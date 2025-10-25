import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { t } from './i18n';
import { SettingsUIBuilder } from './SettingsUiBuilder';
import { FolderSuggestModal } from './ui/FolderSuggestModal';
import { DictionaryManagementModal } from './ui/DictionaryManagementModal';
import AITranscriberPlugin from './main-api';
import { BUY_ME_A_COFFEE_DEFAULT_BUTTON } from './assets/supportImages';

export class APISettingsTab extends PluginSettingTab {
	plugin: AITranscriberPlugin;
	private updateDictionaryDesc?: () => void;
	
	private static readonly SUPPORT_CONFIG = {
		fundingUrl: 'https://buymeacoffee.com/mssoft',
		imageSrc: BUY_ME_A_COFFEE_DEFAULT_BUTTON,
		imageWidth: '217',
		imageHeight: '60'
	} as const;

	constructor(app: App, plugin: AITranscriberPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Remove the main title as requested

		// API settings (unified for all models)
		SettingsUIBuilder.displayAPISettings(containerEl, this.plugin.settings, () => this.plugin.saveSettings(), this.app);

		// Transcription settings - no heading needed

		// Show current Obsidian language if available
		const obsidianLang = this.plugin.getObsidianLanguage();
		const languageDesc = obsidianLang && obsidianLang !== 'auto' 
			? `${t('settings.language.desc')} (${t('settings.language.useObsidianLang')}: ${obsidianLang})`
			: t('settings.language.desc');
		
		new Setting(containerEl)
			.setName(t('settings.language.name'))
			.setDesc(languageDesc)
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
					// Update dictionary description immediately
					this.updateDictionaryDesc?.();
				}))
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip(t('settings.language.useObsidianLang'))
				.onClick(async () => {
					const obsidianLanguage = this.plugin.getObsidianLanguage();
					if (obsidianLanguage) {
						this.plugin.settings.language = obsidianLanguage;
						await this.plugin.saveSettings();
						// Update dictionary description immediately
						this.updateDictionaryDesc?.();
						new Notice(t('notices.languageSet', { language: obsidianLanguage }));
					}
				}));

		new Setting(containerEl)
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

		// Store toggle reference for later use
		let dictionaryToggle: any;

		// Post-processing settings
		new Setting(containerEl)
			.setName(t('settings.postProcessing.name'))
			.setDesc(t('settings.postProcessing.desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.postProcessingEnabled)
				.onChange(async (value) => {
					this.plugin.settings.postProcessingEnabled = value;
					await this.plugin.saveSettings();
					// Update dictionary toggle disabled state
					if (dictionaryToggle) {
						dictionaryToggle.setDisabled(!value);
					}
				}));

		// Dictionary correction settings
		new Setting(containerEl)
			.setName(t('settings.dictionaryCorrection.name'))
			.setDesc(t('settings.dictionaryCorrection.desc'))
			.addToggle(toggle => {
				dictionaryToggle = toggle;
				return toggle
					.setValue(this.plugin.settings.dictionaryCorrectionEnabled)
					.setDisabled(!this.plugin.settings.postProcessingEnabled)
					.onChange(async (value) => {
						this.plugin.settings.dictionaryCorrectionEnabled = value;
						await this.plugin.saveSettings();
					});
			});

		// Output folder setting
		new Setting(containerEl)
			.setName(t('settings.outputFolder.name'))
			.setDesc(t('settings.outputFolder.desc'))
			.addText(text => text
				.setPlaceholder(t('settings.outputFolder.placeholder'))
				.setValue(this.plugin.settings.transcriptionOutputFolder)
				.onChange(async (value) => {
					this.plugin.settings.transcriptionOutputFolder = value;
					await this.plugin.saveSettings();
				}))
			.addExtraButton(button => button
				.setIcon('folder')
				.setTooltip(t('settings.outputFolder.select'))
				.onClick(async () => {
					const modal = new FolderSuggestModal(this.app, this.plugin.settings.transcriptionOutputFolder);
					modal.onChooseFolderPath = async (folder: string) => {
						this.plugin.settings.transcriptionOutputFolder = folder;
						await this.plugin.saveSettings();
						this.display();
					};
					modal.open();
				}));

		// Advanced settings
		SettingsUIBuilder.displayAdvancedSettings(containerEl, this.plugin.settings, () => this.plugin.saveSettings(), () => this.display());
		
		// Dictionary management button
		const dictionarySetting = new Setting(containerEl)
			.setName(t('settings.dictionary.manageDictionary'))
			.addButton(button => button
				.setButtonText(t('settings.dictionary.openManager'))
				.onClick(() => {
					const modal = new DictionaryManagementModal(this.app, this.plugin.settings, this.plugin);
					modal.open();
				}));
		
		// Function to update dictionary description
		const updateDictionaryDesc = () => {
			const desc = this.plugin.settings.language === 'auto'
				? t('settings.dictionary.autoModeDesc')
				: t('settings.dictionary.languageModeDesc', { lang: this.plugin.settings.language });
			dictionarySetting.setDesc(desc);
		};
		
		// Set initial description
		updateDictionaryDesc();
		
		// Store the update function for language change
		this.updateDictionaryDesc = updateDictionaryDesc;
		
		// Progress UI settings
		SettingsUIBuilder.displayProgressUISettings(containerEl, this.plugin.settings, () => this.plugin.saveSettings());
		
		// Debug settings - commented out for production release
		// SettingsUIBuilder.displayDebugSettings(containerEl, this.plugin.settings, () => this.plugin.saveSettings());
		
		// Buy Me a Coffee banner
		this.displaySupportBanner(containerEl);
	}
	
	private displaySupportBanner(containerEl: HTMLElement): void {
		try {
			// Add some spacing before the banner
			containerEl.createEl('div', { cls: 'bmc-spacer' });
			
			// Create support section
			const supportSection = containerEl.createDiv('bmc-support-section');
			
			// Add support message
			supportSection.createEl('p', {
				text: t('support.message'),
				cls: 'bmc-support-message'
			});
			
			// Buy Me a Coffee banner
			const banner = supportSection.createEl('a', {
				href: APISettingsTab.SUPPORT_CONFIG.fundingUrl,
				attr: { target: '_blank', rel: 'noopener' },
				cls: 'bmc-banner'
			});
			
			banner.createEl('img', {
				attr: {
					src: APISettingsTab.SUPPORT_CONFIG.imageSrc,
					alt: t('support.imageAlt'),
					width: APISettingsTab.SUPPORT_CONFIG.imageWidth,
					height: APISettingsTab.SUPPORT_CONFIG.imageHeight
				}
			});
		} catch (error) {
			console.warn('Failed to display support banner:', error);
		}
	}
}
