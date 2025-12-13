import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, App, CachedMetadata, ButtonComponent, getLanguage } from 'obsidian';
import { ProgressTracker, TranscriptionTask } from './ProgressTracker';
import { t } from '../i18n';
import { LoadingAnimation } from '../core/utils/LoadingAnimation';
import { ObsidianApp } from '../types/global';

export const VIEW_TYPE_TRANSCRIPTION = 'ai-transcriber-view';

// Define minimal interface for plugin to avoid any type
interface TranscriptionPlugin {
	transcriber?: {
		cancelTranscription?: () => Promise<void>;
	};
	registerInterval: (intervalId: number) => number;
}

export class TranscriptionView extends ItemView {
	private progressTracker: ProgressTracker;
	private plugin: TranscriptionPlugin;
	private progressContainer: HTMLElement;
	private historyContainer: HTMLElement;
	private controlsContainer: HTMLElement;
	private updateInterval: number | null = null;
	private unsubscribeProgress: (() => void) | null = null;
	private loadingAnimation: LoadingAnimation;

	// Progress display elements (persist across updates)
	private fileInfoEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private timeEl: HTMLElement | null = null;
	private cancelBtnEl: HTMLButtonElement | null = null;
	private noTaskEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TranscriptionPlugin, progressTracker: ProgressTracker) {
		super(leaf);
		this.plugin = plugin;
		this.progressTracker = progressTracker;
		this.loadingAnimation = new LoadingAnimation((intervalId) => this.plugin.registerInterval(intervalId));
	}

	getViewType() {
		return VIEW_TYPE_TRANSCRIPTION;
	}

	getDisplayText() {
		return t('ribbon.tooltip');
	}

	getIcon() {
		return 'file-audio';
	}

	onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ai-transcriber-view');

		// Add a title
		contentEl.createEl('h2', { text: t('ribbon.tooltip') });

		// Create main sections
		this.buildProgressSection();
		this.buildHistorySection();
		this.buildControlSection();

		// Subscribe to progress updates
		this.unsubscribeProgress = this.progressTracker.addListener(this.handleProgressUpdate);

		// Start update interval
		this.updateInterval = this.plugin.registerInterval(
			window.setInterval(() => {
				this.updateView();
			}, 1000)
		);

		// Initial update - force history display
		this.updateView();
		// Ensure history is displayed even if data is still loading
		this.updateHistoryDisplay();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		// Clear update interval
		if (this.updateInterval !== null) {
			window.clearInterval(this.updateInterval);
			this.updateInterval = null;
		}

		// Unsubscribe from progress updates
		if (this.unsubscribeProgress !== null) {
			this.unsubscribeProgress();
			this.unsubscribeProgress = null;
		}

		// Clean up animation
		this.loadingAnimation.destroy();

		// Clear DOM element references to prevent memory leaks
		this.fileInfoEl = null;
		this.statusEl = null;
		this.timeEl = null;
		this.cancelBtnEl = null;
		this.noTaskEl = null;
		return Promise.resolve();
	}

	private buildProgressSection() {
		const section = this.contentEl.createDiv({ cls: 'transcription-progress-section' });
		section.createEl('h3', { text: t('common.progressStatus') });
		this.progressContainer = section.createDiv({ cls: 'progress-container' });

		// Create persistent elements
		this.noTaskEl = this.progressContainer.createEl('p', {
			text: t('common.noActiveTask'),
			cls: 'no-task-message'
		});

		// File info
		this.fileInfoEl = this.progressContainer.createDiv({ cls: 'task-file-info ait-hidden' });

		// Status
		this.statusEl = this.progressContainer.createDiv({ cls: 'task-status ait-hidden' });

		// Time
		this.timeEl = this.progressContainer.createDiv({ cls: 'task-time ait-hidden' });

		// Cancel button
		this.cancelBtnEl = this.progressContainer.createEl('button', {
			text: t('common.cancel'),
			cls: 'mod-warning cancel-task-button ait-hidden'
		});
		this.cancelBtnEl.addEventListener('click', () => {
			void this.handleCancel();
		});
	}

	private buildHistorySection() {
		const section = this.contentEl.createDiv({ cls: 'transcription-history-section' });
		section.createEl('h3', { text: t('common.history') });
		this.historyContainer = section.createDiv({ cls: 'history-container' });
	}

	private buildControlSection() {
		const section = this.contentEl.createDiv({ cls: 'transcription-controls-section' });
		this.controlsContainer = section.createDiv({ cls: 'controls-container' });

		// Clear history button only
		const clearBtn = this.controlsContainer.createEl('button', {
			text: t('common.delete'),
			cls: 'mod-secondary'
		});
		clearBtn.addEventListener('click', () => {
			void this.handleClearHistory();
		});
	}

	private handleProgressUpdate = (_task: TranscriptionTask | null): void => {
		const currentTask = this.progressTracker.getCurrentTask();
		// タスクが完了または失敗した場合は履歴も更新
		if (currentTask && ['completed', 'error', 'partial', 'cancelled'].includes(currentTask.status)) {
			this.updateView();
			// 履歴を確実に更新
			setTimeout(() => this.updateHistoryDisplay(), 100);
		} else {
			this.updateView();
		}
	};

	private updateView() {
		this.updateProgressDisplay();
		// 履歴表示は頻繁に更新する必要がないため、処理中でない場合のみ更新
		const currentTask = this.progressTracker.getCurrentTask();
		if (!currentTask || currentTask.status !== 'processing') {
			this.updateHistoryDisplay();
		}
		this.updateControlsDisplay();
	}

	private updateProgressDisplay() {
		const currentTask = this.progressTracker.getCurrentTask();

		if (!currentTask) {
			// Show no task message
			if (this.noTaskEl) {
				this.noTaskEl.removeClass('ait-hidden');
			}
			if (this.fileInfoEl) {
				this.fileInfoEl.addClass('ait-hidden');
			}
			if (this.statusEl) {
				this.statusEl.addClass('ait-hidden');
			}
			if (this.timeEl) {
				this.timeEl.addClass('ait-hidden');
			}
			if (this.cancelBtnEl) {
				this.cancelBtnEl.addClass('ait-hidden');
			}
			return;
		}

		// Hide no task message
		if (this.noTaskEl) {
			this.noTaskEl.addClass('ait-hidden');
		}

		// Update file info
		if (this.fileInfoEl) {
			this.fileInfoEl.removeClass('ait-hidden');
			this.fileInfoEl.empty();
			const fileName = currentTask.inputFileName || '';
			this.fileInfoEl.createEl('div', {
				text: `${t('modal.transcription.fileInfo')}: ${fileName}`,
				cls: 'file-name'
			});
		}

		// Get percentage for logging only
		// const percentage = this.progressTracker.getProgressPercentage();

		// Update status with loading animation
		if (this.statusEl) {
			this.statusEl.removeClass('ait-hidden');
			if (currentTask.status === 'processing') {
				// Use specific "文字起こし中" for consistency with status bar
				const statusText = `${t('modal.transcription.transcribing')}${this.loadingAnimation.getLoadingDots()}`;
				this.statusEl.setText(statusText);

				// Start animation if not running
				if (!this.loadingAnimation.isRunning()) {
					this.loadingAnimation.start(() => {
						if (this.statusEl && currentTask.status === 'processing') {
							const updatedText = `${t('modal.transcription.transcribing')}${this.loadingAnimation.getLoadingDots()}`;
							this.statusEl.setText(updatedText);
						}
					}, 1000);
				}
			} else {
				// Stop animation for non-processing states
				this.loadingAnimation.stop();
				const statusText = `${t('common.' + currentTask.status)}`;
				this.statusEl.setText(statusText);
			}
		}

		// Update time elapsed
		if (this.timeEl && currentTask.startTime) {
			this.timeEl.removeClass('ait-hidden');
			const elapsed = Date.now() - currentTask.startTime;
			this.timeEl.setText(`${t('common.elapsedTime')}: ${this.formatDuration(elapsed)}`);
		} else if (this.timeEl) {
			this.timeEl.addClass('ait-hidden');
		}

		// Show/hide cancel button
		if (this.cancelBtnEl) {
			if (currentTask.status === 'processing') {
				this.cancelBtnEl.removeClass('ait-hidden');
			} else {
				this.cancelBtnEl.addClass('ait-hidden');
			}
		}
	}

	private updateHistoryDisplay() {
		const history = this.progressTracker.getHistory();

		this.historyContainer.empty();

		if (history.length === 0) {
			this.historyContainer.createEl('p', {
				text: t('common.noHistory'),
				cls: 'no-history-message'
			});
			return;
		}

		// Display recent history - already in newest-first order from ProgressTracker
		const maxItems = 50;
		const recentHistory = history.slice(0, maxItems); // Just take first N items
		const historyList = this.historyContainer.createEl('div', { cls: 'history-list' });

		for (const task of recentHistory) {
			const item = historyList.createDiv({ cls: 'history-item' });

			// 1行目: 文字起こし後のファイル名とタイムスタンプ
			const header = item.createDiv({ cls: 'history-item-header' });
			const statusEmoji = this.getStatusEmoji(task.status);
			const displayName = task.outputFileName || '';
			header.createSpan({ text: `${statusEmoji} ${displayName}` });

			// Time
			if (task.endTime) {
				const timeSpan = header.createSpan({ cls: 'history-item-time' });
				timeSpan.setText(this.formatTime(task.endTime));
			}

			// 2行目: 音声ソースファイル名
			const sourceInfo = item.createDiv({ cls: 'history-item-source' });
			const sourceFileName = task.inputFileName || '';
			if (sourceFileName) {
				sourceInfo.createSpan({
					text: sourceFileName,
					cls: 'source-file-info'
				});
			}

			// 3行目: プレビューまたはステータス情報
			const details = item.createDiv({ cls: 'history-item-details' });

			if (task.preview) {
				details.createSpan({
					text: task.preview,
					cls: 'transcription-preview'
				});
			} else if (task.status === 'partial') {
				const percentage = Math.round((task.completedChunks / task.totalChunks) * 100);
				details.createSpan({
					text: `${percentage}% ${t('common.completed')}`,
					cls: 'partial-info'
				});
			} else if (task.transcriptionTimestamp) {
				details.createSpan({
					text: task.transcriptionTimestamp,
					cls: 'transcription-timestamp'
				});
			}

			// Make all completed items clickable
			if (task.status === 'completed' || task.outputFilePath) {
				item.addEventListener('click', () => {
					void this.showTranscriptionResult(task);
				});
				item.addClass('clickable');
			}
		}
	}

	private updateControlsDisplay() {
		// No need to update controls since cancel button is now in the progress section
	}

	private getStatusEmoji(_status: string): string {
		// No emojis - return empty string
		return '';
	}

	private formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		if (minutes > 0) {
			return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
		} else {
			return `${seconds}s`;
		}
	}


	private formatTime(timestamp: number): string {
		const date = new Date(timestamp);

		// Format: YYYY-MM-DD HH:MM
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');

		return `${year}-${month}-${day} ${hours}:${minutes}`;
	}

	private async handleCancel() {
		const currentTask = this.progressTracker.getCurrentTask();
		if (!currentTask || currentTask.status !== 'processing') {
			return;
		}

		// Cancel through the plugin's transcriber
		if (this.plugin.transcriber && typeof this.plugin.transcriber.cancelTranscription === 'function') {
			await this.plugin.transcriber.cancelTranscription();
			new Notice(t('notices.transcriptionCancelled'));
		} else {
			new Notice(t('errors.general'));
		}
	}

	private async handleClearHistory() {
		this.progressTracker.clearHistory();
		// 即座にUIを更新
		this.updateHistoryDisplay();
		// 少し待ってから成功メッセージを表示
		await new Promise(resolve => setTimeout(resolve, 100));
		new Notice(t('common.historyCleared'));
	}

	private async showTranscriptionResult(task: TranscriptionTask) {
		// If output file path is stored, open the existing file
		if (task.outputFilePath) {
			const file = this.app.vault.getAbstractFileByPath(task.outputFilePath);
			if (file instanceof TFile) {
				await this.app.workspace.openLinkText(file.path, '', true);
			} else {
				// ファイルが見つからない場合、検索を提案
				this.handleMissingFile(task);
			}
			return;
		}

		// 旧形式の履歴（outputFilePathがない）の場合
		if (task.transcriptionTimestamp) {
			// タイムスタンプのみで検索を提案
			this.handleMissingFile(task);
		}
	}

	/**
	 * Handle missing transcription file
	 */
	private handleMissingFile(task: TranscriptionTask): void {
		const searchQuery = task.transcriptionTimestamp ||
			new Date(task.endTime || task.startTime).toLocaleString(getLanguage());

		new Notice(t('errors.fileNotFound'));

		// 検索モーダルを開くか確認
		const modal = new ConfirmModal(
			this.app,
			t('common.fileNotFound'),
			t('common.searchForFile', { timestamp: searchQuery }),
			t('common.search'),
			() => {
				// タイムスタンプで文字起こしファイルを検索
				const files = this.app.vault.getFiles();
				const matchingFiles = files.filter(file => {
					if (file.extension !== 'md') {
						return false;
					}
					const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
					const transcriptionTimestampValue: unknown = cache?.frontmatter?.['transcription_timestamp'];
					return typeof transcriptionTimestampValue === 'string' && transcriptionTimestampValue.includes(searchQuery);
				});

				if (matchingFiles.length > 0) {
					// ファイル選択モーダルを表示
					void this.showFileSelectionModal(task, matchingFiles);
				} else {
					// 見つからない場合は全文検索を開く
					const searchPlugin: unknown = ((this.app as unknown) as ObsidianApp).internalPlugins?.getPluginById('global-search');
					if (this.isSearchPlugin(searchPlugin)) {
						const globalSearch: { openGlobalSearch: (query: string) => void } = searchPlugin.instance;
						globalSearch.openGlobalSearch(`"${searchQuery}"`);
					}
					new Notice(t('common.manualSearchRequired'));
				}
			}
		);
		modal.open();
	}

	/**
	 * Show file selection modal and update history
	 */
	private showFileSelectionModal(task: TranscriptionTask, matchingFiles: TFile[]): void {
		const modal = new FileSelectionModal(
			this.app,
			matchingFiles,
			(selectedFile: TFile) => {
				void this.handleFileSelection(task, selectedFile);
			}
		);
		modal.open();
	}

	/**
	 * Update task in history
	 */
	private async updateTaskInHistory(updatedTask: TranscriptionTask) {
		const history = this.progressTracker.getHistory();
		const taskIndex = history.findIndex(t => t.id === updatedTask.id);

		if (taskIndex !== -1) {
			// ProgressTrackerの履歴を直接更新（updateHistoryItemが全ての情報を更新する）
			await this.progressTracker.updateHistoryItem(taskIndex, updatedTask);

			// UIを更新
			this.updateHistoryDisplay();
		}
	}

	private async handleFileSelection(task: TranscriptionTask, selectedFile: TFile): Promise<void> {
		const updatedTask = { ...task };

		updatedTask.outputFilePath = selectedFile.path;
		updatedTask.outputFileName = selectedFile.name;

		const frontmatter = this.app.metadataCache.getFileCache(selectedFile)?.frontmatter;
		const sourceFilePath = typeof frontmatter?.source_file === 'string' ? frontmatter.source_file : null;
		if (sourceFilePath) {
			const audioFile = this.app.vault.getAbstractFileByPath(sourceFilePath);
			if (audioFile instanceof TFile) {
				updatedTask.inputFilePath = audioFile.path;
				updatedTask.inputFileName = audioFile.name;
			} else {
				const searchFileName = task.inputFileName || '';
				const audioFiles = this.app.vault.getFiles().filter(f =>
					f.name === searchFileName && this.isAudioFile(f.extension)
				);
				if (audioFiles.length === 1) {
					updatedTask.inputFilePath = audioFiles[0].path;
					updatedTask.inputFileName = audioFiles[0].name;
				} else if (audioFiles.length > 1) {
					new Notice(t('common.multipleAudioFilesFound'));
				}
			}
		}

		await this.updateTaskInHistory(updatedTask);
		await this.app.workspace.openLinkText(selectedFile.path, '', true);
	}

	/**
	 * Check if file extension is audio
	 */
	private isAudioFile(extension: string): boolean {
		const audioExtensions = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'wma', 'opus', 'webm'];
		return audioExtensions.includes(extension.toLowerCase());
	}

	private isSearchPlugin(plugin: unknown): plugin is { enabled: boolean; instance: { openGlobalSearch: (query: string) => void } } {
		if (typeof plugin !== 'object' || plugin === null) {
			return false;
		}

		const candidate = plugin as Record<string, unknown>;
		const { enabled, instance } = candidate;

		if (typeof enabled !== 'boolean' || enabled === false) {
			return false;
		}

		if (typeof instance !== 'object' || instance === null) {
			return false;
		}

		const searchInstance = instance as { openGlobalSearch?: unknown };
		return typeof searchInstance.openGlobalSearch === 'function';
	}
}

