/**
 * Main transcription controller
 * Entry point for the refactored transcription system
 */

import { App, TFile, Notice } from 'obsidian';
import { APITranscriptionSettings, DictionaryEntry, ContextualCorrection, UserDictionary } from '../ApiSettings';
import { t } from '../i18n';

// Core
import { AudioPipeline } from '../core/audio/AudioPipeline';
import { AudioProcessingConfig } from '../core/audio/AudioTypes';
import { ChunkingConfig } from '../core/chunking/ChunkingTypes';
import { ChunkingService } from '../core/chunking/ChunkingService';
import { getModelConfig, getTranscriptionConfig, logAllModelConfigs } from '../config/ModelProcessingConfig';
import { AUDIO_CONSTANTS } from '../config/constants';
import { DictionaryCorrector } from '../core/transcription/DictionaryCorrector';
import { GPTDictionaryCorrectionService } from '../infrastructure/api/dictionary/GPTDictionaryCorrectionService';
import { ResourceManager } from '../core/resources/ResourceManager';

// Infrastructure
import { WebAudioEngine } from '../infrastructure/audio/WebAudioEngine';
import { FallbackEngine } from '../infrastructure/audio/FallbackEngine';
import { VADChunkingService } from '../infrastructure/audio/VADChunkingService';
import { WebAudioChunkingService } from '../infrastructure/audio/WebAudioChunkingService';
import { SafeStorageService } from '../infrastructure/storage/SafeStorageService';
import { SecurityUtils } from '../infrastructure/storage/SecurityUtils';

// Application
import { TranscriptionWorkflow, WorkflowOptions, WorkflowResult } from './workflows/TranscriptionWorkflow';
import { WhisperTranscriptionService } from './services/WhisperTranscriptionService';
import { GPT4oTranscriptionService } from './services/GPT4oTranscriptionService';
import { WhisperTranscriptionStrategy } from './strategies/WhisperTranscriptionStrategy';
import { GPT4oTranscriptionStrategy } from './strategies/GPT4oTranscriptionStrategy';
import { TranscriptionProgress } from '../core/transcription/TranscriptionTypes';

// Support
import { VADPreprocessor } from '../vad/VadPreprocessor';
import { ProgressTracker } from '../ui/ProgressTracker';
import { SimpleProgressCalculator } from '../core/utils/SimpleProgressCalculator';
import { Logger } from '../utils/Logger';
import { PathUtils } from '../utils/PathUtils';

export class TranscriptionController {
	private app: App;
	private settings: APITranscriptionSettings;
	private progressTracker?: ProgressTracker;
	private vadPreprocessor?: VADPreprocessor;
	private logger = Logger.getLogger('TranscriptionController');
	private serverSideVADFallback = false;

	// Cached instances
	private audioPipeline?: AudioPipeline;
	private currentWorkflow?: TranscriptionWorkflow;
	private progressCalculator?: SimpleProgressCalculator;

	constructor(
		app: App,
		settings: APITranscriptionSettings,
		progressTracker?: ProgressTracker
	) {
		this.app = app;
		this.settings = settings;
		this.progressTracker = progressTracker;
	}

