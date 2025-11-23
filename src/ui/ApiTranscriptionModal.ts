import { App, Modal, Notice, TFile, MarkdownView, Platform, Setting, getLanguage, TextComponent, ButtonComponent, normalizePath } from 'obsidian';
import { APITranscriber } from '../ApiTranscriber';
import { APITranscriptionSettings } from '../ApiSettings';
import { MODEL_OPTIONS, getModelOption } from '../config/ModelOptions';
import { ErrorHandler } from '../ErrorHandler';
import { ProgressTracker } from './ProgressTracker';
import { SimpleProgressCalculator } from '../core/utils/SimpleProgressCalculator';
import { LoadingAnimation } from '../core/utils/LoadingAnimation';
import { AudioWaveformSelector } from './AudioWaveformSelector';
import { PostProcessingModal } from './PostProcessingModal';
import { DictionaryManagementModal } from './DictionaryManagementModal';
import { PostProcessingService } from '../application/services/PostProcessingService';
import { TranscriptionMetaInfo } from '../core/transcription/TranscriptionTypes';
import { createTranslationMetadata } from '../core/transcription/TranslationUtils';
import { t } from '../i18n';
import { ObsidianApp, isNavigatorWithWakeLock, WakeLockSentinel } from '../types/global';
import { FileTypeUtils } from '../config/constants';
import { Logger } from '../utils/Logger';
import { PathUtils } from '../utils/PathUtils';
import { FolderInputSuggest } from './FolderInputSuggest';

export class APITranscriptionModal extends Modal {
	private transcriber: APITranscriber;
	private audioFile: TFile;
	private settings: APITranscriptionSettings;
	private isTranscribing = false;
	private originalView: MarkdownView | null;
	private costEl: HTMLElement;
	private timeRangeEl: HTMLElement;
	private startTimeInput: HTMLInputElement;
	private endTimeInput: HTMLInputElement;
	private startHourInput: HTMLInputElement;
	private startMinInput: HTMLInputElement;
	private startSecInput: HTMLInputElement;
	private endHourInput: HTMLInputElement;
	private endMinInput: HTMLInputElement;
	private endSecInput: HTMLInputElement;
	private enableTimeRange = false;
	private audioDuration = 0;
	private progressTracker: ProgressTracker | null;
	private processInBackground = false;
	private waveformSelector: AudioWaveformSelector | null = null;
	private wakeLock: WakeLockSentinel | null = null;
	private normalCancelBtn: HTMLButtonElement | null = null;
	private cancelBtn: HTMLButtonElement | null = null;
	private transcribeBtn: ButtonComponent | null = null;
	private metaInfoBtn: HTMLButtonElement | null = null;
	private modalAudioContext: AudioContext | null = null;
	private metaInfo: TranscriptionMetaInfo | null = null;
	private saveSettings: (() => Promise<void>) | null = null;
	private progressListenerUnsubscribe: (() => void) | null = null;
	private progressCalculator: SimpleProgressCalculator | null = null;
	private loadingAnimation: LoadingAnimation;
	private logger: Logger;

	constructor(app: App, transcriber: APITranscriber, audioFile: TFile, settings: APITranscriptionSettings, progressTracker?: ProgressTracker) {
		super(app);
		this.transcriber = transcriber;
		this.audioFile = audioFile;
		this.settings = settings;
		this.progressTracker = progressTracker || null;
		this.loadingAnimation = new LoadingAnimation();
		this.logger = Logger.getLogger('APITranscriptionModal');
		this.logger.debug('APITranscriptionModal created', {
			fileName: audioFile.name,
			model: settings.model
		});

		// Store the current active view if it's a markdown view
		this.originalView = this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.logger.debug('Opening transcription modal');
		this.modalEl.addClass('ai-transcriber-modal');

		// Initialize progress calculator
		this.progressCalculator = new SimpleProgressCalculator(this.settings.postProcessingEnabled);

		// Register progress listener
		if (this.progressTracker) {
			this.progressListenerUnsubscribe = this.progressTracker.addListener((task) => {
				if (task && task.status === 'processing') {
					// Use unified percentage from progress tracker
					const percentage = this.progressTracker.getProgressPercentage();
					this.updateProgress(percentage);
				}
			});
			this.logger.debug('Progress listener registered');
		}

		contentEl.createEl('h2', { text: t('modal.transcription.title') });

		// Provider info with model selection
		const providerInfo = contentEl.createEl('div', { cls: 'transcription-provider-info' });
		const providerRow = providerInfo.createEl('div', { cls: 'ai-transcriber-provider-row' });

		// Label
		providerRow.createEl('span', {
			text: t('modal.transcription.modelLabel') + ': ',
			cls: 'ai-transcriber-provider-label'
		});

		// Model dropdown
		const modelSelect = providerRow.createEl('select', { cls: 'model-select' });
		MODEL_OPTIONS.forEach(opt => {
			// Generate label from translation keys
			let label: string;
			switch (opt.value) {
			case 'whisper-1':
				label = t('settings.model.whisperNoTimestamp');
				break;
			case 'whisper-1-ts':
				label = t('settings.model.whisperWithTimestamp');
				break;
			case 'gpt-4o-transcribe':
				label = t('settings.model.gpt4oHigh');
				break;
			case 'gpt-4o-mini-transcribe':
				label = t('settings.model.gpt4oMiniCost');
				break;
			default:
				label = opt.value; // Fallback to value if no translation
			}
			modelSelect.add(new Option(label, opt.value));
		});

		// Set current value
		modelSelect.value = this.settings.model;

		// Handle model change
		modelSelect.addEventListener('change', () => {
			void this.handleModelChange(modelSelect.value);
		});

		// File info with integrated cost estimation
		const fileInfo = contentEl.createEl('div', { cls: 'transcription-file-info' });

		// First row: File name only
		const fileNameRow = fileInfo.createEl('div', { cls: 'file-info-row' });
		fileNameRow.createEl('span', {
			text: `${t('modal.transcription.fileInfo')}: ${this.audioFile.name}`,
			cls: 'file-name',
			attr: { title: this.audioFile.path }
		});

		// Second row: File type and size
		const fileDetailsRow = fileInfo.createEl('div', { cls: 'file-info-row' });
		const fileExt = this.audioFile.extension.toLowerCase();
		const isVideo = FileTypeUtils.isVideoFile(fileExt);
		const fileTypeText = isVideo ? t('modal.transcription.videoFile') : t('modal.transcription.audioFile');
		// Display as "Audio File | 27.32 MB" format
		fileDetailsRow.createEl('span', {
			text: `${fileTypeText} | ${this.formatFileSize(this.audioFile.stat.size)}`,
			cls: 'file-details'
		});

		// Third row: Cost estimation (integrated)
		const costRow = fileInfo.createEl('div', { cls: 'file-info-row cost-row' });
		this.costEl = costRow.createEl('div', { cls: 'cost-info' });
		void this.displayCostEstimate();

		// Show warning for large files
		const sizeMB = this.audioFile.stat.size / (1024 * 1024);
		if (sizeMB > 500) {
			fileInfo.createEl('div', {
				text: t('modal.transcription.largeFileWarning', { size: sizeMB.toFixed(1) }),
				cls: 'file-size-warning'
			});
		}

		// Processing Options
		this.createProcessingOptions(contentEl);

		// Time range selection with pre-allocated space
		this.timeRangeEl = contentEl.createEl('div', { cls: 'ait-transcription-time-range' });
		// Pre-allocate space to prevent layout shift
		this.timeRangeEl.classList.add('ait-min-height-280');
		// Add loading indicator
		const loadingEl = this.timeRangeEl.createEl('div', {
			cls: 'ait-time-range-loading',
			text: t('common.loading')
		});
		// Load time range controls asynchronously
		void this.loadTimeRangeControls(loadingEl);

		// Always process in background on desktop
		if (!Platform.isMobile && this.progressTracker) {
			this.processInBackground = true; // Always true on desktop
		}

		// Buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'transcription-buttons' });

		// キャンセルボタン（左側）
		this.normalCancelBtn = buttonContainer.createEl('button', {
			text: t('modal.button.cancel')
		});
		this.normalCancelBtn.onclick = () => this.close();

		// 処理中のキャンセルボタン（モバイルのみ、非表示で開始）
		// デスクトップではバックグラウンド処理のためモーダルがすぐ閉じるので不要
		if (Platform.isMobile) {
			this.cancelBtn = buttonContainer.createEl('button', {
				text: t('common.cancel'),
				cls: 'mod-warning ait-hidden'
			});
			this.cancelBtn.onclick = () => this.cancelTranscription();
		}

		// 文字起こし開始ボタン（右側）
		this.transcribeBtn = new ButtonComponent(buttonContainer)
			.setButtonText(t('modal.transcription.startButton'))
			.setCta()
			.onClick(() => this.startTranscription());
	}

