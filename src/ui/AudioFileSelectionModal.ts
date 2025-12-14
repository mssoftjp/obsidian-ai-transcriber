import { Modal, TFile, Setting, Notice, ButtonComponent, getLanguage, AbstractInputSuggest } from 'obsidian';

import { SUPPORTED_FORMATS } from '../config/constants';
import { t } from '../i18n';
import { TempFileManager } from '../infrastructure/storage/TempFileManager';
import { Logger } from '../utils/Logger';

import type { App } from 'obsidian';

export class AudioFileSelectionModal extends Modal {
	private files: TFile[] = [];
	private filteredFiles: TFile[] = [];
	private sortBy: 'ctime' | 'mtime' | 'name' | 'path' = 'ctime';
	private sortOrder: 'asc' | 'desc' = 'desc';
	private searchQuery = '';
	private selectedFile: TFile | null = null;
	private onFileSelect: (file: TFile | File, isExternal: boolean) => void;
	private tempFileManager: TempFileManager;
	private okButton: ButtonComponent | null = null;
	private fileSuggest: AudioFileSuggest | null = null;
	private logger = Logger.getLogger('AudioFileSelectionModal');

	constructor(
		app: App,
		onFileSelect: (file: TFile | File, isExternal: boolean) => void
	) {
		super(app);
		this.onFileSelect = onFileSelect;
		this.tempFileManager = new TempFileManager(app);
	}

	private loadAudioFilesFromCache(): void {
		const metadataCache = this.app.metadataCache as { getCachedFiles?: () => string[]; fileCache?: unknown };
		const cacheReady = Boolean(metadataCache?.fileCache);
		const cachedFiles: unknown = cacheReady && typeof metadataCache.getCachedFiles === 'function'
			? metadataCache.getCachedFiles()
			: [];

		if (!cacheReady) {
			this.logger.debug('Metadata cache not ready; falling back to vault.getFiles()');
		}
		const cachedPaths = Array.isArray(cachedFiles)
			? cachedFiles.filter((path): path is string => typeof path === 'string')
			: [];
		const allowedExtensions = SUPPORTED_FORMATS.EXTENSIONS.map((ext) => ext.toLowerCase());
		const audioFiles: TFile[] = [];

		for (const path of cachedPaths) {
			const abstract = this.app.vault.getAbstractFileByPath(path);
			if (abstract instanceof TFile && allowedExtensions.includes(abstract.extension.toLowerCase())) {
				audioFiles.push(abstract);
			}
		}

		if (audioFiles.length === 0) {
			audioFiles.push(
				...this.app.vault.getFiles().filter((file) =>
					allowedExtensions.includes(file.extension.toLowerCase())
				)
			);
		}

		this.files = audioFiles;
	}

	private setSelectedFile(file: TFile): void {
		this.selectedFile = file;
		this.okButton?.setDisabled(false);
	}

	private confirmSelection(file?: TFile, isExternal = false): void {
		const target = file ?? this.selectedFile;
		if (!target) {
			return;
		}
		this.setSelectedFile(target);
		this.onFileSelect(target, isExternal);
		this.close();
	}

	private buildSuggest(input: HTMLInputElement): void {
		this.fileSuggest?.close();
		this.fileSuggest = new AudioFileSuggest(
			this.app,
			input,
			() => this.files,
			(file) => {
				this.searchQuery = file.basename;
				this.setSelectedFile(file);
				this.filterFiles();
				this.renderFileList();
				this.confirmSelection(file, false);
			}
		);
	}

	override onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('ai-transcriber-modal');

		this.loadAudioFilesFromCache();

		// Debug: Log file count for edge case testing
		if (this.files.length > 100) {
			this.logger.debug(`Large number of audio files found: ${this.files.length}`);
		}

		// Sort files by default (mtime)
		this.sortFiles();
		this.filteredFiles = [...this.files];

