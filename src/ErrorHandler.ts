import { Notice } from 'obsidian';
import { UI_CONSTANTS } from './config/constants';
import { t } from './i18n';
import { Logger } from './utils/Logger';

export interface ErrorRecoveryAction {
	text: string;
	action: () => void;
}

export interface UserFriendlyError {
	title: string;
	message: string;
	recoveryActions?: ErrorRecoveryAction[];
	technicalDetails?: string;
}

export class ErrorHandler {
	private static logger = Logger.getLogger('ErrorHandler');

	/**
	 * Convert technical errors to user-friendly messages
	 */
	static handleError(error: Error | string, context?: string): UserFriendlyError {
		const errorMessage = typeof error === 'string' ? error : error.message;
		const errorName = typeof error === 'string' ? 'Error' : error.name;

		// Log the error
		this.logger.error(`${context || 'Unknown context'}: ${errorMessage}`, error);

		// API-related errors
		if (this.isApiError(errorMessage)) {
			return this.handleApiError(errorMessage, context);
		}

		// File-related errors
		if (this.isFileError(errorMessage)) {
			return this.handleFileError(errorMessage, context);
		}

		// Network-related errors
		if (this.isNetworkError(errorMessage)) {
			return this.handleNetworkError(errorMessage, context);
		}

		// Audio processing errors
		if (this.isAudioError(errorMessage)) {
			return this.handleAudioError(errorMessage, context);
		}

		// Size limit errors
		if (this.isSizeError(errorMessage)) {
			return this.handleSizeError(errorMessage, context);
		}

		// Generic fallback
		return this.handleGenericError(errorMessage, errorName, context);
	}

	/**
	 * Display user-friendly error with optional recovery actions
	 */
	static displayError(userError: UserFriendlyError): void {
		// Construct full error message for notice
		const noticeMessage = `${userError.title}: ${userError.message}`;

		// Always log the user-facing error message that appears in the notice
		this.logger.error('Notice displayed', { message: noticeMessage });

		// Show main error notice with softer tone
		new Notice(noticeMessage, UI_CONSTANTS.NOTICE_DURATION);

		// Log technical details for developers
		if (userError.technicalDetails) {
			this.logger.error('Technical details', { details: userError.technicalDetails });
		}
	}

	/**
	 * Quick method to handle and display errors in one call
	 */
	static handleAndDisplay(error: Error | string, context?: string): void {
		const userError = this.handleError(error, context);
		this.displayError(userError);
	}

	// Private helper methods for error classification

	private static isApiError(message: string): boolean {
		const apiKeywords = [
			'api key', 'apikey', 'unauthorized', '401', '403',
			'invalid_api_key', 'authentication', 'quota', 'rate limit'
		];
		return apiKeywords.some(keyword => message.toLowerCase().includes(keyword));
	}

	private static isFileError(message: string): boolean {
		const fileKeywords = [
			'file not found', 'no such file', 'permission denied',
			'file size', 'unsupported format', 'corrupted', 'invalid file'
		];
		return fileKeywords.some(keyword => message.toLowerCase().includes(keyword));
	}

	private static isNetworkError(message: string): boolean {
		const networkKeywords = [
			'network', 'connection', 'timeout', 'fetch', 'cors',
			'failed to fetch', 'net::', 'dns'
		];
		return networkKeywords.some(keyword => message.toLowerCase().includes(keyword));
	}

	private static isAudioError(message: string): boolean {
		const audioKeywords = [
			'audio', 'decode', 'web audio', 'audiocontext',
			'unsupported audio', 'media'
		];
		return audioKeywords.some(keyword => message.toLowerCase().includes(keyword));
	}

	private static isSizeError(message: string): boolean {
		const sizeKeywords = [
			'size exceeds', 'too large', 'file size', 'limit exceeded',
			'maximum', 'exceeds limit'
		];
		return sizeKeywords.some(keyword => message.toLowerCase().includes(keyword));
	}

	// Private methods for handling specific error types

