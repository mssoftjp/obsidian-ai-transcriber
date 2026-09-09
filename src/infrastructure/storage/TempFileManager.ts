/**
 * Temporary File Manager
 * vault外ファイルの一時コピー管理を担当
 * Clean Architectureに従い、インフラストラクチャ層に実装
 */

import { TFile, TFolder } from 'obsidian';

import { SUPPORTED_FORMATS } from '../../config/constants';
import { t } from '../../i18n';
import { Logger } from '../../utils/Logger';

import type { App } from 'obsidian';

export class TempFileManager {
	private static readonly TEMP_DIR = 'ai-transcriber-temp';
	private static readonly OWNERSHIP_MARKER_NAME = 'AI_TRANSCRIBER_TEMP_FOLDER.md';
	private static readonly SESSION_MARKER_NAME = 'AI_TRANSCRIBER_TEMP_SESSION.md';
	private static readonly OWNERSHIP_MARKER = `${TempFileManager.TEMP_DIR}/${TempFileManager.OWNERSHIP_MARKER_NAME}`;
	private static readonly MARKER_CONTENT = 'Managed by AI Transcriber. Safe to remove when the plugin is not processing audio.\n';
	private app: App;
	private logger: Logger;

	constructor(app: App) {
		this.app = app;
		this.logger = Logger.getLogger('TempFileManager');
	}

	/**
	 * 一時ディレクトリを確保
	 */
	private async ensureTempDirectory(): Promise<TFolder> {
		this.logger.trace('Ensuring temporary directory exists', { dir: TempFileManager.TEMP_DIR });
		// フォルダの存在を確認
		const existingItem = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);

		if (existingItem instanceof TFolder) {
			if (!(await this.hasOwnershipMarker())) {
				throw new Error(
					`${TempFileManager.TEMP_DIR} already exists but is not owned by AI Transcriber`
				);
			}
			this.logger.trace('Temporary directory already exists');
			return existingItem;
		} else if (existingItem) {
			// 同名のファイルが存在する場合はエラー
			this.logger.error('File exists at temporary directory path', { path: TempFileManager.TEMP_DIR });
			throw new Error(`A file already exists at ${TempFileManager.TEMP_DIR}. Please remove it.`);
		}

		// フォルダが存在しない場合は作成を試みる
		try {
			await this.app.vault.createFolder(TempFileManager.TEMP_DIR);
			try {
				await this.app.vault.create(
					TempFileManager.OWNERSHIP_MARKER,
					TempFileManager.MARKER_CONTENT
				);
			} catch (error) {
				const createdFolder = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);
				if (createdFolder instanceof TFolder && createdFolder.children.length === 0) {
					await this.app.fileManager.trashFile(createdFolder);
				}
				throw error;
			}

