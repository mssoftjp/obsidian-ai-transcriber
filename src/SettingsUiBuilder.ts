import { Setting, Notice, Platform, ButtonComponent, FileSystemAdapter, TFile } from 'obsidian';

import { MODEL_OPTIONS, getModelOption } from './config/ModelOptions';
import { getTranscriptionModelProfile } from './config/TranscriptionModelProfiles';
import { t } from './i18n';
import { SafeStorageService } from './infrastructure/storage/SafeStorageService';
import { SecurityUtils } from './infrastructure/storage/SecurityUtils';
import { clearApiKeyInput } from './ui/ApiKeyInput';
import { Logger } from './utils/Logger';
import { PathUtils } from './utils/PathUtils';

import type { APITranscriptionSettings, TranscriptionModel, VADMode } from './ApiSettings';
import type { App } from 'obsidian';

const VAD_MODE_ORDER: readonly VADMode[] = ['disabled', 'local'];

export class SettingsUIBuilder {
	private static readonly FVAD_DOWNLOAD_URL = 'https://github.com/echogarden-project/fvad-wasm';

	private static logger = Logger.getLogger('SettingsUIBuilder');
	/**
	 * Create API settings section
	 */
	static displayAPISettings(containerEl: HTMLElement, settings: APITranscriptionSettings, saveSettings: () => Promise<void>, app: App): void {
		this.configureApiKeySetting(new Setting(containerEl), settings, saveSettings);
		this.configureModelSetting(new Setting(containerEl), settings, saveSettings);
		this.configureVadModeSetting(new Setting(containerEl), settings, saveSettings, app);
	}