	private static handleApiError(message: string, context?: string): UserFriendlyError {
		if (message.toLowerCase().includes('invalid_api_key') || message.includes('401')) {
			return {
				title: t('errors.titles.apiKeyCheck'),
				message: t('errors.messages.apiKeyRecheck'),
				recoveryActions: [
					{
						text: t('errors.recoveryActions.openSettings'),
						action: () => {
							// This would be implemented to open settings
							new Notice(t('errors.notices.settingsCheck'));
						}
					}
				],
				technicalDetails: `API Error: ${message} ${context ? `(Context: ${context})` : ''}`
			};
		}

		if (message.toLowerCase().includes('quota') || message.includes('rate limit')) {
			return {
				title: t('errors.titles.apiUsageLimit'),
				message: t('errors.messages.apiUsageLimitReached'),
				technicalDetails: `API Quota Error: ${message} ${context ? `(Context: ${context})` : ''}`
			};
		}

		return {
			title: t('errors.titles.apiConnection'),
			message: t('errors.messages.apiConnectionIssue'),
			recoveryActions: [
				{
					text: t('errors.recoveryActions.connectionTest'),
					action: () => {
						new Notice(t('errors.notices.settingsConnectionTest'));
					}
				}
			],
			technicalDetails: `API Error: ${message} ${context ? `(Context: ${context})` : ''}`
		};
	}

	private static handleFileError(message: string, context?: string): UserFriendlyError {
		if (message.toLowerCase().includes('not found')) {
			return {
				title: t('errors.titles.fileError'),
				message: t('errors.messages.fileNotFound'),
				technicalDetails: `File Error: ${message} ${context ? `(Context: ${context})` : ''}`
			};
		}

		if (message.toLowerCase().includes('permission')) {
			return {
				title: t('errors.titles.fileAccessError'),
				message: t('errors.messages.fileAccessDenied'),
				technicalDetails: `Permission Error: ${message} ${context ? `(Context: ${context})` : ''}`
			};
		}

		return {
			title: t('errors.titles.fileLoadError'),
			message: t('errors.messages.fileLoadFailed'),
			recoveryActions: [
				{
					text: t('errors.recoveryActions.checkSupportedFormats'),
					action: () => {
						new Notice(t('errors.notices.supportedFormats'));
					}
				}
			],
			technicalDetails: `File Error: ${message} ${context ? `(Context: ${context})` : ''}`
		};
	}

	private static handleNetworkError(message: string, context?: string): UserFriendlyError {
		return {
			title: t('errors.titles.networkError'),
			message: t('errors.messages.networkConnectionIssue'),
			recoveryActions: [
				{
					text: t('errors.recoveryActions.retry'),
					action: () => {
						new Notice(t('errors.notices.networkRetry'));
					}
				}
			],
			technicalDetails: `Network Error: ${message} ${context ? `(Context: ${context})` : ''}`
		};
	}

	private static handleAudioError(message: string, context?: string): UserFriendlyError {
		return {
			title: t('errors.titles.audioProcessError'),
			message: t('errors.messages.audioProcessFailed'),
			recoveryActions: [
				{
					text: t('errors.recoveryActions.tryOtherFormat'),
					action: () => {
						new Notice(t('errors.notices.formatConversion'));
					}
				}
			],
			technicalDetails: `Audio Error: ${message} ${context ? `(Context: ${context})` : ''}`
		};
	}

	private static handleSizeError(message: string, context?: string): UserFriendlyError {
		return {
			title: t('errors.titles.fileSizeError'),
			message: t('errors.messages.fileSizeExceeded'),
			recoveryActions: [
				{
					text: t('errors.recoveryActions.checkSizeLimit'),
					action: () => {
						new Notice(t('errors.notices.sizeLimit'));
					}
				}
			],
			technicalDetails: `Size Error: ${message} ${context ? `(Context: ${context})` : ''}`
		};
	}

	private static handleGenericError(message: string, errorName: string, context?: string): UserFriendlyError {
		return {
			title: t('errors.titles.unexpectedError'),
			message: t('errors.messages.unexpectedErrorOccurred'),
			recoveryActions: [
				{
					text: t('errors.recoveryActions.enableDebugMode'),
					action: () => {
						new Notice(t('errors.notices.debugModeEnable'));
					}
				}
			],
			technicalDetails: `${errorName}: ${message} ${context ? `(Context: ${context})` : ''}`
		};
	}
}