	private openMetaInfoModal(): void {
		const modal = new PostProcessingModal(
			this.app,
			'', // No transcription yet, just collecting meta info
			this.settings,
			(metaInfo) => {
				// Only update if metaInfo is not undefined (undefined means cancel)
				if (metaInfo !== undefined) {
					this.metaInfo = metaInfo;
				}

				// Update button text to show info was entered
				if (this.metaInfoBtn) {
					if (this.metaInfo && this.metaInfo.rawContent) {
						const filledText = t('modal.transcription.metaInfoButtonFilled');
						this.metaInfoBtn.textContent = filledText;
						this.metaInfoBtn.addClass('has-info');
					} else {
						const normalText = t('modal.transcription.metaInfoButton');
						this.metaInfoBtn.textContent = normalText;
						this.metaInfoBtn.removeClass('has-info');
					}
				}
			}
		);
		modal.open();
	}

	private async displayCostEstimate() {
		try {
			// If we have actual audio duration, use it for accurate estimation
			let actualMinutes: number;
			if (this.audioDuration > 0) {
				// Use actual audio duration (in seconds) converted to minutes
				actualMinutes = this.audioDuration / 60;
			} else {
				// Fallback to file size estimate
				const estimate = await this.transcriber.estimateCost(this.audioFile);
				if (estimate.details && typeof estimate.details === 'object' && 'minutes' in estimate.details) {
					actualMinutes = (estimate.details as { minutes: number }).minutes;
				} else {
					// Ultimate fallback based on cost
					actualMinutes = estimate.cost / 0.006; // Assume whisper pricing
				}
			}

			// Get pricing based on model
			const pricePerMinute = this.settings.model === 'gpt-4o-mini-transcribe' ? 0.003 : 0.006;
			let adjustedMinutes = actualMinutes;

			// Apply time range selection if enabled
			if (this.enableTimeRange && this.audioDuration > 0) {
				const { startTime, endTime } = this.getTimeRange();
				const selectedDuration = (endTime || this.audioDuration) - (startTime || 0);
				const durationRatio = selectedDuration / this.audioDuration;
				adjustedMinutes = adjustedMinutes * durationRatio;
			}

			// Calculate cost
			const adjustedCost = Math.round(adjustedMinutes * pricePerMinute * 100) / 100;

			// Build details string
			let adjustedDetails = `${adjustedMinutes.toFixed(1)} minutes @ $${pricePerMinute}/min`;
			if (this.settings.model.startsWith('gpt-4o')) {
				adjustedDetails += ` (${this.settings.model === 'gpt-4o-transcribe' ? 'GPT-4o' : 'GPT-4o Mini'})`;
			}

			// Clear and rebuild cost element
			this.costEl.empty();

			const labelSpan = this.costEl.createSpan({ cls: 'cost-label' });
			labelSpan.setText(t('modal.transcription.costEstimate') + ':');

			const valueSpan = this.costEl.createSpan({ cls: 'cost-value' });
			valueSpan.setText(`$${adjustedCost.toFixed(2)} USD`);

			const detailsEl = this.costEl.createEl('small', { cls: 'cost-details' });
			detailsEl.setText(adjustedDetails);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(this.formatUnknownError(error));
			this.logger.error('Failed to calculate cost estimate', err);
			// Clear and rebuild cost element for error case
			this.costEl.empty();

			const labelSpan = this.costEl.createSpan({ cls: 'cost-label' });
			labelSpan.setText(t('modal.transcription.costEstimate') + ':');

			const valueSpan = this.costEl.createSpan({ cls: 'cost-value' });
			valueSpan.setText('--');
		}
	}

	private async handleModelChange(selectedValue: string): Promise<void> {
		const option = getModelOption(selectedValue);
		if (!option) {
			return;
		}

		this.settings.model = option.model;

		try {
			if (this.saveSettings) {
				await this.saveSettings();
			} else {
				const obsidianApp = this.app as ObsidianApp;
				const plugin = obsidianApp.plugins?.plugins?.[PathUtils.getCurrentPluginId()];
				if (plugin?.saveSettings && typeof plugin.saveSettings === 'function') {
					await plugin.saveSettings();
				} else {
					this.logger.warn('Unable to save settings - saveSettings callback or plugin instance not found');
				}
			}
		} catch (error) {
			this.logger.error('Failed to persist model change', error);
		}

		void this.displayCostEstimate();
	}

	private async cancelTranscription() {
		if (!this.isTranscribing) {
			return;
		}

		this.updateStatus(t('modal.transcription.processing'));

		try {
			await this.transcriber.cancelTranscription();
			this.updateStatus(t('statusBar.cancelled'));

			// Reset button states
			this.isTranscribing = false;
			if (this.transcribeBtn !== null) {
				this.transcribeBtn.setDisabled(false);
				this.transcribeBtn.buttonEl.removeClass('ait-hidden');
			}
			// normalCancelBtn is always visible on desktop
			if (this.cancelBtn) {
				this.cancelBtn.classList.add('ait-hidden');
			}

			// Close modal after a short delay
			setTimeout(() => {
				this.close();
			}, 1000);
		} catch (error) {
			this.logger.error('Failed to cancel transcription', error);
			this.updateStatus(t('common.failed'));
		}
	}

	private async requestWakeLock() {
		if (Platform.isMobile && isNavigatorWithWakeLock(navigator) && navigator.wakeLock?.request) {
			try {
				this.wakeLock = await navigator.wakeLock.request('screen');
			} catch (err) {
				this.logger.warn('Failed to acquire wake lock', err);
			}
		}
	}

	private releaseWakeLock() {
		if (!this.wakeLock) {
			return;
		}
		const releasePromise = this.wakeLock.release();
		releasePromise.catch(err => {
			this.logger.warn('Failed to release wake lock', err);
		});
		this.wakeLock = null;
	}