	/**
	 * Main transcription entry point
	 */
	async transcribe(
		audioFile: TFile,
		startTime?: number,
		endTime?: number,
		abortSignal?: AbortSignal
	): Promise<string | { text: string; modelUsed: string }> {
		this.logger.info('Starting transcription', {
			file: audioFile.name,
			model: this.settings.model,
			startTime,
			endTime
		});

		const processStartTime = performance.now();
		const timings: Record<string, number> = {};

		try {
			// Load audio file
			const loadStart = performance.now();
			let audioBuffer = await this.app.vault.readBinary(audioFile);
			timings.fileLoad = performance.now() - loadStart;
			this.logger.debug('Audio file loaded', {
				size: `${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`,
				loadTime: `${timings.fileLoad.toFixed(0)}ms`
			});

			// Initialize components
			await this.initialize();

			// Apply VAD preprocessing (always enabled)
			let vadApplied = false;
			if (this.vadPreprocessor) {
				try {
					const vadStart = performance.now();
					// const originalSize = audioBuffer.byteLength; // Removed: unused variable
					// VADPreprocessor.processFile returns ArrayBuffer (processed audio)
					const processedBuffer = await this.vadPreprocessor.processFile(audioFile, startTime, endTime);
					timings.vadProcessing = performance.now() - vadStart;

					// If VAD processing was successful and modified the audio
					// Compare byteLength instead of object reference to avoid
					// false positives when the buffer is re-read from disk
					if (
						processedBuffer &&
                                                processedBuffer.byteLength !== audioBuffer.byteLength
					) {
						audioBuffer = processedBuffer;
						vadApplied = true;
						// Note: Detailed statistics are logged inside VADPreprocessor
					} else {
						// VAD processing didn't modify the audio, use original
					}
				} catch (error) {
					this.logger.error('VAD preprocessing failed', error);

					// ユーザーに通知
					new Notice(
						t('notices.vadProcessingError', { error: error instanceof Error ? error.message : 'Unknown error' }),
						5000
					);

					// エラーを再スロー
					throw error;
				}
			} else {
				// VAD not available, use original audio
			}

			// Prepare workflow options
			// If VAD was applied, don't apply time range again (already applied in VAD)
			const effectiveStartTime = vadApplied ? undefined : startTime;
			const effectiveEndTime = vadApplied ? undefined : endTime;
			const options = await this.prepareWorkflowOptions(effectiveStartTime, effectiveEndTime, abortSignal);

			// Create workflow
			const workflow = this.createWorkflow();

			// Validate
			const validation = await workflow.validate(audioFile, audioBuffer);
			if (!validation.valid) {
				throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
			}

			// Show warnings if any
			if (validation.warnings && validation.warnings.length > 0) {
				validation.warnings.forEach(warning => {
					this.logger.warn(`Validation warning: ${warning}`);
				});
			}

			// Execute transcription
			this.logger.debug('Executing transcription workflow...');
			const transcriptionStart = performance.now();
			const result = await workflow.execute(audioFile, audioBuffer, options);
			timings.transcription = performance.now() - transcriptionStart;
			this.logger.debug('Transcription completed', {
				duration: `${timings.transcription.toFixed(0)}ms`,
				chunks: result.chunks,
				partial: result.partial
			});

			// Log statistics
			this.logStatistics(audioFile, result);

			// Log timing information
			timings.total = performance.now() - processStartTime;

			// Check if result is partial
			if (result.partial) {
				this.logger.warn('Partial transcription result', { error: result.error });
				// Throw an error with the partial results for APITranscriber to handle
				if (result.text) {
					throw new Error(result.text);
				}
			}

			// Apply dictionary correction if enabled
			const correctedText = await this.applyDictionaryCorrection(result.text);

			// Return both text and model used if available
			if (result.modelUsed) {
				return { text: correctedText, modelUsed: result.modelUsed };
			}
			return correctedText;

		} catch (error) {
			this.logger.error('Transcription failed', error);
			// Re-throw the error but with more context
			if (error instanceof Error && error.message.includes('[部分的な文字起こし結果]')) {
				// This is already formatted partial result, pass it through
				throw error;
			}
			throw error;
		} finally {
			this.logger.debug('Cleaning up resources...');
			await this.cleanup();
		}
	}

	/**
	 * Initialize components
	 */
	private async initialize(): Promise<void> {
		this.logger.debug('Initializing components...');

		// Log all model configurations for debugging
		if (this.settings.debugMode) {
			logAllModelConfigs();
		}

		// Initialize progress calculator
		this.progressCalculator = new SimpleProgressCalculator(this.settings.postProcessingEnabled);

		// Report preparation progress
		if (this.progressTracker) {
			const currentTask = this.progressTracker.getCurrentTask();
			if (currentTask) {
				const prepProgress = this.progressCalculator.preparationProgress();
				this.progressTracker.updateProgress(currentTask.id, 0, 'Preparing...', prepProgress);
			}
		}

		// Initialize VAD (always enabled)
		this.logger.debug('Initializing VAD preprocessor...');
		const vadConfig = getTranscriptionConfig().vad;
		this.vadPreprocessor = new VADPreprocessor(this.app, {
			enabled: true,
			processor: 'auto',
			sensitivity: vadConfig.sensitivity,
			minSpeechDuration: vadConfig.minSpeechDuration,
			maxSilenceDuration: vadConfig.maxSilenceDuration,
			speechPadding: vadConfig.speechPadding,
			debug: this.settings.debugMode
		});
		await this.vadPreprocessor.initialize();
		this.serverSideVADFallback = this.vadPreprocessor.getFallbackMode() === 'server_vad';
		this.logger.debug('VAD preprocessor initialized', {
			serverSideFallback: this.serverSideVADFallback
		});
		if (this.serverSideVADFallback) {
			this.logger.warn('Local VAD unavailable; server-side VAD will be used for chunking.');
		}

		// Initialize audio pipeline
		if (!this.audioPipeline) {
			this.logger.debug('Creating audio pipeline...');
			this.audioPipeline = await this.createAudioPipeline();
		}
	}