		// Build UI
		this.buildUI();
	}

	private buildUI() {
		const { contentEl } = this;
		contentEl.empty();

		// Title
		contentEl.createEl('h2', { text: t('modal.audioFileSelection.title') });

		// Search and sort controls
		const controlsDiv = contentEl.createDiv({ cls: 'audio-file-selection-controls' });

		// Search box
		const searchDiv = controlsDiv.createDiv({ cls: 'search-input-container' });
		const searchInput = searchDiv.createEl('input', {
			type: 'text',
			placeholder: t('modal.audioFileSelection.searchPlaceholder'),
			cls: 'audio-file-search'
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			this.filterFiles();
			this.renderFileList();
		});
		this.buildSuggest(searchInput);
		// Prevent auto-focus stealing when the modal opens (especially on ribbon click)
		this.modalEl.tabIndex = -1;
		requestAnimationFrame(() => this.modalEl.focus({ preventScroll: true }));

		// Sort dropdown
		const sortDiv = controlsDiv.createDiv({ cls: 'sort-container' });
		new Setting(sortDiv)
			.setName(t('modal.audioFileSelection.sortBy'))
			.addDropdown(dropdown => dropdown
				.addOption('ctime', t('modal.audioFileSelection.sortByCreated'))
				.addOption('mtime', t('modal.audioFileSelection.sortByModified'))
				.addOption('name', t('modal.audioFileSelection.sortByName'))
				.addOption('path', t('modal.audioFileSelection.sortByPath'))
				.setValue(this.sortBy)
				.onChange((value: string) => {
					// Guard the union manually to satisfy exactOptionalPropertyTypes
					if (value === 'ctime' || value === 'mtime' || value === 'name' || value === 'path') {
						this.sortBy = value;
						this.sortFiles();
						this.filterFiles();
						this.renderFileList();
					}
				})
			)
			.addButton(button => button
				.setButtonText(this.sortOrder === 'desc' ? '↓' : '↑')
				.setTooltip(this.sortOrder === 'desc' ? 'Descending' : 'Ascending')
				.onClick(() => {
					this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
					button.setButtonText(this.sortOrder === 'desc' ? '↓' : '↑');
					button.setTooltip(this.sortOrder === 'desc' ? 'Descending' : 'Ascending');
					this.sortFiles();
					this.filterFiles();
					this.renderFileList();
				})
			);

		// File list container
		const fileListContainer = contentEl.createDiv({ cls: 'audio-file-list-container' });
		this.renderFileList(fileListContainer);

		// External file notice
		const noticeContainer = contentEl.createDiv({ cls: 'external-file-notice' });
		noticeContainer.createEl('p', {
			text: t('modal.audioFileSelection.externalFileNotice'),
			cls: 'external-file-notice-text'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container ai-transcriber-modal-buttons' });

		// External file button
		const externalButton = buttonContainer.createEl('button', {
			text: t('modal.audioFileSelection.selectExternal')
		});
		externalButton.addEventListener('click', () => {
			this.onExternalFileSelect();
		});

		// Cancel button
		const cancelButton = buttonContainer.createEl('button', {
			text: t('modal.button.cancel')
		});
		cancelButton.addEventListener('click', () => {
			this.close();
		});

		// OK button
		this.okButton = new ButtonComponent(buttonContainer)
			.setButtonText(t('modal.button.ok'))
			.setCta()
			.onClick(() => {
				this.confirmSelection();
			});
		this.okButton.setDisabled(!this.selectedFile);
	}

	private renderFileList(container?: HTMLElement) {
		const listContainer = container || this.contentEl.querySelector('.audio-file-list-container');
		if (!listContainer) {
			return;
		}

		listContainer.empty();

		if (this.filteredFiles.length === 0) {
			listContainer.createEl('div', {
				text: t('modal.audioFileSelection.noFiles'),
				cls: 'no-files-message'
			});
			return;
		}

		// Create table
		const table = listContainer.createEl('table', { cls: 'audio-file-table' });

		// Header
		const header = table.createEl('thead');
		const headerRow = header.createEl('tr');
		headerRow.createEl('th', { text: t('modal.audioFileSelection.fileName') });
		headerRow.createEl('th', { text: t('modal.audioFileSelection.fileCreated') });
		headerRow.createEl('th', { text: t('modal.audioFileSelection.filePath') });

		// Body
		const tbody = table.createEl('tbody');

		this.filteredFiles.forEach(file => {
			const row = tbody.createEl('tr', {
				cls: this.selectedFile === file ? 'selected' : ''
			});

			row.addEventListener('click', () => {
				// Remove previous selection
				tbody.querySelectorAll('tr').forEach(tr => tr.removeClass('selected'));
				// Add selection to current row
				row.addClass('selected');
				this.setSelectedFile(file);
			});

			// Double click to select and close
			row.addEventListener('dblclick', () => {
				this.confirmSelection(file);
			});

			// File name cell (with extension)
			row.createEl('td', { text: `${file.basename}.${file.extension}` });

			// Creation date cell
			const createdDate = new Date(file.stat.ctime);
			const dateStr = createdDate.toLocaleDateString(getLanguage(), {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
			row.createEl('td', {
				text: dateStr,
				cls: 'file-created'
			});

			// File path cell
			row.createEl('td', {
				text: `(${file.parent?.path || '/'})`,
				cls: 'file-path'
			});
		});
	}

	private sortFiles() {
		this.files.sort((a, b) => {
			let result: number;
			switch (this.sortBy) {
			case 'ctime':
				result = b.stat.ctime - a.stat.ctime;
				break;
			case 'mtime':
				result = b.stat.mtime - a.stat.mtime;
				break;
			case 'name':
				result = a.basename.localeCompare(b.basename);
				break;
			case 'path':
				result = a.path.localeCompare(b.path);
				break;
			default:
				return 0;
			}
			// 昇順の場合は結果を反転
			return this.sortOrder === 'asc' ? -result : result;
		});
	}

	private filterFiles() {
		if (!this.searchQuery) {
			this.filteredFiles = [...this.files];
		} else {
			const query = this.searchQuery.toLowerCase();
			this.filteredFiles = this.files.filter(file =>
				file.basename.toLowerCase().includes(query) ||
                file.path.toLowerCase().includes(query)
			);
		}
	}

	private onExternalFileSelect() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = SUPPORTED_FORMATS.EXTENSIONS.map(ext => `.${ext}`).join(',');

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) {
				return;
			}

			if (!this.tempFileManager.checkFileSize(file, 500)) {
				new Notice(t('errors.fileSizeExceeded'));
				return;
			}

			const spaceCheck = await this.tempFileManager.estimateAvailableSpace();
			if (!spaceCheck.available) {
				new Notice(spaceCheck.message || t('errors.diskSpaceLow', { available: '0' }));
				return;
			}

			this.contentEl.empty();
			const progressContainer = this.contentEl.createDiv({ cls: 'copy-progress-container' });
			progressContainer.createEl('h3', { text: t('modal.audioFileSelection.copying') });

			const progressBar = progressContainer.createEl('progress', {
				cls: 'ai-transcriber-progress',
				attr: { max: '100', value: '0' }
			});
			const progressText = progressContainer.createDiv({ cls: 'ai-transcriber-progress-text' });

			try {
				const result = await this.tempFileManager.copyExternalFile(file, (progress) => {
					this.updateProgress(progressBar, progress);
					progressText.setText(`${Math.round(progress)}%`);
				});

				this.confirmSelection(result.tFile, true);
			} catch (error) {
				this.logger.error('Failed to copy external file:', error);
				const errorMessage = error instanceof Error
					? error.message
					: typeof error === 'string'
						? error
						: 'Unknown error';
				new Notice(`${t('errors.general')}: ${errorMessage}`);
				this.close();
			}
		};

		input.click();
	}

	private updateProgress(element: HTMLProgressElement, percentage: number): void {
		const clamped = Math.max(0, Math.min(percentage, 100));
		element.value = clamped;
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.fileSuggest?.close();
		this.fileSuggest = null;

		// クリーンアップはプラグイン起動時に一括で行うため、ここでは何もしない
	}
}

