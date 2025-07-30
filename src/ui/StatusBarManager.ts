import { App, Plugin } from 'obsidian';
import { ProgressTracker, TranscriptionTask } from './ProgressTracker';
import { t } from '../i18n';
import { LoadingAnimation } from '../core/utils/LoadingAnimation';

export class StatusBarManager {
	private statusBarItem: HTMLElement | null = null;
	private progressTracker: ProgressTracker;
	private plugin: Plugin;
	private app: App;
	private unsubscribe: (() => void) | null = null;
	private clickHandler: (() => void) | null = null;
	private updateInterval: number | null = null;
	private loadingAnimation: LoadingAnimation;
	private currentTask: TranscriptionTask | null = null;

	constructor(app: App, plugin: Plugin, progressTracker: ProgressTracker) {
		this.app = app;
		this.plugin = plugin;
		this.progressTracker = progressTracker;
		this.loadingAnimation = new LoadingAnimation();
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
		this.updateInterval = window.setInterval(() => {
			if (this.currentTask && this.currentTask.status === 'processing') {
				this.updateDisplay(this.currentTask);
			}
		}, 1000);
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

		// Clean up dynamic stylesheet
		const dynamicStyleSheet = document.querySelector('#ait-dynamic-progress');
		if (dynamicStyleSheet) {
			dynamicStyleSheet.remove();
		}

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
	 * Set progress using CSP-compliant dynamic stylesheet
	 */
	private setProgressViaStylesheet(selector: string, percentage: number): void {
		// Find or create our dynamic stylesheet for progress updates
		let styleSheet = document.querySelector('#ait-dynamic-progress') as HTMLStyleElement;
		if (!styleSheet) {
			styleSheet = document.createElement('style');
			styleSheet.id = 'ait-dynamic-progress';
			document.head.appendChild(styleSheet);
		}

		// Update the CSS rule for this progress bar
		const rule = `${selector} { width: ${percentage}% !important; }`;
		styleSheet.textContent = rule;
	}

	/**
	 * Update status bar display based on current task
	 */
	private updateDisplay(task: TranscriptionTask | null): void {
		if (!this.statusBarItem) {
			return;
		}

		// Clear previous content
		this.statusBarItem.empty();

		if (!task) {
			// Idle state - hide the status bar
			this.setIdleState();
		} else {
			// Show status bar when active
			this.statusBarItem.removeClass('ait-hidden');

			// Active task state
			switch (task.status) {
			case 'processing':
				this.setProcessingState(task);
				break;
			case 'completed':
				this.setCompletedState(task);
				break;
			case 'partial':
				this.setPartialState(task);
				break;
			case 'error':
				this.setErrorState(task);
				break;
			case 'cancelled':
				this.setCancelledState(task);
				break;
			default:
				this.setIdleState();
			}
		}
	}

	private setIdleState(): void {
		// Hide status bar when idle
		this.statusBarItem!.addClass('ait-hidden');
		this.statusBarItem!.setAttribute('aria-label', t('ribbon.tooltip'));
		this.statusBarItem!.removeClass('is-processing', 'is-error', 'is-completed');
	}

	private setProcessingState(task: TranscriptionTask): void {
		const percentage = this.progressTracker.getProgressPercentage();
		const elapsed = this.progressTracker.getElapsedTime();

		const text = this.statusBarItem!.createSpan({ cls: 'status-bar-text' });
		// Use specific "文字起こし中" instead of generic "処理中"
		text.setText(`${t('statusBar.processing')}${this.loadingAnimation.getLoadingDots()}: ${percentage}% - ${elapsed}`);

		// Progress bar
		const progressContainer = this.statusBarItem!.createSpan({ cls: 'status-bar-progress' });
		progressContainer.createSpan({ cls: 'status-bar-progress-bar' });
		// Use dynamic stylesheet for CSP compliance
		this.setProgressViaStylesheet('.ai-transcriber-status .status-bar-progress-bar', percentage);

		const fileName = task.inputFileName || '';
		this.statusBarItem!.setAttribute('aria-label', `${t('statusBar.processing')} ${fileName}: ${percentage}%`);
		this.statusBarItem!.addClass('is-processing');
		this.statusBarItem!.removeClass('is-error', 'is-completed');

		// Start animation if not already running
		if (!this.loadingAnimation.isRunning()) {
			this.loadingAnimation.start(() => {
				// Animation callback is handled by the interval update
			}, 1000);
		}
	}

	private setCompletedState(task: TranscriptionTask): void {
		// Stop animation when completed
		this.loadingAnimation.stop();
		const text = this.statusBarItem!.createSpan({ cls: 'status-bar-text' });
		const charCount = task.result ? task.result.length : 0;
		text.setText(`${t('statusBar.completed')}: ${charCount.toLocaleString()}`);

		const fileName = task.inputFileName || '';
		this.statusBarItem!.setAttribute('aria-label', `${t('statusBar.completed')}: ${fileName}`);
		this.statusBarItem!.addClass('is-completed');
		this.statusBarItem!.removeClass('is-processing', 'is-error');
	}

	private setPartialState(task: TranscriptionTask): void {
		// Stop animation when partial
		this.loadingAnimation.stop();
		const text = this.statusBarItem!.createSpan({ cls: 'status-bar-text' });
		const percentage = Math.round((task.completedChunks / task.totalChunks) * 100);
		text.setText(`${t('modal.transcription.partialResult')}: ${percentage}%`);

		const fileName = task.inputFileName || '';
		this.statusBarItem!.setAttribute('aria-label', `${t('modal.transcription.partialResult')}: ${fileName}`);
		this.statusBarItem!.addClass('is-partial');
		this.statusBarItem!.removeClass('is-processing', 'is-completed');
	}

	private setErrorState(task: TranscriptionTask): void {
		// Stop animation when error
		this.loadingAnimation.stop();
		const text = this.statusBarItem!.createSpan({ cls: 'status-bar-text' });
		const fileName = task.inputFileName || '';
		text.setText(`${t('statusBar.failed')}: ${fileName}`);

		this.statusBarItem!.setAttribute('aria-label', `${t('statusBar.failed')}: ${task.error || t('errors.general')}`);
		this.statusBarItem!.addClass('is-error');
		this.statusBarItem!.removeClass('is-processing', 'is-completed');
	}

	private setCancelledState(task: TranscriptionTask): void {
		// Stop animation when cancelled
		this.loadingAnimation.stop();
		const text = this.statusBarItem!.createSpan({ cls: 'status-bar-text' });
		const fileName = task.inputFileName || '';
		text.setText(`${t('statusBar.cancelled')}: ${fileName}`);

		this.statusBarItem!.setAttribute('aria-label', `${t('statusBar.cancelled')}: ${fileName}`);
		this.statusBarItem!.removeClass('is-processing', 'is-completed', 'is-error');
	}
}