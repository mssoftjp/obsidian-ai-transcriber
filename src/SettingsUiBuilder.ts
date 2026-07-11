import { Setting, Notice, Platform, ButtonComponent, FileSystemAdapter, TFile } from 'obsidian';

import { MODEL_NAMES } from './config/constants';
import { MODEL_OPTIONS, getModelOption } from './config/ModelOptions';
import { t } from './i18n';
import { SafeStorageService } from './infrastructure/storage/SafeStorageService';
import { SecurityUtils } from './infrastructure/storage/SecurityUtils';
import { Logger } from './utils/Logger';
import { PathUtils } from './utils/PathUtils';

import type { APITranscriptionSettings, VADMode } from './ApiSettings';
import type { App } from 'obsidian';

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
			.setDesc(this.createApiKeyDescription(t('providers.openai'), 'https://platform.openai.com/api-keys'))
			.addText(text => {
				let storageWarningShown = false;
				text.inputEl.type = 'password';
				text.inputEl.autocomplete = 'off';
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
							const encryptedKey = SafeStorageService.encryptForStore(value);
							if (!encryptedKey) {
								if (!storageWarningShown) {
									new Notice(t('settings.apiKey.insecureWarning'));
									storageWarningShown = true;
								}
								return;
							}
							settings.openaiApiKey = encryptedKey;
							await saveSettings();
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
						const timerWindow = containerEl.ownerDocument.defaultView ?? SettingsUIBuilder.getFallbackWindow();
						timerWindow.setTimeout(() => {
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
						const input = button.extraSettingsEl.parentElement?.querySelector<HTMLInputElement>('input[type="text"]');
						if (input) {
							input.value = '';
						}
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
					if (!option) {
						return;
					}

					settings.model = option.model;
					await saveSettings();
				});
			});

		// Temperature setting removed - now configured in config files only

		// Model comparison info - simplified as requested
		const modelInfoEl = containerEl.createDiv({ cls: 'setting-item-description' });
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

			const initialVadMode = settings.vadMode;
			const vadModeSetting = new Setting(containerEl)
				.setName(t('settings.vadMode.name'))
				.setDesc(this.createVADDescription(t('settings.vadMode.desc'), false, false))
				.addDropdown(dropdown => {
				dropdown.addOption('server', t('settings.vadMode.options.server'));
				dropdown.addOption('local', t('settings.vadMode.options.local'));
				dropdown.addOption('disabled', t('settings.vadMode.options.disabled'));
				dropdown.setValue(initialVadMode);
				dropdown.onChange(async (value) => {
					if (!SettingsUIBuilder.isValidVadMode(value)) {
						this.logger.warn('Invalid VAD mode selection ignored', { value });
						return;
					}
					const mode: VADMode = value;
					if (mode === 'local') {
						const hasLocalWasm = await this.checkLocalWasm(app);
						const includeMissing = !hasLocalWasm;
						const includeLocal = hasLocalWasm;
						vadModeSetting.setDesc(this.createVADDescription(t('settings.vadMode.desc'), includeMissing, includeLocal));
						if (includeMissing && !Platform.isMobileApp) {
							this.setHelperVisibility(helperContainer, helperNote, true, t('settings.vadMode.installWasm.desc'));
						} else {
							this.setHelperVisibility(helperContainer, helperNote, false);
						}
					} else {
						// Non-local: show base desc only and hide helper
						vadModeSetting.setDesc(this.createVADDescription(t('settings.vadMode.desc'), false, false));
						this.setHelperVisibility(helperContainer, helperNote, false);
					}
					settings.vadMode = mode;
					await saveSettings();
				});
			});

		// Inline helper elements (place under the description, left column)
		const infoEl = vadModeSetting.settingEl.querySelector('.setting-item-info');
		const helperContainer = infoEl instanceof HTMLElement
			? infoEl.createDiv({ cls: 'ai-vad-inline-helper ait-hidden' })
			: null;
		const helperNote = helperContainer?.createDiv({ cls: 'setting-item-description' }) ?? null;
		let helperBtn: ButtonComponent | null = null;

		if (helperContainer) {
			helperBtn = new ButtonComponent(helperContainer)
				.setButtonText(t('settings.vadMode.installWasm.button'))
				.setCta();

			helperBtn.onClick(() => {
				try {
					const input = helperContainer.createEl('input', {
						type: 'file',
						cls: 'ait-hidden',
						attr: { accept: '.wasm,application/wasm' }
					});
					input.onchange = () => {
						void (async () => {
							try {
								const file = input.files?.[0];
								if (!file) {
									return;
								}
								if (file.name !== 'fvad.wasm') {
									new Notice(t('settings.vadMode.installWasm.invalidName'));
									return;
								}
								const buffer = await file.arrayBuffer();
								const bytes = new Uint8Array(buffer);
								const isWasm = bytes.length >= 4 &&
									bytes[0] === 0x00 &&
									bytes[1] === 0x61 &&
									bytes[2] === 0x73 &&
									bytes[3] === 0x6d;
								if (!isWasm) {
									new Notice(t('settings.vadMode.installWasm.invalidType'));
									return;
								}

								const pluginDir = PathUtils.getPluginDir(app);
								const targetPath = PathUtils.getPluginFilePath(app, 'fvad.wasm');
								const wasmData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

								const { adapter } = app.vault;
								if (!(adapter instanceof FileSystemAdapter)) {
									throw new Error('Placing fvad.wasm requires the desktop FileSystemAdapter.');
								}

								// Ensure plugin directory exists; ignore "already exists" errors
								try {
									await adapter.mkdir(pluginDir);
								} catch (mkdirError) {
									if (!SettingsUIBuilder.isAlreadyExistsError(mkdirError)) {
										throw mkdirError;
									}
								}

								// Plugin assets live under Obsidian's config/plugin directory, which is hidden from Vault indexing.
								await adapter.writeBinary(targetPath, wasmData);
								new Notice(t('settings.vadMode.installWasm.success'));
								// Reflect installed state for local mode
								vadModeSetting.setDesc(this.createVADDescription(t('settings.vadMode.desc'), false, true));
								// Hide helper after successful installation
								this.setHelperVisibility(helperContainer, helperNote, false);
							} catch (error) {
								const errorMessage = SettingsUIBuilder.formatErrorMessage(error);
								new Notice(t('settings.vadMode.installWasm.writeError', { error: errorMessage }));
							} finally {
								input.remove();
							}
						})();
					};
					input.click();
				} catch (error) {
					const errorMessage = SettingsUIBuilder.formatErrorMessage(error);
					new Notice(t('settings.vadMode.installWasm.writeError', { error: errorMessage }));
				}
			});
		}

		// If current mode is local but wasm is missing (e.g., manual config edit), show the inline note
		this.checkLocalWasm(app).then((exists) => {
			const includeMissing = initialVadMode === 'local' && !exists;
			const includeLocal = initialVadMode === 'local' && exists;
			vadModeSetting.setDesc(this.createVADDescription(t('settings.vadMode.desc'), includeMissing, includeLocal));
			// Helper visibility: show only when local mode AND wasm is missing
			if (initialVadMode === 'local' && includeMissing && !Platform.isMobileApp) {
				this.setHelperVisibility(helperContainer, helperNote, true, t('settings.vadMode.installWasm.desc'));
			} else {
				this.setHelperVisibility(helperContainer, helperNote, false);
			}
		}).catch(error => {
			this.logger.warn('Failed to check local wasm on settings load', error);
		});
	}


	/**
	 * Create advanced settings section
	 */
	static displayAdvancedSettings(_containerEl: HTMLElement, _settings: APITranscriptionSettings, _saveSettings: () => Promise<void>, _refreshDisplay?: () => void): void {
		// Advanced settings heading removed as requested

		// Chunk duration is now automatically determined by model:
		// - GPT-4o & GPT-4o Mini: 300 seconds (5 minutes)
		// - Whisper: 180 seconds (3 minutes)

		// Chunk info removed as requested (fixed configuration)
	}


	/**
	 * Create Progress UI settings section
	 */
	static displayProgressUISettings(_containerEl: HTMLElement, _settings: APITranscriptionSettings, _saveSettings: () => Promise<void>): void {
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
		const fragment = SettingsUIBuilder.createObsidianFragment();
		fragment.appendText(t('settings.apiKey.desc') + ' ');

		const link = fragment.createEl('a');
		link.href = url;
		link.setText(provider);
		link.target = '_blank';

		fragment.appendText('.');

		return fragment;
	}

	private static setHelperVisibility(
		container: HTMLDivElement | null,
		note: HTMLDivElement | null,
		show: boolean,
		message: string = ''
	): void {
		if (!container || !note) {
			return;
		}
		if (show) {
			container.removeClass('ait-hidden');
			if (message) {
				note.setText(message);
			}
		} else {
			container.addClass('ait-hidden');
			note.setText('');
		}
	}


	private static async checkLocalWasm(app: App): Promise<boolean> {
		const possiblePaths = PathUtils.getWasmFilePaths(app, 'fvad.wasm');
		const { adapter } = app.vault;

		for (const path of possiblePaths) {
			const normalizedPath = PathUtils.normalizeUserPath(path);
			const file = app.vault.getAbstractFileByPath(normalizedPath);
			if (file instanceof TFile) {
				return true;
			}

			if (!(adapter instanceof FileSystemAdapter)) {
				continue;
			}

			try {
				await adapter.readBinary(normalizedPath);
				return true;
			} catch {
				// not found
			}
		}

		return false;
	}

	private static isAlreadyExistsError(error: unknown): boolean {
		const message = SettingsUIBuilder.formatErrorMessage(error).toLowerCase();
		return message.includes('already exists') || message.includes('eexist');
	}


	/**
	 * Create VAD description with optional inline missing-wasm note and link
	 */
	private static createVADDescription(baseDesc: string, includeMissingNote: boolean, includeLocalNote: boolean): DocumentFragment {
		const fragment = SettingsUIBuilder.createObsidianFragment();
		fragment.appendText(baseDesc);
		// Always show concise summaries for both selectable modes on the next line
		fragment.createEl('br');
		const summaryLine = `${t('settings.vadMode.options.server')}（${t('settings.vadMode.summaries.server')}）、` +
          `${t('settings.vadMode.options.local')}（${t('settings.vadMode.summaries.local')}）`;
		fragment.appendText(summaryLine);
		if (includeMissingNote) {
			// Add a light separator (empty line) before the missing-note block
			fragment.createEl('br');
			fragment.createEl('br');
			fragment.appendText(t('settings.vadMode.missingInlineNote') + ' ');
			const link = fragment.createEl('a');
			link.href = SettingsUIBuilder.FVAD_DOWNLOAD_URL;
			link.setText(SettingsUIBuilder.FVAD_DOWNLOAD_URL);
			link.target = '_blank';
		}
		if (includeLocalNote) {
			fragment.createEl('br');
			fragment.appendText(t('settings.vadMode.localNote'));
		}
		return fragment;
	}

	private static isValidVadMode(value: string): value is VADMode {
		return value === 'server' || value === 'local' || value === 'disabled';
	}

	private static getFallbackWindow(): Window {
		return activeWindow;
	}

	private static createObsidianFragment(): DocumentFragment {
		return createFragment();
	}

	private static formatErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		if (typeof error === 'number' || typeof error === 'boolean') {
			return String(error);
		}
		try {
			return JSON.stringify(error);
		} catch {
			return 'Unknown error';
		}
	}
}
