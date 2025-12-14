/**
 * GPT-4o-specific transcription strategy
 * Implements sequential processing with context preservation
 */

import { getModelConfig } from '../../config/ModelProcessingConfig';
import { TranscriptionMerger } from '../../core/transcription/TranscriptionMerger';
import { TranscriptionStrategy } from '../../core/transcription/TranscriptionStrategy';
import { t } from '../../i18n';
import { Logger } from '../../utils/Logger';

import type { AudioChunk } from '../../core/audio/AudioTypes';
import type { TranscriptionService } from '../../core/transcription/TranscriptionService';
import type { TranscriptionResult, TranscriptionOptions, TranscriptionProgress } from '../../core/transcription/TranscriptionTypes';


export class GPT4oTranscriptionStrategy extends TranscriptionStrategy {
	readonly strategyName = 'GPT-4o Sequential Processing';
	readonly processingMode = 'sequential' as const;
	readonly maxConcurrency = 1; // Sequential processing only

		private merger: TranscriptionMerger;
		private workflowLanguage: string = 'auto';

	constructor(
		transcriptionService: TranscriptionService,
		onProgress?: (progress: TranscriptionProgress) => void
	) {
		super(transcriptionService, onProgress);
		this.merger = new TranscriptionMerger(transcriptionService.modelId);
		this.logger = Logger.getLogger('GPT4oTranscriptionStrategy');

			// Get context window size from config based on model
			getModelConfig(transcriptionService.modelId);
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

		this.workflowLanguage = this.normalizeLanguageCode(options.language) ?? 'auto';

			for (let i = 0; i < chunks.length; i++) {
				try {
					// Check for cancellation
					this.checkAborted();

					const chunk = chunks[i];
					if (!chunk) {
						continue;
					}

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
				const errorMessage = error instanceof Error ? error.message : t('errors.general');
				const failedChunk = chunks[i];
				results.push({
					id: failedChunk?.id ?? i,
					text: t('modal.transcription.chunkFailure', { index: (i + 1).toString(), error: errorMessage }),
					startTime: failedChunk?.startTime ?? 0,
					endTime: failedChunk?.endTime ?? 0,
					success: false,
					error: errorMessage
				});
			}
		}


		return results;
	}

	private normalizeLanguageCode(language: string | undefined): string | null {
		if (!language) {
			return null;
		}
		const trimmed = language.trim();
		if (!trimmed) {
			return null;
		}
		const base = trimmed.split('-')[0] ?? trimmed;
		return base.toLowerCase();
	}

	private resolveCleaningLanguage(results: TranscriptionResult[]): string {
		const requested = this.normalizeLanguageCode(this.workflowLanguage) ?? 'auto';
		if (requested !== 'auto') {
			return requested;
		}

		const detected = results.find(r => r.success && r.language)?.language;
		const normalizedDetected = this.normalizeLanguageCode(detected);
		return normalizedDetected ?? 'auto';
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
				const raw = sentences[i];
				if (!raw) {
					continue;
				}
				const sentence = raw.trim();
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
			const failureSummary = failed.map(f =>
				t('modal.transcription.chunkFailureSummary', {
					id: f.id.toString(),
					error: f.error || t('errors.general')
				})
			).join('\n');
			const failedChunksLabel = failed.map(f => f.id).join(', ') || failed.length.toString();
			const notice = t('modal.transcription.partialFailedChunks', { chunks: failedChunksLabel });
			return `${notice}\n${failureSummary}`;
		}

		// Use overlap removal to handle chunk boundary duplicates (30s overlap)
		let mergedText = this.merger.mergeWithOverlapRemoval(valid, { separator: '\n\n' });

		// Apply cleaning pipeline to the merged text
		// This includes duplicate removal and other GPT-4o specific cleaning
		try {
			const cleaningLanguage = this.resolveCleaningLanguage(results);
			mergedText = await this.transcriptionService.cleanText(mergedText, cleaningLanguage);
		} catch (error) {
			this.logger.error('Failed to clean merged text:', error);
			// Continue with uncleaned text if cleaning fails
		}

		// If we have partial results, prepend a notice
		if (failed.length > 0) {
			const failedChunks = failed.map(f => f.id).join(', ') || failed.length.toString();
			const notice = t('modal.transcription.partialFailedChunks', { chunks: failedChunks });
			return `${notice}\n\n${mergedText}`;
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
