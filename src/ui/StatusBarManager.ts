import { getLanguage } from 'obsidian';

import { LoadingAnimation } from '../core/utils/LoadingAnimation';
import { t } from '../i18n';

import type { ProgressTracker, TranscriptionTask } from './ProgressTracker';
import type { Plugin } from 'obsidian';

export class StatusBarManager {
	private statusBarItem: HTMLElement | null = null;
	private progressTracker: ProgressTracker;
	private plugin: Plugin;
	private unsubscribe: (() => void) | null = null;
	private clickHandler: (() => void) | null = null;
	private updateInterval: number | null = null;
	private loadingAnimation: LoadingAnimation;
	private currentTask: TranscriptionTask | null = null;

	constructor(plugin: Plugin, progressTracker: ProgressTracker) {
		this.plugin = plugin;
		this.progressTracker = progressTracker;
		this.loadingAnimation = new LoadingAnimation((intervalId) => this.plugin.registerInterval(intervalId));
	}

	/**
	 * Initialize status bar
	 */
	initialize(): void {
		// Create status bar item
		this.statusBarItem = this.plugin.addStatusBarItem();
		this.statusBarItem.addClass('ai-transcriber-status');

		// Subscribe to progress updates
		this.unsubscribe = this.progressTracker.subscribe((task) => {
			this.currentTask = task;
			this.updateDisplay(task);
		});

		// Set initial state
		this.updateDisplay(null);

		// Add click handler
		this.statusBarItem.addEventListener('click', (_evt) => {
			if (this.clickHandler) {
				this.clickHandler();
			}
		});

		// Start update interval for elapsed time and animation
		this.updateInterval = this.plugin.registerInterval(
			window.setInterval(() => {
				if (this.currentTask?.status === 'processing') {
					this.updateDisplay(this.currentTask);
				}
			}, 1000)
		);
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
		}

		if (this.updateInterval !== null) {
			window.clearInterval(this.updateInterval);
			this.updateInterval = null;
		}

		this.loadingAnimation.destroy();

		if (this.statusBarItem) {
			this.statusBarItem.remove();
		}
	}

	/**
	 * Set click handler for status bar item
	 */
	setClickHandler(handler: () => void): void {
		this.clickHandler = handler;
	}

	/**
	 * Update status bar display based on current task
	 */
	private updateDisplay(task: TranscriptionTask | null): void {
		const statusBarItem = this.statusBarItem;
		if (!statusBarItem) {
			return;
		}

		// Clear previous content
		statusBarItem.empty();

		if (!task) {
			// Idle state - hide the status bar
			this.setIdleState(statusBarItem);
		} else {
			// Show status bar when active
			statusBarItem.removeClass('ait-hidden');

			// Active task state
				switch (task.status) {
				case 'idle':
					this.setIdleState(statusBarItem);
					break;
				case 'processing':
					this.setProcessingState(statusBarItem, task);
					break;
			case 'completed':
				this.setCompletedState(statusBarItem, task);
				break;
			case 'partial':
				this.setPartialState(statusBarItem, task);
				break;
			case 'error':
				this.setErrorState(statusBarItem, task);
				break;
			case 'cancelled':
				this.setCancelledState(statusBarItem, task);
				break;
			default:
				this.setIdleState(statusBarItem);
			}
		}
	}

	private setIdleState(statusBarItem: HTMLElement): void {
		// Hide status bar when idle
		statusBarItem.addClass('ait-hidden');
		statusBarItem.setAttribute('aria-label', t('ribbon.tooltip'));
		statusBarItem.removeClass('is-processing', 'is-error', 'is-completed');
	}

	private setProcessingState(statusBarItem: HTMLElement, task: TranscriptionTask): void {
		const percentage = this.progressTracker.getProgressPercentage();
		const elapsed = this.progressTracker.getElapsedTime();

		const text = statusBarItem.createSpan({ cls: 'ai-transcriber-status-text' });
		// Use specific "文字起こし中" instead of generic "処理中"
		text.setText(`${t('statusBar.processing')}${this.loadingAnimation.getLoadingDots()}: ${percentage}% - ${elapsed}`);

		// Progress bar
		const progressContainer = statusBarItem.createSpan({ cls: 'ai-transcriber-status-progress' });
		progressContainer.createEl('progress', {
			cls: 'ait-progress',
			attr: { max: '100', value: String(percentage) }
		});

		const fileName = task.inputFileName || '';
		statusBarItem.setAttribute('aria-label', `${t('statusBar.processing')} ${fileName}: ${percentage}%`);
		statusBarItem.addClass('is-processing');
		statusBarItem.removeClass('is-error', 'is-completed');

		// Start animation if not already running
		if (!this.loadingAnimation.isRunning()) {
			this.loadingAnimation.start(() => {
				// Animation callback is handled by the interval update
			}, 1000);
		}
	}

	private setCompletedState(statusBarItem: HTMLElement, task: TranscriptionTask): void {
		// Stop animation when completed
		this.loadingAnimation.stop();
		const text = statusBarItem.createSpan({ cls: 'ai-transcriber-status-text' });
		const charCount = task.result ? task.result.length : 0;
		text.setText(`${t('statusBar.completed')}: ${charCount.toLocaleString(getLanguage())}`);

		const fileName = task.inputFileName || '';
		statusBarItem.setAttribute('aria-label', `${t('statusBar.completed')}: ${fileName}`);
		statusBarItem.addClass('is-completed');
		statusBarItem.removeClass('is-processing', 'is-error');
	}

	private setPartialState(statusBarItem: HTMLElement, task: TranscriptionTask): void {
		// Stop animation when partial
		this.loadingAnimation.stop();
		const text = statusBarItem.createSpan({ cls: 'ai-transcriber-status-text' });
		const percentage = Math.round((task.completedChunks / task.totalChunks) * 100);
		text.setText(`${t('modal.transcription.partialResult')}: ${percentage}%`);

		const fileName = task.inputFileName || '';
		statusBarItem.setAttribute('aria-label', `${t('modal.transcription.partialResult')}: ${fileName}`);
		statusBarItem.addClass('is-partial');
		statusBarItem.removeClass('is-processing', 'is-completed');
	}

	private setErrorState(statusBarItem: HTMLElement, task: TranscriptionTask): void {
		// Stop animation when error
		this.loadingAnimation.stop();
		const text = statusBarItem.createSpan({ cls: 'ai-transcriber-status-text' });
		const fileName = task.inputFileName || '';
		text.setText(`${t('statusBar.failed')}: ${fileName}`);

		statusBarItem.setAttribute('aria-label', `${t('statusBar.failed')}: ${task.error || t('errors.general')}`);
		statusBarItem.addClass('is-error');
		statusBarItem.removeClass('is-processing', 'is-completed');
	}

	private setCancelledState(statusBarItem: HTMLElement, task: TranscriptionTask): void {
		// Stop animation when cancelled
		this.loadingAnimation.stop();
		const text = statusBarItem.createSpan({ cls: 'ai-transcriber-status-text' });
		const fileName = task.inputFileName || '';
		text.setText(`${t('statusBar.cancelled')}: ${fileName}`);

		statusBarItem.setAttribute('aria-label', `${t('statusBar.cancelled')}: ${fileName}`);
		statusBarItem.removeClass('is-processing', 'is-completed', 'is-error');
	}
}