	/**
	 * Create audio pipeline
	 */
	private async createAudioPipeline(): Promise<AudioPipeline> {
		// Audio processing config
		const audioConfig: AudioProcessingConfig = {
			targetSampleRate: AUDIO_CONSTANTS.SAMPLE_RATE,
			targetBitDepth: AUDIO_CONSTANTS.BIT_DEPTH,
			targetChannels: AUDIO_CONSTANTS.CHANNELS,
			enableVAD: !this.serverSideVADFallback,
			vadConfig: {
				processor: 'auto',
				sensitivity: 0.7,
				minSpeechDuration: 0.3,
				maxSilenceDuration: 0.5
			}
		};

		// Create audio processor
		let audioProcessor;
		if (WebAudioEngine.isAvailable()) {
			audioProcessor = new WebAudioEngine(audioConfig);
		} else {
			this.logger.warn('WebAudio not available, using fallback audio engine');
			audioProcessor = new FallbackEngine(audioConfig);
		}

		// Create VAD-based chunking service
		const chunkingConfig = this.getChunkingConfig();
		const vadConfig = {
			enabled: !this.serverSideVADFallback,
			processor: 'webrtc' as const,
			sensitivity: 0.7,
			minSpeechDuration: 0.3,
			maxSilenceDuration: 0.5,
			speechPadding: 0.1,
			debug: false
		};

		let chunkingService: ChunkingService;
		if (this.serverSideVADFallback) {
			this.logger.warn('Creating WebAudio chunking service because local VAD is unavailable');
			const fallbackChunkingService = new WebAudioChunkingService(chunkingConfig);
			fallbackChunkingService.setPreferredChunkDuration(
				chunkingConfig.constraints.chunkDurationSeconds
			);
			chunkingService = fallbackChunkingService;
		} else {
			chunkingService = new VADChunkingService(
				this.app,
				chunkingConfig,
				vadConfig,
				PathUtils.getCurrentPluginId()
			);
		}

		// Create pipeline
		const pipeline = new AudioPipeline({
			audioProcessor,
			chunkingService,
			audioConfig
		});

		this.logger.debug('Audio pipeline created', {
			engine: WebAudioEngine.isAvailable() ? 'WebAudio' : 'Fallback'
		});

		return pipeline;
	}

	/**
	 * Get chunking configuration based on model
	 */
	private getChunkingConfig(): ChunkingConfig {
		const model = this.settings.model as string; // Cast to string
		const modelConfig = getModelConfig(model);
		const isWhisper = model.startsWith('whisper-1');


		const serverFallback = this.serverSideVADFallback;

		return {
			constraints: {
				maxSizeMB: modelConfig.maxFileSizeMB,
				maxDurationSeconds: modelConfig.maxDurationSeconds,
				chunkDurationSeconds: modelConfig.chunkDurationSeconds,
				recommendedOverlapSeconds: modelConfig.vadChunking.overlapDurationSeconds,
				supportsParallelProcessing: modelConfig.maxConcurrentChunks > 1,
				maxConcurrentChunks: modelConfig.maxConcurrentChunks
			},
			modelName: model, // Pass model name for VAD chunking config
			processingMode: isWhisper ? 'parallel' : 'sequential',
			useServerVAD: serverFallback,
			mergeStrategy: isWhisper ? {
				type: 'overlap_removal',
				config: {
					minMatchLength: modelConfig.merging.minMatchLength
				}
			} : {
				type: 'simple',
				config: {
					separator: '\n\n'
				}
			},
			optimizeBoundaries: modelConfig.vadChunking.optimizeBoundaries
		};
	}