	static configureApiKeySetting(
		setting: Setting,
		settings: APITranscriptionSettings,
		saveSettings: () => Promise<void>
	): void {
		let apiKeyInput: HTMLInputElement | null = null;
		let storageWarningShown = false;
		const containerEl = setting.settingEl;

		setting
			.setName(t('settings.apiKey.name'))
			.setDesc(this.createApiKeyDescription(t('providers.openai'), 'https://platform.openai.com/api-keys'))
			.addText(text => {
				apiKeyInput = text.inputEl;
				text.inputEl.type = 'password';
				text.inputEl.autocomplete = 'off';
				const apiKey = SafeStorageService.decryptFromStore(settings.openaiApiKey);
				if (apiKey) {
					text.setValue(SecurityUtils.maskApiKey(apiKey));
				}
				return text
					.setPlaceholder(t('settings.apiKey.placeholder'))
					.onChange(async (value) => {
						if (!value || value.includes('*')) {
							return;
						}
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
					});
			})
			.addButton(button => button
				.setButtonText(t('settings.apiKey.testButton'))
				.onClick(async () => {
					button.setButtonText(t('common.processing'));
					button.setDisabled(true);
					const apiKey = SafeStorageService.decryptFromStore(settings.openaiApiKey);
					try {
						this.logger.debug('Testing API key connection');
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
			.addExtraButton(button => button
				.setTooltip(t('common.delete'))
				.setIcon('trash-2')
				.onClick(async () => {
					settings.openaiApiKey = '';
					await saveSettings();
					clearApiKeyInput(apiKeyInput);
				}));
	}

	static configureModelSetting(
		setting: Setting,
		settings: APITranscriptionSettings,
		saveSettings: () => Promise<void>
	): void {
		setting
			.setName(t('settings.model.name'))
			.setDesc(this.createModelDescription())
			.addDropdown(dropdown => {
				MODEL_OPTIONS.forEach(option => {
					dropdown.addOption(option.value, this.getModelLabel(option.model));
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
	}

	static configureVadModeSetting(
		setting: Setting,
		settings: APITranscriptionSettings,
		saveSettings: () => Promise<void>,
		app: App
	): void {
		const initialVadMode = settings.vadMode;
		setting
			.setName(t('settings.vadMode.name'))
			.setDesc(this.createVADDescription(t('settings.vadMode.desc'), false))
			.addDropdown(dropdown => {
				VAD_MODE_ORDER.forEach(mode => {
					dropdown.addOption(mode, t(`settings.vadMode.options.${mode}`));
				});
				dropdown.setValue(initialVadMode);
				dropdown.onChange(async (value) => {
					if (!SettingsUIBuilder.isValidVadMode(value)) {
						this.logger.warn('Invalid VAD mode selection ignored', { value });
						return;
					}
					if (value === 'local') {
						const hasLocalWasm = await this.checkLocalWasm(app);
						setting.setDesc(this.createVADDescription(
							t('settings.vadMode.desc'),
							!hasLocalWasm
						));
						this.setHelperVisibility(
							helperState.container,
							helperState.note,
							!hasLocalWasm && !Platform.isMobileApp,
							t('settings.vadMode.installWasm.desc')
						);
					} else {
						setting.setDesc(this.createVADDescription(t('settings.vadMode.desc'), false));
						this.setHelperVisibility(helperState.container, helperState.note, false);
					}
					settings.vadMode = value;
					await saveSettings();
				});
			});

		const helperState = this.createVadHelper(setting);
		const helperContainer = helperState.container;
		if (helperContainer) {
			new ButtonComponent(helperContainer)
				.setButtonText(t('settings.vadMode.installWasm.button'))
				.setCta()
				.onClick(() => {
					this.openVadWasmPicker(app, setting, helperContainer, helperState.note);
				});
		}

		void this.refreshVadAvailability(app, setting, initialVadMode, helperState.container, helperState.note);
	}

	private static createVadHelper(setting: Setting): {
		container: HTMLDivElement | null;
		note: HTMLDivElement | null;
	} {
		const infoEl = setting.settingEl.querySelector('.setting-item-info');
		const container = infoEl instanceof HTMLElement
			? infoEl.createDiv({ cls: 'ai-vad-inline-helper ait-hidden' })
			: null;
		return {
			container,
			note: container?.createDiv({ cls: 'setting-item-description' }) ?? null
		};
	}

	private static openVadWasmPicker(
		app: App,
		setting: Setting,
		helperContainer: HTMLDivElement,
		helperNote: HTMLDivElement | null
	): void {
		try {
			const input = helperContainer.createEl('input', {
				type: 'file',
				cls: 'ait-hidden',
				attr: { accept: '.wasm,application/wasm' }
			});
			input.onchange = () => {
				void this.installSelectedVadWasm(app, setting, helperContainer, helperNote, input);
			};
			input.click();
		} catch (error) {
			const errorMessage = SettingsUIBuilder.formatErrorMessage(error);
			new Notice(t('settings.vadMode.installWasm.writeError', { error: errorMessage }));
		}
	}

	private static async installSelectedVadWasm(
		app: App,
		setting: Setting,
		helperContainer: HTMLDivElement,
		helperNote: HTMLDivElement | null,
		input: HTMLInputElement
	): Promise<void> {
		try {
			const file = input.files?.[0];
			if (!file) {
				return;
			}
			if (file.name !== 'fvad.wasm') {
				new Notice(t('settings.vadMode.installWasm.invalidName'));
				return;
			}
			const bytes = new Uint8Array(await file.arrayBuffer());
			const isWasm = bytes.length >= 4
				&& bytes[0] === 0x00
				&& bytes[1] === 0x61
				&& bytes[2] === 0x73
				&& bytes[3] === 0x6d;
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
			try {
				await adapter.mkdir(pluginDir);
			} catch (mkdirError) {
				if (!SettingsUIBuilder.isAlreadyExistsError(mkdirError)) {
					throw mkdirError;
				}
			}
			await adapter.writeBinary(targetPath, wasmData);
			new Notice(t('settings.vadMode.installWasm.success'));
			setting.setDesc(this.createVADDescription(t('settings.vadMode.desc'), false));
			this.setHelperVisibility(helperContainer, helperNote, false);
		} catch (error) {
			const errorMessage = SettingsUIBuilder.formatErrorMessage(error);
			new Notice(t('settings.vadMode.installWasm.writeError', { error: errorMessage }));
		} finally {
			input.remove();
		}
	}

	private static async refreshVadAvailability(
		app: App,
		setting: Setting,
		mode: VADMode,
		helperContainer: HTMLDivElement | null,
		helperNote: HTMLDivElement | null
	): Promise<void> {
		try {
			const exists = await this.checkLocalWasm(app);
			const includeMissing = mode === 'local' && !exists;
			setting.setDesc(this.createVADDescription(t('settings.vadMode.desc'), includeMissing));
			this.setHelperVisibility(
				helperContainer,
				helperNote,
				includeMissing && !Platform.isMobileApp,
				t('settings.vadMode.installWasm.desc')
			);
		} catch (error) {
			this.logger.warn('Failed to check local wasm on settings load', error);
		}
	}

	private static createModelDescription(): DocumentFragment {
		const fragment = SettingsUIBuilder.createObsidianFragment();
		fragment.appendText(t('settings.model.desc'));
		const comparison = fragment.createDiv({ cls: 'ai-transcriber-model-comparison' });
		comparison.createDiv({
			cls: 'ai-transcriber-model-comparison-title',
			text: t('settings.model.comparison')
		});
		const list = comparison.createEl('ul');
		list.createEl('li', {
			text: `${t('settings.model.whisper')}: ${t('settings.model.whisperDesc')}`
		});
		list.createEl('li', {
			text: `${t('settings.model.gpt4o')}: ${t('settings.model.gpt4oDesc')}`
		});
		list.createEl('li', {
			text: `${t('settings.model.gpt4oMini')}: ${t('settings.model.gpt4oMiniDesc')}`
		});
		return fragment;
	}

	private static getModelLabel(model: TranscriptionModel): string {
		return t(getTranscriptionModelProfile(model).ui.optionLabelKey);
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
	private static createVADDescription(baseDesc: string, includeMissingNote: boolean): DocumentFragment {
		const fragment = SettingsUIBuilder.createObsidianFragment();
		fragment.appendText(baseDesc);
		const comparison = fragment.createDiv({ cls: 'ai-transcriber-vad-comparison' });
		const list = comparison.createEl('ul');
		VAD_MODE_ORDER.forEach(mode => {
			list.createEl('li', {
				text: `${t(`settings.vadMode.options.${mode}`)}: ${t(`settings.vadMode.descriptions.${mode}`)}`
			});
		});
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
		return fragment;
	}

	private static isValidVadMode(value: string): value is VADMode {
		return value === 'local' || value === 'disabled';
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
