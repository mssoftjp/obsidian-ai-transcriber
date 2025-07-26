import { Platform } from 'obsidian';
import { Logger } from '../../utils/Logger';

const PREFIX = 'SAFE_V1::';
const LEGACY_XOR = 'XOR_V1::';
const LEGACY_PLAIN = 'PLAIN::';
const FIXED_KEY = 'obsidian-ai-transcriber-2025';

export class SafeStorageService {
	private static safeStorage: any = null;
	private static logger = Logger.getLogger('SafeStorageService');

	/** safeStorageの遅延初期化 */
	private static getSafeStorage() {
		if (!this.safeStorage) {
			try {
				// モバイル環境チェック
				if (Platform.isMobileApp) {
					return null;
				}
				
				// Obsidianのelectron環境からsafeStorageを取得
				const electron = (window as any).require?.('electron');
				
				this.safeStorage = electron?.remote?.safeStorage || electron?.safeStorage;
			} catch (e) {
				this.logger.error('Error during safeStorage initialization', { error: e.message });
			}
		}
		return this.safeStorage;
	}

	/** 暗号化して保存用文字列へ変換 */
	static encryptForStore(apiKey: string): string {
		if (!apiKey) return '';
		
		// Trim the API key before storing
		const trimmedKey = apiKey.trim();
		if (!trimmedKey) return '';

		this.logger.trace('Encrypting API key for storage');
		
		const safeStorage = this.getSafeStorage();
		if (safeStorage?.isEncryptionAvailable?.()) {
			try {
				const buf = safeStorage.encryptString(trimmedKey);
				this.logger.debug('API key encrypted using SafeStorage');
				return PREFIX + buf.toString('base64');
			} catch (e) {
				this.logger.warn('SafeStorage encryption failed, using fallback', { error: e.message });
			}
		}
		// フォールバック
		const encrypted = this.xorEncrypt(trimmedKey, FIXED_KEY);
		this.logger.debug('API key encrypted using XOR fallback');
		return LEGACY_XOR + encrypted;
	}

	/** 保存文字列 -> 平文 API キー */
	static decryptFromStore(stored: string): string {
		if (!stored) return '';

		this.logger.trace('Decrypting stored API key');

		// 新方式
		if (stored.startsWith(PREFIX)) {
			const safeStorage = this.getSafeStorage();
			if (safeStorage?.decryptString) {
				const b64 = stored.slice(PREFIX.length);
				try {
					const decrypted = safeStorage.decryptString(Buffer.from(b64, 'base64'));
					this.logger.debug('API key decrypted using SafeStorage');
					return decrypted;
				} catch (e) {
					this.logger.error('SafeStorage decryption failed', { error: e.message });
					return '';
				}
			}
		}

		if (stored.startsWith(LEGACY_XOR)) {
			const encrypted = stored.substring(LEGACY_XOR.length);
			try {
				const decrypted = this.xorDecrypt(encrypted, FIXED_KEY);
				this.logger.debug('API key decrypted using XOR fallback');
				return decrypted;
			} catch (e) {
				this.logger.error('XOR decryption failed', { error: e.message });
				return '';
			}
		}

		// 平文
		if (stored.startsWith(LEGACY_PLAIN)) {
			return stored.replace(LEGACY_PLAIN, '');
		}
		
		if (stored.startsWith('sk-') && stored.length > 40) {
			return stored;
		}

		return '';
	}

	private static xorEncrypt(text: string, key: string): string {
		let result = '';
		for (let i = 0; i < text.length; i++) {
			result += String.fromCharCode(
				text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
			);
		}
		return btoa(result);
	}

	private static xorDecrypt(encoded: string, key: string): string {
		try {
			const text = atob(encoded);
			let result = '';
			for (let i = 0; i < text.length; i++) {
				result += String.fromCharCode(
					text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
				);
			}
			return result;
		} catch (e) {
			this.logger.error('XOR decryption failed', { error: e.message });
			return '';
		}
	}
}