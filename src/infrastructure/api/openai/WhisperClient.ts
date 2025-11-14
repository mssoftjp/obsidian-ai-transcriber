/**
 * OpenAI Whisper API client implementation
 * Handles Whisper-specific API calls and response parsing
 */

import { ApiClient } from '../ApiClient';
import { AudioChunk } from '../../../core/audio/AudioTypes';
import { 
	TranscriptionResult, 
	TranscriptionOptions,
	ModelSpecificOptions 
} from '../../../core/transcription/TranscriptionTypes';
import { 
	WHISPER_CONFIG,
	buildWhisperRequest
} from '../../../config/openai/WhisperConfig';
import { DEFAULT_REQUEST_CONFIG } from '../../../config/openai/index';
import { Logger } from '../../../utils/Logger';

interface WhisperResponse {
	text: string;
	language?: string;
	duration?: number;
	segments?: Array<{
		id: number;
		text: string;
		start: number;
		end: number;
		words?: Array<{
			word: string;
			start: number;
			end: number;
		}>;
	}>;
}

export class WhisperClient extends ApiClient {

	constructor(apiKey: string) {
		super({
			baseUrl: WHISPER_CONFIG.endpoint.transcriptions.split('/audio')[0], // Extract base URL
			apiKey,
			timeout: 60000, // 60 seconds for Whisper
			maxRetries: DEFAULT_REQUEST_CONFIG.maxRetries,
			retryDelay: DEFAULT_REQUEST_CONFIG.retryDelayMs
		});
		
		this.logger = Logger.getLogger('WhisperClient');
	}

	/**
	 * Transcribe audio chunk using Whisper API
	 */
	async transcribe(
		chunk: AudioChunk,
		options: TranscriptionOptions,
		modelOptions?: ModelSpecificOptions
	): Promise<TranscriptionResult> {
		const formData = new FormData();

		// Create file from chunk data
		const fileName = `chunk_${chunk.id}.wav`;
		const file = new File([chunk.data], fileName, { type: 'audio/wav' });
		formData.append('file', file);

		// Whisper does not use prompts - they can cause hallucinations
		const prompt = ''; // No prompt for Whisper

		// Build request parameters using the new config
		const requestParams = buildWhisperRequest({
			response_format: modelOptions?.whisper?.responseFormat || WHISPER_CONFIG.defaults.response_format,
			language: options.language === 'auto' ? undefined : options.language,
			timestamp_granularities: modelOptions?.whisper?.timestampGranularities,
			prompt: prompt || undefined
		}, chunk.id === 0); // isFirstChunk


		// Append all parameters to FormData
		Object.entries(requestParams).forEach(([key, value]) => {
			if (value !== undefined) {
				if (key === 'timestamp_granularities' && Array.isArray(value)) {
					// OpenAI expects each array element as a separate form field with brackets
					value.forEach(item => {
						formData.append('timestamp_granularities[]', item.toString());
					});
				} else if (Array.isArray(value)) {
					// For other arrays, use JSON string format
					formData.append(key, JSON.stringify(value));
				} else {
					formData.append(key, value.toString());
				}
			}
		});

		try {
			const startTime = performance.now();
			this.logger.trace('Sending request to Whisper API', { 
				chunkId: chunk.id,
				requestParams: {
					model: requestParams.model,
					response_format: requestParams.response_format,
					timestamp_granularities: requestParams.timestamp_granularities,
					language: requestParams.language
				}
			});
			
			const response = await this.post<WhisperResponse | string>(
				'/audio/transcriptions',
				formData,
				{},
				options.signal
			);
			
			this.logger.debug('Whisper API response type', {
				chunkId: chunk.id,
				responseType: typeof response,
				hasSegments: typeof response === 'object' && 'segments' in response,
				segmentsCount: typeof response === 'object' && response.segments?.length,
				// Log first few segments for debugging
				sampleSegments: typeof response === 'object' && response.segments 
					? response.segments.slice(0, 2).map(s => ({ start: s.start, end: s.end, textLength: s.text.length }))
					: null
			});

			const result = this.parseResponse(response, chunk);
			
			const elapsedTime = performance.now() - startTime;
			this.logger.debug('Whisper transcription completed', {
				chunkId: chunk.id,
				elapsedTime: `${elapsedTime.toFixed(2)}ms`,
				textLength: result.text.length,
				hasSegments: !!result.segments,
				segmentsCount: result.segments?.length
			});
			
			return result;

		} catch (error) {
			this.logger.error('Whisper transcription failed', {
				chunkId: chunk.id,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			
			return {
				id: chunk.id,
				text: '',
				startTime: chunk.startTime,
				endTime: chunk.endTime,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Parse Whisper API response
	 */
	private parseResponse(response: WhisperResponse | string, chunk: AudioChunk): TranscriptionResult {
		// Handle text-only response format
		if (typeof response === 'string') {
			return {
				id: chunk.id,
				text: response,
				startTime: chunk.startTime,
				endTime: chunk.endTime,
				success: true,
				segments: undefined, // No segments for text format
				language: undefined // Language detection not available in text format
			};
		}

		// Handle verbose_json response format
		// Adjust timestamps based on chunk offset
		const segments = response.segments?.map(segment => ({
			text: segment.text,
			start: segment.start + chunk.startTime,
			end: segment.end + chunk.startTime,
			words: segment.words?.map(word => ({
				word: word.word,
				start: word.start + chunk.startTime,
				end: word.end + chunk.startTime
			}))
		}));

		const result = {
			id: chunk.id,
			text: response.text || '',
			startTime: chunk.startTime,
			endTime: chunk.endTime,
			success: true,
			segments,
			language: response.language
		};
		
		
		return result;
	}

	/**
	 * Test connection to OpenAI API
	 */
	async testConnection(): Promise<boolean> {
		try {
			await this.get('/models');
			return true;
		} catch (error) {
			this.logger.error('Whisper API connection test failed', error);
			return false;
		}
	}

	/**
	 * Get supported audio formats
	 */
	static getSupportedFormats(): string[] {
		return WHISPER_CONFIG.limitations.supportedFormats;
	}

	/**
	 * Get maximum file size in bytes
	 */
	static getMaxFileSize(): number {
		// Use configured value (25MB for Whisper)
		return WHISPER_CONFIG.limitations.maxFileSizeMB * 1024 * 1024;
	}
}