	/**
	 * Create workflow based on model
	 */
	private createWorkflow(): TranscriptionWorkflow {
		this.logger.debug('Creating transcription workflow', { model: this.settings.model });

		// Get API key
		const apiKey = this.getApiKey();

		// Create dictionary corrector with user dictionary
		const dictionaryCorrector = this.createDictionaryCorrector();

		// Create service and strategy
		let service;
		let strategy;

		const model = this.settings.model as string; // Cast to string

		if (model.startsWith('whisper-1')) {
			this.logger.debug('Using Whisper transcription service', { model });
			service = new WhisperTranscriptionService(apiKey, model, dictionaryCorrector);
			strategy = new WhisperTranscriptionStrategy(
				service,
				this.createProgressAdapter()
			);
		} else {
			// GPT-4o or GPT-4o Mini
			let gpt4oModel: string;

			if (model === 'gpt-4o-transcribe') {
				gpt4oModel = 'gpt-4o-transcribe';
			} else {
				gpt4oModel = 'gpt-4o-mini-transcribe';
			}

			this.logger.debug('Using GPT-4o transcription service', { model: gpt4oModel });
			service = new GPT4oTranscriptionService(apiKey, gpt4oModel, dictionaryCorrector);
			strategy = new GPT4oTranscriptionStrategy(
				service,
				this.createProgressAdapter()
			);
		}

		// Create workflow
		const workflow = new TranscriptionWorkflow(this.audioPipeline!, strategy);
		this.logger.debug('Workflow created successfully');
		return workflow;
	}

	/**
	 * Apply dictionary correction to transcribed text
	 */
	private async applyDictionaryCorrection(text: string): Promise<string> {
		// Only apply if dictionary correction is enabled
		if (!this.settings.dictionaryCorrectionEnabled) {
			this.logger.trace('Dictionary correction disabled, skipping');
			return text;
		}

		this.logger.debug('Applying dictionary corrections...');
		try {
			const corrector = this.createDictionaryCorrector();
			const currentLanguage = this.settings.language || 'auto';
			const correctedText = await corrector.correct(text, currentLanguage);

			if (correctedText !== text) {
				this.logger.debug('Dictionary corrections applied');
			}

			return correctedText;
		} catch (error) {
			this.logger.error('Dictionary correction failed', error);
			// Return original text on error
			return text;
		}
	}

	/**
	 * Create dictionary corrector with user dictionary
	 */
	private createDictionaryCorrector(): DictionaryCorrector {
		// Get API key for GPT correction
		// Enable GPT correction if post-processing is enabled
		const useGPTCorrection = this.settings.postProcessingEnabled;
		const resourceManager = ResourceManager.getInstance();
		const gptService = useGPTCorrection
			? new GPTDictionaryCorrectionService(this.getApiKey(), resourceManager)
			: undefined;

		const corrector = new DictionaryCorrector(useGPTCorrection, gptService);

		if (!this.settings.userDictionaries || !this.settings.dictionaryCorrectionEnabled) {
			return corrector;
		}

		// Get current language setting
		const currentLanguage = this.settings.language || 'auto';

		if (currentLanguage === 'auto') {
			// For auto-detect, use all language dictionaries combined
			const allEntries = this.convertAllDictionariesToEntries();

			if (allEntries.length > 0) {
				const multiDict = {
					name: 'user-dictionary-multi',
					language: 'multi', // Special language code for multi-language
					enabled: true,
					useGPTCorrection: useGPTCorrection,
					// Pass all dictionaries data for GPT correction
					definiteCorrections: [
						...this.settings.userDictionaries.ja.definiteCorrections,
						...this.settings.userDictionaries.en.definiteCorrections,
						...this.settings.userDictionaries.zh.definiteCorrections
					],
					contextualCorrections: [
						...(this.settings.userDictionaries.ja.contextualCorrections || []),
						...(this.settings.userDictionaries.en.contextualCorrections || []),
						...(this.settings.userDictionaries.zh.contextualCorrections || [])
					],
					entries: allEntries
				};
				corrector.addDictionary(multiDict);
			}
		} else if (currentLanguage === 'ja' || currentLanguage === 'en' || currentLanguage === 'zh') {
			// For specific language, use only that language's dictionary
			const userDictionary = this.settings.userDictionaries[currentLanguage];
			const entries = this.convertDictionaryToEntries(userDictionary);

			if (entries.length > 0) {
				const langDict = {
					name: `user-dictionary-${currentLanguage}`,
					language: currentLanguage,
					enabled: true,
					useGPTCorrection: useGPTCorrection,
					definiteCorrections: userDictionary.definiteCorrections,
					contextualCorrections: userDictionary.contextualCorrections,
					entries: entries
				};
				corrector.addDictionary(langDict);
			}
		}

		return corrector;
	}

