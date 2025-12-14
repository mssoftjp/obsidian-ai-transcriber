import { Notice, Plugin, TFile, Platform, getLanguage } from 'obsidian';

import { DEFAULT_API_SETTINGS } from './ApiSettings';
import { APISettingsTab } from './ApiSettingsTab';
import { APITranscriber } from './ApiTranscriber';
import { SUPPORTED_FORMATS } from './config/constants';
import { ResourceManager } from './core/resources/ResourceManager';
import { initializeI18n, initializeTranslations, t } from './i18n';
import en from './i18n/translations/en';
import ja from './i18n/translations/ja';
import ko from './i18n/translations/ko';
import zh from './i18n/translations/zh';
import { PluginStateRepository } from './infrastructure/storage/PluginStateRepository';
import { TempFileManager } from './infrastructure/storage/TempFileManager';
import { APITranscriptionModal } from './ui/ApiTranscriptionModal';
import { AudioFileSelectionModal } from './ui/AudioFileSelectionModal';
import { ProgressTracker } from './ui/ProgressTracker';
import { StatusBarManager } from './ui/StatusBarManager';
import { TranscriptionView, VIEW_TYPE_TRANSCRIPTION } from './ui/TranscriptionView';
import { Logger, LogLevel } from './utils/Logger';
import { PathUtils } from './utils/PathUtils';

	import type { APITranscriptionSettings } from './ApiSettings';
	import type { Menu, TAbstractFile } from 'obsidian';

export default class AITranscriberPlugin extends Plugin {
	settings!: APITranscriptionSettings;
	transcriber!: APITranscriber;
	progressTracker!: ProgressTracker;
	statusBarManager?: StatusBarManager;
	private stateRepo!: PluginStateRepository;
	private logger = Logger.getLogger('Plugin');

	override onload(): void {
		void this.initializePlugin().catch(error => {
			this.logger.error('Failed to load AI Transcriber plugin', error);
		});
	}

	private async initializePlugin(): Promise<void> {
		// Initialize i18n BEFORE loading settings
		initializeTranslations({ en, ja, zh, ko });
		initializeI18n();

		// Cache plugin directory from manifest for consistent path resolution
		PathUtils.setPluginDir(this.manifest.dir);

		await this.loadSettings();

		// Initialize logger with debug mode setting
		Logger.getInstance().updateConfig({
			debugMode: this.settings.debugMode,
			logLevel: this.settings.debugMode ? LogLevel.DEBUG : LogLevel.INFO
		});
		this.logger.info('Plugin loading...');

		// Initialize progress tracking system
		this.progressTracker = new ProgressTracker(this.stateRepo);

		// Initialize the API transcriber with progress tracker
		this.transcriber = new APITranscriber(this.app, this.settings, this.progressTracker);

		// Run UI setup after workspace is ready
		this.app.workspace.onLayoutReady(async () => {
			await this.handleLayoutReady();
		});

		// Add command to transcribe selected audio file
		this.addCommand({
			id: 'api-transcribe-audio',
			name: t('commands.transcribeAudio'),
			callback: () => {
				void this.transcribeCurrentAudio();
			}
		});

		// Add command to open transcription view
		this.addCommand({
			id: 'open-transcription-view',
			name: t('commands.openPanel'),
			callback: () => {
				void this.activateTranscriptionView();
			}
		});

		// Add settings tab
		this.addSettingTab(new APISettingsTab(this.app, this));

		this.logger.info('AI Transcriber plugin loaded successfully');
	}

	override onunload(): void {
		void this.disposePlugin().catch(error => {
			this.logger.error('Failed to unload AI Transcriber plugin', error);
		});
	}