			// 作成後に再度取得
			const newFolder = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);
			if (newFolder instanceof TFolder) {
				return newFolder;
			} else {
				throw new Error('Created folder but could not retrieve it');
			}
		} catch (error) {
			// "Folder already exists"エラーの場合は、フォルダを再取得
			if (error instanceof Error && error.message.toLowerCase().includes('already exist')) {
				const folder = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);
				if (folder instanceof TFolder && await this.hasOwnershipMarker()) {
					return folder;
				}
			}

			// エラーを再スロー
			this.logger.error('Failed to create temporary directory', { error: this.formatError(error) });
			throw error instanceof Error ? error : new Error(this.formatError(error));
		}
	}

	/**
	 * ユニークなIDを生成
	 */
	private generateId(): string {
		return `ait-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
	}

	/**
	 * 外部ファイルをvault内に一時コピー
	 * @param file HTML5 Fileオブジェクト
	 * @param onProgress プログレスコールバック (0-100)
	 * @returns コピーされたファイルのTFileオブジェクト
	 */
	async copyExternalFile(
		file: File,
		onProgress?: (progress: number) => void
	): Promise<{ tFile: TFile; sessionId: string }> {
		const startTime = performance.now();
		this.logger.info('Starting external file copy', {
			fileName: file.name,
			fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
		});

		// 一時ディレクトリを確保
		await this.ensureTempDirectory();

		// セッションIDを生成（サブフォルダ用）
		let sessionId = this.generateId();
		let sessionPath = `${TempFileManager.TEMP_DIR}/${sessionId}`;
		while (this.app.vault.getAbstractFileByPath(sessionPath)) {
			sessionId = this.generateId();
			sessionPath = `${TempFileManager.TEMP_DIR}/${sessionId}`;
		}
		this.logger.debug('Session created', { sessionId, sessionPath });

		// セッション用サブフォルダを作成
		await this.app.vault.createFolder(sessionPath);
		try {
			await this.app.vault.create(
				`${sessionPath}/${TempFileManager.SESSION_MARKER_NAME}`,
				TempFileManager.MARKER_CONTENT
			);
		} catch (error) {
			const sessionFolder = this.app.vault.getAbstractFileByPath(sessionPath);
			if (sessionFolder instanceof TFolder) {
				try {
					await this.app.fileManager.trashFile(sessionFolder);
				} catch (cleanupError) {
					this.logger.warn('Failed to roll back temporary session', {
						error: this.formatError(cleanupError)
					});
				}
			}
			throw error;
		}

		let tFile: TFile;
		try {
			tFile = await this.createTemporaryAudioFile(file, sessionPath, onProgress);
		} catch (error) {
			await this.cleanupSession(sessionId);
			throw error;
		}

		const elapsedTime = performance.now() - startTime;
		this.logger.info('External file copy completed', {
			fileName: file.name,
			sessionId,
			elapsedTime: `${(elapsedTime / 1000).toFixed(2)}s`
		});

		return { tFile, sessionId };
	}

	private async createTemporaryAudioFile(
		file: File,
		sessionPath: string,
		onProgress?: (progress: number) => void
	): Promise<TFile> {
		const sanitizedFileName = file.name
			.replace(/[<>:"|?*\\/]/g, '_')
			.replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, '_$1')
			.replace(/^\.+$/, '_') || 'audio-file';
		const tempPath = `${sessionPath}/${sanitizedFileName}`;
		const buffer = await this.readFileAsArrayBuffer(file, onProgress);
		await this.app.vault.createBinary(tempPath, buffer);

		const abstractFile = this.app.vault.getAbstractFileByPath(tempPath);
		if (!(abstractFile instanceof TFile)) {
			this.logger.error('Failed to retrieve file after creation', { tempPath });
			throw new Error(t('errors.createFileFailed', { error: 'File not found after creation' }));
		}
		return abstractFile;
	}

	/**
	 * FileをArrayBufferとして読み込み（プログレス付き）
	 */
	private readFileAsArrayBuffer(
		file: File,
		onProgress?: (progress: number) => void
	): Promise<ArrayBuffer> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();

			reader.onload = (e) => {
				if (e.target?.result instanceof ArrayBuffer) {
					resolve(e.target.result);
				} else {
					reject(new Error('Failed to read file as ArrayBuffer'));
				}
			};

			reader.onerror = () => {
				reject(new Error('Failed to read file'));
			};

			if (onProgress) {
				reader.onprogress = (e) => {
					if (e.lengthComputable) {
						const progress = (e.loaded / e.total) * 100;
						onProgress(progress);
					}
				};
			}

			reader.readAsArrayBuffer(file);
		});
	}

	/**
	 * セッション単位でクリーンアップ
	 * @param sessionId セッションID
	 */
	async cleanupSession(sessionId: string): Promise<void> {
		this.logger.debug('Cleaning up session', { sessionId });
		try {
			if (!this.isValidSessionId(sessionId) || !(await this.hasOwnershipMarker())) {
				this.logger.warn('Ignoring invalid temporary session id');
				return;
			}
			const sessionPath = `${TempFileManager.TEMP_DIR}/${sessionId}`;
			const sessionFolder = this.app.vault.getAbstractFileByPath(sessionPath);

			if (sessionFolder instanceof TFolder && await this.hasSessionMarker(sessionId)) {
				// セッションフォルダを削除
				await this.app.fileManager.trashFile(sessionFolder);
				await this.cleanupRootIfEmpty();
				this.logger.debug('Session cleaned up successfully', { sessionId });
			}
		} catch (error) {
			// クリーンアップエラーはログのみ（処理は継続）
			this.logger.warn('Cleanup session error', {
				sessionId,
				error: this.formatError(error)
			});
		}
	}

	/**
	 * 一時ファイルのクリーンアップ
	 * @param specificFile 特定のファイルのみ削除する場合
	 */
	async cleanup(specificFile?: TFile): Promise<void> {
		this.logger.debug('Starting cleanup', { specific: Boolean(specificFile) });
		try {
			if (specificFile) {
				const sessionId = this.getSessionId(specificFile);
				if (sessionId) {
					await this.cleanupSession(sessionId);
				}
			} else {
				const folder = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);
				if (folder instanceof TFolder && await this.hasOwnershipMarker()) {
					const sessionFolders = folder.children
						.filter((child): child is TFolder => child instanceof TFolder)
						.filter(child => this.isValidSessionId(child.name));
					for (const sessionFolder of sessionFolders) {
						await this.ensureLegacySessionMarker(sessionFolder);
						await this.cleanupSession(sessionFolder.name);
					}
					await this.cleanupRootIfEmpty();
					this.logger.info('Temporary sessions cleaned up');
				} else if (folder instanceof TFolder) {
					this.logger.warn('Skipped unowned temporary directory cleanup');
				}
			}
		} catch (error) {
			// エラーは無視（処理は継続）
			this.logger.warn('Cleanup error', { error: this.formatError(error) });
		}
	}


	/**
	 * 一時ファイルかどうかを判定
	 */
	isTemporaryFile(file: TFile): boolean {
		return file.path.startsWith(`${TempFileManager.TEMP_DIR}/`);
	}

	private async hasOwnershipMarker(): Promise<boolean> {
		return this.hasValidMarker(TempFileManager.OWNERSHIP_MARKER);
	}

	private async hasSessionMarker(sessionId: string): Promise<boolean> {
		const markerPath = `${TempFileManager.TEMP_DIR}/${sessionId}/${TempFileManager.SESSION_MARKER_NAME}`;
		return this.hasValidMarker(markerPath);
	}

	private async hasValidMarker(path: string): Promise<boolean> {
		const marker = this.app.vault.getAbstractFileByPath(path);
		if (!(marker instanceof TFile)) {
			return false;
		}
		try {
			return await this.app.vault.cachedRead(marker) === TempFileManager.MARKER_CONTENT;
		} catch (error) {
			this.logger.warn('Failed to read temporary ownership marker', {
				path,
				error: this.formatError(error)
			});
			return false;
		}
	}

	private isValidSessionId(sessionId: string): boolean {
		return /^ait-[a-z0-9]{8,}-[a-z0-9]{6,}$/i.test(sessionId)
			|| /^[a-z0-9]{16,}$/i.test(sessionId);
	}

	private getSessionId(file: TFile): string | null {
		if (!this.isTemporaryFile(file)) {
			return null;
		}
		const parts = file.path.split('/');
		const sessionId = parts.length === 3 ? parts[1] : undefined;
		return sessionId && this.isValidSessionId(sessionId) ? sessionId : null;
	}

	private containsOnlyRootMarker(folder: TFolder): boolean {
		return folder.children.length === 1
			&& folder.children[0]?.path === TempFileManager.OWNERSHIP_MARKER;
	}

	private async cleanupRootIfEmpty(): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);
		if (folder instanceof TFolder
			&& await this.hasOwnershipMarker()
			&& this.containsOnlyRootMarker(folder)) {
			await this.app.fileManager.trashFile(folder);
		}
	}

	private isLegacySessionFolder(sessionFolder: TFolder): boolean {
		if (!this.isValidSessionId(sessionFolder.name) || sessionFolder.children.length !== 1) {
			return false;
		}
		const [file] = sessionFolder.children;
		return file instanceof TFile
			&& SUPPORTED_FORMATS.EXTENSIONS.includes(file.extension.toLowerCase());
	}

	private async ensureLegacySessionMarker(sessionFolder: TFolder): Promise<void> {
		if (await this.hasSessionMarker(sessionFolder.name)
			|| !this.isLegacySessionFolder(sessionFolder)) {
			return;
		}
		await this.app.vault.create(
			`${sessionFolder.path}/${TempFileManager.SESSION_MARKER_NAME}`,
			TempFileManager.MARKER_CONTENT
		);
	}

	/**
	 * ファイルサイズの事前チェック
	 * @param file チェックするファイル
	 * @param maxSizeMB 最大サイズ（MB）
	 * @returns サイズチェックOKかどうか
	 */
	checkFileSize(file: File, maxSizeMB: number = 500): boolean {
		const fileSizeMB = file.size / (1024 * 1024);
		return fileSizeMB <= maxSizeMB;
	}

	/**
	 * 利用可能なディスク容量をチェック（推定）
	 * 注: Web APIの制限により、正確な容量は取得できない
	 */
	async estimateAvailableSpace(): Promise<{ available: boolean; message?: string }> {
		this.logger.trace('Estimating available storage space');
		try {
			// navigator.storage.estimate() を使用（対応ブラウザのみ）
					if ('storage' in navigator && 'estimate' in navigator.storage) {
						const estimate = await navigator.storage.estimate();
						const usageGB = (estimate.usage ?? 0) / (1024 * 1024 * 1024);
						const quotaGB = (estimate.quota ?? 0) / (1024 * 1024 * 1024);
						const availableGB = quotaGB - usageGB;

				if (availableGB < 0.1) { // 100MB未満
					this.logger.warn('Low disk space detected', { availableGB });
					return {
						available: false,
						message: t('errors.diskSpaceLow', { available: availableGB.toFixed(2) })
					};
				}
			}
			return { available: true };
		} catch (error) {
			// エラーが発生した場合は、とりあえず続行可能とする
			this.logger.warn('Failed to estimate storage', { error: this.formatError(error) });
			return { available: true };
		}
	}

	private formatError(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		try {
			return JSON.stringify(error);
		} catch {
			return 'Unknown error';
		}
	}
}
