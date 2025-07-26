/**
 * Language Detection Utility
 * Centralized language detection logic to avoid duplication
 */

export type DetectedLanguage = 'ja' | 'en' | 'zh' | 'ko';

export class LanguageDetector {
	/**
	 * Detect language from text
	 * @param text Text to analyze
	 * @returns Detected language code
	 */
	static detectLanguage(text: string): DetectedLanguage {
		// Regular expressions for language detection
		const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
		const chineseOnlyRegex = /[\u4E00-\u9FFF]/g;
		const englishRegex = /[a-zA-Z]/g;
		const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g; // Hangul
		
		const japaneseMatches = (text.match(japaneseRegex) || []).length;
		const chineseMatches = (text.match(chineseOnlyRegex) || []).length;
		const englishMatches = (text.match(englishRegex) || []).length;
		const koreanMatches = (text.match(koreanRegex) || []).length;
		
		const textLength = text.length;
		
		// 韓国語文字（ハングル）があれば韓国語
		if (koreanMatches > textLength * 0.1) {
			return 'ko';
		}
		
		// 日本語特有の文字（ひらがな・カタカナ）があれば日本語
		if (japaneseMatches > textLength * 0.1) {
			return 'ja';
		}
		
		// 英語の比率が高ければ英語
		if (englishMatches > textLength * 0.5) {
			return 'en';
		}
		
		// 漢字のみが多ければ中国語
		if (chineseMatches > textLength * 0.3) {
			return 'zh';
		}
		
		// デフォルトは日本語
		return 'ja';
	}

	/**
	 * Check if text contains Japanese characters
	 */
	static containsJapanese(text: string): boolean {
		const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
		return japaneseRegex.test(text);
	}

	/**
	 * Check if text contains English characters
	 */
	static containsEnglish(text: string): boolean {
		const englishRegex = /[a-zA-Z]/;
		return englishRegex.test(text);
	}

	/**
	 * Check if text contains Chinese characters (excluding Japanese context)
	 */
	static containsChinese(text: string): boolean {
		const chineseOnlyRegex = /[\u4E00-\u9FFF]/;
		const hiraganaKatakanaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
		
		// If it contains hiragana/katakana, it's likely Japanese
		if (hiraganaKatakanaRegex.test(text)) {
			return false;
		}
		
		return chineseOnlyRegex.test(text);
	}

	/**
	 * Check if text contains Korean characters
	 */
	static containsKorean(text: string): boolean {
		const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
		return koreanRegex.test(text);
	}

	/**
	 * Get language distribution in text
	 */
	static getLanguageDistribution(text: string): {
		japanese: number;
		english: number;
		chinese: number;
		korean: number;
		other: number;
	} {
		const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
		const chineseOnlyRegex = /[\u4E00-\u9FFF]/g;
		const englishRegex = /[a-zA-Z]/g;
		const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g;
		
		const japaneseMatches = (text.match(japaneseRegex) || []).length;
		const chineseMatches = (text.match(chineseOnlyRegex) || []).length;
		const englishMatches = (text.match(englishRegex) || []).length;
		const koreanMatches = (text.match(koreanRegex) || []).length;
		
		const textLength = text.length;
		
		return {
			japanese: japaneseMatches / textLength,
			english: englishMatches / textLength,
			chinese: (chineseMatches - japaneseMatches) / textLength, // Exclude kanji used in Japanese
			korean: koreanMatches / textLength,
			other: (textLength - japaneseMatches - englishMatches - (chineseMatches - japaneseMatches) - koreanMatches) / textLength
		};
	}
}