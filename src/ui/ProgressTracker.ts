import { TFile } from 'obsidian';
import { UI_CONSTANTS } from '../config/constants';
import { Logger } from '../utils/Logger';

export interface TranscriptionTask {
	id: string;
	inputFileName: string;
	inputFilePath: string;
	outputFileName?: string; // 文字起こし後のテキストファイル名
	outputFilePath?: string; // 生成された文字起こしファイルのパス
	startTime: number;
	endTime?: number;
	totalChunks: number;
	completedChunks: number;
	status: 'idle' | 'processing' | 'completed' | 'error' | 'partial' | 'cancelled';
	result?: string;
	error?: string;
	provider?: string;
	estimatedCost?: number;
	unifiedPercentage?: number; // 統一された進捗パーセンテージ
	transcriptionTimestamp?: string; // 文字起こし実行日時（ファイル検索用）
	preview?: string; // 文字起こし結果の冒頭部分（履歴表示用）
}

export interface TranscriptionHistory {
	tasks: TranscriptionTask[];
	maxItems: number;
}

export type ProgressListener = (task: TranscriptionTask | null) => void;

// Define minimal interface for plugin to avoid any type
interface DataPlugin {
	loadData?: () => Promise<unknown>;
	app: {
		vault: {
			configDir: string;
			adapter: {
				exists: (path: string) => Promise<boolean>;
				read: (path: string) => Promise<string>;
				write: (path: string, data: string) => Promise<void>;
			};
		};
	};
}

interface ProgressData {
	history: TranscriptionTask[];
}

export class ProgressTracker {
	private currentTask: TranscriptionTask | null = null;
	private history: TranscriptionTask[] = [];
	private listeners: ProgressListener[] = [];
	private readonly maxHistoryItems = UI_CONSTANTS.MAX_HISTORY_ITEMS; // Fixed at 50
	private plugin: DataPlugin | null; // Reference to plugin for data persistence
	private unifiedPercentage = 0; // 統一された進捗パーセンテージ
	private logger: Logger;

	constructor(plugin?: DataPlugin) {
		this.plugin = plugin;
		this.logger = Logger.getLogger('ProgressTracker');
		// Initialize with saved history if available
		this.initializeHistory();
	}

	private async initializeHistory() {
		try {
			await this.loadHistory();
			// 履歴読み込み完了後、リスナーに通知
			this.notifyListeners();
			this.logger.debug('Progress history loaded', { historyCount: this.history.length });
		} catch (error) {
			this.logger.error('Failed to load history', error);
		}
	}

	/**
	 * Start a new transcription task
	 */
	startTask(file: TFile, totalChunks: number, provider: string, estimatedCost?: number): string {
		const taskId = this.generateTaskId();

		this.currentTask = {
			id: taskId,
			inputFileName: file.name,
			inputFilePath: file.path,
			startTime: Date.now(),
			totalChunks,
			completedChunks: 0,
			status: 'processing',
			provider,
			estimatedCost
		};

		this.logger.info('Transcription task started', {
			taskId,
			fileName: file.name,
			totalChunks,
			provider
		});

		this.notifyListeners();
		return taskId;
	}

	/**
	 * Update progress of current task
	 */
	updateProgress(taskId: string, completedChunks: number, _message?: string, unifiedPercentage?: number): void {
		if (!this.currentTask || this.currentTask.id !== taskId) {
			this.logger.warn(`No active task with ID: ${taskId}`);
			return;
		}

		this.currentTask.completedChunks = completedChunks;
		if (unifiedPercentage !== undefined) {
			this.currentTask.unifiedPercentage = unifiedPercentage;
			this.unifiedPercentage = unifiedPercentage;
		}
		this.notifyListeners();
	}

	/**
	 * Update total chunks of current task
	 */
	updateTotalChunks(taskId: string, totalChunks: number): void {
		if (!this.currentTask || this.currentTask.id !== taskId) {
			this.logger.warn(`No active task with ID: ${taskId}`);
			return;
		}

		if (this.currentTask.totalChunks !== totalChunks) {
			this.currentTask.totalChunks = totalChunks;
			this.notifyListeners();
		}
	}