/**
 * Simple confirmation modal
 */
class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private message: string,
		private confirmText: string,
		private onConfirm: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;

		this.modalEl.addClass('ai-transcriber-modal');

		contentEl.createEl('h2', { text: this.title });
		contentEl.createEl('p', { text: this.message });

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container ai-transcriber-modal-buttons' });

		new ButtonComponent(buttonContainer)
			.setButtonText(t('common.cancel'))
			.onClick(() => this.close());

		new ButtonComponent(buttonContainer)
			.setButtonText(this.confirmText)
			.setCta()
			.onClick(() => {
				this.onConfirm();
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * File selection modal
 */
class FileSelectionModal extends Modal {
	constructor(
		app: App,
		private files: TFile[],
		private onSelect: (file: TFile) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;

		this.modalEl.addClass('ai-transcriber-modal');

		contentEl.createEl('h2', { text: t('common.selectFile') });
		contentEl.createEl('p', { text: t('common.multipleFilesFound') });

		const fileList = contentEl.createDiv({ cls: 'file-selection-list' });

		this.files.forEach(file => {
			const item = fileList.createDiv({ cls: 'file-selection-item' });

			// ファイル名
			item.createEl('div', {
				text: file.name,
				cls: 'file-selection-name'
			});

			// パス
			item.createEl('div', {
				text: file.path,
				cls: 'file-selection-path'
			});

			// クリックで選択
			item.addEventListener('click', () => {
				this.onSelect(file);
				this.close();
			});
		});

		// キャンセルボタン
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container ai-transcriber-modal-buttons' });
		buttonContainer.createEl('button', {
			text: t('common.cancel'),
			cls: 'mod-secondary'
		}).addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
