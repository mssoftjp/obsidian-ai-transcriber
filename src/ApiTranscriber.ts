/**
 * API Transcriber - Facade for backward compatibility
 * Delegates to the new TranscriptionController architecture
 */

import { Notice } from 'obsidian';

import { TranscriptionController } from './application/TranscriptionController';
import { SUPPORTED_FORMATS } from './config/constants';
import { getModelConfig } from './config/ModelProcessingConfig';
import { TranscriptionBusyError } from './core/transcription/TranscriptionJob';
import { t } from './i18n';
import { Logger } from './utils/Logger';

import type { APITranscriptionSettings } from './ApiSettings';
import type { ActiveTranscriptionJob } from './core/transcription/TranscriptionJob';
import type { TranscriptionOutcome } from './core/transcription/TranscriptionTypes';
import type { ProgressTracker } from './ui/ProgressTracker';
import type { App, TFile } from 'obsidian';

type TranscriptionResult = string | TranscriptionOutcome;
type TranscriptionContinuation = (
	result: TranscriptionResult,
	signal: AbortSignal
) => Promise<void>;

/**
 * Legacy APITranscriber class maintained for backward compatibility
 * All functionality is delegated to the new TranscriptionController
 */
export class APITranscriber {
	private settings: APITranscriptionSettings;
	private controller: TranscriptionController;
	private progressTracker: ProgressTracker | null = null;
	private logger = Logger.getLogger('APITranscriber');

	private activeJob: ActiveTranscriptionJob | null = null;

	constructor(app: App, settings: APITranscriptionSettings, progressTracker?: ProgressTracker) {
		this.settings = settings;
		this.progressTracker = progressTracker ?? null;

		// Create new controller
		this.controller = new TranscriptionController(app, settings, progressTracker);

	}

	/**
	 * Main transcription method
	 * Delegates to TranscriptionController
	 */
	async transcribe(
		audioFile: TFile,
		startTime?: number,
		endTime?: number,
		onTranscribed?: TranscriptionContinuation
	): Promise<TranscriptionResult> {
		if (this.activeJob) {
			throw new TranscriptionBusyError();
		}

		const job: ActiveTranscriptionJob = {
			id: this.generateJobId(),
			abortController: new AbortController(),
			taskId: null
		};
		this.activeJob = job;
		let downstreamStarted = false;

		try {
			// Progress setup belongs to this job and must release ownership if it fails.
			if (this.progressTracker) {
				const provider = this.getProviderDisplayName();
				const costEstimate = await this.estimateCost(audioFile);

				this.throwIfAborted(job);
				job.taskId = this.progressTracker.startTask(
					audioFile,
					1, // We don't know chunk count yet
					provider,
					costEstimate.cost
				);
			}

			const transcriptionStartTime = performance.now();

			// Validate audio file
			this.validateAudioFile(audioFile);

			// Delegate to new controller with abort signal
			this.logger.debug('Delegating to TranscriptionController');
			const result = await this.controller.transcribe(
				audioFile,
				startTime,
				endTime,
				job.abortController.signal
			);
			this.throwIfAborted(job);

			// Keep the same job and AbortSignal alive through downstream processing.
			if (onTranscribed) {
				downstreamStarted = true;
				await onTranscribed(result, job.abortController.signal);
				this.throwIfAborted(job);
			}

			// Extract text for progress tracker
			const resultText = typeof result === 'string' ? result : result.text;

			// Don't mark as complete here - let the modal handle completion after post-processing
			// This keeps the task in 'processing' state at 70%

			const elapsedTime = performance.now() - transcriptionStartTime;
			this.logger.info('Transcription completed', {
				file: audioFile.name,
				elapsedTime: `${(elapsedTime / 1000).toFixed(2)}s`,
				textLength: resultText.length
			});

			return result;

		} catch (error) {
			// Handle cancellation
			const isAbortError = job.abortController.signal.aborted
				|| (error instanceof DOMException && error.name === 'AbortError');
			if (isAbortError) {

				// Only show notice and return empty if no partial results
				new Notice(t('notices.transcriptionCancelled'));

				// Mark task as cancelled in progress tracker
				if (this.progressTracker && job.taskId) {
					this.progressTracker.cancelTask(job.taskId);
					job.taskId = null;
				}

				return '';
			}

			// Handle other errors
			if (downstreamStarted) {
				throw error;
			}
			throw error;

		} finally {
			// Clean up
			if (this.activeJob === job) {
				this.activeJob = null;
			}
		}
	}

	/**
	 * Cancel ongoing transcription
	 */
	cancelTranscription(): Promise<boolean> {
		const job = this.activeJob;
		if (!job) {
			return Promise.resolve(false);
		}
		job.abortController.abort();

		// Cancel current task in progress tracker
		if (this.progressTracker && job.taskId) {
			this.progressTracker.cancelTask(job.taskId);
			job.taskId = null;
		}
		return Promise.resolve(true);
	}

	isTranscribing(): boolean {
		return this.activeJob !== null;
	}

