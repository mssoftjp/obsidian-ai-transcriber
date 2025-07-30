import { App, Notice, Plugin, TFile, Menu, Platform } from 'obsidian';
import { APITranscriber } from './ApiTranscriber';
import { APITranscriptionSettings, DEFAULT_API_SETTINGS, UserDictionary, LanguageDictionaries, DictionaryEntry, ContextualCorrection } from './ApiSettings';
import { APISettingsTab } from './ApiSettingsTab';
import { APITranscriptionModal } from './ui/ApiTranscriptionModal';
import { AudioFileSelectionModal } from './ui/AudioFileSelectionModal';
import { TempFileManager } from './infrastructure/storage/TempFileManager';
import { ProgressTracker } from './ui/ProgressTracker';
import { StatusBarManager } from './ui/StatusBarManager';
import { TranscriptionView, VIEW_TYPE_TRANSCRIPTION } from './ui/TranscriptionView';
import { SUPPORTED_FORMATS } from './config/constants';
import { ResourceManager } from './core/resources/ResourceManager';
import { initializeI18n, initializeTranslations, t } from './i18n';
import en from './i18n/translations/en';
import ja from './i18n/translations/ja';
import zh from './i18n/translations/zh';
import ko from './i18n/translations/ko';
import { Logger, LogLevel } from './utils/Logger';
import { ObsidianApp } from './types/global';

export default class AITranscriberPlugin extends Plugin {
	settings: APITranscriptionSettings;
	transcriber: APITranscriber;
	progressTracker: ProgressTracker;
	statusBarManager: StatusBarManager;
	private logger = Logger.getLogger('Plugin');

	async onload() {
		// Initialize i18n BEFORE loading settings
		initializeTranslations({ en, ja, zh, ko });
		initializeI18n(this.app);

		await this.loadSettings();

		// Initialize logger with debug mode setting
		Logger.getInstance().updateConfig({
			debugMode: this.settings.debugMode,
			logLevel: this.settings.debugMode ? LogLevel.DEBUG : LogLevel.INFO
		});
		this.logger.info('Plugin loading...');

		// Crypto initialization removed - using BetterEncryptionService directly

		// Clean up temporary files from previous sessions
		// Delay cleanup to ensure vault is fully loaded
		setTimeout(async () => {
			try {
				const tempFileManager = new TempFileManager(this.app);
				await tempFileManager.cleanup();
				this.logger.debug('Temporary files cleaned up');
			} catch (error) {
				this.logger.error('Failed to clean up temporary files', error);
			}
		}, 3000); // 3秒待機してからクリーンアップ

		// Initialize progress tracking system
		this.progressTracker = new ProgressTracker(this);

		// Initialize the API transcriber with progress tracker
		this.transcriber = new APITranscriber(this.app, this.settings, this.progressTracker);

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
			this.statusBarManager = new StatusBarManager(this.app, this, this.progressTracker);
			this.statusBarManager.initialize();
			
			// Set click handler to open side panel
			this.statusBarManager.setClickHandler(() => {
				this.logger.debug('Status bar clicked, opening transcription view');
				this.activateTranscriptionView();
			});
		}

		// Add command to transcribe selected audio file
		this.addCommand({
			id: 'api-transcribe-audio',
			name: t('commands.transcribeAudio'),
			callback: () => {
				this.transcribeCurrentAudio();
			}
		});

		// Add command to open transcription view
		this.addCommand({
			id: 'open-transcription-view',
			name: t('commands.openPanel'),
			callback: () => {
				this.activateTranscriptionView();
			}
		});

		// Add ribbon icon
		this.addRibbonIcon('file-audio', t('ribbon.tooltip'), () => {
			this.transcribeCurrentAudio();
		});

		// Register context menu for audio files
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
				if (this.isAudioFile(file)) {
					menu.addItem((item) => {
						item
							.setTitle(t('commands.contextMenu'))
							.setIcon('file-audio')
							.onClick(async () => {
								// Check if API key is configured before showing modal
								if (!this.isApiConfigured()) {
									new Notice(t('notices.apiKeyNotConfigured'));
									return;
								}
								await this.transcribeAudioFile(file);
							});
					});
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new APISettingsTab(this.app, this));

