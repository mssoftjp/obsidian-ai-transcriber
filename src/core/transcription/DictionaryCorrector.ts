/**
 * Deterministic dictionary corrector for fixed replacements
 */

import type { DictionaryCategory } from '../../ApiSettings';

export interface DictionaryEntry {
	// 誤認識されやすいパターン（正規表現または文字列）
	pattern: string | RegExp;
	// 正しい表記
	replacement: string;
	// 大文字小文字を区別するか
	caseSensitive?: boolean;
	// カテゴリ
	category?: DictionaryCategory;
	// 優先度
	priority?: number;
}

export interface CorrectionDictionary {
	// 辞書名
	name: string;
	// 言語コード
	language: string;
	// 辞書エントリ
	entries: DictionaryEntry[];
	// 有効/無効
	enabled: boolean;
}

export class DictionaryCorrector {
	private dictionaries: Map<string, CorrectionDictionary> = new Map();

	/**
	 * Add or update a dictionary
	 */
	addDictionary(dictionary: CorrectionDictionary): void {
		this.dictionaries.set(dictionary.name, dictionary);
	}

	/**
	 * Remove a dictionary
	 */
	removeDictionary(name: string): void {
		this.dictionaries.delete(name);
	}

	/**
	 * Apply all enabled dictionaries to text
	 */
	correct(text: string, language: string = 'ja', signal?: AbortSignal): Promise<string> {
		if (signal?.aborted) {
			return Promise.reject(new DOMException('Dictionary correction was cancelled', 'AbortError'));
		}
		let correctedText = text;

		// Apply fixed replacements
		for (const dictionary of this.dictionaries.values()) {
			if (signal?.aborted) {
				return Promise.reject(new DOMException('Dictionary correction was cancelled', 'AbortError'));
			}
			if (!dictionary.enabled) {
				continue;
			}

			// Apply dictionary if it matches the language OR if it's a multi-language dictionary
			if (dictionary.language === language || dictionary.language === 'multi') {
				correctedText = this.applyDictionary(correctedText, dictionary);
			}
		}

		return Promise.resolve(correctedText);
	}

	/**
	 * Apply a single dictionary to text
	 */
	private applyDictionary(text: string, dictionary: CorrectionDictionary): string {
		let result = text;

		for (const entry of dictionary.entries) {
			if (entry.pattern instanceof RegExp) {
				// RegExp pattern
				result = result.replace(entry.pattern, entry.replacement);
			} else {
				// String pattern
				const flags = entry.caseSensitive ? 'g' : 'gi';
				const regex = new RegExp(this.escapeRegex(entry.pattern), flags);
				result = result.replace(regex, entry.replacement);
			}
		}

		return result;
	}

	/**
	 * Escape special regex characters in string
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

}