	/**
	 * Convert a single user dictionary to entries
	 */
	private convertDictionaryToEntries(userDictionary: UserDictionary): any[] {
		const entries: any[] = [];

		// Add definite corrections as rules
		entries.push(
			...userDictionary.definiteCorrections
				.filter((entry: DictionaryEntry) => entry.from && entry.from.length > 0 && entry.to)
				.flatMap((entry: DictionaryEntry) => {
					return entry.from.map((pattern: string) => ({
						pattern: pattern,
						replacement: entry.to,
						caseSensitive: false,
						category: entry.category,
						priority: entry.priority
					}));
				})
		);

		// Add contextual corrections as rules with conditions
		entries.push(
			...(userDictionary.contextualCorrections || [])
				.filter((entry: ContextualCorrection) => entry.from && entry.from.length > 0 && entry.to)
				.flatMap((entry: ContextualCorrection) => {
					return entry.from.map((pattern: string) => ({
						pattern: pattern,
						replacement: entry.to,
						caseSensitive: false,
						category: entry.category,
						priority: entry.priority,
						condition: entry.contextKeywords && entry.contextKeywords.length > 0
							? (text: string) => entry.contextKeywords!.some((keyword: string) => text.includes(keyword))
							: undefined
					}));
				})
		);

		return entries;
	}

	/**
	 * Convert all language dictionaries to entries
	 */
	private convertAllDictionariesToEntries(): any[] {
		const allEntries: any[] = [];
		const languages: ('ja' | 'en' | 'zh' | 'ko')[] = ['ja', 'en', 'zh', 'ko'];

		for (const lang of languages) {
			const dict = this.settings.userDictionaries[lang];
			if (dict) {
				allEntries.push(...this.convertDictionaryToEntries(dict));
			}
		}

		return allEntries;
	}

	/**
	 * Get decrypted API key
	 */
	private getApiKey(): string {
		const storedKey = this.settings.openaiApiKey;

		// Use SafeStorageService to retrieve the actual API key
		const apiKey = SafeStorageService.decryptFromStore(storedKey);

		// Validate API key format using SecurityUtils
		const validation = SecurityUtils.validateOpenAIAPIKey(apiKey);
		if (!validation.valid) {
			throw new Error(validation.error || 'Invalid API key');
		}

		return apiKey;
	}

	/**
	 * Create progress adapter that converts TranscriptionProgress to ProgressTracker format
	 */
	private createProgressAdapter(): ((progress: TranscriptionProgress) => void) | undefined {
		if (!this.progressTracker || !this.progressCalculator) {
			return undefined;
		}

		// We need to get the current task ID from the API transcriber
		// Since the controller doesn't have direct access to it, we'll create a closure
		// that captures the current task ID when it's called
		return (progress: TranscriptionProgress) => {
			try {
				// Get the current task from the progress tracker
				const currentTask = this.progressTracker?.getCurrentTask();
				if (!currentTask) {
					// This can happen if the task was already completed or cancelled
					// Just log the progress without updating the tracker
					return;
				}

				// Convert TranscriptionProgress to ProgressTracker format
				const completedChunks = progress.currentChunk;
				const message = progress.operation;

				// Update the total chunks if it's different from what we initially set
				if (progress.totalChunks !== currentTask.totalChunks) {
					// Update the task with correct total chunks via ProgressTracker
					this.progressTracker?.updateTotalChunks(currentTask.id, progress.totalChunks);
					// Also update progress calculator
					this.progressCalculator?.updateTotalChunks(progress.totalChunks);
				}

				// Calculate unified progress using SimpleProgressCalculator
				const unifiedPercentage = this.progressCalculator?.transcriptionProgress(completedChunks) || 0;

				// Call the actual updateProgress method with the correct parameters
				this.progressTracker?.updateProgress(currentTask.id, completedChunks, message, unifiedPercentage);

			} catch (error) {
				// Don't let progress tracking errors break the transcription
				this.logger.error('Error in progress adapter (continuing)', error);
			}
		};
	}

