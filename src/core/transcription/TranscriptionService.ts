/**
 * Abstract transcription service interface
 * Defines the contract that all AI transcription services must implement
 */

import { SUPPORTED_FORMATS } from '../../config/constants';
import { getModelCleaningStrategy } from '../../config/ModelCleaningConfig';
import { Logger } from '../../utils/Logger';

import {
	WhisperCleaningPipeline,
	GPT4oCleaningPipeline,
	StandardCleaningPipeline
} from './cleaners';

import type {
	CleaningPipeline,
	CleaningContext
} from './cleaners';
import type { DictionaryCorrector } from './DictionaryCorrector';
import type {
	TranscriptionResult,
	TranscriptionOptions,
	ModelSpecificOptions,
	TranscriptionRequest,
	TranscriptionValidation
} from './TranscriptionTypes';
import type { AudioChunk } from '../audio/AudioTypes';

export abstract class TranscriptionService {
	/**
	 * Model identifier (whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe)
	 */
	abstract readonly modelId: string;

	/**
	 * Model display name
	 */
	abstract readonly modelName: string;

	/**
	 * Model capabilities
	 */
	abstract readonly capabilities: {
		supportsTimestamps: boolean;
		supportsWordLevel: boolean;
		supportsLanguageDetection: boolean;
		supportedLanguages: string[];
		maxFileSizeMB: number;
		maxDurationSeconds: number;
	};

	/**
	 * Validate transcription request
	 */
	abstract validate(request: TranscriptionRequest): Promise<TranscriptionValidation>;

	/**
	 * Transcribe a single audio chunk
	 */
	abstract transcribe(
		chunk: AudioChunk,
		options: TranscriptionOptions,
		modelOptions?: ModelSpecificOptions
	): Promise<TranscriptionResult>;

	/**
	 * Test API connection
	 */
	abstract testConnection(apiKey: string): Promise<boolean>;

	/**
	 * Format transcription result (remove hallucinations, etc.)
	 */
	abstract formatResult(result: TranscriptionResult): Promise<TranscriptionResult>;

	/**
	 * Estimate transcription cost
	 */
	abstract estimateCost(durationSeconds: number): {
		amount: number;
		currency: string;
		perMinute: number;
	};

	/**
	 * Get optimal chunk duration for this model
	 */
	abstract getOptimalChunkDuration(): number;

	/**
	 * Dictionary corrector instance for text correction
	 */
	protected dictionaryCorrector: DictionaryCorrector | undefined;

	/**
	 * Text cleaning pipeline for this model
	 */
	protected cleaningPipeline: CleaningPipeline | undefined;

	/**
	 * Logger instance
	 */
	protected logger = Logger.getLogger('TranscriptionService');

	/**
	 * Check if language is supported
	 */
	isLanguageSupported(language: string): boolean {
		return language === 'auto' ||
		       this.capabilities.supportedLanguages.includes(language);
	}

	/**
	 * Get MIME type for file extension
	 */
	protected getMimeType(extension: string): string {
		const mimeTypes = SUPPORTED_FORMATS.MIME_TYPES;
		const key = extension.toLowerCase();
		const mimeType = (mimeTypes as Record<string, string | undefined>)[key];
		return mimeType ?? 'audio/mpeg';
	}

	/**
	 * Initialize the cleaning pipeline for this model
	 */
	protected initializeCleaningPipeline(debugMode: boolean = false): void {
		const strategy = getModelCleaningStrategy(this.modelId, debugMode);

		// CLEANER_DEBUG_START - Remove this block after confirming new cleaner system works
		//
		//
		// CLEANER_DEBUG_END

			switch (strategy.pipelineType) {
			case 'whisper':
				this.cleaningPipeline = debugMode
					? WhisperCleaningPipeline.createWithLogging(this.dictionaryCorrector)
					: WhisperCleaningPipeline.createDefault(this.dictionaryCorrector);
				break;

			case 'gpt4o':
				this.cleaningPipeline = debugMode
					? GPT4oCleaningPipeline.createWithLogging(this.dictionaryCorrector, this.modelId)
					: GPT4oCleaningPipeline.createDefault(this.dictionaryCorrector, this.modelId);
				break;

			case 'standard':
				this.cleaningPipeline = new StandardCleaningPipeline({
					name: 'StandardPipeline',
					cleaners: [],
					modelId: this.modelId,
					enableDetailedLogging: debugMode
				});
				break;
			}

		// CLEANER_DEBUG_START - Remove this block after confirming new cleaner system works
		//
		// CLEANER_DEBUG_END
	}

	/**
	 * Clean text using the configured pipeline
	 */
	async cleanText(text: string, language: string = 'auto', context?: CleaningContext): Promise<string> {
		// Validate input
		if (!text || typeof text !== 'string') {
			this.logger.warn(`[${this.modelId}] Invalid text input for cleaning, returning empty string`);
			return '';
		}

		// Initialize pipeline if needed
		if (!this.cleaningPipeline) {
			try {
				this.initializeCleaningPipeline();
			} catch (initError) {
				this.logger.error(`[${this.modelId}] Failed to initialize cleaning pipeline`, initError);
				return text; // Return original text if initialization fails
			}
		}

		// Final check for pipeline availability
		if (!this.cleaningPipeline) {
			this.logger.warn(`[${this.modelId}] No cleaning pipeline available after initialization, returning original text`);
			return text;
		}

		try {
			const pipelineContext: CleaningContext = {
				modelId: this.modelId,
				...(context ?? {})
			};
			const result = await this.cleaningPipeline.execute(text, language, pipelineContext);

			// Log summary if there were significant changes or issues
			if (result.metadata.totalIssuesFound > 0 || result.metadata.totalReductionRatio > 0.1) {
				this.logger.debug(`[${this.modelId}] Cleaning pipeline made significant adjustments`, {
					issuesFound: result.metadata.totalIssuesFound,
					reductionRatio: result.metadata.totalReductionRatio
				});
			}

			return result.finalText;
		} catch (error) {
			// Provide more detailed error information
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			const errorStack = error instanceof Error ? error.stack : undefined;

			this.logger.error(`[${this.modelId}] Text cleaning pipeline failed`, {
				error: errorMessage,
				textLength: text.length,
				language,
				context,
				stack: errorStack
			});

			// Return original text as fallback
			return text;
		}
	}

	/**
	 * Set debug mode for cleaning pipeline
	 * This will enable detailed logging of the cleaning process
	 */
	protected setCleaningDebugMode(debugMode: boolean): void {
		this.initializeCleaningPipeline(debugMode);
	}

	/**
	 * Enable detailed logging for troubleshooting cleaning issues
	 * This method should be used during development or when investigating
	 * text cleaning problems
	 */
	enableCleaningDebugMode(): void {
		this.setCleaningDebugMode(true);
	}

	/**
	 * Disable detailed logging to reduce console noise in production
	 */
	disableCleaningDebugMode(): void {
		this.setCleaningDebugMode(false);
	}

}
