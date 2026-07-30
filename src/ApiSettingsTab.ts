import { Notice, PluginSettingTab, Setting } from 'obsidian';

import { t } from './i18n';
import { SettingsUIBuilder } from './SettingsUiBuilder';
import { DictionaryManagementModal } from './ui/DictionaryManagementModal';
import { FolderInputSuggest } from './ui/FolderInputSuggest';
import { FolderSuggestModal } from './ui/FolderSuggestModal';
import { PathUtils } from './utils/PathUtils';

import type AITranscriberPlugin from './main-api';
import type { App, SettingDefinitionItem, TextComponent } from 'obsidian';

interface SettingsRowDefinition {
	name: string;
	desc: string;
	aliases: string[];
	render: (setting: Setting) => void;
}

export class APISettingsTab extends PluginSettingTab {
	plugin: AITranscriberPlugin;
	private updateDictionaryDesc?: () => void;

	constructor(app: App, plugin: AITranscriberPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return this.getSettingsRows().map(row => ({
			name: row.name,
			desc: row.desc,
			aliases: row.aliases,
			render: row.render
		}));
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('ai-transcriber-settings');
		this.getSettingsRows().forEach(row => {
			row.render(new Setting(containerEl));
		});
	}

	private getSettingsRows(): SettingsRowDefinition[] {
		return [
			{
				name: t('settings.apiKey.name'),
				desc: t('settings.apiKey.desc'),
				aliases: ['OpenAI', 'API key'],
				render: setting => SettingsUIBuilder.configureApiKeySetting(
					setting,
					this.plugin.settings,
					async () => this.plugin.saveSettings()
				)
			},
			{
				name: t('settings.model.name'),
				desc: t('settings.model.desc'),
				aliases: ['GPT Transcribe', 'Whisper', 'GPT-4o'],
				render: setting => SettingsUIBuilder.configureModelSetting(
					setting,
					this.plugin.settings,
					async () => this.plugin.saveSettings()
				)
			},
			{
				name: t('settings.vadMode.name'),
				desc: t('settings.vadMode.desc'),
				aliases: ['VAD', 'voice activity detection'],
				render: setting => SettingsUIBuilder.configureVadModeSetting(
					setting,
					this.plugin.settings,
					async () => this.plugin.saveSettings(),
					this.app
				)
			},
			{
				name: t('settings.language.name'),
				desc: this.getLanguageDescription(),
				aliases: ['transcription language'],
				render: setting => this.configureLanguageSetting(setting)
			},
			{
				name: t('settings.outputFormat.name'),
				desc: t('settings.outputFormat.desc'),
				aliases: ['callout', 'quote', 'plain text'],
				render: setting => this.configureOutputFormatSetting(setting)
			},
			{
				name: t('settings.postProcessing.name'),
				desc: t('settings.postProcessing.desc'),
				aliases: ['post-processing'],
				render: setting => this.configurePostProcessingSetting(setting)
			},
			{
				name: t('settings.dictionaryCorrection.name'),
				desc: t('settings.dictionaryCorrection.desc'),
				aliases: ['dictionary correction'],
				render: setting => this.configureDictionaryCorrectionSetting(setting)
			},
			{
				name: t('settings.outputFolder.name'),
				desc: t('settings.outputFolder.desc'),
				aliases: ['save folder', 'output path'],
				render: setting => this.configureOutputFolderSetting(setting)
			},
			{
				name: t('settings.dictionary.manageDictionary'),
				desc: this.getDictionaryDescription(),
				aliases: ['custom dictionary', 'corrections'],
				render: setting => this.configureDictionaryManagementSetting(setting)
			}
		];
	}

