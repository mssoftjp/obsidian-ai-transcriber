/**
 * OpenAI file-transcription strategy
 * Implements stable serial chunk processing with overlap-aware merging
 */

import { getModelConfig } from '../../config/ModelProcessingConfig';
import { TranscriptionMerger } from '../../core/transcription/TranscriptionMerger';
import { TranscriptionStrategy } from '../../core/transcription/TranscriptionStrategy';
import { planWaveConcurrency } from '../../core/utils/WaveConcurrencyPlanner';
import { planWaveGroupSizes } from '../../core/utils/WaveGroupPlanner';
import { t } from '../../i18n';
import { Logger } from '../../utils/Logger';

import type { AudioChunk } from '../../core/audio/AudioTypes';
import type { TranscriptionService } from '../../core/transcription/TranscriptionService';
import type { TranscriptionResult, TranscriptionOptions, TranscriptionProgress } from '../../core/transcription/TranscriptionTypes';

interface AdaptiveWaveState {
	concurrencyLimit: number;
	inFlightGroups: number;
}

export class GPT4oTranscriptionStrategy extends TranscriptionStrategy {
	readonly strategyName = 'OpenAI File Transcription Wave Processing';
	readonly processingMode = 'batch' as const;
	readonly maxConcurrency = 1;

	private static readonly WAVE_MIN_GROUP_SIZE = 3;
	private static readonly WAVE_MAX_GROUP_SIZE = 5;
	private merger: TranscriptionMerger;
	private workflowLanguage: string = 'auto';
	private readonly dispatchedChunkIds = new Set<number>();

	constructor(
		transcriptionService: TranscriptionService,
		onProgress?: (progress: TranscriptionProgress) => void
	) {
		super(transcriptionService, onProgress);
		this.merger = new TranscriptionMerger(transcriptionService.modelId);
		this.logger = Logger.getLogger('GPT4oTranscriptionStrategy');

		// Ensure model config is loaded (used by other components and logs)
		getModelConfig(transcriptionService.modelId);
	}

	/**
	 * Process chunks using wave-parallel grouping:
	 * - Within a group: sequential without transcript prompt carry-over
	 * - Across groups: run in parallel up to maxConcurrency
	 */
	async processChunks(
		chunks: AudioChunk[],
		options: TranscriptionOptions
	): Promise<TranscriptionResult[]> {
		this.workflowLanguage = options.language;
		this.dispatchedChunkIds.clear();

		if (chunks.length === 0) {
			return [];
		}

		const results: TranscriptionResult[] = [];
		const startTime = Date.now();
		const totalChunks = chunks.length;

		const groupSizes = planWaveGroupSizes(chunks.length, {
			minGroupSize: GPT4oTranscriptionStrategy.WAVE_MIN_GROUP_SIZE,
			maxGroupSize: GPT4oTranscriptionStrategy.WAVE_MAX_GROUP_SIZE,
			distributeRemainderToEnd: true
		});

		const groups = this.createGroups(chunks, groupSizes);
		const totalGroups = groups.length;
		const totalDurationSeconds = this.getTotalDurationSeconds(chunks);

		const progressState = { completedChunks: 0 };
		let nextGroupIndex = 0;
		const initialConcurrency = planWaveConcurrency(totalDurationSeconds, totalGroups, this.maxConcurrency);
		const adaptiveState: AdaptiveWaveState = {
			concurrencyLimit: initialConcurrency,
			inFlightGroups: 0
		};

		const runWorker = async (): Promise<void> => {
			for (;;) {
				const acquired = await this.acquireGroupSlot(adaptiveState);
				if (!acquired) {
					return;
				}
				const currentGroupIndex = nextGroupIndex;
				nextGroupIndex++;
				if (currentGroupIndex >= totalGroups) {
					this.releaseGroupSlot(adaptiveState);
					return;
				}
				const group = groups[currentGroupIndex];
				if (!group) {
					this.releaseGroupSlot(adaptiveState);
					continue;
				}
				try {
					await this.processGroup(group, currentGroupIndex, totalGroups, totalChunks, options, startTime, results, progressState, adaptiveState);
				} finally {
					this.releaseGroupSlot(adaptiveState);
				}
			}
		};

		const workers = Array.from({ length: this.maxConcurrency }, () => runWorker());
		await Promise.all(workers);

		return results;
	}

	private async acquireGroupSlot(state: AdaptiveWaveState): Promise<boolean> {
		for (;;) {
			if (this.abortSignal?.aborted) {
				return false;
			}

			if (state.inFlightGroups < state.concurrencyLimit) {
				state.inFlightGroups++;
				return true;
			}

			try {
				await this.delay(50);
			} catch {
				return false;
			}
		}
	}

	private releaseGroupSlot(state: AdaptiveWaveState): void {
		state.inFlightGroups = Math.max(0, state.inFlightGroups - 1);
	}

	private getTotalDurationSeconds(chunks: AudioChunk[]): number {
		let minStart = Infinity;
		let maxEnd = 0;
		for (const chunk of chunks) {
			minStart = Math.min(minStart, chunk.startTime);
			maxEnd = Math.max(maxEnd, chunk.endTime);
		}
		const normalizedMinStart = Number.isFinite(minStart) ? minStart : 0;
		return Math.max(0, maxEnd - normalizedMinStart);
	}

	private createGroups(chunks: AudioChunk[], sizes: number[]): AudioChunk[][] {
		const groups: AudioChunk[][] = [];
		let offset = 0;
		for (const size of sizes) {
			if (size <= 0) {
				continue;
			}
			const group = chunks.slice(offset, offset + size);
			if (group.length > 0) {
				groups.push(group);
			}
			offset += size;
		}
		return groups;
	}