	/**
	 * Update settings
	 */
	updateSettings(settings: APITranscriptionSettings): void {
		this.settings = settings;
		this.controller.updateSettings(settings);
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		try {
			// Cancel any ongoing operations
			await this.cancelTranscription();

			// Controller handles its own cleanup internally
		} catch (error) {
			this.logger.warn('Cleanup error', error);
		}
	}

	/**
	 * Test API connection
	 */
	async testConnection(): Promise<boolean> {
		try {
			return await this.controller.testConnection();
		} catch (error) {
			this.logger.error('Connection test failed', error);
			return false;
		}
	}

	/**
	 * Validate audio file
	 */
	private validateAudioFile(audioFile: TFile): void {
		const supportedExtensions = SUPPORTED_FORMATS.EXTENSIONS;
		const fileExtension = audioFile.extension.toLowerCase();

		if (!supportedExtensions.includes(fileExtension)) {
			throw new Error(t('errors.unsupportedAudioFormat', {
				extension: fileExtension,
				formats: supportedExtensions.join(', ')
			}));
		}
	}

	// ===== Compatibility methods for gradual migration =====

	/**
	 * Get transcriber instance (for compatibility)
	 * @deprecated Use TranscriptionController directly
	 */
	getTranscriber(): unknown {
		this.logger.warn('getTranscriber() is deprecated');
		return this.controller;
	}

	/**
	 * Get chunk processor (for compatibility)
	 * @deprecated Chunk processing is handled internally
	 */
	getChunkProcessor(): unknown {
		this.logger.warn('getChunkProcessor() is deprecated');
		return null;
	}

	/**
	 * Get current model (for compatibility)
	 */
	getCurrentModel(): string {
		return this.settings.model;
	}

	/**
	 * Check if using GPT-4o model
	 */
	isGPT4oModel(): boolean {
		return this.settings.model.startsWith('gpt-4o');
	}

	/**
	 * Get provider display name
	 */
	getProviderDisplayName(): string {
		const model = this.settings.model as string; // Cast to string to avoid type errors
		switch (model) {
		case 'whisper-1':
			return t('providers.whisper');
		case 'whisper-1-ts':
			return t('providers.whisperTs');
		case 'gpt-4o-transcribe':
			return t('providers.gpt4o');
		case 'gpt-4o-mini-transcribe':
			return t('providers.gpt4oMini');
		default:
			// Fallback to model name with proper formatting
			return model.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
		}
	}

	/**
	 * Get provider-specific limits
	 */
	getProviderLimits(): { maxFileSize: number; supportedFormats: string[] } {
		const supportedFormats = SUPPORTED_FORMATS.EXTENSIONS;
		const modelConfig = getModelConfig(this.settings.model);

		return {
			maxFileSize: modelConfig.maxFileSizeMB,
			supportedFormats
		};
	}

	/**
	 * Estimate transcription cost
	 * Returns both old format (for backward compatibility) and new format
	 */
	estimateCost(audioFile: TFile): Promise<{ cost: number; currency: string; details: unknown }> {
		try {
			// Estimate from metadata without loading the audio body into memory.
			const sizeMB = audioFile.stat.size / (1024 * 1024);

			// Rough estimate: 1MB ≈ 1 minute for compressed audio
			const estimatedMinutes = sizeMB * 1.2; // Conservative estimate

			// Cost per minute based on model configuration
			const model = this.settings.model as string; // Cast to string to avoid type errors
			const modelConfig = getModelConfig(model);
			const costPerMinute = modelConfig.pricing.costPerMinute;
			const currency = modelConfig.pricing.currency;
			const totalCost = estimatedMinutes * costPerMinute;
			const rateDisplay = this.formatCostRate(currency, costPerMinute);

			// Return format that supports both old and new interface
			return Promise.resolve({
				cost: Math.round(totalCost * 100) / 100,
				currency,
				details: {
					minutes: estimatedMinutes,
					costPerMinute,
					toString: () => t('modal.transcription.costEstimateSummary', {
						minutes: estimatedMinutes.toFixed(1),
						rate: rateDisplay
					})
				}
			});
		} catch (error) {
			this.logger.error('Error estimating cost', error);
			return Promise.resolve({
				cost: 0,
				currency: 'USD',
				details: {
					minutes: 0,
					costPerMinute: 0,
					toString: () => t('errors.costEstimateUnavailable')
				}
			});
		}
	}

	/**
	 * Check API connection
	 */
	async checkApiConnection(): Promise<boolean> {
		return await this.testConnection();
	}

	/**
	 * Set progress callback (for compatibility)
	 */
	setProgressCallback(_callback: (current: number, total: number, message: string) => void): void {
		// This is now handled internally by TranscriptionController
	}

	private generateJobId(): string {
		return `job-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
	}

	private throwIfAborted(job: ActiveTranscriptionJob): void {
		if (job.abortController.signal.aborted) {
			throw new DOMException('Transcription cancelled', 'AbortError');
		}
	}

	private formatCostRate(currency: string, amount: number): string {
		const precision = amount >= 0.01 ? 2 : 3;
		const formatted = amount.toFixed(precision);
		if (currency === 'USD') {
			return `$${formatted}`;
		}
		return `${currency} ${formatted}`;
	}
}
