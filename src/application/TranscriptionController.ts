/**
 * Main transcription controller
 * Entry point for the refactored transcription system
 */

import { Notice } from 'obsidian';

import { AUDIO_CONSTANTS, SUPPORTED_FORMATS } from '../config/constants';
import { getModelConfig, getTranscriptionConfig, logAllModelConfigs } from '../config/ModelProcessingConfig';
import { getTranscriptionModelProfile } from '../config/TranscriptionModelProfiles';
import { AudioPipeline } from '../core/audio/AudioPipeline';
import { AudioDecodingError } from '../core/audio/AudioPreparationError';
import { assertEncodedMediaWithinBudget } from '../core/audio/MediaWorkBudget';
import { DictionaryCorrector } from '../core/transcription/DictionaryCorrector';
import { canFallBackToOriginalDirectUpload, createTranscriptionJobPlan } from '../core/transcription/TranscriptionJobPlan';
import { isAbortError } from '../core/utils/CooperativeTask';
import { SimpleProgressCalculator } from '../core/utils/SimpleProgressCalculator';
import { t } from '../i18n';
import { FallbackEngine } from '../infrastructure/audio/FallbackEngine';
import { VADChunkingService } from '../infrastructure/audio/VADChunkingService';
import { WebAudioChunkingService } from '../infrastructure/audio/WebAudioChunkingService';
import { WebAudioEngine } from '../infrastructure/audio/WebAudioEngine';
import { SafeStorageService } from '../infrastructure/storage/SafeStorageService';
import { SecurityUtils } from '../infrastructure/storage/SecurityUtils';
import { Logger } from '../utils/Logger';
import { PathUtils } from '../utils/PathUtils';
import { VADPreprocessor } from '../vad/VadPreprocessor';

import { GPT4oTranscriptionService } from './services/GPT4oTranscriptionService';
import { WhisperTranscriptionService } from './services/WhisperTranscriptionService';
import { GPT4oTranscriptionStrategy } from './strategies/GPT4oTranscriptionStrategy';
import { WhisperTranscriptionStrategy } from './strategies/WhisperTranscriptionStrategy';
import { TranscriptionWorkflow } from './workflows/TranscriptionWorkflow';

import type { APITranscriptionSettings, DictionaryEntry, UserDictionary, VADMode } from '../ApiSettings';
import type { AudioProcessingConfig } from '../core/audio/AudioTypes';
import type { ChunkingService } from '../core/chunking/ChunkingService';
import type { ChunkingConfig } from '../core/chunking/ChunkingTypes';
import type { DictionaryEntry as CorrectionDictionaryEntry } from '../core/transcription/DictionaryCorrector';
import type { TranscriptionService } from '../core/transcription/TranscriptionService';
import type { TranscriptionStrategy } from '../core/transcription/TranscriptionStrategy';
import type { TranscriptionOptions, TranscriptionOutcome, TranscriptionProgress } from '../core/transcription/TranscriptionTypes';
import type { ProgressTracker } from '../ui/ProgressTracker';
import type { WorkflowOptions, WorkflowResult } from './workflows/TranscriptionWorkflow';
import type { App, TFile } from 'obsidian';

export class TranscriptionController {
	private app: App;
	private settings: APITranscriptionSettings;
	private progressTracker: ProgressTracker | null;
	private vadPreprocessor: VADPreprocessor | null = null;
	private logger = Logger.getLogger('TranscriptionController');
	private noVADFallback = false;

	// Cached instances
	private audioPipeline: AudioPipeline | null = null;
	private progressCalculator?: SimpleProgressCalculator;

	constructor(
		app: App,
		settings: APITranscriptionSettings,
		progressTracker?: ProgressTracker
	) {
		this.app = app;
		this.settings = settings;
		this.progressTracker = progressTracker ?? null;
	}

