/**
 * OpenAI GPT-4o Audio API client implementation
 * Handles GPT-4o-specific API calls with context preservation
 */

import { ApiClient } from '../ApiClient';
import { AudioChunk } from '../../../core/audio/AudioTypes';
import {
	TranscriptionResult,
	TranscriptionOptions,
	ModelSpecificOptions
} from '../../../core/transcription/TranscriptionTypes';
import {
	GPT4O_TRANSCRIBE_CONFIG,
	buildGPT4oTranscribeRequest,
	GPT4oTranscribeRequestPayload
} from '../../../config/openai/GPT4oTranscribeConfig';
import { DEFAULT_REQUEST_CONFIG } from '../../../config/openai/index';
import { Logger } from '../../../utils/Logger';

interface GPT4oResponse {
	text: string;
	// GPT-4o doesn't provide detailed segment info in basic JSON format
}

export class GPT4oClient extends ApiClient {
	private readonly supportedModels = Object.keys(GPT4O_TRANSCRIBE_CONFIG.models);

	// Model name mapping
	private readonly modelMapping: Record<string, string> = {
		'gpt-4o-transcribe': 'gpt-4o-transcribe',
		'gpt-4o-mini-transcribe': 'gpt-4o-mini-transcribe'
	};

	constructor(apiKey: string, private model: string) {
		super({
			baseUrl: GPT4O_TRANSCRIBE_CONFIG.endpoint.split('/audio')[0], // Extract base URL
			apiKey,
			timeout: DEFAULT_REQUEST_CONFIG.timeout,
			maxRetries: DEFAULT_REQUEST_CONFIG.maxRetries,
			retryDelay: DEFAULT_REQUEST_CONFIG.retryDelayMs
		});

		// Map model name if needed
		this.model = this.modelMapping[model] || model;

		if (!this.supportedModels.includes(this.model)) {
			throw new Error(`Unsupported GPT-4o model: ${model} (mapped to: ${this.model})`);
		}

		this.logger = Logger.getLogger('GPT4oClient');
	}

	/**
	 * Transcribe audio chunk using GPT-4o API
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

		// Use custom prompt if provided, otherwise let buildGPT4oTranscribeRequest handle it
		const customPrompt = modelOptions?.gpt4o?.customPrompt;


		// Build request parameters using the new config
		const requestParams = buildGPT4oTranscribeRequest({
			model: this.model as 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe',
			response_format: 'json', // GPT-4o only supports json/text
			language: options.language === 'auto' ? 'auto' : options.language,
			prompt: customPrompt || undefined,
			previousContext: modelOptions?.gpt4o?.previousContext,
			stream: false // No streaming for now
		}, chunk.id === 0 && !modelOptions?.gpt4o?.previousContext);

		// Append all parameters to FormData
		const paramEntries = Object.entries(requestParams) as Array<
			[keyof GPT4oTranscribeRequestPayload, GPT4oTranscribeRequestPayload[keyof GPT4oTranscribeRequestPayload]]
		>;
		paramEntries.forEach(([key, value]) => {
			if (value === undefined) {
				return;
			}
			const serialized = Array.isArray(value) ? value.join(',') : String(value);
			formData.append(key, serialized);
		});

		try {
			const startTime = performance.now();
			this.logger.debug('Sending request to GPT-4o API', {
				chunkId: chunk.id,
				model: this.model,
				hasCustomPrompt: !!customPrompt
			});

			const response = await this.post<GPT4oResponse>(
				'/audio/transcriptions',
				formData,
				{},
				options.signal
			);

			const elapsedTime = performance.now() - startTime;
			this.logger.debug('GPT-4o API response received', {
				chunkId: chunk.id,
				elapsedTime: `${elapsedTime.toFixed(2)}ms`
			});

			return this.parseResponse(response, chunk);

		} catch (error) {
			this.logger.error('GPT-4o transcription failed', {
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
	 * Parse GPT-4o API response
	 */
	private parseResponse(response: GPT4oResponse, chunk: AudioChunk): TranscriptionResult {
		let text = response.text || '';

		// Extract content from <TRANSCRIPT> tags if present
		const transcriptMatch = text.match(/<TRANSCRIPT>([\s\S]*?)<\/TRANSCRIPT>/);
		if (transcriptMatch) {
			this.logger.trace('Extracted text from TRANSCRIPT tags', { chunkId: chunk.id });
			text = transcriptMatch[1].trim();
		}

		const result = {
			id: chunk.id,
			text: text,
			startTime: chunk.startTime,
			endTime: chunk.endTime,
			success: true
			// GPT-4o doesn't provide segments in basic JSON format
		};

		this.logger.debug('GPT-4o response parsed', {
			chunkId: chunk.id,
			textLength: result.text.length,
			hasTranscriptTags: !!transcriptMatch
		});

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
			this.logger.error('GPT-4o API connection test failed', error);
			return false;
		}
	}

	/**
	 * Get maximum file size in bytes
	 */
	static getMaxFileSize(): number {
		// Use configured value (25MB for GPT-4o Transcribe)
		return GPT4O_TRANSCRIBE_CONFIG.limitations.maxFileSizeMB * 1024 * 1024;
	}

	/**
	 * Get maximum audio duration in seconds
	 */
	static getMaxDuration(): number {
		return GPT4O_TRANSCRIBE_CONFIG.limitations.maxDurationMinutes * 60;
	}
}