	private async processGroup(
		group: AudioChunk[],
		groupIndex: number,
		totalGroups: number,
		totalChunks: number,
		options: TranscriptionOptions,
		startTime: number,
		results: TranscriptionResult[],
		progressState: { completedChunks: number },
		_adaptiveState: AdaptiveWaveState
	): Promise<void> {
		for (let i = 0; i < group.length; i++) {
			if (this.abortSignal?.aborted) {
				return;
			}

			const chunk = group[i];
			if (!chunk) {
				continue;
			}

			// Check chunk size before sending to API
			const chunkSizeMB = chunk.data.byteLength / (1024 * 1024);
			if (chunkSizeMB > 25) {
				const indexLabel = (chunk.id + 1).toString();
				const errorMessage = `Chunk size ${chunkSizeMB.toFixed(1)}MB exceeds API limit of 25MB`;
				results.push({
					id: chunk.id,
					text: t('modal.transcription.chunkFailure', { index: indexLabel, error: errorMessage }),
					startTime: chunk.startTime,
					endTime: chunk.endTime,
					success: false,
					error: errorMessage
				});
				progressState.completedChunks++;
				this.reportWaveProgress(progressState.completedChunks, groupIndex, totalGroups, chunk.id, totalChunks, startTime);
				continue;
			}

			// The audio overlap supplies boundary context. Sending the preceding
			// transcript as a prompt can cause the model to echo it into this chunk.
			const result = await this.transcribeChunkOnce(chunk, options);
			results.push(result);

			progressState.completedChunks++;
			this.reportWaveProgress(progressState.completedChunks, groupIndex, totalGroups, chunk.id, totalChunks, startTime);
		}
	}

	private async transcribeChunkOnce(
		chunk: AudioChunk,
		options: TranscriptionOptions
	): Promise<TranscriptionResult> {
		if (this.dispatchedChunkIds.has(chunk.id)) {
			const error = `Duplicate transcription dispatch blocked for chunk ${chunk.id}`;
			this.logger.error(error);
			return {
				id: chunk.id,
				text: '',
				startTime: chunk.startTime,
				endTime: chunk.endTime,
				success: false,
				error
			};
		}
		this.dispatchedChunkIds.add(chunk.id);
		return await this.processSingleChunk(chunk, options);
	}

	private reportWaveProgress(
		completedChunks: number,
		groupIndex: number,
		totalGroups: number,
		chunkId: number,
		totalChunks: number,
		startTime: number
	): void {
		const clampedCompleted = Math.max(0, Math.min(completedChunks, totalChunks));
		const percentage = (clampedCompleted / totalChunks) * 90; // Reserve 10% for merging
		const groupLabel = `${groupIndex + 1}/${totalGroups}`;
		const chunkLabel = `${chunkId + 1}/${totalChunks}`;

		this.reportProgress({
			currentChunk: clampedCompleted,
			totalChunks,
			percentage,
			operation: `Transcribing chunk ${chunkLabel} (group ${groupLabel})`,
			estimatedTimeRemaining: this.calculateTimeRemaining(Math.max(1, clampedCompleted), totalChunks, startTime),
			cancellable: true
		});
	}

	/**
	 * Merge results with overlap removal
	 */
	async mergeResults(results: TranscriptionResult[]): Promise<string> {
		const { valid, failed } = this.filterResults(results);

		if (valid.length === 0 && failed.length === 0) {
			return '';
		}

		// If no valid results but we have failed results, return error information
		if (valid.length === 0) {
			const pseudo = failed.map(f => this.toFailurePlaceholderResult(f));
			const merged = this.merger.mergeWithOverlapRemoval(pseudo, { separator: '\n\n' });
			const failedChunksLabel = failed.map(f => f.id).join(', ') || failed.length.toString();
			const notice = t('modal.transcription.partialFailedChunks', { chunks: failedChunksLabel });
			return `${notice}\n\n${merged}`;
		}

		// Use overlap removal to handle chunk boundary duplicates.
		// If there are failed chunks, insert placeholders so gaps are visible/recoverable.
		const mergeInputs = failed.length > 0
			? results.map(r => (r.success ? r : this.toFailurePlaceholderResult(r)))
			: valid;
		let mergedText = this.merger.mergeWithOverlapRemoval(mergeInputs, { separator: '\n\n' });

		mergedText = await this.postProcessMergedText(mergedText, results, this.workflowLanguage);

		// If we have partial results, prepend a notice
		if (failed.length > 0) {
			const failedChunks = failed.map(f => f.id).join(', ') || failed.length.toString();
			const notice = t('modal.transcription.partialFailedChunks', { chunks: failedChunks });
			return `${notice}\n\n${mergedText}`;
		}

		return mergedText;
	}

	private toFailurePlaceholderResult(result: TranscriptionResult): TranscriptionResult {
		const startLabel = this.formatSeconds(result.startTime);
		const endLabel = this.formatSeconds(result.endTime);
		const errorMessage = result.error ? result.error : t('errors.general');

		return {
			...result,
			success: true,
			text: `【欠損: チャンク${result.id + 1} (${startLabel}–${endLabel})】\n${errorMessage}`
		};
	}

	private formatSeconds(seconds: number): string {
		const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
		const total = Math.floor(safe);
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		const s = total % 60;
		const hh = String(h).padStart(2, '0');
		const mm = String(m).padStart(2, '0');
		const ss = String(s).padStart(2, '0');
		return `${hh}:${mm}:${ss}`;
	}

	/**
	 * Get optimal settings for the selected file-transcription profile
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
	 * Estimate processing time for an OpenAI file-transcription model
	 */
	estimateProcessingTime(chunks: AudioChunk[]): number {
		// Keep the established conservative estimate for this shared workflow.
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