	private configureLanguageSetting(setting: Setting): void {
		setting
			.setName(t('settings.language.name'))
			.setDesc(this.getLanguageDescription())
			.addDropdown(dropdown => dropdown
				.addOption('auto', t('settings.language.autoDetect'))
				.addOption('ja', t('settings.language.options.ja'))
				.addOption('en', t('settings.language.options.en'))
				.addOption('zh', t('settings.language.options.zh'))
				.addOption('ko', t('settings.language.options.ko'))
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
					this.updateDictionaryDesc?.();
				}))
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip(t('settings.language.useObsidianLang'))
				.onClick(async () => {
					const language = this.plugin.getObsidianLanguage();
					if (!language) {
						return;
					}
					this.plugin.settings.language = language;
					await this.plugin.saveSettings();
					this.updateDictionaryDesc?.();
					new Notice(t('notices.languageSet', { language }));
				}));
	}

	private configureOutputFormatSetting(setting: Setting): void {
		setting
			.setName(t('settings.outputFormat.name'))
			.setDesc(t('settings.outputFormat.desc'))
			.addDropdown(dropdown => dropdown
				.addOption('callout', t('settings.outputFormat.callout'))
				.addOption('quote', t('settings.outputFormat.quote'))
				.addOption('plain', t('settings.outputFormat.plain'))
				.setValue(this.plugin.settings.outputFormat)
				.onChange(async (value) => {
					this.plugin.settings.outputFormat = value;
					await this.plugin.saveSettings();
				}));
	}

	private configurePostProcessingSetting(setting: Setting): void {
		setting
			.setName(t('settings.postProcessing.name'))
			.setDesc(t('settings.postProcessing.desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.postProcessingEnabled)
				.onChange(async (value) => {
					this.plugin.settings.postProcessingEnabled = value;
					await this.plugin.saveSettings();
				}));
	}

	private configureDictionaryCorrectionSetting(setting: Setting): void {
		setting
			.setName(t('settings.dictionaryCorrection.name'))
			.setDesc(t('settings.dictionaryCorrection.desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.dictionaryCorrectionEnabled)
				.onChange(async (value) => {
					this.plugin.settings.dictionaryCorrectionEnabled = value;
					await this.plugin.saveSettings();
				}));
	}

	private configureOutputFolderSetting(setting: Setting): void {
		const outputFolderState: { component?: TextComponent } = {};
		setting
			.setName(t('settings.outputFolder.name'))
			.setDesc(t('settings.outputFolder.desc'))
			.addText(text => {
				outputFolderState.component = text;
				new FolderInputSuggest(this.app, text.inputEl, (folderPath) => {
					const normalized = PathUtils.normalizeUserPath(folderPath);
					this.plugin.settings.transcriptionOutputFolder = normalized;
					void this.plugin.saveSettings();
					text.setValue(normalized);
				});
				return text
					.setPlaceholder(t('settings.outputFolder.placeholder'))
					.setValue(PathUtils.normalizeUserPath(this.plugin.settings.transcriptionOutputFolder))
					.onChange(async (value) => {
						this.plugin.settings.transcriptionOutputFolder = PathUtils.normalizeUserPath(value);
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton(button => button
				.setIcon('folder')
				.setTooltip(t('settings.outputFolder.select'))
				.onClick(() => {
					const currentFolder = PathUtils.normalizeUserPath(this.plugin.settings.transcriptionOutputFolder);
					const modal = new FolderSuggestModal(this.app, currentFolder);
					modal.onChooseFolderPath = (folder: string) => {
						const normalized = PathUtils.normalizeUserPath(folder);
						this.plugin.settings.transcriptionOutputFolder = normalized;
						void this.plugin.saveSettings();
						outputFolderState.component?.setValue(normalized);
					};
					modal.open();
				}));
	}

	private configureDictionaryManagementSetting(setting: Setting): void {
		setting
			.setName(t('settings.dictionary.manageDictionary'))
			.setDesc(this.getDictionaryDescription())
			.addButton(button => button
				.setButtonText(t('settings.dictionary.openManager'))
				.onClick(() => {
					new DictionaryManagementModal(this.app, this.plugin.settings, this.plugin).open();
				}));
		this.updateDictionaryDesc = () => {
			setting.setDesc(this.getDictionaryDescription());
		};
	}

	private getLanguageDescription(): string {
		const obsidianLanguage = this.plugin.getObsidianLanguage();
		return obsidianLanguage && obsidianLanguage !== 'auto' && this.plugin.settings.language !== 'auto'
			? t('settings.language.desc') + ' (' + t('settings.language.useObsidianLang') + ': ' + obsidianLanguage + ')'
			: t('settings.language.desc');
	}

	private getDictionaryDescription(): string {
		return this.plugin.settings.language === 'auto'
			? t('settings.dictionary.autoModeDesc')
			: t('settings.dictionary.languageModeDesc', { lang: this.plugin.settings.language });
	}
}
