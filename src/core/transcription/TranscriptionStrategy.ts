/**
 * Abstract base class for transcription strategies
 * Implements the Strategy pattern for different transcription workflows
 */

import { AudioChunk } from '../audio/AudioTypes';
import { TranscriptionResult, TranscriptionOptions, TranscriptionProgress } from './TranscriptionTypes';
import { ChunkProcessingMode } from '../chunking/ChunkingTypes';
import { TranscriptionService } from './TranscriptionService';
import { Logger } from '../../utils/Logger';
import { t } from '../../i18n';

export abstract class TranscriptionStrategy {
	protected transcriptionService: TranscriptionService;
	protected onProgress?: (progress: TranscriptionProgress) => void;
	protected abortSignal?: AbortSignal;
	protected logger: Logger;

	constructor(
		transcriptionService: TranscriptionService,
		onProgress?: (progress: TranscriptionProgress) => void
	) {
		this.transcriptionService = transcriptionService;
		this.onProgress = onProgress;
		this.logger = Logger.getLogger('TranscriptionStrategy');
	}

	/**
	 * Strategy identifier
	 */
	abstract readonly strategyName: string;

	/**
	 * Processing mode (sequential for GPT-4o, parallel for Whisper)
	 */
	abstract readonly processingMode: ChunkProcessingMode;

	/**
	 * Maximum concurrent requests
	 */
	abstract readonly maxConcurrency: number;

	/**
	 * Get the actual model that was used for transcription
	 */
	getModelUsed(): string {
		return this.transcriptionService.modelId;
	}

	/**
	 * Process chunks according to the strategy
	 */
	abstract processChunks(
		chunks: AudioChunk[],
		options: TranscriptionOptions
	): Promise<TranscriptionResult[]>;

	/**
	 * Merge results according to the strategy
	 */
	abstract mergeResults(results: TranscriptionResult[]): Promise<string>;

	/**
	 * Execute the complete transcription workflow
	 */
	async execute(
		chunks: AudioChunk[],
		options: TranscriptionOptions
	): Promise<{ text: string; segments?: Array<{ text: string; start: number; end: number; }>; partial?: boolean; error?: string }> {
		this.abortSignal = options.signal;

		// Report initial progress
		this.reportProgress({
			currentChunk: 0,
			totalChunks: chunks.length,
			percentage: 0,
			operation: t('modal.transcription.processing'),
			cancellable: true
		});

		let results: TranscriptionResult[] = [];
		let processingError: Error | null = null;
		let isCancelled = false;

		try {
			// Process chunks according to strategy
			results = await this.processChunks(chunks, options);

			// Check for cancellation
			this.checkAborted();

		} catch (error) {
			processingError = error as Error;
			isCancelled = processingError.message.includes('cancelled') || processingError.message.includes('aborted') || processingError.name === 'AbortError';
			
			// Log the interruption
			if (isCancelled) {
			} else {
				this.logger.warn(`Processing interrupted: ${processingError.message}`);
			}
			
			// If no results at all and not cancelled, re-throw the error
			if (results.length === 0 && !isCancelled) {
				throw processingError;
			}
		}

		// Always try to merge whatever results we have
		if (results.length > 0) {
			try {
				// Report merging progress
				this.reportProgress({
					currentChunk: results.length,
					totalChunks: chunks.length,
					percentage: 95,
					operation: t('modal.transcription.processing'),
					cancellable: false
				});

				// Merge results
				const mergedText = await this.mergeResults(results);

				// Collect all segments if available
				let allSegments: Array<{ text: string; start: number; end: number; }> | undefined;
				if (options.timestamps) {
					const validResults = results.filter(r => r.success && r.segments);
					if (validResults.length > 0) {
						allSegments = [];
						for (const result of validResults) {
							if (result.segments) {
								allSegments.push(...result.segments);
							}
						}
						// Sort by start time
						allSegments.sort((a, b) => a.start - b.start);
					}
				}

				// Report completion or partial completion
				const successfulResults = results.filter(r => r.success);
				const isPartial = successfulResults.length < chunks.length || processingError !== null;
				
			this.reportProgress({
				currentChunk: results.length,
				totalChunks: chunks.length,
				percentage: 100,
				operation: isPartial ? t('modal.transcription.partialResult') : t('modal.transcription.completed'),
				cancellable: false
			});

				const result: any = {
					text: mergedText,
					segments: allSegments
				};

			if (isPartial) {
				result.partial = true;
				const processedCount = successfulResults.length.toString();
				const totalCount = chunks.length.toString();
				const partialHeader = t('modal.transcription.partialResult');
				const summary = t('modal.transcription.partialSummary', {
					processed: processedCount,
					total: totalCount
				});
				result.text = `${partialHeader}\n${summary}\n\n${mergedText}`;
				if (isCancelled) {
					result.error = t('modal.transcription.partialCancelled', {
						processed: processedCount,
						total: totalCount
					});
				} else if (processingError) {
					const errorMessage = processingError.message || t('errors.general');
					result.error = t('modal.transcription.partialError', {
						error: errorMessage,
						processed: processedCount,
						total: totalCount
					});
				}
			}

				return result;

			} catch (mergeError) {
				this.logger.error('Merge failed', mergeError);
				// Even if merge fails, try to return something
				const successfulResults = results.filter(r => r.success && r.text);
			if (successfulResults.length > 0) {
				const fallbackText = successfulResults.map(r => r.text).join('\n\n');
				return {
					text: fallbackText,
					partial: true,
					error: `${t('modal.transcription.partialFailedChunks', { chunks: successfulResults.length.toString() })} ${(mergeError as Error).message}`
				};
			}
			throw mergeError;
		}
	} else {
			// No results at all
			if (isCancelled) {
				// Return empty result with cancellation message
				return {
					text: `${t('modal.transcription.partialResult')}\n\n${t('modal.transcription.partialNoChunks')}`,
					partial: true,
					error: t('modal.transcription.partialNoChunks')
				};
			}
			if (processingError) {
				throw processingError;
			}
			throw new Error(t('errors.noTranscriptionResults'));
		}
	}

