/**
 * GPT-4o-specific transcription strategy
 * Implements sequential processing with context preservation
 */

import { TranscriptionStrategy } from '../../core/transcription/TranscriptionStrategy';
import { TranscriptionService } from '../../core/transcription/TranscriptionService';
import { TranscriptionMerger } from '../../core/transcription/TranscriptionMerger';
import { AudioChunk } from '../../core/audio/AudioTypes';
import { TranscriptionResult, TranscriptionOptions } from '../../core/transcription/TranscriptionTypes';
import { getModelConfig } from '../../config/ModelProcessingConfig';
import { Logger } from '../../utils/Logger';

export class GPT4oTranscriptionStrategy extends TranscriptionStrategy {
	readonly strategyName = 'GPT-4o Sequential Processing';
	readonly processingMode = 'sequential' as const;
	readonly maxConcurrency = 1; // Sequential processing only

	private merger: TranscriptionMerger;
	private contextWindowSize: number;

	constructor(
		transcriptionService: TranscriptionService,
		onProgress?: (progress: any) => void
	) {
		super(transcriptionService, onProgress);
		this.merger = new TranscriptionMerger(transcriptionService.modelId);
		this.logger = Logger.getLogger('GPT4oTranscriptionStrategy');
		
		// Get context window size from config based on model
		const config = getModelConfig(transcriptionService.modelId);
		this.contextWindowSize = config.contextWindowSize;
	}

	/**
	 * Process chunks sequentially with context preservation
	 */
	async processChunks(
		chunks: AudioChunk[],
		options: TranscriptionOptions
	): Promise<TranscriptionResult[]> {
		const results: TranscriptionResult[] = [];
		const startTime = Date.now();
		let previousChunkText = ''; // 前チャンクの最後の文を保持
		

		for (let i = 0; i < chunks.length; i++) {
			try {
				// Check for cancellation
				this.checkAborted();

				const chunk = chunks[i];
				
				// Check chunk size before sending to API
				const chunkSizeMB = chunk.data.byteLength / (1024 * 1024);
				if (chunkSizeMB > 25) {
					throw new Error(`Chunk size ${chunkSizeMB.toFixed(1)}MB exceeds API limit of 25MB`);
				}

				// Report progress
				this.reportProgress({
					currentChunk: i + 1,
					totalChunks: chunks.length,
					percentage: ((i + 1) / chunks.length) * 90, // Reserve 10% for merging
					operation: `Transcribing chunk ${i + 1}/${chunks.length}`,
					estimatedTimeRemaining: this.calculateTimeRemaining(i + 1, chunks.length, startTime),
					cancellable: true
				});

				// Process chunk with previous context
				let previousContext: string | undefined;
				if (i > 0 && previousChunkText) {
					// 最後の2文程度を抽出（約150-200文字を目安）
					const lastSentences = this.extractLastSentences(previousChunkText, 200);
					if (lastSentences) {
						previousContext = lastSentences;
					}
				} else {
				}

				// Process chunk
				
				const result = await this.processSingleChunk(chunk, options, previousContext);
				
				
				results.push(result);


				// 成功したチャンクのテキストを保存
				if (result.success && result.text) {
					previousChunkText = result.text;
				}
			} catch (error) {
				// If cancelled or aborted, return current results
				if (error instanceof Error && (error.message.includes('cancelled') || error.message.includes('aborted'))) {
					break; // Exit the loop but keep the results we have
				}
				// For other errors, log and continue with next chunk
				this.logger.error(`Failed to process chunk ${i + 1}:`, error);
				results.push({
					id: chunks[i].id,
					text: `[Chunk ${i + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}]`,
					startTime: chunks[i].startTime,
					endTime: chunks[i].endTime,
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}
		

		return results;
	}

	/**
	 * Extract last sentences from text (within token limit)
	 */
	private extractLastSentences(text: string, maxLength: number): string {
		
		// 句読点で分割
		const sentences = text.split(/(?<=[。.!?！？\n])/);
		const selectedSentences: string[] = [];
		let totalLength = 0;
		
		// 後ろから文を選択していく
		for (let i = sentences.length - 1; i >= 0; i--) {
			const sentence = sentences[i].trim();
			if (sentence) {
				// スペースを含めた長さを計算
				const additionalLength = selectedSentences.length > 0 
					? sentence.length + 1 // スペース分を追加
					: sentence.length;
				
				if (totalLength + additionalLength <= maxLength) {
					selectedSentences.unshift(sentence); // 前に追加して順序を保つ
					totalLength += additionalLength;
				} else {
					break;
				}
			}
		}
		
		// 選択した文を結合
		const result = selectedSentences.join(' ');
		
		
		// もし文が選択できなかった場合は、最後のmaxLength文字を返す
		return result || text.slice(-maxLength);
	}

	/**
	 * Merge results with simple concatenation (context already handled)
	 */
	async mergeResults(results: TranscriptionResult[]): Promise<string> {
		const { valid, failed } = this.filterResults(results);


		if (valid.length === 0 && failed.length === 0) {
			return '';
		}


		// If no valid results but we have failed results, return error information
		if (valid.length === 0) {
			const errorInfo = failed.map(f => `Chunk ${f.id}: ${f.error || 'Unknown error'}`).join('\n');
			return `[部分的な文字起こし結果]\n\n文字起こしに失敗しました:\n${errorInfo}`;
		}

		// Use overlap removal to handle chunk boundary duplicates (30s overlap)
		let mergedText = this.merger.mergeWithOverlapRemoval(valid, { separator: '\n\n' });
		
		// Apply cleaning pipeline to the merged text
		// This includes duplicate removal and other GPT-4o specific cleaning
		try {
			mergedText = await this.transcriptionService.cleanText(mergedText, 'ja', {
				processingStage: 'post-merge',
				isMergedText: true
			});
		} catch (error) {
			this.logger.error('Failed to clean merged text:', error);
			// Continue with uncleaned text if cleaning fails
		}
		
		// If we have partial results, prepend a notice
		if (failed.length > 0) {
			const failedChunks = failed.map(f => f.id).join(', ');
			return `[部分的な文字起こし結果]\n一部のチャンク（${failedChunks}）で文字起こしに失敗しました。\n\n${mergedText}`;
		}
		
		return mergedText;
	}


	/**
	 * Get optimal settings for GPT-4o/GPT-4o Mini
	 */
	getOptimalSettings(): {
		chunkDuration: number;
		overlapDuration: number;
		responseFormat: string;
		maxContextLength: number;
	} {
		// Get chunk duration from model configuration instead of hardcoding
		const modelConfig = getModelConfig(this.transcriptionService.modelId);
		
		return {
			chunkDuration: modelConfig.chunkDurationSeconds,
			overlapDuration: modelConfig.vadChunking.overlapDurationSeconds,
			responseFormat: 'json', // Only JSON supported
			maxContextLength: modelConfig.contextWindowSize
		};
	}

	/**
	 * Estimate processing time for GPT-4o
	 */
	estimateProcessingTime(chunks: AudioChunk[]): number {
		// GPT-4o is slower than Whisper, processes at ~5-10x realtime
		const totalDuration = chunks.reduce((sum, chunk) => 
			sum + (chunk.endTime - chunk.startTime), 0
		);
		
		const processingSpeed = 7; // 7x realtime (conservative estimate)
		const baseTime = totalDuration / processingSpeed;
		
		// Add overhead for sequential processing
		const perChunkOverhead = 2; // 2 seconds per chunk
		const totalOverhead = chunks.length * perChunkOverhead;
		
		return baseTime + totalOverhead;
	}

}