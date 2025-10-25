import { Setting, Notice, Platform, App } from 'obsidian';
import { APITranscriptionSettings, VADMode } from './ApiSettings';
import { MODEL_OPTIONS, getModelOption } from './config/ModelOptions';
import { MODEL_NAMES } from './config/constants';
import { SafeStorageService } from './infrastructure/storage/SafeStorageService';
import { SecurityUtils } from './infrastructure/storage/SecurityUtils';
import { t } from './i18n';
import { Logger } from './utils/Logger';
import { PathUtils } from './utils/PathUtils';
import { ElectronRenderer, isElectronWindow } from './types/global';

export class SettingsUIBuilder {
	private static readonly FVAD_DOWNLOAD_URL = 'https://github.com/echogarden-project/fvad-wasm';

	private static logger = Logger.getLogger('SettingsUIBuilder');
	/**
	 * Create API settings section
	 */
	static displayAPISettings(containerEl: HTMLElement, settings: APITranscriptionSettings, saveSettings: () => Promise<void>, app: App): void {
		// API settings heading removed as requested

		// API Key setting
		new Setting(containerEl)
			.setName(t('settings.apiKey.name'))
			.setDesc(this.createApiKeyDescription('OpenAI', 'https://platform.openai.com/api-keys'))
			.addText(text => {
				// Retrieve stored API key
				const apiKey = SafeStorageService.decryptFromStore(settings.openaiApiKey);
				
				if (apiKey) {
					// Show masked key
					text.setValue(SecurityUtils.maskApiKey(apiKey));
				}
				// If no valid key, leave the field empty
				
				text.setPlaceholder(t('settings.apiKey.placeholder'))
					.onChange(async (value) => {
						// Skip if it's the masked value
						if (value && !value.includes('*')) {
							// Store API key with SafeStorage encryption
							settings.openaiApiKey = SafeStorageService.encryptForStore(value);
							await saveSettings();
							// Check if safeStorage is available
							if (!this.isSafeStorageAvailable()) {
								new Notice(t('settings.apiKey.insecureWarning'));
							}
						}
					});
			})
			.addButton(button => button
				.setButtonText(t('settings.apiKey.testButton'))
				.onClick(async () => {
					button.setButtonText(t('common.processing'));
					button.setDisabled(true);

					// Get the actual API key
					const apiKey = SafeStorageService.decryptFromStore(settings.openaiApiKey);
					
					try {
						this.logger.debug('Testing API key connection');
						// Use SecurityUtils for complete validation (format + API test)
						const result = await SecurityUtils.validateApiKey(apiKey, true);
						
						if (result.valid) {
							this.logger.info('API key validation successful');
							button.setButtonText(t('common.success'));
							button.setCta();
						} else {
							this.logger.warn('API key validation failed', { reason: result.error });
							button.setButtonText(t('common.failed'));
							button.removeCta();
						}
					} catch (error) {
						this.logger.error('API key test error', error);
						new Notice(t('errors.general'));
						button.setButtonText(t('common.error'));
						button.removeCta();
					} finally {
						setTimeout(() => {
							button.setButtonText(t('settings.apiKey.testButton'));
							button.setDisabled(false);
							button.removeCta();
						}, 3000);
					}
				}))
			.addExtraButton(button => {
				button.setTooltip(t('common.delete'))
					.setIcon('trash-2')
					.onClick(async () => {
						settings.openaiApiKey = '';
						await saveSettings();
						// Removed Notice - clear action is obvious from UI
						// Clear the input field
						const input = button.extraSettingsEl.parentElement?.querySelector('input[type="text"]') as HTMLInputElement;
						if (input) input.value = '';
					});
			});

                new Setting(containerEl)
                        .setName(t('settings.model.name'))
                        .setDesc(t('settings.model.desc'))
                        .addDropdown(dropdown => {
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
                                            case MODEL_NAMES.GPT4O:
                                                label = t('settings.model.gpt4oHigh');
                                                break;
                                            case MODEL_NAMES.GPT4O_MINI:
                                                label = t('settings.model.gpt4oMiniCost');
                                                break;
                                            default:
                                                label = opt.value; // Fallback to value if no translation
                                        }
                                        dropdown.addOption(opt.value, label);
                                });

                                dropdown.setValue(settings.model);

