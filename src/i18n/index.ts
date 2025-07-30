/**
 * Internationalization (i18n) helper functions
 */

import { moment } from 'obsidian';
import { TranslationKeys, SupportedLocale } from './locales';
import { Logger } from '../utils/Logger';
import { ObsidianApp } from '../types/global';

// Translations will be imported here
let translations: Record<SupportedLocale, TranslationKeys> = {} as Record<SupportedLocale, TranslationKeys>;

// Current locale
let currentLocale: SupportedLocale = 'en';

// App instance for accessing Obsidian settings
let appInstance: unknown = null;

/**
 * Initialize i18n with translations
 * This is called after translations are loaded
 */
export function initializeTranslations(translationData: Record<SupportedLocale, TranslationKeys>): void {
	translations = translationData;
}

/**
 * Initialize i18n with app instance and detect locale
 */
export function initializeI18n(app: unknown): void {
	appInstance = app; // eslint-disable-line @typescript-eslint/no-unused-vars

	// Get Obsidian's language setting
	const locale = (app as ObsidianApp).vault?.config?.locale ||
		moment.locale() ||
		navigator.language ||
		'en';

	// Extract language code (e.g., 'en-US' -> 'en')
	const langCode = locale.split('-')[0].toLowerCase();

	// Set current locale
	if (langCode === 'ja') {
		currentLocale = 'ja';
	} else if (langCode === 'zh') {
		currentLocale = 'zh';
	} else if (langCode === 'ko') {
		currentLocale = 'ko';
	} else {
		currentLocale = 'en';
	}

}

/**
 * Get translation for a given key
 * @param path - Dot-separated path to translation key (e.g., 'settings.title')
 * @param params - Optional parameters for string interpolation
 * @returns Translated string
 */
export function t(path: string, params?: Record<string, string | number>): string {
	if (!translations[currentLocale]) {
		const logger = Logger.getLogger('i18n');
		logger.warn(`No translations loaded for locale: ${currentLocale}`);
		return path;
	}

	const keys = path.split('.');
	let value: unknown = translations[currentLocale];

	// Navigate through the translation object
	for (const key of keys) {
		value = (value as Record<string, unknown>)?.[key];
		if (value === undefined) {
			// Try fallback to English
			if (currentLocale !== 'en' && translations.en) {
				value = translations.en;
				for (const k of keys) {
					value = (value as Record<string, unknown>)?.[k];
					if (value === undefined) {
						break;
					}
				}
			}
			break;
		}
	}

	// If translation not found, return the key
	if (typeof value !== 'string') {
		const logger = Logger.getLogger('i18n');
		logger.warn(`Translation key not found: ${path}`);
		return path;
	}

	// Replace parameters
	if (params) {
		return value.replace(/\{(\w+)\}/g, (match, key) => {
			const param = params[key];
			return param !== undefined ? String(param) : match;
		});
	}

	return value;
}

/**
 * Get current locale
 */
export function getCurrentLocale(): SupportedLocale {
	return currentLocale;
}

/**
 * Set locale manually
 */
export function setLocale(locale: SupportedLocale): void {
	if (locale === 'en' || locale === 'ja' || locale === 'zh' || locale === 'ko') {
		currentLocale = locale;
	} else {
		const logger = Logger.getLogger('i18n');
		logger.warn(`Unsupported locale: ${locale}`);
	}
}

/**
 * Check if a locale is supported
 */
export function isLocaleSupported(locale: string): boolean {
	return locale === 'en' || locale === 'ja' || locale === 'zh' || locale === 'ko';
}

/**
 * Get all available locales
 */
export function getAvailableLocales(): SupportedLocale[] {
	return ['en', 'ja', 'zh', 'ko'];
}

/**
 * Format number according to current locale
 */
export function formatNumber(num: number, options?: Intl.NumberFormatOptions): string {
	const localeString = currentLocale === 'zh' ? 'zh-CN' :
		currentLocale === 'ko' ? 'ko-KR' : currentLocale;
	return new Intl.NumberFormat(localeString, options).format(num);
}

/**
 * Format date according to current locale
 */
export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
	const localeString = currentLocale === 'zh' ? 'zh-CN' :
		currentLocale === 'ko' ? 'ko-KR' : currentLocale;
	return new Intl.DateTimeFormat(localeString, options).format(date);
}

// Re-export types
export type { TranslationKeys, SupportedLocale } from './locales';