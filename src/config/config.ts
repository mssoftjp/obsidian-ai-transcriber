/**
 * Configuration Module Entry Point
 * Centralized access to all configuration types and functions
 *
 * File Structure:
 * - TranscriptionModelProfiles.ts → Canonical transcription model metadata and routing
 * - openai/                   → OpenAI API configurations (modular)
 *   - WhisperConfig.ts        → Whisper API configuration
 *   - GPT4oTranscribeConfig.ts → OpenAI file-transcription request configuration
 *   - RealtimeApiConfig.ts    → Separate Realtime WebSocket configuration
 *   - index.ts                → OpenAI config index
 * - ModelProcessingConfig.ts  → Shared audio-processing presets
 * - ModelCleaningConfig.ts    → Shared transcript-cleaning presets
 * - constants.ts              → Common constants
 * - config.ts (this file)     → Unified exports for all configuration modules
 *
 * Usage:
 * import { getModelConfig, WHISPER_CONFIG } from '../config/config';
 */

export * from './ModelProcessingConfig';
export * from './TranscriptionModelProfiles';
export * from './constants';

// Export all OpenAI configurations
export * from './openai/index';