                                dropdown.onChange(async (value) => {
                                        const option = getModelOption(value);
                                        if (!option) return;

                                        settings.model = option.model;
                                        await saveSettings();
                                });
                        });

		// Temperature setting removed - now configured in config files only

		// Model comparison info - simplified as requested
		const modelInfoEl = containerEl.createEl('div', { cls: 'setting-item-description' });
		// Clear and rebuild model info element
		modelInfoEl.empty();
		
		const titleEl = modelInfoEl.createEl('strong');
		titleEl.setText(t('settings.model.comparison'));
		modelInfoEl.createEl('br');
		
		// Whisper model info
		modelInfoEl.appendText('• ');
		const whisperLabel = modelInfoEl.createEl('strong');
		whisperLabel.setText(t('settings.model.whisper') + ':');
		modelInfoEl.appendText(' ' + t('settings.model.whisperDesc'));
		modelInfoEl.createEl('br');
		
		// GPT-4o model info
		modelInfoEl.appendText('• ');
		const gpt4oLabel = modelInfoEl.createEl('strong');
		gpt4oLabel.setText(t('settings.model.gpt4o') + ':');
		modelInfoEl.appendText(' ' + t('settings.model.gpt4oDesc'));
		modelInfoEl.createEl('br');
		
		// GPT-4o Mini model info
		modelInfoEl.appendText('• ');
		const gpt4oMiniLabel = modelInfoEl.createEl('strong');
		gpt4oMiniLabel.setText(t('settings.model.gpt4oMini') + ':');
		modelInfoEl.appendText(' ' + t('settings.model.gpt4oMiniDesc'));

		const initialVadMode = settings.vadMode ?? 'server';
		new Setting(containerEl)
			.setName(t('settings.vadMode.name'))
			.setDesc(t('settings.vadMode.desc'))
			.addDropdown(dropdown => {
				dropdown.addOption('server', t('settings.vadMode.options.server'));
				dropdown.addOption('local', t('settings.vadMode.options.local'));
				dropdown.addOption('disabled', t('settings.vadMode.options.disabled'));
				dropdown.setValue(initialVadMode);
				dropdown.onChange(async (value) => {
					const mode = value as VADMode;
					if (mode === 'local') {
						const hasLocalWasm = await this.checkLocalWasm(app);
						if (!hasLocalWasm) {
							new Notice(t('settings.vadMode.missingWarning'), 8000);
							try {
								window.open(SettingsUIBuilder.FVAD_DOWNLOAD_URL, '_blank');
							} catch (error) {
								this.logger.warn('Failed to open fvad download link', error);
							}
							dropdown.setValue(settings.vadMode ?? 'server');
							return;
						}
					}
					settings.vadMode = mode;
					await saveSettings();
				});
			});
	}


	/**
	 * Create advanced settings section
	 */
	static displayAdvancedSettings(containerEl: HTMLElement, settings: APITranscriptionSettings, saveSettings: () => Promise<void>, refreshDisplay?: () => void): void {
		// Advanced settings heading removed as requested
		
		// Chunk duration is now automatically determined by model:
		// - GPT-4o & GPT-4o Mini: 300 seconds (5 minutes)
		// - Whisper: 180 seconds (3 minutes)
		
		// Chunk info removed as requested (fixed configuration)
	}


	/**
	 * Create Progress UI settings section
	 */
	static displayProgressUISettings(containerEl: HTMLElement, settings: APITranscriptionSettings, saveSettings: () => Promise<void>): void {
		// Progress UI settings heading removed as requested
		
		// Background processing is now always enabled on desktop
		// Max history items is now fixed at 50
	}

	/**
	 * Create debug settings section
	 * Commented out for production release
	 */
	// static displayDebugSettings(containerEl: HTMLElement, settings: APITranscriptionSettings, saveSettings: () => Promise<void>): void {
	// 	// Debug settings heading removed as requested
	// 	
	// 	// Debug mode toggle
	// 	new Setting(containerEl)
	// 		.setName(t('settings.debug.mode'))
	// 		.setDesc(t('settings.debug.modeDesc'))
	// 		.addToggle(toggle => toggle
	// 			.setValue(settings.debugMode)
	// 			.onChange(async (value) => {
	// 				settings.debugMode = value;
	// 				await saveSettings();
	// 			}));
	// }

	/**
	 * Create API key description with link
	 */
	private static createApiKeyDescription(provider: string, url: string): DocumentFragment {
		const fragment = document.createDocumentFragment();
		fragment.appendText(t('settings.apiKey.desc') + ' ');
		
		const link = document.createElement('a');
		link.href = url;
		link.textContent = provider;
		link.target = '_blank';
		fragment.appendChild(link);
		
		fragment.appendText('.');
		
		return fragment;
	}


	/**
	 * Check if safeStorage is available
	 */
	private static isSafeStorageAvailable(): boolean {
		try {
			// モバイル環境チェック
			if (Platform.isMobileApp) {
				return false;
			}
			const electron = isElectronWindow(window) ? window.require?.('electron') : null;
			// remote.safeStorage を優先的に確認
			const safeStorage = electron?.remote?.safeStorage || electron?.safeStorage;
			return safeStorage?.isEncryptionAvailable?.() || false;
		} catch {
			return false;
		}
	}
	private static async checkLocalWasm(app: App): Promise<boolean> {
		const possiblePaths = PathUtils.getWasmFilePaths(app, 'fvad.wasm');
		for (const path of possiblePaths) {
			try {
				const exists = await app.vault.adapter.exists(path);
				if (exists) {
					return true;
				}
			} catch (error) {
				this.logger.warn('Error checking fvad.wasm path', { path, error });
			}
		}
		return false;
	}
}