	/**
	 * Prepare workflow options
	 */
	private async prepareWorkflowOptions(
		startTime?: number,
		endTime?: number,
		abortSignal?: AbortSignal
	): Promise<WorkflowOptions> {
		return {
			startTime,
			endTime,
			language: this.settings.language || 'auto',
			customPrompt: undefined,
			onProgress: this.createProgressAdapter(),
			signal: abortSignal
			// Note: VAD is already applied at the file level before this point
		};
	}


	/**
	 * Log statistics
	 */
	private logStatistics(file: TFile, result: WorkflowResult): void {
		this.logger.info('Transcription completed', {
			file: file.name,
			model: this.settings.model,
			duration: `${result.duration.toFixed(1)}s`,
			chunks: result.chunks,
			chunkStrategy: result.strategy.needsChunking
				? `${result.strategy.totalChunks} chunks (${result.strategy.chunkDuration}s each)`
				: 'Single chunk',
			textLength: result.text.length,
			charsPerSecond: (result.text.length / result.duration).toFixed(2),
			partial: result.partial || false
		});
	}

	/**
	 * Cleanup resources
	 */
	private async cleanup(): Promise<void> {
		// Clean up VAD preprocessor
		if (this.vadPreprocessor) {
			await this.vadPreprocessor.cleanup();
			this.vadPreprocessor = undefined;
		}

		// Clean up audio pipeline (which includes WebAudioEngine and VADChunkingService)
		if (this.audioPipeline) {
			try {
				// AudioPipeline should cleanup its audio processor (WebAudioEngine)
				const audioProcessor = (this.audioPipeline as unknown as { audioProcessor?: { cleanup?: () => Promise<void> } }).audioProcessor;
				if (audioProcessor && typeof audioProcessor.cleanup === 'function') {
					await audioProcessor.cleanup();
				}

				// Clean up chunking service (VADChunkingService)
				const chunkingService = (this.audioPipeline as unknown as { chunkingService?: { cleanup?: () => Promise<void> } }).chunkingService;
				if (chunkingService && typeof chunkingService.cleanup === 'function') {
					await chunkingService.cleanup();
				}
			} catch (error) {
				this.logger.error('Error cleaning up audio pipeline', error);
			}
			this.audioPipeline = undefined;
		}
	}

	/**
	 * Test API connection
	 */
	async testConnection(): Promise<boolean> {
		this.logger.debug('Testing API connection...');
		const startTime = performance.now();

		try {
			const apiKey = this.getApiKey(); // This already validates format
			// Use SecurityUtils for API connection test
			const result = await SecurityUtils.testOpenAIAPIKey(apiKey);

			const elapsedTime = performance.now() - startTime;
			this.logger.info('Connection test completed', {
				valid: result.valid,
				elapsedTime: `${elapsedTime.toFixed(2)}ms`
			});

			return result.valid;
		} catch (error) {
			this.logger.error('Connection test failed', error);
			return false;
		}
	}

	/**
	 * Update settings
	 */
	updateSettings(settings: APITranscriptionSettings): void {
		this.logger.debug('Updating transcription controller settings', {
			model: settings.model,
			language: settings.language,
			postProcessingEnabled: settings.postProcessingEnabled
		});
		this.settings = settings;
		// Clear cached instances to force recreation with new settings
		this.audioPipeline = undefined;
		this.currentWorkflow = undefined;
	}

}