	/**
	 * Main transcription entry point
	 */
	async transcribe(
		audioFile: TFile,
		startTime?: number,
		endTime?: number,
		abortSignal?: AbortSignal
	): Promise<string | TranscriptionOutcome> {
		this.logger.info('Starting transcription', {
			file: audioFile.name,
			model: this.settings.model,
			startTime,
			endTime
		});

		const processStartTime = performance.now();
		const timings: Record<string, number> = {};

		try {
			const planInput = {
				model: this.settings.model,
				vadMode: this.getVadMode(),
				fileSizeBytes: audioFile.stat.size,
				extension: audioFile.extension,
				...(startTime !== undefined ? { startTime } : {}),
				...(endTime !== undefined ? { endTime } : {})
			};
			let jobPlan = createTranscriptionJobPlan(planInput);
			if (jobPlan.mode === 'client') {
				assertEncodedMediaWithinBudget(audioFile.stat.size);
			}
			if (abortSignal?.aborted) {
				throw new DOMException('Transcription cancelled', 'AbortError');
			}

			// Load audio file
			const loadStart = performance.now();
			let audioBuffer = await this.app.vault.readBinary(audioFile);
			if (audioBuffer.byteLength === 0) {
				throw new AudioDecodingError('The selected audio file is empty.');
			}
			const actualPlanInput = {
				...planInput,
				fileSizeBytes: audioBuffer.byteLength
			};
			jobPlan = createTranscriptionJobPlan(actualPlanInput);
			if (jobPlan.mode === 'client') {
				assertEncodedMediaWithinBudget(audioBuffer.byteLength);
			}
			timings['fileLoad'] = performance.now() - loadStart;
			this.logger.debug('Audio file loaded', {
				size: `${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`,
				loadTime: `${timings['fileLoad'].toFixed(0)}ms`
			});

			if (jobPlan.mode === 'direct') {
				return await this.transcribeDirectFile(
					audioFile,
					audioBuffer,
					abortSignal
				);
			}
			const canUseOriginalFallback = canFallBackToOriginalDirectUpload(actualPlanInput);

			// Initialize components
			await this.initialize();

			// Apply VAD preprocessing (always enabled)
			let vadApplied = false;
				if (this.vadPreprocessor) {
					try {
						const vadStart = performance.now();
						// const originalSize = audioBuffer.byteLength; // Removed: unused variable
						// VADPreprocessor.processFile returns ArrayBuffer (processed audio)
						const processedBuffer = await this.vadPreprocessor.processFile(
							audioFile,
							startTime,
							endTime,
							{
								sourceBuffer: audioBuffer,
								...(abortSignal ? { signal: abortSignal } : {})
							}
						);
						timings['vadProcessing'] = performance.now() - vadStart;

						// The preprocessor returns the original buffer object when it did not
						// apply VAD or a selected range.
						if (processedBuffer !== audioBuffer) {
							audioBuffer = processedBuffer;
							vadApplied = true;
						// Note: Detailed statistics are logged inside VADPreprocessor
					} else {
						// VAD processing didn't modify the audio, use original
					}
				} catch (error) {
					this.logger.error('VAD preprocessing failed', error);
					if (error instanceof AudioDecodingError && canUseOriginalFallback) {
						this.logger.warn('Local decoding failed; using the eligible original-file upload path', {
							file: audioFile.name,
							code: error.code
						});
						new Notice(t('notices.vadUnavailable'), 5000);
						await this.cleanup();
						return await this.transcribeDirectFile(audioFile, audioBuffer, abortSignal);
					}
					throw error;
				}
			} else {
				// VAD not available, use original audio
			}

			if (!vadApplied && this.noVADFallback && canUseOriginalFallback) {
				this.logger.info('Local VAD is unavailable; switching to the eligible original-file upload path');
				await this.cleanup();
				return await this.transcribeDirectFile(audioFile, audioBuffer, abortSignal);
			}

			// Prepare workflow options
			// If VAD was applied, don't apply time range again (already applied in VAD)
			const effectiveStartTime = vadApplied ? undefined : startTime;
			const effectiveEndTime = vadApplied ? undefined : endTime;
			const options = this.prepareWorkflowOptions(
				effectiveStartTime,
				effectiveEndTime,
				abortSignal,
				vadApplied ? `${audioFile.basename}.wav` : undefined
			);

			// Create workflow
			const { workflow, dictionaryCorrector } = this.createWorkflow();

			// Validate
			const validation = await workflow.validate(audioFile, audioBuffer);
			if (!validation.valid) {
				const errorDetails = Array.isArray(validation.errors) ? validation.errors.join(', ') : '';
				throw new Error(t('errors.validationFailed', { details: errorDetails }));
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
			timings['transcription'] = performance.now() - transcriptionStart;
			this.logger.debug('Transcription completed', {
				duration: `${timings['transcription'].toFixed(0)}ms`,
				chunks: result.chunks,
				partial: result.partial
			});

			// Log statistics
			this.logStatistics(audioFile, result);

			// Log timing information
			timings['total'] = performance.now() - processStartTime;

			// Check if result is partial
				if (result.partial) {
					this.logger.warn('Partial transcription result', { error: result.error });
					const partialOutcome: TranscriptionOutcome = {
						text: result.text,
						modelUsed: result.modelUsed || this.settings.model,
						partial: true
					};
					if (result.error) {
						partialOutcome.error = result.error;
					}
					return partialOutcome;
				}

			// Apply dictionary correction if enabled
			const correctedText = await this.applyDictionaryCorrection(result.text, dictionaryCorrector, abortSignal);

			// Return both text and model used if available
			if (result.modelUsed) {
				return { text: correctedText, modelUsed: result.modelUsed };
			}
			return correctedText;

		} catch (error) {
			// Cancellation is also user-driven; keep logs quieter
			const isCancelled =
				(abortSignal?.aborted ?? false) ||
				(error instanceof DOMException && error.name === 'AbortError') ||
				(error instanceof Error && error.message === t('errors.transcriptionCancelledByUser'));
			if (isCancelled) {
				this.logger.info('Transcription cancelled');
				throw error;
			}

			this.logger.error('Transcription failed', error);
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
				this.progressTracker.updateProgress(currentTask.id, 0, t('modal.transcription.preparingAudio'), prepProgress);
			}
		}

		const vadMode = this.getVadMode();
		this.logger.debug('VAD mode selected', { vadMode });
		if (vadMode === 'local') {
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
			this.noVADFallback = this.vadPreprocessor.getFallbackMode() === 'disabled';
			this.logger.debug('VAD preprocessor initialized', {
				noVADFallback: this.noVADFallback
			});
			if (this.noVADFallback) {
				this.logger.warn('Local VAD unavailable; processing will continue without silence removal.');
			}
		} else {
			this.vadPreprocessor = null;
			this.noVADFallback = true;
			this.logger.info('VAD disabled via settings. Proceeding without silence removal.');
		}

		// Initialize audio pipeline
		if (!this.audioPipeline) {
			this.logger.debug('Creating audio pipeline...');
			this.audioPipeline = this.createAudioPipeline();
		}
	}