	/**
	 * Complete the current task successfully
	 */
	completeTask(taskId: string, result: string): void {
		if (!this.currentTask || this.currentTask.id !== taskId) {
			this.logger.warn(`No active task with ID: ${taskId}`);
			return;
		}

		this.currentTask.status = 'completed';
		// 履歴には結果を保存しない（ファイルパスのみで十分）
		this.currentTask.endTime = Date.now();
		this.currentTask.completedChunks = this.currentTask.totalChunks;
		// 文字起こし実行日時を記録（ファイル検索用）
		this.currentTask.transcriptionTimestamp = new Date().toLocaleString('ja-JP');

		// プレビュー用に最初の50文字を保存（改行を除去）
		if (result) {
			const cleanResult = result.replace(/\n/g, ' ').trim();
			this.currentTask.preview = cleanResult.substring(0, 50) + (cleanResult.length > 50 ? '...' : '');
		}

		this.addToHistory(this.currentTask);
		this.notifyListeners();

		// Clear current task after a delay
		setTimeout(() => {
			if (this.currentTask && this.currentTask.id === taskId) {
				this.currentTask = null;
				this.notifyListeners();
			}
		}, 5000);
	}

	/**
	 * Mark task as partially completed
	 */
	partialCompleteTask(taskId: string, result: string, completedChunks: number): void {
		if (!this.currentTask || this.currentTask.id !== taskId) {
			this.logger.warn(`No active task with ID: ${taskId}`);
			return;
		}

		this.currentTask.status = 'partial';
		// 履歴には結果を保存しない
		this.currentTask.endTime = Date.now();
		this.currentTask.completedChunks = completedChunks;

		// プレビュー用に最初の50文字を保存（改行を除去）
		if (result) {
			const cleanResult = result.replace(/\n/g, ' ').trim();
			this.currentTask.preview = cleanResult.substring(0, 50) + (cleanResult.length > 50 ? '...' : '');
		}

		this.addToHistory(this.currentTask);
		this.notifyListeners();

		// Clear current task after a delay
		setTimeout(() => {
			if (this.currentTask && this.currentTask.id === taskId) {
				this.currentTask = null;
				this.notifyListeners();
			}
		}, 5000);
	}

	/**
	 * Mark task as failed
	 */
	failTask(taskId: string, error: string): void {
		if (!this.currentTask || this.currentTask.id !== taskId) {
			this.logger.warn(`No active task with ID: ${taskId}`);
			return;
		}

		this.currentTask.status = 'error';
		this.currentTask.error = error;
		this.currentTask.endTime = Date.now();

		this.addToHistory(this.currentTask);
		this.notifyListeners();

		// Clear current task after a delay
		setTimeout(() => {
			if (this.currentTask && this.currentTask.id === taskId) {
				this.currentTask = null;
				this.notifyListeners();
			}
		}, 5000);
	}

	/**
	 * Cancel the current task
	 */
	cancelTask(taskId: string): void {
		if (!this.currentTask || this.currentTask.id !== taskId) {
			this.logger.warn(`No active task with ID: ${taskId}`);
			return;
		}

		this.currentTask.status = 'cancelled';
		this.currentTask.endTime = Date.now();

		this.addToHistory(this.currentTask);
		this.notifyListeners();

		this.currentTask = null;
		this.notifyListeners();
	}

	/**
	 * Set the output file path for the current task
	 */
	setOutputFilePath(taskId: string, filePath: string): void {
		if (!this.currentTask || this.currentTask.id !== taskId) {
			this.logger.warn(`No active task with ID: ${taskId}`);
			return;
		}

		this.currentTask.outputFilePath = filePath;
		// outputFileNameも設定（クロスプラットフォーム対応）
		this.currentTask.outputFileName = this.getFileNameFromPath(filePath);
		this.notifyListeners();
	}

	/**
	 * Update task status without completing it
	 */
	updateTaskStatus(taskId: string, status: 'idle' | 'processing' | 'completed' | 'error' | 'partial' | 'cancelled'): void {
		if (!this.currentTask || this.currentTask.id !== taskId) {
			this.logger.warn(`No active task with ID: ${taskId}`);
			return;
		}

		this.currentTask.status = status;
		this.notifyListeners();
	}

	/**
	 * Get current task state
	 */
	getCurrentTask(): TranscriptionTask | null {
		return this.currentTask;
	}

	/**
	 * Get task history
	 */
	getHistory(): TranscriptionTask[] {
		return [...this.history];
	}

