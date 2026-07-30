/**
 * OpenAI GPT-4o Audio API client implementation
 * Handles GPT-4o-specific API calls with context preservation
 */

import {
	GPT4O_TRANSCRIBE_CONFIG,
	buildGPT4oTranscribeRequest
} from '../../../config/openai/GPT4oTranscribeConfig';
import { DEFAULT_REQUEST_CONFIG } from '../../../config/openai/index';
import { getTranscriptionModelProfile } from '../../../config/TranscriptionModelProfiles';
import { Logger } from '../../../utils/Logger';
import { ApiClient } from '../ApiClient';

import { extractTranscriptFromTagWrapper } from './TranscriptTagExtractor';

import type {
	GPT4oTranscribeParams,
	GPT4oTranscribeRequestPayload
} from '../../../config/openai/GPT4oTranscribeConfig';
import type { OpenAIFileTranscriptionModel } from '../../../config/TranscriptionModelProfiles';
import type { AudioChunk } from '../../../core/audio/AudioTypes';
import type {
	TranscriptionResult,
	TranscriptionOptions,
	ModelSpecificOptions
} from '../../../core/transcription/TranscriptionTypes';

interface GPT4oResponse {
	text: string;
	languages?: string[];
	// GPT-4o doesn't provide detailed segment info in basic JSON format
}

export class GPT4oClient extends ApiClient {
	private readonly model: OpenAIFileTranscriptionModel;

	constructor(apiKey: string, model: string) {
		const profile = getTranscriptionModelProfile(model);
		if (profile.workflow !== 'openai-file') {
			throw new Error(
				`[GPT4oClient] Model "${model}" does not use the OpenAI file transcription workflow`
			);
		}
		const baseUrl = GPT4O_TRANSCRIBE_CONFIG.endpoint.split('/audio')[0] ?? GPT4O_TRANSCRIBE_CONFIG.endpoint;
		super({
			baseUrl, // Extract base URL
			apiKey,
			timeout: DEFAULT_REQUEST_CONFIG.timeout,
			maxRetries: 0,
			retryDelay: DEFAULT_REQUEST_CONFIG.retryDelayMs
		});

		this.model = profile.id;
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
		const fileExtension = chunk.fileExtension ?? 'wav';
		const mimeType = chunk.mimeType ?? 'audio/wav';
		const fileName = `chunk_${chunk.id}.${fileExtension}`;
		const file = new File([chunk.data], fileName, { type: mimeType });
		return await this.executeTranscription(file, chunk, options, modelOptions);
	}

	async transcribeFile(
		data: ArrayBuffer,
		fileName: string,
		mimeType: string,
		options: TranscriptionOptions
	): Promise<TranscriptionResult> {
		const file = new File([data], fileName, { type: mimeType });
		const chunk: AudioChunk = {
			id: 0,
			data,
			startTime: 0,
			endTime: 0,
			hasOverlap: false,
			overlapDuration: 0
		};
		return await this.executeTranscription(file, chunk, options);
	}

	private async executeTranscription(
		file: File,
		chunk: AudioChunk,
		options: TranscriptionOptions,
		modelOptions?: ModelSpecificOptions
	): Promise<TranscriptionResult> {
		const formData = new FormData();
		formData.append('file', file);
		const customPrompt = modelOptions?.gpt4o?.customPrompt;
		const requestInput: Partial<GPT4oTranscribeParams> = {
			model: this.model,
			response_format: 'json',
			language: options.language === 'auto' ? 'auto' : options.language,
			stream: false
		};
		if (customPrompt) {
			requestInput.prompt = customPrompt;
		}
		const previousContext = modelOptions?.gpt4o?.previousContext;
		if (previousContext) {
			requestInput.previousContext = previousContext;
		}
		const requestParams = buildGPT4oTranscribeRequest(requestInput, chunk.id === 0 && !previousContext);
		this.appendRequestParams(formData, requestParams);

		try {
			const startTime = performance.now();
			this.logger.debug('Sending request to GPT-4o API', {
				chunkId: chunk.id,
				model: this.model,
				hasCustomPrompt: Boolean(customPrompt)
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
			if (options.signal?.aborted) {
				throw error;
			}
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

	private appendRequestParams(
		formData: FormData,
		params: GPT4oTranscribeRequestPayload
	): void {
		formData.append('model', params.model);
		formData.append('temperature', String(params.temperature));
		if (params.response_format !== undefined) {
			formData.append('response_format', params.response_format);
		}
		if (params.language !== undefined) {
			formData.append('language', params.language);
		}
		params.languages?.forEach((language) => {
			formData.append('languages[]', language);
		});
		if (params.prompt !== undefined) {
			formData.append('prompt', params.prompt);
		}
		if (params.stream !== undefined) {
			formData.append('stream', String(params.stream));
		}
		if (params.include !== undefined) {
			formData.append('include', params.include.join(','));
		}
	}


	/**
	 * Parse GPT-4o API response
	 */
			private parseResponse(response: GPT4oResponse, chunk: AudioChunk): TranscriptionResult {
				let text = response.text || '';

				const extraction = extractTranscriptFromTagWrapper(text);
				text = extraction.extractedText;

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
				hasTranscriptTags: extraction.hadTranscriptTags,
				transcriptTagMode: extraction.mode
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