	/**
	 * Create audio pipeline
	 */
	private createAudioPipeline(): AudioPipeline {
		// Audio processing config
		const audioConfig: AudioProcessingConfig = {
			targetSampleRate: AUDIO_CONSTANTS.SAMPLE_RATE,
			targetBitDepth: AUDIO_CONSTANTS.BIT_DEPTH,
			targetChannels: AUDIO_CONSTANTS.CHANNELS,
			enableVAD: !this.noVADFallback,
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
			enabled: !this.noVADFallback,
			processor: 'webrtc' as const,
			sensitivity: 0.7,
			minSpeechDuration: 0.3,
			maxSilenceDuration: 0.5,
			speechPadding: 0.1,
			debug: false
		};

		let chunkingService: ChunkingService;
		if (this.noVADFallback) {
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
		const model = this.settings.model;
		const profile = getTranscriptionModelProfile(model);
		const modelConfig = getModelConfig(model);
		const isWhisper = profile.workflow === 'whisper';

		const minMatchLength = modelConfig.merging.minMatchLength ?? 0;

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
				mergeStrategy: isWhisper ? {
					type: 'overlap_removal',
					config: {
						minMatchLength
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
	private createWorkflow(): { workflow: TranscriptionWorkflow; dictionaryCorrector: DictionaryCorrector } {
		this.logger.debug('Creating transcription workflow', { model: this.settings.model });

		// Get API key
		const apiKey = this.getApiKey();

		// Create dictionary corrector with user dictionary
		const dictionaryCorrector = this.createDictionaryCorrector();

		// Create service and strategy
		let service: TranscriptionService;
		let strategy: TranscriptionStrategy;

		const profile = getTranscriptionModelProfile(this.settings.model);

		if (profile.workflow === 'whisper') {
			this.logger.debug('Using Whisper transcription service', { model: profile.id });
			service = new WhisperTranscriptionService(apiKey, profile.id, dictionaryCorrector);
			strategy = new WhisperTranscriptionStrategy(
				service,
				this.createProgressAdapter()
			);
		} else {
			this.logger.debug('Using OpenAI file transcription service', { model: profile.id });
			service = new GPT4oTranscriptionService(apiKey, profile.id, dictionaryCorrector);
			strategy = new GPT4oTranscriptionStrategy(
				service,
				this.createProgressAdapter()
			);
		}

		if (this.settings.debugMode) {
			service.enableCleaningDebugMode();
		}

		const pipeline = this.audioPipeline ?? this.createAudioPipeline();
		this.audioPipeline = pipeline;
		const workflow = new TranscriptionWorkflow(pipeline, strategy);
		this.logger.debug('Workflow created successfully');
		return { workflow, dictionaryCorrector };
	}

	private async transcribeDirectFile(
		audioFile: TFile,
		audioBuffer: ArrayBuffer,
		abortSignal?: AbortSignal
	): Promise<{ text: string; modelUsed: string }> {
		if (abortSignal?.aborted) {
			throw new DOMException('Transcription cancelled', 'AbortError');
		}

		const apiKey = this.getApiKey();
		const dictionaryCorrector = this.createDictionaryCorrector();
		const profile = getTranscriptionModelProfile(this.settings.model);
		if (!profile.capabilities.originalDirectUpload) {
			throw new Error(
				`[TranscriptionController] Model "${profile.id}" cannot use direct file transcription`
			);
		}
		if (!canFallBackToOriginalDirectUpload({
			model: profile.id,
			vadMode: 'disabled',
			fileSizeBytes: audioBuffer.byteLength,
			extension: audioFile.extension
		})) {
			throw new Error('The original file is not eligible for direct transcription upload.');
		}
		const model = profile.id;
		const service = new GPT4oTranscriptionService(apiKey, model, dictionaryCorrector);
		const mimeTypes = SUPPORTED_FORMATS.MIME_TYPES as Record<string, string>;
		const mimeType = mimeTypes[audioFile.extension.toLowerCase()] ?? 'application/octet-stream';
		const options: TranscriptionOptions = {
			language: this.settings.language || 'auto',
			timestamps: false,
			...(abortSignal ? { signal: abortSignal } : {})
		};
		const uploadFileName = `upload.${audioFile.extension.toLowerCase()}`;
		const result = await service.transcribeFile(
			audioBuffer,
			uploadFileName,
			mimeType,
			options
		);
		if (abortSignal?.aborted) {
			throw new DOMException('Transcription cancelled', 'AbortError');
		}
		if (!result.success) {
			throw new Error(result.error || t('errors.noTranscriptionResults'));
		}

		if (this.progressTracker) {
			const currentTask = this.progressTracker.getCurrentTask();
			if (currentTask) {
				this.progressTracker.updateTotalChunks(currentTask.id, 1);
				this.progressTracker.updateProgress(currentTask.id, 1, t('modal.transcription.savingResults'), 70);
			}
		}

		const correctedText = await this.applyDictionaryCorrection(result.text, dictionaryCorrector, abortSignal);
		this.logger.info('Direct transcription completed', {
			file: audioFile.name,
			textLength: correctedText.length,
			model
		});
		return { text: correctedText, modelUsed: model };
	}

	/**
	 * Apply dictionary correction to transcribed text
	 */
	private async applyDictionaryCorrection(
		text: string,
		corrector: DictionaryCorrector,
		signal?: AbortSignal
	): Promise<string> {
		// Only apply if dictionary correction is enabled
		if (!this.settings.dictionaryCorrectionEnabled) {
			this.logger.trace('Dictionary correction disabled, skipping');
			return text;
		}

			this.logger.debug('Applying dictionary corrections...');
			try {
				const currentLanguage = this.settings.language || 'auto';
				const correctedText = await corrector.correct(text, currentLanguage, signal);

			if (correctedText !== text) {
				this.logger.debug('Dictionary corrections applied');
			}

			return correctedText;
		} catch (error) {
			if (isAbortError(error, signal)) {
				throw error;
			}
			this.logger.error('Dictionary correction failed', error);
			// Return original text on error
				return text;
			}
		}

	/**
	 * Create dictionary corrector with user dictionary
	 */
			private createDictionaryCorrector(): DictionaryCorrector {
			const corrector = new DictionaryCorrector();

			if (!this.settings.dictionaryCorrectionEnabled) {
				return corrector;
			}

		// Get current language setting
			const currentLanguage = this.settings.language;

		if (currentLanguage === 'auto') {
			// For auto-detect, use all language dictionaries combined
			const allEntries = this.convertAllDictionariesToEntries();

			if (allEntries.length > 0) {
				const multiDict = {
					name: 'user-dictionary-multi',
					language: 'multi', // Special language code for multi-language
					enabled: true,
						entries: allEntries
					};
				corrector.addDictionary(multiDict);
			}
		} else if (currentLanguage === 'ja' || currentLanguage === 'en'
			|| currentLanguage === 'zh' || currentLanguage === 'ko') {
			// For specific language, use only that language's dictionary
				const userDictionary = this.settings.userDictionaries[currentLanguage];
				const entries = this.convertDictionaryToEntries(userDictionary);

				if (entries.length > 0) {
					const langDict = {
						name: `user-dictionary-${currentLanguage}`,
						language: currentLanguage,
						enabled: true,
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
	private convertDictionaryToEntries(userDictionary: UserDictionary): CorrectionDictionaryEntry[] {
		const entries: CorrectionDictionaryEntry[] = [];

			// Add definite corrections as rules
			entries.push(
				...userDictionary.definiteCorrections
					.filter((entry: DictionaryEntry) => entry.from.length > 0 && entry.to)
					.flatMap((entry: DictionaryEntry) => {
						return entry.from.map((pattern: string) => {
							const mapped: CorrectionDictionaryEntry = {
								pattern,
							replacement: entry.to,
							caseSensitive: false
						};
						if (entry.category !== undefined) {
							mapped.category = entry.category;
						}
						if (entry.priority !== undefined) {
							mapped.priority = entry.priority;
						}
						return mapped;
					});
				})
		);

		return entries;
	}

	/**
	 * Convert all language dictionaries to entries
	 */
	private convertAllDictionariesToEntries(): CorrectionDictionaryEntry[] {
		const allEntries: CorrectionDictionaryEntry[] = [];
		const languages: ('ja' | 'en' | 'zh' | 'ko')[] = ['ja', 'en', 'zh', 'ko'];

			for (const lang of languages) {
				const dict = this.settings.userDictionaries[lang];
				allEntries.push(...this.convertDictionaryToEntries(dict));
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
				throw new Error(validation.error ?? 'Invalid API key');
			}

		return apiKey;
	}

	/**
	 * Create progress adapter that converts TranscriptionProgress to ProgressTracker format
	 */
	private createProgressAdapter(): (progress: TranscriptionProgress) => void {
		if (!this.progressTracker || !this.progressCalculator) {
			return () => {
				// Progress tracking is disabled; no-op
			};
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
				const unifiedPercentage = this.progressCalculator?.transcriptionProgress(completedChunks) ?? 0;

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
		private prepareWorkflowOptions(
			startTime?: number,
			endTime?: number,
			abortSignal?: AbortSignal,
			processedFileName?: string
			): WorkflowOptions {
				const options: WorkflowOptions = {
					language: this.settings.language
					// Note: VAD is already applied at the file level before this point
				};
			if (startTime !== undefined) {
				options.startTime = startTime;
			}
			if (endTime !== undefined) {
				options.endTime = endTime;
			}
				if (abortSignal) {
					options.signal = abortSignal;
				}
				if (processedFileName) {
					options.sourceFileName = processedFileName;
					options.sourceExtension = 'wav';
				}
				return options;
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
				partial: result.partial ?? false
			});
		}

	/**
	 * Cleanup resources
	 */
	private async cleanup(): Promise<void> {
		// Clean up VAD preprocessor
		const vadPreprocessor = this.vadPreprocessor;
		this.vadPreprocessor = null;
		if (vadPreprocessor) {
			try {
				await vadPreprocessor.cleanup();
			} catch (error) {
				this.logger.error('Error cleaning up VAD preprocessor', error);
			}
		}

		// Clean up audio pipeline (which includes WebAudioEngine and VADChunkingService)
		const audioPipeline = this.audioPipeline;
		this.audioPipeline = null;
		if (audioPipeline) {
			await audioPipeline.dispose();
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
		this.audioPipeline = null;
	}

		private getVadMode(): VADMode {
			return this.settings.vadMode;
		}

}