	private async handleLayoutReady(): Promise<void> {
		// Clean up temporary files from previous sessions
		try {
			const tempFileManager = new TempFileManager(this.app);
			await tempFileManager.cleanup();
			this.logger.debug('Temporary files cleaned up');
		} catch (error) {
			this.logger.error('Failed to clean up temporary files', error);
		}

		// Register the transcription view
		try {
			this.registerView(
				VIEW_TYPE_TRANSCRIPTION,
				(leaf) => new TranscriptionView(leaf, this, this.progressTracker)
			);
			this.logger.debug('TranscriptionView registered successfully');
		} catch (error) {
			this.logger.error('Failed to register view', error);
		}

		// Initialize status bar only on desktop
		if (!Platform.isMobile) {
			this.statusBarManager = new StatusBarManager(this, this.progressTracker);
			this.statusBarManager.initialize();

			// Set click handler to open side panel
			this.statusBarManager.setClickHandler(() => {
				this.logger.debug('Status bar clicked, opening transcription view');
				void this.activateTranscriptionView();
			});
		}

		// Add ribbon icon
		this.addRibbonIcon('file-audio', t('ribbon.tooltip'), () => {
			void this.transcribeCurrentAudio();
		});

			// Register context menu for audio files
			this.registerEvent(
				this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, _source: string) => {
					if (file instanceof TFile && this.isAudioFile(file)) {
						menu.addItem((item) => {
							item
							.setTitle(t('commands.contextMenu'))
							.setIcon('file-audio')
							.onClick(() => {
								// Check if API key is configured before showing modal
								if (!this.isApiConfigured()) {
									new Notice(t('notices.apiKeyNotConfigured'));
									return;
								}
								this.transcribeAudioFile(file);
							});
					});
				}
			})
		);
	}

	private async disposePlugin(): Promise<void> {
		this.logger.info('Unloading AI Transcriber plugin...');

		// Close any open transcription view leaves to prevent orphaned views after unload
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TRANSCRIPTION);

		// Clean up status bar
		if (this.statusBarManager) {
			this.statusBarManager.destroy();
		}

			// Clean up API transcriber resources
			await this.transcriber.cleanup();

		// Clean up all global resources via ResourceManager
		await ResourceManager.getInstance().cleanupAll();

		this.logger.info('AI Transcriber plugin unloaded');
	}

	async loadSettings() {
		this.stateRepo = new PluginStateRepository(this);
		await this.stateRepo.initialize();

		const storedSettings = this.stateRepo.getSettings();
			this.settings = Object.assign({}, DEFAULT_API_SETTINGS, storedSettings);
			this.settings.userDictionaries = this.stateRepo.getDictionaries();
			this.normalizeSettingsPaths();
			this.logger.debug('Settings loaded', { debugMode: this.settings.debugMode });

			// Migrate from old XOR encryption to new SafeStorage format
			if (this.settings.openaiApiKey.startsWith('XOR_V1::')) {
				const { SafeStorageService } = await import('./infrastructure/storage/SafeStorageService');
				const apiKey = SafeStorageService.decryptFromStore(this.settings.openaiApiKey);
				if (apiKey) {
				// Re-encrypt with new format
				this.settings.openaiApiKey = SafeStorageService.encryptForStore(apiKey);
				await this.stateRepo.saveSettings(this.settings);
				new Notice(t('settings.apiKey.migrated'));
			}
		}

			// If no language setting exists, use Obsidian's locale
			if (!storedSettings.language) {
				const obsidianLanguage = this.getObsidianLanguage();
				if (obsidianLanguage && obsidianLanguage !== 'auto') {
					this.settings.language = obsidianLanguage;
				// Using Obsidian's language setting
			}
		}

			const languages: ('ja' | 'en' | 'zh' | 'ko')[] = ['ja', 'en', 'zh', 'ko'];
			for (const lang of languages) {
				this.settings.userDictionaries[lang].contextualCorrections ??= [];
			}

	}

	/**
	 * Get Obsidian's language setting and map to our supported languages
	 */
	getObsidianLanguage(): string {
		const locale = getLanguage();

		// Map common locale codes to our supported languages
		const localeMap: Record<string, string> = {
			'ja': 'ja',      // Japanese
			'ja-JP': 'ja',
			'en': 'en',      // English
			'en-US': 'en',
			'en-GB': 'en',
			'zh': 'zh',      // Chinese
			'zh-CN': 'zh',
			'zh-TW': 'zh',
			'ko': 'ko',      // Korean
			'ko-KR': 'ko'
		};

			// Extract language code from locale (e.g., 'en-US' -> 'en')
			const languageCode = (locale.split('-')[0] ?? locale).toLowerCase();

		// Return mapped language or 'auto' if not found
		return localeMap[locale.toLowerCase()] ||
		       localeMap[languageCode] ||
		       'auto';
	}

	private normalizeSettingsPaths(): void {
		this.settings.transcriptionOutputFolder = PathUtils.normalizeUserPath(this.settings.transcriptionOutputFolder);
	}

	async saveSettings() {
		const startTime = performance.now();
		this.logger.debug('Saving settings...');
		this.normalizeSettingsPaths();
		await this.stateRepo.saveSettings(this.settings);

		// Update logger configuration if debugMode changed
		Logger.getInstance().updateConfig({
			debugMode: this.settings.debugMode,
			logLevel: this.settings.debugMode ? LogLevel.DEBUG : LogLevel.INFO
		});

			// Update transcriber with new settings
			this.transcriber.updateSettings(this.settings);

		const elapsedTime = performance.now() - startTime;
		this.logger.info('Settings saved', { elapsedTime: `${elapsedTime.toFixed(2)}ms` });
	}

		private isAudioFile(file: TFile): boolean {
			// フォルダの場合やextensionがない場合はfalseを返す
			if (!file.extension) {
				return false;
			}
		const audioExtensions = SUPPORTED_FORMATS.EXTENSIONS;
		const extension = file.extension.toLowerCase();
		return audioExtensions.includes(extension);
	}

	private transcribeCurrentAudio(): void {
		this.logger.debug('Transcribe audio command triggered');

		// Check if API key is configured first
		if (!this.isApiConfigured()) {
			this.logger.warn('API key not configured');
			new Notice(t('notices.apiKeyNotConfigured'));
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !this.isAudioFile(activeFile)) {
			// Show file selection modal when no audio file is selected
			const modal = new AudioFileSelectionModal(
				this.app,
				(file: TFile | File, isExternal: boolean) => {
					// TFileオブジェクトとして処理（外部ファイルも既にコピー済み）
					if (file instanceof TFile) {
						this.transcribeAudioFile(file, isExternal);
					} else {
						// ここには到達しないはず（AudioFileSelectionModalで既にTFileに変換済み）
						new Notice(t('errors.general'));
					}
				}
			);
			modal.open();
			return;
		}

		this.transcribeAudioFile(activeFile);
	}

	private transcribeAudioFile(file: TFile, isExternal: boolean = false): void {
		this.logger.info('Starting transcription', {
			file: file.name,
			fileSize: `${(file.stat.size / 1024 / 1024).toFixed(2)}MB`,
			isExternal
		});

		// Check if API is configured (redundant check for safety)
		if (!this.isApiConfigured()) {
			this.logger.error('API key not configured when attempting transcription');
			new Notice(t('notices.apiKeyNotConfigured'));
			return;
		}

		const modal = new APITranscriptionModal(this.app, this.transcriber, file, this.settings, this.progressTracker);
		// Set save callback
		(modal as unknown as { saveSettings: () => Promise<void> }).saveSettings = () => this.saveSettings();
		modal.open();
		this.logger.debug('Transcription modal opened');
	}

	private isApiConfigured(): boolean {
		// Unified OpenAI API check (works for all models)
		// Note: API key decryption is handled in TranscriptionController using BetterEncryptionService
		const hasOpenaiKey = Boolean(this.settings.openaiApiKey);

		this.logger.debug('API configuration check', {
			hasKey: hasOpenaiKey,
			model: this.settings.model
		});

		return hasOpenaiKey;
	}

	// Public method for external access (e.g., from settings tab)
	async testApiConnection(): Promise<boolean> {
		this.logger.debug('Testing API connection...');
		const result = await this.transcriber.checkApiConnection();
		this.logger.debug('API connection test result', { success: result });
		return result;
	}

	/**
	 * Activate the transcription view in the side panel
	 */
	async activateTranscriptionView(): Promise<void> {
		try {
			const { workspace } = this.app;
			// Activating transcription view...

				// Check if view already exists
				const existing = workspace.getLeavesOfType(VIEW_TYPE_TRANSCRIPTION);
				if (existing.length) {
					const leaf = existing[0];
					if (leaf) {
						await workspace.revealLeaf(leaf);
						return;
					}
				}

			// Create new view in right sidebar
			// Creating new view in right sidebar
			const leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_TRANSCRIPTION,
					active: true
				});
				await workspace.revealLeaf(leaf);
				// View created and revealed successfully
			} else {
				// Failed to get right leaf
				new Notice(t('errors.general'));
			}
		} catch (error) {
			this.logger.error('Error activating view', error);
			new Notice(t('errors.general'));
		}
	}

}