class AudioFileSuggest extends AbstractInputSuggest<TFile> {
	private readonly getFiles: () => TFile[];
	private readonly onChooseFile: (file: TFile) => void;
	private readonly inputElRef: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement, getFiles: () => TFile[], onChooseFile: (file: TFile) => void) {
		super(app, inputEl);
		this.getFiles = getFiles;
		this.onChooseFile = onChooseFile;
		this.inputElRef = inputEl;
	}

	getSuggestions(query: string): TFile[] {
		const files = this.getFiles();
		const normalized = query.trim().toLowerCase();
		const candidates = normalized
			? files.filter((file) =>
				file.basename.toLowerCase().includes(normalized) ||
				file.path.toLowerCase().includes(normalized)
			)
			: files;
		return candidates.slice(0, 50);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.addClass('ai-transcriber-audio-suggest');
		el.createDiv({
			text: `${file.basename}.${file.extension}`,
			cls: 'ai-transcriber-audio-suggest-name'
		});
		el.createDiv({
			text: file.parent?.path || '/',
			cls: 'ai-transcriber-audio-suggest-path'
		});
	}

	override selectSuggestion(file: TFile): void {
		this.inputElRef.value = `${file.basename}.${file.extension}`;
		this.onChooseFile(file);
		this.close();
	}
}