	private async startTranscription() {
		if (this.isTranscribing) {
			return;
		}

		this.isTranscribing = true;

		// Update button states
		if (this.transcribeBtn !== null) {
			this.transcribeBtn.setDisabled(true);
			this.transcribeBtn.buttonEl.addClass('ait-hidden');
		}
		// normalCancelBtn is always visible on desktop
		if (this.cancelBtn) {
			this.cancelBtn.classList.remove('ait-hidden');
		}

		// If background processing is enabled, close modal and continue
		if (this.processInBackground && this.progressTracker) {
			await this.requestWakeLock();
			new Notice(t('notices.backgroundProcessingStarted'));
			this.close();

			// Continue processing in background
			void this.performTranscriptionInBackground().finally(() => {
				this.releaseWakeLock();
				this.isTranscribing = false;
			});
			return;
		}

		await this.requestWakeLock();

		try {
			// Only perform transcription
			await this.performTranscriptionOnly();

		} catch (error) {
			const userError = ErrorHandler.handleError(error as Error, 'API transcription');
			this.updateStatus(`${userError.title}`);
			ErrorHandler.displayError(userError);

		} finally {
			this.isTranscribing = false;
			this.releaseWakeLock();

			// Reset button states
			if (this.transcribeBtn !== null) {
				this.transcribeBtn.setDisabled(false);
				this.transcribeBtn.buttonEl.removeClass('ait-hidden');
			}
			// normalCancelBtn is always visible on desktop
			if (this.cancelBtn) {
				this.cancelBtn.classList.add('ait-hidden');
			}
		}
	}

	/**
	 * Perform transcription in background
	 */
	private async performTranscriptionInBackground() {
		// Ensure progress calculator is initialized
		if (!this.progressCalculator) {
			this.progressCalculator = new SimpleProgressCalculator(this.settings.postProcessingEnabled);
		}

		try {
			// Get time range if enabled
			const { startTime, endTime } = this.getTimeRange();

			// Transcribe using API
			let transcription = '';
			let modelUsed = '';
			const partialMarker = this.getPartialResultMarker();
			try {
				const result = await this.transcriber.transcribe(this.audioFile, startTime, endTime);
				if (typeof result === 'string') {
					transcription = result;
					modelUsed = this.settings.model; // Fallback to settings
				} else {
					transcription = result.text;
					modelUsed = result.modelUsed;
				}
			} catch (error) {
				// Check if error contains partial results
				const errorMessage = error instanceof Error ? error.message : '';
				if (errorMessage.includes(partialMarker)) {
					// This is a partial result, use it
					transcription = errorMessage;
				} else {
					// Re-throw if it's a different error
					throw error;
				}
			}

			// Check if this is a partial result
			const isPartialResult = transcription.includes(partialMarker);

			if (!transcription || (transcription.trim().length === 0 && !isPartialResult)) {
				throw new Error(t('errors.messages.noTranscriptionText'));
			}

			// Update progress to 70% before processing
			if (this.progressTracker) {
				const currentTask = this.progressTracker.getCurrentTask();
				if (currentTask && this.progressCalculator) {
					const progress = this.progressCalculator.postProcessingProgress('start');
					this.progressTracker.updateProgress(currentTask.id, currentTask.completedChunks, t('modal.transcription.postProcessing'), progress);
				}
			}

			// Insert transcription to the active note
			await this.insertTranscription(transcription, modelUsed);

			// Update to 100% after completion
			if (this.progressTracker) {
				const currentTask = this.progressTracker.getCurrentTask();
				if (currentTask && this.progressCalculator) {
					const progress = this.progressCalculator.completionProgress();
					this.progressTracker.updateProgress(currentTask.id, currentTask.completedChunks, t('common.completed'), progress);
				}
			}

			// Mark task as complete in progress tracker
			if (this.progressTracker) {
				const currentTask = this.progressTracker.getCurrentTask();
				if (currentTask) {
					if (isPartialResult) {
						// Mark as partial
						this.progressTracker.updateTaskStatus(currentTask.id, 'partial');
					} else {
						// Mark as complete
						this.progressTracker.completeTask(currentTask.id, transcription);
					}
				}
			}

			// Show completion notice
			const charCount = transcription.length;
			if (isPartialResult) {
				new Notice(t('notices.partialTranscriptionComplete', { count: charCount.toString() }));
			} else {
				new Notice(t('notices.transcriptionCompleteDetailed', { count: charCount.toString(), details: '' }));
			}

		} catch (error) {
			const userError = ErrorHandler.handleError(error as Error, 'Background transcription');
			new Notice(t('notices.backgroundProcessingError', { message: userError.message }));
			ErrorHandler.displayError(userError);

			// Mark task as failed in progress tracker
			if (this.progressTracker) {
				const currentTask = this.progressTracker.getCurrentTask();
				if (currentTask) {
					this.progressTracker.failTask(currentTask.id, userError.message);
				}
			}
		}
	}

	/**
	 * Stage 1 only: Audio → Transcription text
	 */
	private async performTranscriptionOnly() {
		this.updateStatus(t('modal.transcription.transcribing'));
		this.updateProgress(10);

		// Check API connection
		const isConnected = await this.transcriber.checkApiConnection();
		if (!isConnected) {
			throw new Error(t('errors.messages.apiConnectionFailedDetailed'));
		}

		// Show appropriate message based on file type
		const fileExt = this.audioFile.extension.toLowerCase();
		const isVideo = FileTypeUtils.isVideoFile(fileExt);
		this.updateStatus(isVideo ? t('modal.transcription.extractingAudio') : t('modal.transcription.preparingAudio'));
		this.updateProgress(20);

		// Get time range if enabled
		const { startTime, endTime } = this.getTimeRange();

		// Progress is now handled by ProgressTracker listener

		this.updateStatus(t('modal.transcription.transcribing'));

		// Transcribe using API with dictionary context
		let transcription = '';
		let modelUsed = '';
		const partialMarker = this.getPartialResultMarker();
		try {
			const result = await this.transcriber.transcribe(this.audioFile, startTime, endTime);
			if (typeof result === 'string') {
				transcription = result;
				modelUsed = this.settings.model; // Fallback to settings
			} else {
				transcription = result.text;
				modelUsed = result.modelUsed;
			}
		} catch (error) {
			// Check if error contains partial results
			const errorMessage = error instanceof Error ? error.message : '';
			if (errorMessage.includes(partialMarker)) {
				// This is a partial result, use it
				transcription = errorMessage;
			} else {
				// Re-throw if it's a different error
				throw error;
			}
		}

		if (!transcription || transcription.trim().length === 0) {
			throw new Error(t('errors.messages.noTranscriptionText'));
		}

		// Check if this is a partial result
		const isPartialResult = transcription.includes(partialMarker);

		// Adjust progress based on whether post-processing is enabled
		// If post-processing is enabled and will be performed: 70%
		// Otherwise: 80% (matching the transcription callback range)
		const saveProgress = this.settings.postProcessingEnabled && this.metaInfo && this.metaInfo.enablePostProcessing ? 70 : 80;
		this.updateStatus(t('modal.transcription.savingResults'));
		this.updateProgress(saveProgress);


		await this.insertTranscription(transcription, modelUsed);

		// Only update to 100% if post-processing is not happening (it will be updated in insertTranscription)
		const shouldShowCompletionNotice = !this.settings.postProcessingEnabled || !this.metaInfo || !this.metaInfo.enablePostProcessing;

		if (shouldShowCompletionNotice) {
			const charCount = transcription.length.toString();
			if (isPartialResult) {
				this.updateStatus(t('modal.transcription.partialResult'));
				new Notice(t('notices.partialTranscriptionComplete', { count: charCount }), 5000);
			} else {
				this.updateStatus(t('modal.transcription.completed'));
				const modelInfo = this.settings.postProcessingEnabled && this.metaInfo && this.metaInfo.enablePostProcessing
					? t('notices.postProcessingSuffix', { model: modelUsed || this.settings.model })
					: '';
				new Notice(t('notices.transcriptionCompleteDetailed', { count: charCount, details: modelInfo }), 5000);
			}
			this.updateProgress(100);
		}

		setTimeout(() => {
			this.close();
		}, 2000);
	}


