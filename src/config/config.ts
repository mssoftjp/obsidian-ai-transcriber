/**
 * Configuration Module Entry Point
 * Centralized access to all configuration types and functions
 *
 * File Structure:
 * - openai/                   → OpenAI API configurations (modular)
 *   - whisper.config.ts       → Whisper API configuration
 *   - gpt4o-transcribe.config.ts → GPT-4o Transcribe API configuration
 *   - gpt4o-chat-audio.config.ts → GPT-4o Chat Audio API configuration
 *   - realtime-api.config.ts  → Realtime WebSocket API configuration
 *   - index.ts                → OpenAI config index
 * - model-processing.config.ts → Audio processing parameters for different AI models
 * - constants.ts              → Common constants
 * - config.ts (this file)     → Unified exports for all configuration modules
 *
 * Usage:
 * import { getModelConfig, WHISPER_CONFIG } from '../config/config';
 */

export * from './ModelProcessingConfig';
export * from './constants';

// Export all OpenAI configurations
export * from './openai/index';