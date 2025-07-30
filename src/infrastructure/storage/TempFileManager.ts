/**
 * Temporary File Manager
 * vault外ファイルの一時コピー管理を担当
 * Clean Architectureに従い、インフラストラクチャ層に実装
 */

import { App, TFile, TFolder } from 'obsidian';
import { t } from '../../i18n';
import { Logger } from '../../utils/Logger';

export class TempFileManager {
	private static readonly TEMP_DIR = 'ai-transcriber-temp';
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
			// フォルダが既に存在する
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
			
			// 作成後に再度取得
			const newFolder = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);
			if (newFolder instanceof TFolder) {
				return newFolder;
			} else {
				throw new Error('Created folder but could not retrieve it');
			}
		} catch (error) {
			// "Folder already exists"エラーの場合は、フォルダを再取得
			if (error.message && error.message.toLowerCase().includes('already exist')) {
				const folder = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);
				if (folder instanceof TFolder) {
					return folder;
				}
			}
			
			// エラーを再スロー
			this.logger.error('Failed to create temporary directory', { error: error.message });
			throw error;
		}
	}

	/**
	 * ユニークなIDを生成
	 */
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
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
		const sessionId = this.generateId();
		const sessionPath = `${TempFileManager.TEMP_DIR}/${sessionId}`;
		this.logger.debug('Session created', { sessionId, sessionPath });
		
		// セッション用サブフォルダを作成
		await this.app.vault.createFolder(sessionPath);

		// ファイル名をサニタイズ（元のファイル名を保持）
		const sanitizedFileName = file.name
			.replace(/[<>:"|?*\\]/g, '_')
			.replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, '_$1');
		
		// シンプルなファイルパス（サブフォルダ内に元のファイル名で保存）
		const tempPath = `${sessionPath}/${sanitizedFileName}`;

		// ファイルをArrayBufferとして読み込み
		const buffer = await this.readFileAsArrayBuffer(file, onProgress);

		// vault内に書き込み
		await this.app.vault.createBinary(tempPath, buffer);

		// TFileオブジェクトを取得
		const abstractFile = this.app.vault.getAbstractFileByPath(tempPath);
		if (!abstractFile) {
			this.logger.error('Failed to retrieve file after creation', { tempPath });
			throw new Error(t('errors.createFileFailed', { error: 'File not found after creation' }));
		}
		
		if (!(abstractFile instanceof TFile)) {
			this.logger.error('Retrieved item is not a file', { tempPath, type: abstractFile.constructor.name });
			throw new Error(t('errors.createFileFailed', { error: 'Retrieved item is not a file' }));
		}
		
		const tFile = abstractFile;

		const elapsedTime = performance.now() - startTime;
		this.logger.info('External file copy completed', {
			fileName: file.name,
			sessionId,
			elapsedTime: `${(elapsedTime / 1000).toFixed(2)}s`
		});

		return { tFile, sessionId };
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
			const sessionPath = `${TempFileManager.TEMP_DIR}/${sessionId}`;
			const sessionFolder = this.app.vault.getAbstractFileByPath(sessionPath);
			
			if (sessionFolder instanceof TFolder) {
				// セッションフォルダを削除
				await this.app.vault.delete(sessionFolder, true);
				this.logger.debug('Session cleaned up successfully', { sessionId });
			}
		} catch (error) {
			// クリーンアップエラーはログのみ（処理は継続）
			this.logger.warn('Cleanup session error', { sessionId, error: error.message });
		}
	}

	/**
	 * 一時ファイルのクリーンアップ
	 * @param specificFile 特定のファイルのみ削除する場合
	 */
	async cleanup(specificFile?: TFile): Promise<void> {
		this.logger.debug('Starting cleanup', { specific: !!specificFile });
		try {
			if (specificFile) {
				// 特定のファイルのみ削除
				if (specificFile.path.startsWith(TempFileManager.TEMP_DIR)) {
					await this.app.vault.delete(specificFile);
					this.logger.debug('Specific file cleaned up', { file: specificFile.path });
				}
			} else {
				// フォルダごと削除（シンプルな実装）
				const folder = this.app.vault.getAbstractFileByPath(TempFileManager.TEMP_DIR);
				if (folder instanceof TFolder) {
					await this.app.vault.delete(folder, true);
					this.logger.info('All temporary files cleaned up');
				}
			}
		} catch (error) {
			// エラーは無視（処理は継続）
			this.logger.warn('Cleanup error', { error: error.message });
		}
	}


	/**
	 * 一時ファイルかどうかを判定
	 */
	isTemporaryFile(file: TFile): boolean {
		return file.path.startsWith(TempFileManager.TEMP_DIR);
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
				const usageGB = (estimate.usage || 0) / (1024 * 1024 * 1024);
				const quotaGB = (estimate.quota || 0) / (1024 * 1024 * 1024);
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
			this.logger.warn('Failed to estimate storage', { error: error.message });
			return { available: true };
		}
	}
}