	/**
	 * Helper methods for two-stage processing
	 */
	private getTimeRange(): { startTime: number | undefined, endTime: number | undefined } {
		let startTime: number | undefined;
		let endTime: number | undefined;

		if (this.enableTimeRange) {
			startTime = this.parseTimeString(this.startTimeInput.value);
			endTime = this.parseTimeString(this.endTimeInput.value);

			if (endTime > 0 && startTime >= endTime) {
				throw new Error(t('errors.messages.invalidTimeRange'));
			}

			if (this.audioDuration > 0 && endTime > this.audioDuration) {
				throw new Error(t('errors.messages.endTimeExceedsDuration', {
					end: this.formatTime(endTime),
					duration: this.formatTime(this.audioDuration)
				}));
			}
		}

		return { startTime, endTime };
	}



	private async insertTranscription(transcription: string, modelUsed?: string) {
		const partialMarker = this.getPartialResultMarker();
		this.logger.info('Starting transcription insertion', {
			modelUsed,
			transcriptionLength: transcription.length,
			postProcessingEnabled: this.settings.postProcessingEnabled
		});

		// Check if post-processing is enabled and meta info was provided
		if (this.settings.postProcessingEnabled && this.metaInfo && this.metaInfo.enablePostProcessing) {
			try {
				this.updateStatus(t('modal.transcription.postProcessing'));
				// Update progress using unified calculator
				if (this.progressCalculator) {
					this.updateProgress(this.progressCalculator.postProcessingProgress('start'));
				}

				const postProcessingService = new PostProcessingService(this.settings);

				// Processing stage - delay slightly so user can see 70%
				await this.delay(300);
				if (this.progressCalculator) {
					this.updateProgress(this.progressCalculator.postProcessingProgress('processing'));
					// Update progress tracker for background processing
					if (this.progressTracker && this.processInBackground) {
						const currentTask = this.progressTracker.getCurrentTask();
						if (currentTask) {
							this.progressTracker.updateProgress(currentTask.id, currentTask.completedChunks, 'Processing', 80);
						}
					}
				}

				const processed = await postProcessingService.processTranscription(
					transcription,
					this.metaInfo
				);

				// Use processed text
				transcription = processed.processedText;

				// Post-processing done
				if (this.progressCalculator) {
					this.updateProgress(this.progressCalculator.postProcessingProgress('done'));
					// Update progress tracker for background processing
					if (this.progressTracker && this.processInBackground) {
						const currentTask = this.progressTracker.getCurrentTask();
						if (currentTask) {
							this.progressTracker.updateProgress(currentTask.id, currentTask.completedChunks, t('modal.transcription.postProcessingCompleted'), 90);
						}
					}
				}

				this.updateStatus(t('modal.transcription.completed'));
				// Remove duplicate notice - the main completion notice will be shown later

				// Don't update to 100% yet - wait until file is saved
			} catch (error) {
				this.logger.error('Post-processing failed', error);
				new Notice(t('notices.postProcessingFailed'));
				// Update to 90% on error (ready for save)
				if (this.progressCalculator) {
					this.updateProgress(this.progressCalculator.postProcessingProgress('done'));
				}
			}
		} else {
			// No meta info provided, use original transcription as-is
			// Jump to 90% without post-processing
			if (this.progressCalculator) {
				this.updateProgress(90);
				// Update progress tracker for background processing
				if (this.progressTracker && this.processInBackground) {
					const currentTask = this.progressTracker.getCurrentTask();
					if (currentTask) {
						this.progressTracker.updateProgress(currentTask.id, currentTask.completedChunks, 'Ready to save', 90);
					}
				}
			}
		}

		// Always create a new file for transcription

		// Generate readable timestamp format for filename
		const fileTimestamp = new Date().toISOString()
			.replace(/T/, '-')
			.replace(/:/g, '-')
			.replace(/\..+/, '');

		// Create filename with readable timestamp
		const fileName = `AI-Transcription-${this.audioFile.basename}-${fileTimestamp}.md`;
		this.logger.debug('Generated filename', { fileName });

		// Determine the full path including output folder
		const outputFolder = this.getNormalizedOutputFolder();
		const filePath = normalizePath(outputFolder ? `${outputFolder}/${fileName}` : fileName);
		if (outputFolder) {
			this.logger.debug('Using output folder', { folder: outputFolder, filePath });
		}

		let activeView: MarkdownView;
		try {
			// Ensure the folder exists if specified
			if (outputFolder) {
				const folderExists = await this.app.vault.adapter.exists(outputFolder);
				if (!folderExists) {
					this.logger.debug('Creating output folder structure', { folder: outputFolder });
					// Create nested folders if necessary
					const parts = outputFolder.split('/');
					let currentPath = '';
					for (const part of parts) {
						if (part) {
							currentPath = currentPath ? `${currentPath}/${part}` : part;
							if (!(await this.app.vault.adapter.exists(currentPath))) {
								await this.app.vault.createFolder(currentPath);
								this.logger.trace('Created folder', { path: currentPath });
							}
						}
					}
				}
			}

			// Create the new file
			this.logger.debug('Creating new file', { filePath });
			const newFile = await this.app.vault.create(filePath, '');

			// Wait a moment for Obsidian to process the file creation
			// This helps avoid Dataview indexing errors
			await this.delay(50);
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(newFile);
			activeView = leaf.view as MarkdownView;
			this.logger.info('File created and opened', { filePath });

			// Save the output file path to progress tracker
			if (this.progressTracker) {
				const currentTask = this.progressTracker.getCurrentTask();
				if (currentTask) {
					this.progressTracker.setOutputFilePath(currentTask.id, filePath);
				}
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(this.formatUnknownError(error));
			this.logger.error('Failed to create new note', { error: err.message, filePath });
			throw new Error(t('errors.createFileFailed', { error: err.message }));
		}

		if (!activeView) {
			throw new Error(t('errors.messages.unableToOpenFile'));
		}

		const editor = activeView.editor;
		const cursor = editor.getCursor();


		// Format transcription based on settings
		let formattedTranscription = '';
		const timestamp = this.getLocalTimestamp();
		// Use the actual model used if available, otherwise fall back to current settings
		const providerName = modelUsed ? this.getModelDisplayName(modelUsed) : this.transcriber.getProviderDisplayName();

		switch (this.settings.outputFormat) {
		case 'callout':
			formattedTranscription = `\n> [!note] AI Transcription - ${this.audioFile.name}\n> Generated by: ${providerName}\n> Date: ${timestamp}\n>\n${transcription.split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
			break;
		case 'quote':
			formattedTranscription = `\n> **AI Transcription - ${this.audioFile.name}**\n> *Generated by ${providerName} on ${timestamp}*\n>\n${transcription.split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
			break;
		default:
			formattedTranscription = `\n## AI Transcription - ${this.audioFile.name}\n*Generated by ${providerName} on ${timestamp}*\n\n${transcription}\n\n`;
		}



		try {
			// Platform-specific insertion logic
			if (Platform.isMobile || Platform.isWin) {

				// Method 1: Use Vault API to modify the file directly
				if (activeView.file) {
					const currentContent = await this.app.vault.read(activeView.file);
					const offset = editor.posToOffset(cursor);


					// Insert transcription at cursor position
					const newContent = currentContent.slice(0, offset) +
						formattedTranscription +
						currentContent.slice(offset);

					// Save using Vault API
					await this.app.vault.modify(activeView.file, newContent);

					// Update editor display
					editor.setValue(newContent);

					// Set cursor after inserted text
					const newOffset = offset + formattedTranscription.length;
					const newCursor = editor.offsetToPos(newOffset);
					editor.setCursor(newCursor);

				} else {
					// Fallback for new files without a file reference
					editor.replaceRange(formattedTranscription, cursor);

					// Add a small delay before saving on problematic platforms
					await this.delay(100);

					if (activeView.file) {
						await this.app.vault.modify(activeView.file, editor.getValue());
					}
				}
			} else {
				// Desktop (macOS/Linux) - use standard method
				editor.replaceRange(formattedTranscription, cursor);

				// Save the file
				if (activeView.file) {
					await this.app.vault.modify(activeView.file, editor.getValue());
				}
			}



			// Emit completion event for external plugins
			const localTimestamp = this.getLocalTimestamp();

			this.logger.debug('Emitting transcription:completed event');
			this.app.workspace.trigger('transcription:completed', {
				file: activeView.file,
				transcription: transcription,
				audioFile: this.audioFile,
				modelUsed: modelUsed || this.settings.model,
				timestamp: localTimestamp,
				length: transcription.length
			});


			// Add completion metadata to frontmatter
			if (activeView.file) {
				try {
					const fileCache = this.app.metadataCache.getFileCache(activeView.file);
					const frontmatter = fileCache?.frontmatter || {};

					// Add transcription metadata
					const localTimestamp = this.getLocalTimestamp();

					const metadata = {
						...frontmatter,
						transcription_status: 'complete',
						transcription_timestamp: localTimestamp,
						audio_source: this.audioFile.name,
						model_used: modelUsed || this.settings.model,
						character_count: transcription.length
					};

					// Update frontmatter
					await this.app.fileManager.processFrontMatter(activeView.file, (fm) => {
						Object.assign(fm, metadata);
					});
					this.logger.trace('Frontmatter metadata updated');

				} catch (metadataError) {
					const err = metadataError instanceof Error ? metadataError : new Error(this.formatUnknownError(metadataError));
					this.logger.warn('Failed to add frontmatter metadata', { error: err.message });
					// Don't fail the whole operation for metadata errors
				}
			}

			// Add translation hints for external plugins with detailed metadata
			const translationMeta = createTranslationMetadata(
				transcription,
				this.settings.language || 'auto',
				modelUsed || this.settings.model
			);

			this.app.workspace.trigger('transcription:ready-for-translation', {
				file: activeView.file,
				textLength: transcription.length,
				estimatedTokens: translationMeta.estimatedTokens,
				language: this.settings.language || 'auto',
				recommendedChunkSize: translationMeta.needsChunking ? translationMeta.optimalChunkSize : null,
				needsChunking: translationMeta.needsChunking,
				chunkCount: translationMeta.recommendedChunkCount,
				translationMetadata: translationMeta
			});


		} catch (editorError) {
			this.logger.error('Editor operation failed', editorError);

			// Enhanced fallback: Try alternative insertion methods
			try {

				if (activeView.file) {
					// Fallback 1: Append to file
					const currentContent = await this.app.vault.read(activeView.file);
					const newContent = currentContent + '\n\n' + formattedTranscription;
					await this.app.vault.modify(activeView.file, newContent);
					this.logger.trace('Fallback: Appended transcription to file');

					// Update editor
					editor.setValue(newContent);
					editor.setCursor(editor.offsetToPos(newContent.length));

					new Notice(t('notices.transcriptionAppendedFallback'));

					// Emit completion events for fallback insertion
					this.app.workspace.trigger('transcription:completed', {
						file: activeView.file,
						transcription: transcription,
						audioFile: this.audioFile,
						modelUsed: modelUsed || this.settings.model,
						timestamp: new Date().toISOString(),
						length: transcription.length
					});
				} else {
					// Fallback 2: Create new file
					const fileName = `AI-Transcription-Fallback-${this.audioFile.basename}-${Date.now()}.md`;

					try {
						this.logger.debug('Fallback: Creating new file', { fileName });
						const newFile = await this.app.vault.create(fileName, formattedTranscription);

						// Open the new file
						const leaf = this.app.workspace.getLeaf(false);
						await leaf.openFile(newFile);

						new Notice(t('notices.transcriptionSavedToNewFile', { fileName }));

						// Emit completion events for new file creation
						this.app.workspace.trigger('transcription:completed', {
							file: newFile,
							transcription: transcription,
							audioFile: this.audioFile,
							modelUsed: modelUsed || this.settings.model,
							timestamp: new Date().toISOString(),
							length: transcription.length
						});
					} catch (fileError) {
						this.logger.error('Failed to create fallback file', fileError);
						throw fileError;
					}
				}
			} catch (fallbackError) {
				this.logger.error('All insertion methods failed', fallbackError);

				// Last resort: Copy to clipboard
				await navigator.clipboard.writeText(transcription);
				new Notice(t('notices.transcriptionCopyFallback'), 10000);

				// Log the formatted content for debugging
				throw new Error(t('errors.messages.fileInsertionFailed'));
			}
		}

		// Update to 100% after file save is complete
		if (this.progressCalculator) {
			if (!this.processInBackground) {
				// Modal mode: update UI
				this.updateProgress(this.progressCalculator.completionProgress());
			} else if (this.progressTracker) {
				// Background mode: update progress tracker
				const currentTask = this.progressTracker.getCurrentTask();
				if (currentTask) {
					this.progressTracker.updateProgress(currentTask.id, currentTask.completedChunks, t('modal.transcription.completed'), 100);
				}
			}
		}

		// Mark task as complete in progress tracker (for modal only, not background)
		if (this.progressTracker && !this.processInBackground) {
			const currentTask = this.progressTracker.getCurrentTask();
			if (currentTask) {
				const isPartialResult = transcription.includes(partialMarker);
				if (isPartialResult) {
					// Mark as partial
					this.progressTracker.updateTaskStatus(currentTask.id, 'partial');
				} else {
					// Mark as complete
					this.progressTracker.completeTask(currentTask.id, transcription);
				}
			}
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private currentStatus = '';

	private updateStatus(_status: string) {
		// Status display removed from modal
	}

	private updateProgress(_percentage: number) {
		// Progress bar removed from modal
	}

	private getNormalizedOutputFolder(): string {
		const normalized = PathUtils.normalizeUserPath(this.settings.transcriptionOutputFolder);
		this.settings.transcriptionOutputFolder = normalized;
		return normalized;
	}

	private createProcessingOptions(containerEl: HTMLElement): void {
		const optionsSection = containerEl.createEl('div', { cls: 'processing-options-section' });
		const updateOutputFolder = async (value: string) => {
			const normalized = PathUtils.normalizeUserPath(value);
			this.settings.transcriptionOutputFolder = normalized;
			this.transcriber.updateSettings(this.settings);
			if (this.saveSettings) {
				await this.saveSettings();
			}
		};

		// Header
		optionsSection.createEl('h4', { text: t('modal.transcription.processingOptions.title') });

		// Language setting - compact one-line display
		new Setting(optionsSection)
			.setName(t('settings.language.name'))
			.addDropdown(dropdown => dropdown
				.addOption('auto', t('settings.language.autoDetect'))
				.addOption('ja', t('settings.language.options.ja'))
				.addOption('en', t('settings.language.options.en'))
				.addOption('zh', t('settings.language.options.zh'))
				.addOption('ko', t('settings.language.options.ko'))
				.setValue(this.settings.language)
				.onChange(async (value) => {
					this.settings.language = value;
					this.transcriber.updateSettings(this.settings);
					if (this.saveSettings) {
						await this.saveSettings();
					}
				}));

		// Output folder - same pattern as settings tab
		let folderTextComponent: TextComponent | null = null;
		new Setting(optionsSection)
			.setName(t('modal.transcription.processingOptions.outputFolder'))
			.addText(text => {
				folderTextComponent = text;
				return text
					.setPlaceholder(t('settings.outputFolder.placeholder'))
					.setValue(this.getNormalizedOutputFolder())
					.onChange(async (value) => {
						await updateOutputFolder(value);
					});
			})
			.addExtraButton(button => button
				.setIcon('folder')
				.setTooltip(t('settings.outputFolder.select'))
				.onClick(async () => {
					const { FolderSuggestModal } = await import('./FolderSuggestModal');
					const modal = new FolderSuggestModal(this.app, this.getNormalizedOutputFolder());
					modal.onChooseFolderPath = (folderPath: string) => {
						const normalizedFolderPath = PathUtils.normalizeUserPath(folderPath);
						void updateOutputFolder(normalizedFolderPath);
						// Update the text input
						folderTextComponent?.setValue(normalizedFolderPath);
					};
					modal.open();
				}));

		const folderInput = folderTextComponent?.inputEl;
		if (folderInput) {
			new FolderInputSuggest(this.app, folderInput, (folderPath) => {
				const normalizedFolderPath = PathUtils.normalizeUserPath(folderPath);
				void updateOutputFolder(normalizedFolderPath);
				folderTextComponent?.setValue(normalizedFolderPath);
			});
		}

		const aiDependentContainer = document.createElement('div');
		if (!this.settings.postProcessingEnabled) {
			aiDependentContainer.classList.add('ait-hidden');
		}

		// Post-processing toggle - updates visibility of dependent options
		new Setting(optionsSection)
			.setName(t('modal.transcription.processingOptions.enablePostProcessing'))
			.addToggle(toggle => toggle
				.setValue(this.settings.postProcessingEnabled)
				.onChange(async (value) => {
					this.settings.postProcessingEnabled = value;
					this.transcriber.updateSettings(this.settings);
					if (this.saveSettings) {
						await this.saveSettings();
					}
					// Update visibility of dependent options
					if (value) {
						aiDependentContainer.classList.remove('ait-hidden');
					} else {
						aiDependentContainer.classList.add('ait-hidden');
					}
					// Update related info button visibility
					this.updateRelatedInfoButton();
				}));

		// Container for AI post-processing dependent options (created after toggle for proper DOM order)
		optionsSection.appendChild(aiDependentContainer);

		// Add separator between AI post-processing and dictionary correction
		optionsSection.createEl('div', { cls: 'setting-item-separator' });

		// Dictionary correction toggle - inside dependent container
		const dictSetting = new Setting(aiDependentContainer)
			.setName(t('modal.transcription.processingOptions.enableDictionaryCorrection'));

		// Add manage dictionary button before the toggle
		dictSetting.addButton(button => button
			.setButtonText(t('settings.dictionary.openManager'))
			.onClick(() => {
				const modal = new DictionaryManagementModal(this.app, this.settings, null);
				modal.open();
			}));

		// Add the toggle
		dictSetting.addToggle(toggle => toggle
			.setValue(this.settings.dictionaryCorrectionEnabled)
			.onChange(async (value) => {
				this.settings.dictionaryCorrectionEnabled = value;
				this.transcriber.updateSettings(this.settings);
				if (this.saveSettings) {
					await this.saveSettings();
				}
			}));

		// Related info row - inside dependent container
		const relatedInfoContainer = aiDependentContainer.createEl('div', { cls: 'setting-item' });
		const relatedInfoLeft = relatedInfoContainer.createEl('div', { cls: 'setting-item-info' });
		relatedInfoLeft.createEl('div', {
			text: t('modal.transcription.processingOptions.relatedInfo'),
			cls: 'setting-item-name'
		});

		const relatedInfoControl = relatedInfoContainer.createEl('div', { cls: 'setting-item-control' });
		// Store button reference for visibility updates
		this.createRelatedInfoButton(relatedInfoControl);

		// Initialize visibility based on current settings
		if (!this.settings.postProcessingEnabled) {
			aiDependentContainer.classList.add('ait-hidden');
		}
	}

	private createRelatedInfoButton(container: HTMLElement): void {
		// Create button with correct initial text based on whether meta info exists
		const buttonText = this.metaInfo && this.metaInfo.rawContent
			? t('modal.transcription.metaInfoButtonFilled')
			: t('modal.transcription.metaInfoButton');

		this.metaInfoBtn = container.createEl('button', {
			text: buttonText,
			cls: 'mod-info'
		});

		// Add has-info class if meta info exists
		if (this.metaInfo && this.metaInfo.rawContent) {
			this.metaInfoBtn.addClass('has-info');
		}

		// Set visibility based on post-processing setting
		if (!this.settings.postProcessingEnabled) {
			this.metaInfoBtn.classList.add('ait-hidden');
		}

		this.metaInfoBtn.addEventListener('click', () => {
			// Open post-processing modal for meta info input
			const modal = new PostProcessingModal(
				this.app,
				'', // No transcription yet
				this.settings,
				(metaInfo) => {
					if (metaInfo) {
						this.metaInfo = metaInfo;
						// Update button text and appearance
						if (this.metaInfoBtn) {
							this.metaInfoBtn.setText(t('modal.transcription.metaInfoButtonFilled'));
							this.metaInfoBtn.addClass('has-info');
						}
					}
				}
			);
			modal.open();
		});
	}

	private updateRelatedInfoButton(): void {
		if (!this.metaInfoBtn) {
			return;
		}

		// Show/hide based on post-processing setting
		if (this.settings.postProcessingEnabled) {
			this.metaInfoBtn.classList.remove('ait-hidden');
		} else {
			this.metaInfoBtn.classList.add('ait-hidden');
		}
	}


	private async createTimeRangeControls() {
		const headerEl = this.timeRangeEl.createEl('div');
		headerEl.createEl('h4', { text: t('audioRange.title') });

		// Try to get audio duration and show waveform
		try {
			this.logger.trace('Reading audio file for waveform', { audioFile: this.audioFile.name });
			const audioBuffer = await this.app.vault.readBinary(this.audioFile);
			this.modalAudioContext = new AudioContext();
			const decodedAudio = await this.modalAudioContext.decodeAudioData(audioBuffer.slice(0));
			this.audioDuration = decodedAudio.duration;

			headerEl.createEl('p', {
				text: `${t('audioRange.audioDuration')}: ${this.formatTime(this.audioDuration)}`,
				cls: 'audio-duration'
			});

			// Update cost estimate with actual audio duration
			void this.displayCostEstimate();

			// Add waveform selector
			const waveformContainer = this.timeRangeEl.createEl('div', {
				cls: 'waveform-container'
			});

			// Calculate appropriate width based on modal container
			const modalWidth = this.contentEl.offsetWidth || 600;
			const waveformWidth = Math.min(modalWidth - 40, 560); // Leave some padding

			this.waveformSelector = new AudioWaveformSelector(waveformContainer, waveformWidth, 100);
			this.waveformSelector.loadAudio(decodedAudio);

			// Set up range change callback
			this.waveformSelector.setOnRangeChange((start, end) => {
				// Update individual time fields
				const startHours = Math.floor(start / 3600);
				const startMins = Math.floor((start % 3600) / 60);
				const startSecs = Math.floor(start % 60);

				const endHours = Math.floor(end / 3600);
				const endMins = Math.floor((end % 3600) / 60);
				const endSecs = Math.floor(end % 60);

				this.startHourInput.value = startHours.toString();
				this.startMinInput.value = startMins.toString();
				this.startSecInput.value = startSecs.toString();

				this.endHourInput.value = endHours.toString();
				this.endMinInput.value = endMins.toString();
				this.endSecInput.value = endSecs.toString();

				// Update hidden inputs
				this.startTimeInput.value = this.formatTime(start);
				this.endTimeInput.value = this.formatTime(end);

				this.enableTimeRange = true;
				const checkbox = this.timeRangeEl.querySelector<HTMLInputElement>('.ait-enable-time-range');
				if (checkbox) {
					checkbox.checked = true;
				}
				this.updateTimeRangeControls();
				void this.displayCostEstimate();
			});

			// Close audio context after successful load
			if (this.modalAudioContext && this.modalAudioContext.state !== 'closed') {
				await this.modalAudioContext.close();
				this.modalAudioContext = null;
			}
		} catch (error) {
			this.logger.warn('Could not determine audio duration', error);
			headerEl.createEl('p', {
				text: t('modal.transcription.duration', { duration: 'Unknown' }),
				cls: 'audio-duration'
			});

			// Always clean up audio context on error
			if (this.modalAudioContext && this.modalAudioContext.state !== 'closed') {
				try {
					await this.modalAudioContext.close();
				} catch (closeError) {
					this.logger.error('Failed to close AudioContext', closeError);
				} finally {
					this.modalAudioContext = null;
				}
			}
		}

		// Enable checkbox
		const checkboxContainer = this.timeRangeEl.createEl('div', { cls: 'ait-time-range-checkbox-container' });
		const checkboxLabel = checkboxContainer.createEl('label', { cls: 'checkbox-label' });
		const enableCheckbox = checkboxLabel.createEl('input', {
			type: 'checkbox',
			cls: 'ait-enable-time-range'
		});
		checkboxLabel.createSpan({ text: t('audioRange.enableSelection') });

		enableCheckbox.addEventListener('change', (e) => {
			this.enableTimeRange = (e.target as HTMLInputElement).checked;
			this.updateTimeRangeControls();
			// Update cost estimate when range is enabled/disabled
			void this.displayCostEstimate();
		});

		// Time inputs with separate fields for better UX
		const timeContainer = this.timeRangeEl.createEl('div', { cls: 'ait-time-range-controls' });

		// Start time inputs
		const startContainer = timeContainer.createEl('div', { cls: 'ait-time-input-group' });
		startContainer.createEl('label', { text: t('modal.transcription.startTime') + ':' });

		const startInputs = startContainer.createEl('div', { cls: 'ait-time-inputs' });
		this.startHourInput = this.createTimeInput(startInputs, 'H', 2, true);
		startInputs.createEl('span', { text: ':', cls: 'ait-time-separator' });
		this.startMinInput = this.createTimeInput(startInputs, 'M', 2);
		startInputs.createEl('span', { text: ':', cls: 'ait-time-separator' });
		this.startSecInput = this.createTimeInput(startInputs, 'S', 2);

		// Set initial values to 0
		this.startHourInput.value = '0';
		this.startMinInput.value = '0';
		this.startSecInput.value = '0';

		// End time inputs
		const endContainer = timeContainer.createEl('div', { cls: 'ait-time-input-group' });
		endContainer.createEl('label', { text: t('modal.transcription.endTime') + ':' });

		const endInputs = endContainer.createEl('div', { cls: 'ait-time-inputs' });
		this.endHourInput = this.createTimeInput(endInputs, 'H', 2, true);
		endInputs.createEl('span', { text: ':', cls: 'ait-time-separator' });
		this.endMinInput = this.createTimeInput(endInputs, 'M', 2);
		endInputs.createEl('span', { text: ':', cls: 'ait-time-separator' });
		this.endSecInput = this.createTimeInput(endInputs, 'S', 2);

		// Set default end time if duration is known
		if (this.audioDuration) {
			const hours = Math.floor(this.audioDuration / 3600);
			const mins = Math.floor((this.audioDuration % 3600) / 60);
			const secs = Math.floor(this.audioDuration % 60);

			this.endHourInput.value = hours.toString();
			this.endMinInput.value = mins.toString();
			this.endSecInput.value = secs.toString();
		}

		// Hidden inputs for compatibility with existing code
		this.startTimeInput = timeContainer.createEl('input', {
			type: 'hidden',
			cls: 'ait-time-input-hidden'
		});
		this.endTimeInput = timeContainer.createEl('input', {
			type: 'hidden',
			cls: 'ait-time-input-hidden'
		});

		this.updateTimeRangeControls();
	}

	private createTimeInput(container: HTMLElement, placeholder: string, maxLength: number, optional = false): HTMLInputElement {
		const input = container.createEl('input', {
			type: 'text',
			cls: 'ait-time-field',
			placeholder: optional ? '' : placeholder,
			attr: {
				'maxlength': maxLength.toString(),
				'autocomplete': 'off',
				'inputmode': 'numeric',
				'pattern': '[0-9]*'
			}
		});

		// Handle input to allow only numbers (both half-width and full-width)
		input.addEventListener('input', (e) => {
			const target = e.target as HTMLInputElement;
			// Convert full-width to half-width
			let value = target.value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
			// Remove non-digits
			value = value.replace(/[^0-9]/g, '');
			target.value = value;

			// Update hidden inputs and waveform
			this.updateTimeFromFields();

			// Automatically enable time range when user edits fields
			if (!this.enableTimeRange) {
				this.enableTimeRange = true;
				const checkbox = this.timeRangeEl.querySelector<HTMLInputElement>('.ait-enable-time-range');
				if (checkbox) {
					checkbox.checked = true;
				}
				this.updateTimeRangeControls();
			}

			// Auto-advance to next field when maxLength reached
			if (value.length === maxLength && (e as InputEvent).inputType !== 'deleteContentBackward') {
				const nextInput = this.getNextTimeInput(target);
				if (nextInput) {
					nextInput.focus();
					nextInput.select();
				}
			}
		});

		// Handle key navigation
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === 'Tab' && !e.shiftKey) {
				e.preventDefault();
				const nextInput = this.getNextTimeInput(e.target as HTMLInputElement);
				if (nextInput) {
					nextInput.focus();
					nextInput.select();
				} else {
					// Focus transcribe button
					this.transcribeBtn?.buttonEl.focus();
				}
			} else if (e.key === 'Tab' && e.shiftKey) {
				e.preventDefault();
				const prevInput = this.getPrevTimeInput(e.target as HTMLInputElement);
				if (prevInput) {
					prevInput.focus();
					prevInput.select();
				}
			}
		});

		// Select all on focus
		input.addEventListener('focus', (e) => {
			(e.target as HTMLInputElement).select();
		});

		return input;
	}

	private getNextTimeInput(current: HTMLInputElement): HTMLInputElement | null {
		const inputs = [
			this.startHourInput, this.startMinInput, this.startSecInput,
			this.endHourInput, this.endMinInput, this.endSecInput
		];
		const currentIndex = inputs.indexOf(current);
		return currentIndex >= 0 && currentIndex < inputs.length - 1 ? inputs[currentIndex + 1] : null;
	}

	private getPrevTimeInput(current: HTMLInputElement): HTMLInputElement | null {
		const inputs = [
			this.startHourInput, this.startMinInput, this.startSecInput,
			this.endHourInput, this.endMinInput, this.endSecInput
		];
		const currentIndex = inputs.indexOf(current);
		return currentIndex > 0 ? inputs[currentIndex - 1] : null;
	}

	private updateTimeFromFields() {
		// Update start time
		const startHours = parseInt(this.startHourInput.value) || 0;
		const startMins = parseInt(this.startMinInput.value) || 0;
		const startSecs = parseInt(this.startSecInput.value) || 0;
		this.startTimeInput.value = this.formatTimeFromComponents(startHours, startMins, startSecs);

		// Update end time
		const endHours = parseInt(this.endHourInput.value) || 0;
		const endMins = parseInt(this.endMinInput.value) || 0;
		const endSecs = parseInt(this.endSecInput.value) || 0;
		this.endTimeInput.value = this.formatTimeFromComponents(endHours, endMins, endSecs);

		// Update cost estimate and waveform
		void this.displayCostEstimate();
		if (this.waveformSelector) {
			const start = this.parseTimeString(this.startTimeInput.value);
			const end = this.parseTimeString(this.endTimeInput.value);
			this.waveformSelector.setTimeRange(start, end);
		}
	}

	private formatTimeFromComponents(hours: number, minutes: number, seconds: number): string {
		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
		} else {
			return `${minutes}:${seconds.toString().padStart(2, '0')}`;
		}
	}

