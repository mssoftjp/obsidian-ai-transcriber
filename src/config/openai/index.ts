/**
 * OpenAI Configuration Index
 * Central export point for all OpenAI API configurations
 */

import {
	TRANSCRIPTION_MODEL_PROFILES,
	getTranscriptionModelProfile
} from '../TranscriptionModelProfiles';

// Whisper API (Traditional transcription)
export * from './WhisperConfig';

// GPT-4o Transcribe API (New transcription models)
export * from './GPT4oTranscribeConfig';

// Realtime API (WebSocket streaming)
export * from './RealtimeApiConfig';

// Post-processing configuration
export * from './PostProcessingConfig';

// Common types and utilities
export interface OpenAIModel {
	id: string;
	type: 'transcription' | 'chat' | 'realtime';
	displayName: string;
	endpoint: string;
	costPerMinute?: number;
}

/**
 * Get all available OpenAI models
 */
export function getAvailableModels(): OpenAIModel[] {
	return TRANSCRIPTION_MODEL_PROFILES.map(profile => ({
		id: profile.id,
		type: 'transcription',
		displayName: profile.displayName,
		endpoint: 'https://api.openai.com/v1/audio/transcriptions',
		costPerMinute: profile.pricing.costPerMinute
	}));
}

/**
 * Determine which OpenAI configuration to use based on model ID
 */
export function getOpenAIModelConfig(modelId: string) {
	const profile = getTranscriptionModelProfile(modelId);
	switch (profile.workflow) {
	case 'whisper':
		return { type: 'whisper', module: 'whisper.config' };
	case 'openai-file':
		return { type: 'gpt4o-transcribe', module: 'gpt4o-transcribe.config' };
	}
}

/**
 * Common request configuration
 */
export interface RequestConfig {
	timeout: number;
	maxRetries: number;
	retryDelayMs: number;
	maxRetryDelayMs: number;
}

export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
	timeout: 300000, // 5 minutes
	maxRetries: 3,
	retryDelayMs: 1000,
	maxRetryDelayMs: 30000
};
