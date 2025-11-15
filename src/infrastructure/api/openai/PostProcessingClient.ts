/**
 * Post-processing client for transcription enhancement
 * Handles API communication with the configured AI model
 */

import { ApiClient } from '../ApiClient';
import { APITranscriptionSettings } from '../../../ApiSettings';
import { buildPostProcessingRequest, POST_PROCESSING_CONFIG } from '../../../config/openai/PostProcessingConfig';
import { SafeStorageService } from '../../storage/SafeStorageService';
import { LanguageDetector } from '../../../core/utils/LanguageDetector';
import { Logger } from '../../../utils/Logger';
import { OpenAIChatResponse } from './OpenAIChatTypes';

export interface PostProcessingResult {
	processedText: string;
	confidence?: number;
	modelUsed: string;
}

export class PostProcessingClient extends ApiClient {

	constructor(settings: APITranscriptionSettings) {
		const apiKey = SafeStorageService.decryptFromStore(settings.openaiApiKey);
		if (!apiKey) {
			throw new Error('OpenAI API key not configured');
		}

		super({
			baseUrl: 'https://api.openai.com',
			apiKey: apiKey,
			timeout: 180000  // 180秒に延長（後処理用）
		});

		this.logger = Logger.getLogger('PostProcessingClient');
		this.logger.debug('PostProcessingClient initialized', { model: POST_PROCESSING_CONFIG.model });
	}

	/**
	 * Process transcription with meta information
	 */
	async processTranscription(
		transcription: string,
		context: string,
		keywords: string[],
		signal?: AbortSignal
	): Promise<PostProcessingResult> {
		const startTime = performance.now();
		this.logger.debug('Starting post-processing', {
			textLength: transcription.length,
			hasContext: !!context,
			keywordCount: keywords.length
		});

		try {
			// 言語を検出（簡易的な実装）
			const detectedLanguage = this.detectLanguage(transcription);

			const request = buildPostProcessingRequest(transcription, context, keywords, detectedLanguage);

			const response = await this.post<OpenAIChatResponse>(
				POST_PROCESSING_CONFIG.endpoint,
				request,
				{},
				signal
			);

			if (!response.choices || response.choices.length === 0) {
				throw new Error('No response from post-processing model');
			}

			const processedText = response.choices[0].message?.content || transcription;

			const elapsedTime = performance.now() - startTime;
			this.logger.info('Post-processing completed', {
				elapsedTime: `${elapsedTime.toFixed(2)}ms`,
				originalLength: transcription.length,
				processedLength: processedText.length,
				tokensUsed: response.usage?.total_tokens
			});

			return {
				processedText,
				modelUsed: POST_PROCESSING_CONFIG.model,
				confidence: response.usage ? 0.9 : undefined // Placeholder confidence
			};

		} catch (error: unknown) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw error;
			}

			const errorMessage = this.formatUnknownError(error);
			this.logger.error('Processing failed', { error: errorMessage });

			// Return original transcription on error
			return {
				processedText: transcription,
				modelUsed: 'none',
				confidence: 0
			};
		}
	}

	/**
	 * Validate post-processing is available
	 */
	async validateConfiguration(): Promise<{
		isValid: boolean;
		error?: string;
		model: string;
	}> {
		try {
			// Simple validation request
			const testRequest = {
				model: POST_PROCESSING_CONFIG.model,
				messages: [
					{
						role: 'system',
						content: 'Test'
					},
					{
						role: 'user',
						content: 'Hello'
					}
				],
				max_tokens: 5
			};

			await this.post<OpenAIChatResponse>(POST_PROCESSING_CONFIG.endpoint, testRequest);

			return {
				isValid: true,
				model: POST_PROCESSING_CONFIG.model
			};
		} catch (error: unknown) {
			return {
				isValid: false,
				error: this.formatUnknownError(error),
				model: POST_PROCESSING_CONFIG.model
			};
		}
	}

	/**
	 * Get current model information
	 */
	getModelInfo(): {
		name: string;
		endpoint: string;
		maxTokens: number;
		} {
		return {
			name: POST_PROCESSING_CONFIG.model,
			endpoint: POST_PROCESSING_CONFIG.endpoint,
			maxTokens: POST_PROCESSING_CONFIG.limitations.maxOutputTokens
		};
	}

	/**
	 * Test API connection
	 */
	async testConnection(): Promise<boolean> {
		const result = await this.validateConfiguration();
		return result.isValid;
	}

	/**
	 * Detect language from text (simple implementation)
	 * 言語検出の簡易実装
	 */
	private detectLanguage(text: string): string {
		return LanguageDetector.detectLanguage(text);
	}

	/**
	 * Normalize unknown error values into a safe string
	 */
	private formatUnknownError(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		try {
			const serialized = JSON.stringify(error);
			return serialized ?? 'Unknown error';
		} catch {
			return 'Unknown error';
		}
	}
}
