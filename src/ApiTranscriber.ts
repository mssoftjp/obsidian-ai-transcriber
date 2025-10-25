/**
 * API Transcriber - Facade for backward compatibility
 * Delegates to the new TranscriptionController architecture
 */

import { App, TFile, Notice } from 'obsidian';
import { APITranscriptionSettings } from './ApiSettings';
import { TranscriptionController } from './application/TranscriptionController';
import { SUPPORTED_FORMATS } from './config/constants';
import { getModelConfig } from './config/ModelProcessingConfig';
import { ProgressTracker } from './ui/ProgressTracker';
import { ErrorHandler } from './ErrorHandler';
import { Logger } from './utils/Logger';
import { t } from './i18n';

/**
 * Legacy APITranscriber class maintained for backward compatibility
 * All functionality is delegated to the new TranscriptionController
 */
export class APITranscriber {
	private app: App;
	private settings: APITranscriptionSettings;
	private controller: TranscriptionController;
	private progressTracker: ProgressTracker | null = null;
	private logger = Logger.getLogger('APITranscriber');
	
	// Cancellation support
	private abortController: AbortController | null = null;
	private isCancelled: boolean = false;
	
	// For compatibility
	private currentTaskId: string | null = null;

	constructor(app: App, settings: APITranscriptionSettings, progressTracker?: ProgressTracker) {
		this.app = app;
		this.settings = settings;
		this.progressTracker = progressTracker || null;
		
		// Create new controller
		this.controller = new TranscriptionController(app, settings, progressTracker);
		
	}

	/**
	 * Main transcription method
	 * Delegates to TranscriptionController
	 */
	async transcribe(audioFile: TFile, startTime?: number, endTime?: number): Promise<string | { text: string; modelUsed: string }> {
		// Initialize cancellation controller
		this.abortController = new AbortController();
		this.isCancelled = false;
		
		// Create task in progress tracker if available
		if (this.progressTracker) {
			// Get provider name and estimate cost
			const provider = this.getProviderDisplayName();
			const costEstimate = await this.estimateCost(audioFile);
			
			this.currentTaskId = this.progressTracker.startTask(
				audioFile,
				1, // We don't know chunk count yet
				provider,
				costEstimate.cost
			);
		}
		
		try {
			const transcriptionStartTime = performance.now();
			
			// Validate audio file
			this.validateAudioFile(audioFile);
			
			// Delegate to new controller with abort signal
			this.logger.debug('Delegating to TranscriptionController');
			const result = await this.controller.transcribe(
				audioFile, 
				startTime, 
				endTime,
				this.abortController.signal
			);
			
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
			// Check if this is a partial result error
			if (error instanceof Error && error.message.includes('[部分的な文字起こし結果]')) {
				// Extract the partial result text and return it
				const partialText = error.message;
				
				// Don't mark as complete here - let the modal handle completion
				
				return partialText;
			}
			
			// Handle cancellation - but first check if we have partial results
			if (this.isCancelled || (error instanceof Error && error.message.includes('cancelled'))) {
				
				// If the error is a cancellation but includes partial results, return them
				if (error instanceof Error && error.message.includes('[部分的な文字起こし結果]')) {
					const partialText = error.message;
					
					// Mark as partial, not complete
					if (this.progressTracker && this.currentTaskId) {
						this.progressTracker.updateTaskStatus(this.currentTaskId, 'partial');
					}
					
					return partialText;
				}
				
				// Only show notice and return empty if no partial results
				new Notice(t('notices.transcriptionCancelled'));
				
				// Mark task as cancelled in progress tracker
				if (this.progressTracker && this.currentTaskId) {
					this.progressTracker.cancelTask(this.currentTaskId);
				}
				
				return '';
			}
			
			// Handle other errors
			const userError = ErrorHandler.handleError(error as Error, 'transcription');
			ErrorHandler.displayError(userError);
			throw error;
			
		} finally {
			// Clean up
			this.abortController = null;
			this.currentTaskId = null;
		}
	}

	/**
	 * Cancel ongoing transcription
	 */
	async cancelTranscription(): Promise<void> {
		this.isCancelled = true;
		
		if (this.abortController) {
			this.abortController.abort();
		}
		
		// Cancel current task in progress tracker
		if (this.progressTracker && this.currentTaskId) {
			this.progressTracker.cancelTask(this.currentTaskId);
			this.currentTaskId = null;
		}
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
			this.cancelTranscription();
			
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
			throw new Error(`Unsupported audio format: ${fileExtension}. Supported formats: ${supportedExtensions.join(', ')}`);
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
	 * Debug log helper (for compatibility)
	 */
	private log(message: string, data?: unknown): void {
		if (this.settings.debugMode) {
			if (data !== undefined) {
			} else {
			}
		}
	}

	/**
	 * Get provider display name
	 */
	getProviderDisplayName(): string {
		const model = this.settings.model as string; // Cast to string to avoid type errors
		switch (model) {
			case 'whisper-1':
				return 'OpenAI Whisper';
			case 'gpt-4o-transcribe':
				return 'GPT-4o';
			case 'gpt-4o-mini-transcribe':
				return 'GPT-4o Mini';
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
	async estimateCost(audioFile: TFile): Promise<{ cost: number; currency: string; details: unknown }> {
		try {
			// Get audio duration (rough estimate based on file size)
			const audioBuffer = await this.app.vault.readBinary(audioFile);
			const sizeMB = audioBuffer.byteLength / (1024 * 1024);
			
			// Rough estimate: 1MB ≈ 1 minute for compressed audio
			const estimatedMinutes = sizeMB * 1.2; // Conservative estimate
			
			// Cost per minute based on model configuration
			const model = this.settings.model as string; // Cast to string to avoid type errors
			const modelConfig = getModelConfig(model);
			const costPerMinute = modelConfig.pricing.costPerMinute;
			const currency = modelConfig.pricing.currency;
			const totalCost = estimatedMinutes * costPerMinute;
			
			// Return format that supports both old and new interface
			return {
				cost: Math.round(totalCost * 100) / 100,
				currency,
				details: {
					// For backward compatibility with modal
					minutes: estimatedMinutes,
					costPerMinute,
					// String representation for display
					toString: () => `~${estimatedMinutes.toFixed(1)} minutes @ $${costPerMinute}/min`
				}
			};
		} catch (error) {
			this.logger.error('Error estimating cost', error);
			return {
				cost: 0,
				currency: 'USD',
				details: {
					minutes: 0,
					costPerMinute: 0,
					toString: () => 'Unable to estimate cost'
				}
			};
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
	setProgressCallback(callback: (current: number, total: number, message: string) => void): void {
		// This is now handled internally by TranscriptionController
	}
}