	private updateTimeRangeControls() {
		const timeInputs = this.timeRangeEl.querySelectorAll('.ait-time-field');
		timeInputs.forEach(input => {
			(input as HTMLInputElement).disabled = !this.enableTimeRange;
			if (this.enableTimeRange) {
				(input as HTMLElement).classList.remove('ait-opacity-50');
				(input as HTMLElement).classList.add('ait-opacity-100');
			} else {
				(input as HTMLElement).classList.remove('ait-opacity-100');
				(input as HTMLElement).classList.add('ait-opacity-50');
			}
		});
	}

	private parseTimeString(timeStr: string): number {
		if (!timeStr || timeStr.trim() === '') {
			return 0;
		}

		// Clean input - handle full-width and various formats
		timeStr = timeStr
			.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0)) // Full-width to half-width
			.replace(/：/g, ':') // Full-width colon
			.replace(/[.．、。]/g, ':') // Other separators
			.replace(/\s+/g, '') // Remove spaces
			.trim();

		// Handle decimal notation (e.g., "3.5" = 3 minutes 30 seconds)
		if (!timeStr.includes(':') && timeStr.includes('.')) {
			const decimal = parseFloat(timeStr);
			if (!isNaN(decimal)) {
				const minutes = Math.floor(decimal);
				const seconds = Math.round((decimal - minutes) * 60);
				return minutes * 60 + seconds;
			}
		}

		// Handle colon-separated format
		const parts = timeStr.split(':').filter(p => p.length > 0);

		if (parts.length === 1) {
			// Single number - intelligent parsing
			const num = parseFloat(parts[0]) || 0;
			if (num >= 100) {
				// Treat large numbers as MMSS format
				// e.g., 130 = 1:30, 1045 = 10:45
				const str = Math.floor(num).toString();
				if (str.length >= 3) {
					const mins = parseInt(str.slice(0, -2));
					const secs = parseInt(str.slice(-2));
					return mins * 60 + Math.min(secs, 59); // Cap seconds at 59
				}
			}
			// Otherwise treat as seconds
			return num;
		} else if (parts.length === 2) {
			// Minutes:seconds
			const minutes = parseInt(parts[0]) || 0;
			const seconds = Math.min(parseFloat(parts[1]) || 0, 59); // Cap at 59
			return minutes * 60 + seconds;
		} else if (parts.length === 3) {
			// Hours:minutes:seconds
			const hours = parseInt(parts[0]) || 0;
			const minutes = Math.min(parseInt(parts[1]) || 0, 59); // Cap at 59
			const seconds = Math.min(parseFloat(parts[2]) || 0, 59); // Cap at 59
			return hours * 3600 + minutes * 60 + seconds;
		}

		return 0;
	}

	private formatTime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);

		if (hours > 0) {
			return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
		} else {
			return `${mins}:${secs.toString().padStart(2, '0')}`;
		}
	}

	private getPartialResultMarker(): string {
		return t('modal.transcription.partialResult');
	}

	private formatFileSize(bytes: number): string {
		if (bytes === 0) {
			return t('common.fileSize.zero');
		}
		const units = [
			t('common.fileSize.units.bytes'),
			t('common.fileSize.units.kb'),
			t('common.fileSize.units.mb'),
			t('common.fileSize.units.gb')
		];
		const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		const value = Math.round((bytes / Math.pow(1024, index)) * 100) / 100;
		return `${value} ${units[index]}`;
	}

	/**
	 * Get display name for a specific model
	 */
	private getModelDisplayName(model: string): string {
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

	private formatUnknownError(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		try {
			const serialized = JSON.stringify(error);
			return serialized ?? 'Unknown error';
		} catch {
			return 'Unknown error';
		}
	}

	/**
	 * Get localized timestamp
	 */
	private getLocalTimestamp(): string {
		const userLocale = getLanguage();
		return new Date().toLocaleString(userLocale || 'en');
	}

	private async loadTimeRangeControls(loadingEl: HTMLElement) {
		try {
			await this.createTimeRangeControls();
			loadingEl.remove();
			this.timeRangeEl.classList.remove('ait-min-height-280');
			this.timeRangeEl.classList.add('ait-min-height-auto'); // Remove min-height after loaded
		} catch (error) {
			this.logger.warn('Failed to create time range controls', error);
			loadingEl.setText(t('errors.audioLoad'));
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		// Clean up animation
		this.loadingAnimation.destroy();

		// Unregister progress listener
		if (this.progressListenerUnsubscribe) {
			this.progressListenerUnsubscribe();
			this.progressListenerUnsubscribe = null;
		}

		// Clean up waveform selector
		if (this.waveformSelector) {
			this.waveformSelector.destroy();
			this.waveformSelector = null;
		}
		// Clean up audio context if still open
		if (this.modalAudioContext && this.modalAudioContext.state !== 'closed') {
			const closePromise = this.modalAudioContext.close();
			closePromise.catch(error => {
				this.logger.error('Failed to close AudioContext on modal close', error);
			});
			this.modalAudioContext = null;
		}
		// Release wake lock if still held
		this.releaseWakeLock();
	}
}
