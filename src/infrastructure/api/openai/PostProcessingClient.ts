/**
 * Post-processing client for transcription enhancement
 * Handles API communication with the configured AI model
 */

import { buildPostProcessingRequest, POST_PROCESSING_CONFIG } from '../../../config/openai/PostProcessingConfig';
import { LanguageDetector } from '../../../core/utils/LanguageDetector';
import { Logger } from '../../../utils/Logger';
import { SafeStorageService } from '../../storage/SafeStorageService';
import { ApiClient } from '../ApiClient';

import type { OpenAIChatResponse } from './OpenAIChatTypes';
import type { APITranscriptionSettings } from '../../../ApiSettings';

const MIN_OUTPUT_RETENTION_RATIO = 0.75;

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
		contextualGuidance: string = '',
		signal?: AbortSignal
	): Promise<PostProcessingResult> {
		const startTime = performance.now();
		this.logger.debug('Starting post-processing', {
			textLength: transcription.length,
			hasContext: Boolean(context),
			keywordCount: keywords.length,
			contextualGuidanceLength: contextualGuidance.length
		});

		try {
			// 言語を検出（簡易的な実装）
			const detectedLanguage = this.detectLanguage(transcription);

			const request = buildPostProcessingRequest(
				transcription,
				context,
				keywords,
				detectedLanguage,
				contextualGuidance
			);

			const response = await this.post<OpenAIChatResponse>(
				POST_PROCESSING_CONFIG.endpoint,
				request,
				{},
				signal
			);

				if (response.choices.length === 0) {
					throw new Error('No response from post-processing model');
				}

				const processedText = getCompletedPostProcessingText(response, transcription);

			const elapsedTime = performance.now() - startTime;
			this.logger.info('Post-processing completed', {
				elapsedTime: `${elapsedTime.toFixed(2)}ms`,
				originalLength: transcription.length,
				processedLength: processedText.length,
				tokensUsed: response.usage?.total_tokens
			});

				const result: PostProcessingResult = {
					processedText,
					modelUsed: POST_PROCESSING_CONFIG.model
				};
				if (response.usage) {
					result.confidence = 0.9; // Placeholder confidence
				}
				return result;

			} catch (error: unknown) {
			const isAborted = signal?.aborted ?? false;
			if (isAborted || (error instanceof Error && error.name === 'AbortError')) {
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
				max_completion_tokens: 5,
				reasoning_effort: 'minimal'
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
				return serialized;
			} catch {
				return 'Unknown error';
			}
	}
}

export function getCompletedPostProcessingText(
	response: OpenAIChatResponse,
	originalText: string
): string {
	const firstChoice = response.choices[0];
	if (!firstChoice?.message?.content) {
		throw new Error('No content returned from post-processing model');
	}
	if (firstChoice.finish_reason !== 'stop') {
		throw new Error(`Post-processing output was incomplete: ${firstChoice.finish_reason ?? 'unknown'}`);
	}

	const processedText = firstChoice.message.content.trim();
	const minimumLength = Math.floor(originalText.trim().length * MIN_OUTPUT_RETENTION_RATIO);
	if (processedText.length < minimumLength) {
		throw new Error('Post-processing output was unexpectedly shorter than the transcription');
	}

	return processedText;
}