	/**
	 * Subscribe to progress updates
	 */
	subscribe(listener: ProgressListener): () => void {
		this.listeners.push(listener);

		// Immediately notify with current state
		listener(this.currentTask);

		// Return unsubscribe function
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index > -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	/**
	 * Add a listener for progress updates (alias for subscribe)
	 */
	addListener(listener: ProgressListener): () => void {
		return this.subscribe(listener);
	}

	/**
	 * Clear all history
	 */
	clearHistory(): void {
		this.history = [];
		this.saveHistory();
	}

	/**
	 * Get progress percentage
	 */
	getProgressPercentage(): number {
		if (!this.currentTask) {
			return 0;
		}

		// 統一された進捗があればそれを使用
		if (this.currentTask.unifiedPercentage !== undefined) {
			return this.currentTask.unifiedPercentage;
		}

		// フォールバック: チャンクベースの計算
		if (this.currentTask.totalChunks === 0) {
			return 0;
		}

		return Math.round((this.currentTask.completedChunks / this.currentTask.totalChunks) * 100);
	}

	/**
	 * Get elapsed time for current task
	 */
	getElapsedTime(): string {
		if (!this.currentTask) {
			return '0:00';
		}

		const elapsed = Date.now() - this.currentTask.startTime;
		const minutes = Math.floor(elapsed / 60000);
		const seconds = Math.floor((elapsed % 60000) / 1000);

		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	/**
	 * Get estimated remaining time
	 */
	getEstimatedRemainingTime(): string {
		if (!this.currentTask || this.currentTask.completedChunks === 0) {
			return '--:--';
		}

		const elapsed = Date.now() - this.currentTask.startTime;
		const perChunk = elapsed / this.currentTask.completedChunks;
		const remaining = (this.currentTask.totalChunks - this.currentTask.completedChunks) * perChunk;

		const minutes = Math.floor(remaining / 60000);
		const seconds = Math.floor((remaining % 60000) / 1000);

		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	private notifyListeners(): void {
		this.listeners.forEach(listener => {
			try {
				listener(this.currentTask);
			} catch (error) {
				this.logger.error('Error in listener', error);
			}
		});
	}

	private addToHistory(task: TranscriptionTask): void {
		// 履歴に保存する際、不要なデータを削除
		const historyTask = { ...task };
		delete historyTask.result; // 結果の全文は保存しない

		// Add to beginning of history
		this.history.unshift(historyTask);

		// Trim history to max items
		if (this.history.length > this.maxHistoryItems) {
			this.history = this.history.slice(0, this.maxHistoryItems);
		}

		this.saveHistory();
	}

	private generateTaskId(): string {
		return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Extract file name from path (cross-platform)
	 */
	private getFileNameFromPath(filePath: string): string {
		// Use regex to handle both / and \ as path separators
		const parts = filePath.split(/[/\\]/);
		return parts[parts.length - 1] || '';
	}

	private async loadHistory(): Promise<void> {
		if (!this.plugin || !this.plugin.loadData) {
			this.logger.warn('No plugin reference, cannot load history');
			return;
		}

		try {
			// 履歴データ専用ファイルから読み込み
			const historyPath = `${this.plugin.app.vault.configDir}/plugins/obsidian-ai-transcriber/transcription-history.json`;
			if (await this.plugin.app.vault.adapter.exists(historyPath)) {
				const historyData = await this.plugin.app.vault.adapter.read(historyPath);
				const progressData = JSON.parse(historyData) as ProgressData;
				this.history = progressData.history || [];

			}
		} catch (error) {
			this.logger.error('Failed to load history', error);
			this.history = [];
		}
	}

	private async saveHistory(): Promise<void> {
		if (!this.plugin || !this.plugin.app) {
			this.logger.warn('No plugin reference, cannot save history');
			return;
		}

		try {
			// 履歴データ専用ファイルに保存
			const historyPath = `${this.plugin.app.vault.configDir}/plugins/obsidian-ai-transcriber/transcription-history.json`;
			const progressData: ProgressData = {
				history: this.history
			};

			await this.plugin.app.vault.adapter.write(
				historyPath,
				JSON.stringify(progressData, null, 2)
			);
		} catch (error) {
			this.logger.error('Failed to save history', error);
		}
	}

	// setMaxHistoryItems removed - using fixed constant from UI_CONSTANTS

	/**
	 * Update a specific history item
	 */
	async updateHistoryItem(index: number, updatedTask: TranscriptionTask): Promise<void> {
		if (index >= 0 && index < this.history.length) {
			// 結果は保存しない
			const taskToSave = { ...updatedTask };
			delete taskToSave.result;

			this.history[index] = taskToSave;
			await this.saveHistory();
		}
	}
}