		this.logger.info('AI Transcriber plugin loaded successfully');
	}

	async onunload() {
		this.logger.info('Unloading AI Transcriber plugin...');
		
		// Clean up status bar
		if (this.statusBarManager) {
			this.statusBarManager.destroy();
		}

		// Clean up API transcriber resources
		if (this.transcriber && typeof this.transcriber.cleanup === 'function') {
			this.transcriber.cleanup();
		}

		// Clean up all global resources via ResourceManager
		await ResourceManager.getInstance().cleanupAll();
		
		this.logger.info('AI Transcriber plugin unloaded');
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_API_SETTINGS, loadedData);
		
		if (this.logger) {
			this.logger.debug('Settings loaded', { debugMode: this.settings.debugMode });
		}
		
		// Migrate from old XOR encryption to new SafeStorage format
		if (this.settings.openaiApiKey && this.settings.openaiApiKey.startsWith('XOR_V1::')) {
			const { SafeStorageService } = await import('./infrastructure/storage/SafeStorageService');
			const apiKey = SafeStorageService.decryptFromStore(this.settings.openaiApiKey);
			if (apiKey) {
				// Re-encrypt with new format
				this.settings.openaiApiKey = SafeStorageService.encryptForStore(apiKey);
				await this.saveData(this.settings);
				new Notice(t('settings.apiKey.migrated'));
			}
		}
		
		// Load user dictionary from separate file
		await this.loadUserDictionary();
		
		// If no language setting exists, use Obsidian's locale
		if (!loadedData?.language) {
			const obsidianLanguage = this.getObsidianLanguage();
			if (obsidianLanguage && obsidianLanguage !== 'auto') {
				this.settings.language = obsidianLanguage;
				// Using Obsidian's language setting
			}
		}
		
		// Ensure userDictionaries structure exists with proper initialization
		if (!this.settings.userDictionaries) {
			this.settings.userDictionaries = {
				ja: { definiteCorrections: [], contextualCorrections: [] },
				en: { definiteCorrections: [], contextualCorrections: [] },
				zh: { definiteCorrections: [], contextualCorrections: [] },
				ko: { definiteCorrections: [], contextualCorrections: [] }
			};
		}
		
		// Ensure each language dictionary is properly initialized
		const languages: ('ja' | 'en' | 'zh' | 'ko')[] = ['ja', 'en', 'zh', 'ko'];
		for (const lang of languages) {
			if (!this.settings.userDictionaries[lang]) {
				this.settings.userDictionaries[lang] = { definiteCorrections: [], contextualCorrections: [] };
			}
			if (!this.settings.userDictionaries[lang].definiteCorrections) {
				this.settings.userDictionaries[lang].definiteCorrections = [];
			}
			if (!this.settings.userDictionaries[lang].contextualCorrections) {
				this.settings.userDictionaries[lang].contextualCorrections = [];
			}
		}
		
	}
	
	private isLanguageDictionaries(data: unknown): data is LanguageDictionaries {
		return typeof data === 'object' && 
		       data !== null && 
		       ('ja' in data || 'en' in data || 'zh' in data);
	}

	/**
	 * Get Obsidian's language setting and map to our supported languages
	 */
	getObsidianLanguage(): string {
		// Get Obsidian's locale setting
		const locale = ((this.app as unknown) as ObsidianApp).vault?.config?.locale || 
		               (window as { moment?: { locale(): string } }).moment?.locale() || 
		               navigator.language || 
		               'en';
		
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
		const languageCode = locale.split('-')[0].toLowerCase();
		
		// Return mapped language or 'auto' if not found
		return localeMap[locale.toLowerCase()] || 
		       localeMap[languageCode] || 
		       'auto';
	}

	async saveSettings() {
		const startTime = performance.now();
		this.logger.debug('Saving settings...');
		
		// Save user dictionary separately
		await this.saveUserDictionary();
		
		// Create settings copy without userDictionaries (save separately)
		const settingsToSave = { ...this.settings };
		delete settingsToSave.userDictionaries;
		
		await this.saveData(settingsToSave);
		
		// Update logger configuration if debugMode changed
		Logger.getInstance().updateConfig({
			debugMode: this.settings.debugMode,
			logLevel: this.settings.debugMode ? LogLevel.DEBUG : LogLevel.INFO
		});
		
		// Update transcriber with new settings
		if (this.transcriber) {
			this.transcriber.updateSettings(this.settings);
		}
		
		const elapsedTime = performance.now() - startTime;
		this.logger.info('Settings saved', { elapsedTime: `${elapsedTime.toFixed(2)}ms` });
	}

	private isAudioFile(file: TFile): boolean {
		// フォルダの場合やextensionがない場合はfalseを返す
		if (!file || !file.extension) {
			return false;
		}
		const audioExtensions = SUPPORTED_FORMATS.EXTENSIONS;
		const extension = file.extension.toLowerCase();
		return audioExtensions.includes(extension);
	}

	private async transcribeCurrentAudio() {
		this.logger.debug('Transcribe audio command triggered');
		
		// Check if API key is configured first
		if (!this.isApiConfigured()) {
			this.logger.warn('API key not configured');
			new Notice('❌ API key not configured. Please add your OpenAI API key in settings.');
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !this.isAudioFile(activeFile)) {
			// Show file selection modal when no audio file is selected
			const modal = new AudioFileSelectionModal(
				this.app,
				async (file: TFile | File, isExternal: boolean) => {
					// TFileオブジェクトとして処理（外部ファイルも既にコピー済み）
					if (file instanceof TFile) {
						await this.transcribeAudioFile(file, isExternal);
					} else {
						// ここには到達しないはず（AudioFileSelectionModalで既にTFileに変換済み）
						new Notice(t('errors.general'));
					}
				}
			);
			modal.open();
			return;
		}

		await this.transcribeAudioFile(activeFile);
	}

	private async transcribeAudioFile(file: TFile, isExternal: boolean = false) {
		const startTime = performance.now();
		this.logger.info('Starting transcription', { 
			file: file.name, 
			fileSize: `${(file.stat.size / 1024 / 1024).toFixed(2)}MB`,
			isExternal 
		});
		
		// Check if API is configured (redundant check for safety)
		if (!this.isApiConfigured()) {
			this.logger.error('API key not configured when attempting transcription');
			new Notice('❌ API key not configured. Please add your OpenAI API key in settings.');
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
		const hasOpenaiKey = !!this.settings.openaiApiKey;
		
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
				// Found existing view, revealing it
				// Reveal existing view
				workspace.revealLeaf(existing[0]);
				return;
			}

			// Create new view in right sidebar
			// Creating new view in right sidebar
			const leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_TRANSCRIPTION,
					active: true,
				});
				workspace.revealLeaf(leaf);
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


	/**
	 * Load user dictionary from separate file
	 */
	private async loadUserDictionary(): Promise<void> {
		this.logger.debug('Loading user dictionary...');
		try {
			const dictionaryPath = `${this.app.vault.configDir}/plugins/obsidian-ai-transcriber/user-dictionary.json`;
			
			// Check if dictionary file exists
			if (await this.app.vault.adapter.exists(dictionaryPath)) {
				const dictionaryData = await this.app.vault.adapter.read(dictionaryPath);
				const parsedData = JSON.parse(dictionaryData) as unknown;
				
				// Only load if it's in the new format (has language keys)
				if (this.isLanguageDictionaries(parsedData)) {
					// Apply migration for from: string to from: string[] if needed
					const languages: ('ja' | 'en' | 'zh')[] = ['ja', 'en', 'zh'];
					for (const lang of languages) {
						if (parsedData[lang]) {
							parsedData[lang] = this.migrateDictionaryFormat(parsedData[lang]);
						}
					}
					
					this.settings.userDictionaries = parsedData;
					this.logger.debug('Loaded language-specific dictionaries from file');
				}
				// Ignore old format completely
			} else {
				this.logger.debug('User dictionary file not found');
			}
		} catch (error) {
			this.logger.error('Failed to load user dictionary', error);
		}
	}
	
	/**
	 * Migrate dictionary format from string to string[] for 'from' field
	 */
	private migrateDictionaryFormat(dictionary: unknown): UserDictionary {
		const result: UserDictionary = {
			definiteCorrections: [],
			contextualCorrections: []
		};
		
		if (dictionary && typeof dictionary === 'object') {
			const dict = dictionary as Record<string, unknown>;
			
			if (Array.isArray(dict.definiteCorrections)) {
				result.definiteCorrections = dict.definiteCorrections.map((entry: unknown) => {
					if (entry && typeof entry === 'object') {
						const typedEntry = entry as Record<string, unknown>;
						if (typeof typedEntry.from === 'string') {
							return {
								...typedEntry,
								from: typedEntry.from.split(',').map((s: string) => s.trim()).filter((s: string) => s)
							};
						}
					}
					return entry;
				}) as DictionaryEntry[];
			}
			
			if (Array.isArray(dict.contextualCorrections)) {
				result.contextualCorrections = dict.contextualCorrections.map((entry: unknown) => {
					if (entry && typeof entry === 'object') {
						const typedEntry = entry as Record<string, unknown>;
						if (typeof typedEntry.from === 'string') {
							return {
								...typedEntry,
								from: typedEntry.from.split(',').map((s: string) => s.trim()).filter((s: string) => s)
							};
						}
					}
					return entry;
				}) as ContextualCorrection[];
			}
		}
		
		return result;
	}

	/**
	 * Save user dictionary to separate file
	 */
	private async saveUserDictionary(): Promise<void> {
		this.logger.debug('Saving user dictionary...');
		try {
			const dictionaryPath = `${this.app.vault.configDir}/plugins/obsidian-ai-transcriber/user-dictionary.json`;
			
			// Save only userDictionaries (new format)
			if (this.settings.userDictionaries) {
				// Format JSON with compact arrays
				const jsonString = JSON.stringify(this.settings.userDictionaries, null, 2);
				// Make arrays compact (single line) for better readability
				const compactJson = jsonString.replace(/\[\s*\n\s*(.+?)\n\s*\]/gs, (match, content) => {
					// Only compact small arrays (less than 100 chars)
					if (match.length < 100) {
						return '[' + content.split(/,\s*\n\s*/).join(', ') + ']';
					}
					return match;
				});
				
				await this.app.vault.adapter.write(
					dictionaryPath,
					compactJson
				);
				this.logger.debug('Saved language-specific dictionaries');
			}
		} catch (error) {
			this.logger.error('Failed to save user dictionary', error);
		}
	}
}