import { App, Modal, Notice } from 'obsidian';
import { APITranscriptionSettings, UserDictionary, DictionaryEntry, ContextualCorrection, DictionaryCategory, LanguageDictionaries } from '../ApiSettings';
import { t } from '../i18n';
import { DICTIONARY_CONSTANTS } from '../config/constants';
import { Logger } from '../utils/Logger';

// Define minimal interface for plugin to avoid any type
interface SettingsPlugin {
	saveSettings: () => Promise<void>;
}

export class DictionaryManagementModal extends Modal {
	private settings: APITranscriptionSettings;
	private plugin: SettingsPlugin;
	private dictionaryContentEl!: HTMLElement;
	private currentLanguage: 'ja' | 'en' | 'zh' | 'ko' = 'ja';
	private tabsContainer!: HTMLElement;
	private logger = Logger.getLogger('DictionaryManagementModal');

	constructor(app: App, settings: APITranscriptionSettings, plugin: SettingsPlugin) {
		super(app);
		this.settings = settings;
		this.plugin = plugin;
		// Set initial language based on current settings
		const lang = this.settings.language;
		if (lang === 'ja' || lang === 'en' || lang === 'zh' || lang === 'ko') {
			this.currentLanguage = lang;
		} else {
			// Default to Japanese if auto-detect
			this.currentLanguage = 'ja';
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Apply dictionary-management-modal class for CSS-based sizing
		// Do NOT apply mod-settings as it's reserved for Obsidian's settings modal
		this.modalEl.addClass('dictionary-management-modal');
		this.modalEl.addClass('ai-transcriber-modal');

		// Remove any inline styles - let CSS handle the sizing
		// The CSS already has the proper sizing rules

		// Header
		contentEl.createEl('h2', { text: t('settings.dictionary.title') });

		// Tab container with buttons
		const tabBarContainer = contentEl.createEl('div', { cls: 'dictionary-tab-bar' });

		// Language tabs
		this.tabsContainer = tabBarContainer.createEl('div', { cls: 'dictionary-language-tabs' });
		const languages = [
			{ code: 'ja', name: t('settings.language.options.ja') },
			{ code: 'en', name: t('settings.language.options.en') },
			{ code: 'zh', name: t('settings.language.options.zh') },
			{ code: 'ko', name: t('settings.language.options.ko') }
		];

		languages.forEach(lang => {
			const tab = this.tabsContainer.createEl('button', {
				text: lang.name,
				cls: `dictionary-tab ${this.currentLanguage === lang.code ? 'active' : ''}`
			});
			tab.addEventListener('click', () => {
				this.currentLanguage = lang.code as 'ja' | 'en' | 'zh' | 'ko';
				this.updateTabSelection();
				this.displayDictionary();
			});
		});

		// Import/Export buttons on the right side
		const importExportContainer = tabBarContainer.createEl('div', { cls: 'dictionary-import-export' });

		const importButton = importExportContainer.createEl('button', {
			text: t('settings.dictionary.import'),
			cls: 'dictionary-import-button',
			attr: { 'aria-label': t('settings.dictionary.import'), 'title': t('settings.dictionary.import') }
		});
		importButton.addEventListener('click', () => this.importDictionary());

		const exportButton = importExportContainer.createEl('button', {
			text: t('settings.dictionary.export'),
			cls: 'dictionary-export-button',
			attr: { 'aria-label': t('settings.dictionary.export'), 'title': t('settings.dictionary.export') }
		});
		exportButton.addEventListener('click', () => this.exportDictionary());

		// Dictionary content container
		this.dictionaryContentEl = contentEl.createEl('div', { cls: 'dictionary-content' });

		// Display dictionary sections
		this.displayDictionary();

		// Close button
		const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container ai-transcriber-modal-buttons' });
		const closeBtn = buttonContainer.createEl('button', {
			text: t('common.close')
		});
		closeBtn.addEventListener('click', () => this.close());
	}

	private updateTabSelection(): void {
		// Update tab active states
		const tabs = this.tabsContainer.querySelectorAll('.dictionary-tab');
		tabs.forEach((tab, index) => {
			const languages = ['ja', 'en', 'zh', 'ko'];
			if (languages[index] === this.currentLanguage) {
				tab.addClass('active');
			} else {
				tab.removeClass('active');
			}
		});
	}

	private getCurrentDictionary(): UserDictionary {
		// Ensure userDictionaries exists
		if (!this.settings.userDictionaries) {
			this.settings.userDictionaries = {
				ja: { definiteCorrections: [], contextualCorrections: [] },
				en: { definiteCorrections: [], contextualCorrections: [] },
				zh: { definiteCorrections: [], contextualCorrections: [] },
				ko: { definiteCorrections: [], contextualCorrections: [] }
			};
		}

		// Get dictionary for current language
		const dict = this.settings.userDictionaries[this.currentLanguage];
		if (!dict) {
			// Initialize if not exists
			this.settings.userDictionaries[this.currentLanguage] = {
				definiteCorrections: [],
				contextualCorrections: []
			};
			return this.settings.userDictionaries[this.currentLanguage]!;
		}

		// Ensure arrays exist
		if (!dict.definiteCorrections) {
			dict.definiteCorrections = [];
		}
		if (!dict.contextualCorrections) {
			dict.contextualCorrections = [];
		}

		return dict;
	}

	private displayDictionary(): void {
		this.dictionaryContentEl.empty();

		// Definite corrections section
		this.displayDefiniteCorrections();

		// Contextual corrections section
		this.displayContextualCorrections();
	}

	private displayDefiniteCorrections(): void {
		const section = this.dictionaryContentEl.createEl('div', { cls: 'dictionary-section' });
		const header = section.createEl('div', { cls: 'dictionary-section-header' });
		header.createEl('h3', { text: t('settings.dictionary.definiteCorrections') });

		// Add count and limit info
		const dict = this.getCurrentDictionary();
		const currentCount = dict.definiteCorrections?.length || 0;
		header.createEl('span', {
			cls: 'dictionary-limit-info',
			text: `(${currentCount} / ${DICTIONARY_CONSTANTS.MAX_DEFINITE_CORRECTIONS})`
		});

		// Create table
		const tableContainer = section.createEl('div', { cls: 'dictionary-table-container' });
		const table = tableContainer.createEl('table', { cls: 'dictionary-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: t('settings.dictionary.from') });
		headerRow.createEl('th', { text: t('settings.dictionary.to') });
		headerRow.createEl('th', { text: t('settings.dictionary.category') });
		headerRow.createEl('th', { text: t('settings.dictionary.priority') });
		headerRow.createEl('th', { text: '' }); // Delete button column

		// Body
		const tbody = table.createEl('tbody');
		const currentDict = this.getCurrentDictionary();
		const entries = currentDict.definiteCorrections;

		entries.forEach((entry, index) => {
			this.createDefiniteEntryRow(tbody, entry, index);
		});

		// Add button
		const addButton = section.createEl('button', {
			text: '+',
			cls: 'dictionary-add-button'
		});
		addButton.addEventListener('click', () => {
			// Check limit
			if (entries.length >= DICTIONARY_CONSTANTS.MAX_DEFINITE_CORRECTIONS) {
				new Notice(t('settings.dictionary.limitReached', {
					limit: DICTIONARY_CONSTANTS.MAX_DEFINITE_CORRECTIONS
				}));
				return;
			}

			const newEntry: DictionaryEntry = {
				from: [],
				to: '',
				category: DICTIONARY_CONSTANTS.DEFAULT_CATEGORY,
				priority: DICTIONARY_CONSTANTS.DEFAULT_PRIORITY
			};
			entries.push(newEntry);
			this.saveSettings();
			this.displayDictionary();
		});
	}

	private displayContextualCorrections(): void {
		const section = this.dictionaryContentEl.createEl('div', { cls: 'dictionary-section' });
		const header = section.createEl('div', { cls: 'dictionary-section-header' });
		header.createEl('h3', { text: t('settings.dictionary.contextualCorrections') });

		// Add count and limit info
		const dict = this.getCurrentDictionary();
		const currentCount = dict.contextualCorrections?.length || 0;
		header.createEl('span', {
			cls: 'dictionary-limit-info',
			text: `(${currentCount} / ${DICTIONARY_CONSTANTS.MAX_CONTEXTUAL_CORRECTIONS})`
		});

		// Create table
		const tableContainer = section.createEl('div', { cls: 'dictionary-table-container' });
		const table = tableContainer.createEl('table', { cls: 'dictionary-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: t('settings.dictionary.from') });
		headerRow.createEl('th', { text: t('settings.dictionary.to') });
		headerRow.createEl('th', { text: t('settings.dictionary.category') });
		headerRow.createEl('th', { text: t('settings.dictionary.priority') });
		headerRow.createEl('th', { text: t('settings.dictionary.context') });
		headerRow.createEl('th', { text: '' }); // Delete button column

		// Body
		const tbody = table.createEl('tbody');
		const currentDict = this.getCurrentDictionary();
		const entries = currentDict.contextualCorrections || [];

		entries.forEach((entry, index) => {
			this.createContextualEntryRow(tbody, entry, index);
		});

		// Add button
		const addButton = section.createEl('button', {
			text: '+',
			cls: 'dictionary-add-button'
		});
		addButton.addEventListener('click', () => {
			// Check limit
			if (entries.length >= DICTIONARY_CONSTANTS.MAX_CONTEXTUAL_CORRECTIONS) {
				new Notice(t('settings.dictionary.limitReached', {
					limit: DICTIONARY_CONSTANTS.MAX_CONTEXTUAL_CORRECTIONS
				}));
				return;
			}

			const newEntry: ContextualCorrection = {
				from: [],
				to: '',
				category: DICTIONARY_CONSTANTS.DEFAULT_CATEGORY,
				priority: DICTIONARY_CONSTANTS.DEFAULT_PRIORITY,
				contextKeywords: []
			};
			entries.push(newEntry);
			this.saveSettings();
			this.displayDictionary();
		});
	}

	private createDefiniteEntryRow(tbody: HTMLTableSectionElement, entry: DictionaryEntry, index: number): void {
		const row = tbody.createEl('tr');

		// From
		const fromCell = row.createEl('td');
		const fromInput = fromCell.createEl('input', {
			type: 'text',
			value: entry.from.join(', '),
			placeholder: t('settings.dictionary.fromPlaceholder')
		});
		fromInput.addEventListener('change', (e) => {
			const value = (e.target as HTMLInputElement).value;
			entry.from = value ? value.split(',').map(s => s.trim()).filter(s => s) : [];
			this.saveSettings();
		});

		// To
		const toCell = row.createEl('td');
		const toInput = toCell.createEl('input', {
			type: 'text',
			value: entry.to,
			placeholder: t('settings.dictionary.toPlaceholder')
		});
		toInput.addEventListener('change', (e) => {
			entry.to = (e.target as HTMLInputElement).value;
			this.saveSettings();
		});

		// Category
		const categoryCell = row.createEl('td');
		const categorySelect = categoryCell.createEl('select');
		DICTIONARY_CONSTANTS.CATEGORIES.forEach(cat => {
			const option = categorySelect.createEl('option', {
				value: cat,
				text: t(`settings.dictionary.categories.${cat}`)
			});
			if (cat === entry.category) {
				option.selected = true;
			}
		});
		categorySelect.addEventListener('change', (e) => {
			entry.category = (e.target as HTMLSelectElement).value as DictionaryCategory;
			this.saveSettings();
		});

		// Priority
		const priorityCell = row.createEl('td');
		const prioritySelect = priorityCell.createEl('select');
		DICTIONARY_CONSTANTS.PRIORITY_RANGE.forEach(priority => {
			const option = prioritySelect.createEl('option', {
				value: String(priority),
				text: String(priority)
			});
			if (priority === entry.priority) {
				option.selected = true;
			}
		});
		prioritySelect.addEventListener('change', (e) => {
			entry.priority = parseInt((e.target as HTMLSelectElement).value);
			this.saveSettings();
		});

		// Delete button
		const deleteCell = row.createEl('td');
		const deleteButton = deleteCell.createEl('button', {
			text: '×',
			cls: 'dictionary-delete-button'
		});
		deleteButton.addEventListener('click', () => {
			const currentDict = this.getCurrentDictionary();
			currentDict.definiteCorrections.splice(index, 1);
			this.saveSettings();
			this.displayDictionary();
		});
	}

	private createContextualEntryRow(tbody: HTMLTableSectionElement, entry: ContextualCorrection, index: number): void {
		const row = tbody.createEl('tr');

		// From
		const fromCell = row.createEl('td');
		const fromInput = fromCell.createEl('input', {
			type: 'text',
			value: entry.from.join(', '),
			placeholder: t('settings.dictionary.fromPlaceholder')
		});
		fromInput.addEventListener('change', (e) => {
			const value = (e.target as HTMLInputElement).value;
			entry.from = value ? value.split(',').map(s => s.trim()).filter(s => s) : [];
			this.saveSettings();
		});

		// To
		const toCell = row.createEl('td');
		const toInput = toCell.createEl('input', {
			type: 'text',
			value: entry.to,
			placeholder: t('settings.dictionary.toPlaceholder')
		});
		toInput.addEventListener('change', (e) => {
			entry.to = (e.target as HTMLInputElement).value;
			this.saveSettings();
		});

		// Category
		const categoryCell = row.createEl('td');
		const categorySelect = categoryCell.createEl('select');
		DICTIONARY_CONSTANTS.CATEGORIES.forEach(cat => {
			const option = categorySelect.createEl('option', {
				value: cat,
				text: t(`settings.dictionary.categories.${cat}`)
			});
			if (cat === entry.category) {
				option.selected = true;
			}
		});
		categorySelect.addEventListener('change', (e) => {
			entry.category = (e.target as HTMLSelectElement).value as DictionaryCategory;
			this.saveSettings();
		});

		// Priority
		const priorityCell = row.createEl('td');
		const prioritySelect = priorityCell.createEl('select');
		DICTIONARY_CONSTANTS.PRIORITY_RANGE.forEach(priority => {
			const option = prioritySelect.createEl('option', {
				value: String(priority),
				text: String(priority)
			});
			if (priority === entry.priority) {
				option.selected = true;
			}
		});
		prioritySelect.addEventListener('change', (e) => {
			entry.priority = parseInt((e.target as HTMLSelectElement).value);
			this.saveSettings();
		});

		// Context
		const contextCell = row.createEl('td');
		const contextInput = contextCell.createEl('input', {
			type: 'text',
			value: entry.contextKeywords?.join(', ') || '',
			placeholder: t('settings.dictionary.contextPlaceholder')
		});
		contextInput.addEventListener('change', (e) => {
			const value = (e.target as HTMLInputElement).value;
			entry.contextKeywords = value ? value.split(',').map(k => k.trim()).filter(k => k) : [];
			this.saveSettings();
		});

		// Delete button
		const deleteCell = row.createEl('td');
		const deleteButton = deleteCell.createEl('button', {
			text: '×',
			cls: 'dictionary-delete-button'
		});
		deleteButton.addEventListener('click', () => {
			const currentDict = this.getCurrentDictionary();
			const entries = currentDict.contextualCorrections || [];
			entries.splice(index, 1);
			this.saveSettings();
			this.displayDictionary();
		});
	}

	private async saveSettings(): Promise<void> {
		if (this.plugin) {
			await this.plugin.saveSettings();
		}
	}

	private async exportDictionary(): Promise<void> {
		try {
			// Check if any dictionary has data
			const hasData = Object.values(this.settings.userDictionaries).some(dict =>
				dict.definiteCorrections.length > 0 ||
				(dict.contextualCorrections && dict.contextualCorrections.length > 0)
			);

			if (!hasData) {
				new Notice(t('settings.dictionary.noDataToExport'));
				return;
			}

			// Export all dictionaries in unified format
			const exportData = {
				version: '2.0',
				dictionaries: this.settings.userDictionaries,
				exportedAt: new Date().toISOString()
			};

			const dataStr = JSON.stringify(exportData, null, 2);
			const dataBlob = new Blob([dataStr], { type: 'application/json' });

			const link = document.createElement('a');
			const url = URL.createObjectURL(dataBlob);
			link.href = url;
			link.download = `dictionary-all-${new Date().toISOString().slice(0, 10)}.json`;

			// Add link to document temporarily
			document.body.appendChild(link);
			link.click();

			// Clean up
			setTimeout(() => {
				document.body.removeChild(link);
				URL.revokeObjectURL(url);
			}, 100);

			// Note: We cannot detect if the user cancelled the save dialog
			// So we don't show a success message here
		} catch (error) {
			this.logger.error('Failed to export dictionary:', error);
			new Notice(t('settings.dictionary.exportError'));
		}
	}

	private async importDictionary(): Promise<void> {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = async (e: Event) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) {
				return;
			}

			try {
				const text = await file.text();
				const imported = JSON.parse(text) as unknown;

				// Check if it's the new unified format
				if (this.isImportedDataV2(imported)) {
					// New format - import all dictionaries
					const shouldReplace = await this.confirmReplace();

					if (shouldReplace) {
						// Replace all dictionaries
						this.settings.userDictionaries = imported.dictionaries;
					} else {
						// Merge dictionaries
						const languages: ('ja' | 'en' | 'zh' | 'ko')[] = ['ja', 'en', 'zh', 'ko'];
						for (const lang of languages) {
							if (imported.dictionaries[lang]) {
								this.settings.userDictionaries[lang].definiteCorrections.push(
									...imported.dictionaries[lang].definiteCorrections
								);
								if (imported.dictionaries[lang].contextualCorrections) {
									if (!this.settings.userDictionaries[lang].contextualCorrections) {
										this.settings.userDictionaries[lang].contextualCorrections = [];
									}
									this.settings.userDictionaries[lang].contextualCorrections!.push(
										...imported.dictionaries[lang].contextualCorrections
									);
								}
							}
						}
					}
				} else if (this.isLegacyDictionaryData(imported)) {
					// Old single-language format - import to current language
					const currentDict = this.getCurrentDictionary();
					const shouldReplace = await this.confirmReplace();

					if (shouldReplace) {
						currentDict.definiteCorrections = imported.definiteCorrections;
						currentDict.contextualCorrections = imported.contextualCorrections || [];
					} else {
						currentDict.definiteCorrections.push(...imported.definiteCorrections);
						if (imported.contextualCorrections) {
							if (!currentDict.contextualCorrections) {
								currentDict.contextualCorrections = [];
							}
							currentDict.contextualCorrections.push(...imported.contextualCorrections);
						}
					}
				} else {
					throw new Error('Invalid dictionary format');
				}

				await this.saveSettings();
				this.displayDictionary();
				new Notice(t('settings.dictionary.importSuccess'));
			} catch (error) {
				this.logger.error('Failed to import dictionary:', error);
				new Notice(t('settings.dictionary.importError'));
			}
		};

		input.click();
	}

	private async confirmReplace(): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.modalEl.addClass('ai-transcriber-modal');
			modal.contentEl.createEl('p', {
				text: t('settings.dictionary.importConfirm')
			});

			const buttonContainer = modal.contentEl.createEl('div', { cls: 'modal-button-container ai-transcriber-modal-buttons' });

			const replaceBtn = buttonContainer.createEl('button', {
				text: t('settings.dictionary.replace'),
				cls: 'mod-warning'
			});
			replaceBtn.addEventListener('click', () => {
				modal.close();
				resolve(true);
			});

			const mergeBtn = buttonContainer.createEl('button', {
				text: t('settings.dictionary.merge')
			});
			mergeBtn.addEventListener('click', () => {
				modal.close();
				resolve(false);
			});

			modal.open();
		});
	}

	private isImportedDataV2(data: unknown): data is { version: string; dictionaries: LanguageDictionaries } {
		return typeof data === 'object' &&
			data !== null &&
			'version' in data &&
			(data as Record<string, unknown>).version === '2.0' &&
			'dictionaries' in data &&
			typeof (data as Record<string, unknown>).dictionaries === 'object';
	}

	private isLegacyDictionaryData(data: unknown): data is { definiteCorrections: DictionaryEntry[]; contextualCorrections?: ContextualCorrection[] } {
		return typeof data === 'object' &&
			data !== null &&
			'definiteCorrections' in data &&
			Array.isArray((data as Record<string, unknown>).definiteCorrections);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
