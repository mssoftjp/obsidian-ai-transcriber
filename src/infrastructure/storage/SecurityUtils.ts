import { Notice } from 'obsidian';
import { t } from '../../i18n';
import { Logger } from '../../utils/Logger';

export class SecurityUtils {
	/**
	 * Validate OpenAI API key format
	 * OpenAI API keys should start with 'sk-' followed by alphanumeric characters
	 */
	static validateOpenAIAPIKey(key: string): { valid: boolean; error?: string } {
		if (!key || key.trim().length === 0) {
			return { valid: false, error: t('errors.apiKeyMissing') };
		}

		// Trim the key to handle accidental spaces
		const trimmedKey = key.trim();

		// More flexible pattern to accommodate format changes
		// sk-proj-... format is also valid
		// Updated to be more flexible with length (some keys can be quite long)
		const pattern = /^sk-[a-zA-Z0-9\-_]{20,200}$/;
		
		if (!pattern.test(trimmedKey)) {
			return { valid: false, error: t('errors.invalidApiKeyFormat') };
		}

		return { valid: true };
	}

	/**
	 * Test OpenAI API key by making a simple API call
	 * Uses the /models endpoint which is lightweight and reliable
	 */
	static async testOpenAIAPIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
		// First validate format
		const formatValidation = this.validateOpenAIAPIKey(apiKey);
		if (!formatValidation.valid) {
			return formatValidation;
		}

		try {
			// Create AbortController for timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
			
			const response = await fetch('https://api.openai.com/v1/models', {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${apiKey.trim()}`,
					'Content-Type': 'application/json'
				},
				signal: controller.signal
			});
			
			clearTimeout(timeoutId);

			if (response.ok) {
				return { valid: true };
			}

			// Handle specific error cases
			switch (response.status) {
				case 401:
					return { valid: false, error: t('errors.invalidApiKey') };
				case 429:
					return { valid: false, error: t('errors.rateLimitExceeded') };
				case 500:
				case 502:
				case 503:
					return { valid: false, error: t('errors.apiUnavailable') };
				default:
					return { 
						valid: false, 
						error: t('errors.apiConnectionFailed').replace('{status}', response.status.toString()) 
					};
			}
		} catch (error) {
			Logger.getLogger('SecurityUtils').error('API test failed:', error);
			
			// Handle timeout specifically
			if (error instanceof Error && error.name === 'AbortError') {
				return { valid: false, error: t('errors.timeout') };
			}
			
			return { valid: false, error: t('errors.networkError') };
		}
	}

	/**
	 * Display validation result as Obsidian Notice
	 */
	static showValidationNotice(result: { valid: boolean; error?: string }): void {
		if (result.valid) {
			new Notice(t('settings.apiKey.testSuccess'));
		} else {
			new Notice(result.error || t('settings.apiKey.testFailed'));
		}
	}

	/**
	 * Mask API key for display purposes
	 * Shows first 7 characters and masks the rest
	 */
	static maskApiKey(apiKey: string): string {
		if (!apiKey || apiKey.length < 10) return '';
		return apiKey.substring(0, 7) + '*'.repeat(40);
	}

	/**
	 * Check if a string looks like an API key
	 * Used for detecting plain text keys in settings
	 */
	static looksLikeApiKey(str: string): boolean {
		return /^sk-[a-zA-Z0-9\-_]{20,200}$/.test(str);
	}

	/**
	 * Validate API key with detailed error information
	 * Combines format validation and API testing
	 */
	static async validateApiKey(apiKey: string, showNotice: boolean = true): Promise<{ valid: boolean; error?: string }> {
		// Format validation
		const formatResult = this.validateOpenAIAPIKey(apiKey);
		if (!formatResult.valid) {
			if (showNotice) {
				this.showValidationNotice(formatResult);
			}
			return formatResult;
		}

		// API test
		const testResult = await this.testOpenAIAPIKey(apiKey);
		if (showNotice) {
			this.showValidationNotice(testResult);
		}
		return testResult;
	}
}