	/**
	 * Report progress to callback
	 */
	protected reportProgress(progress: TranscriptionProgress): void {
		if (this.onProgress) {
			this.onProgress(progress);
		}
	}

	/**
	 * Check if operation was aborted
	 */
	protected checkAborted(): void {
		if (this.abortSignal?.aborted) {
			throw new Error(t('errors.transcriptionCancelledByUser'));
		}
	}

	/**
	 * Process a single chunk with error handling
	 */
	protected async processSingleChunk(
		chunk: AudioChunk,
		options: TranscriptionOptions,
		previousContext?: string
	): Promise<TranscriptionResult> {
		try {
			const modelOptions = previousContext 
				? { gpt4o: { previousContext, responseFormat: 'json' as const } }
				: undefined;

			const result = await this.transcriptionService.transcribe(
				chunk,
				options,
				modelOptions
			);

			// Note: Formatting/cleaning is now done after merging all chunks
			// to avoid redundant processing and improve performance
			return result;

		} catch (error) {
			// Return error result for this chunk
			const errorMessage = error instanceof Error ? error.message : t('errors.general');
			return {
				id: chunk.id,
				text: t('modal.transcription.chunkFailure', { index: chunk.id.toString(), error: errorMessage }),
				startTime: chunk.startTime,
				endTime: chunk.endTime,
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Delay for rate limiting with cancellation support
	 */
	protected delay(ms: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(resolve, ms);
			
			// Check if already aborted
			if (this.abortSignal?.aborted) {
				clearTimeout(timeoutId);
				reject(new Error(t('errors.cancelled')));
				return;
			}
			
			// Listen for abort
			const abortHandler = () => {
				clearTimeout(timeoutId);
				reject(new Error(t('errors.cancelled')));
			};
			
			this.abortSignal?.addEventListener('abort', abortHandler, { once: true });
		});
	}

	/**
	 * Calculate estimated time remaining
	 */
	protected calculateTimeRemaining(
		processedChunks: number,
		totalChunks: number,
		startTime: number
	): number {
		if (processedChunks === 0) return 0;

		const elapsedSeconds = (Date.now() - startTime) / 1000;
		const averageTimePerChunk = elapsedSeconds / processedChunks;
		const remainingChunks = totalChunks - processedChunks;

		return Math.round(averageTimePerChunk * remainingChunks);
	}

	/**
	 * Filter out failed results and log statistics
	 */
	protected filterResults(results: TranscriptionResult[]): {
		valid: TranscriptionResult[];
		failed: TranscriptionResult[];
	} {
		const valid = results.filter(r => r.success);
		const failed = results.filter(r => !r.success);

		if (failed.length > 0) {
			this.logger.warn(`[${this.strategyName}] ${failed.length} chunks failed:`, 
				failed.map(f => ({ id: f.id, error: f.error }))
			);
		}

		return { valid, failed };
	}
}
