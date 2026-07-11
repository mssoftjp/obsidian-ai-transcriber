
import { AUDIO_CONSTANTS } from '../../config/constants';
import { getModelConfig } from '../../config/ModelProcessingConfig';
import { encodePcmForTranscription } from '../../core/audio/TranscriptionAudioEncoder';
import { isAbortError, throwIfAborted, yieldToEventLoop } from '../../core/utils/CooperativeTask';

import { WebRTCVADProcessor } from './WebrtcVadProcessor';

import type { AudioChunk } from '../../core/audio/AudioTypes';
import type { ChunkingConfig } from '../../core/chunking/ChunkingTypes';
import type { VADConfig } from '../VadTypes';
import type { App } from 'obsidian';

/**
 * Chunk information during VAD processing
 */
interface ChunkInfo {
	startTime: number;
	endTime: number;
}

/**
 * VAD-based chunking processor
 * Integrates WebRTC VAD with chunk generation in a single pass
 */
export class VADChunkingProcessor extends WebRTCVADProcessor {
	private minChunkDuration: number;
	private maxChunkDuration: number;
	private preferredChunkDuration: number;
	private overlapDuration: number;
	private minSilenceForSplit: number;
	private forceSplitAfterExtra: number;
	private minChunkSize: number;

	constructor(
		app: App,
		vadConfig: VADConfig,
		chunkingConfig: ChunkingConfig,
		pluginId?: string
	) {
		super(app, vadConfig, pluginId);

		// Get model name from chunking config
		const modelName = chunkingConfig.modelName;
		if (!modelName) {
			throw new Error('[VADChunkingProcessor] Model name is required in chunkingConfig');
		}
		const modelConfig = getModelConfig(modelName);

		// Use model-specific VAD settings (required)
		const vadChunkingConfig = modelConfig.vadChunking;

		// Set chunk duration parameters
		this.minChunkDuration = vadChunkingConfig.minChunkDuration;
		this.maxChunkDuration = vadChunkingConfig.maxChunkDuration;
		this.preferredChunkDuration = chunkingConfig.constraints.chunkDurationSeconds;
		this.overlapDuration = chunkingConfig.constraints.recommendedOverlapSeconds;

		// Set VAD chunking parameters
		this.minSilenceForSplit = vadChunkingConfig.minSilenceForSplit;
		this.forceSplitAfterExtra = vadChunkingConfig.forceSplitAfterExtra;
		this.minChunkSize = vadChunkingConfig.minChunkSize;

		// Log configuration for debugging
	}

	/**
	 * Process audio and create chunks in a single pass
	 */
	async processAudioWithChunking(
		audioData: Float32Array,
		sampleRate: number,
		signal?: AbortSignal
	): Promise<{ chunks: AudioChunk[] }> {
		if (!this.available || !this.vadInstance || !this.bufferPtr) {
			throw new Error('VAD not initialized');
		}

		try {
			throwIfAborted(signal);
			// 1. Resample if needed (to 16kHz for VAD)
			let processData = audioData;
			let vadSampleRate = sampleRate;
			if (sampleRate !== AUDIO_CONSTANTS.SAMPLE_RATE) {
				processData = await this.resampleTo16kHz(audioData, sampleRate, signal);
				vadSampleRate = AUDIO_CONSTANTS.SAMPLE_RATE;
			}

			// 2. Convert to Int16 for VAD
			const int16Data = await this.convertFloat32ToInt16(processData, signal);

			// 3. Use VAD decisions to create transcription chunks
			const chunks = await this.createChunksFromVadFrames(
				int16Data,
				audioData,
				vadSampleRate,
				sampleRate,
				signal
			);

			return { chunks };
		} catch (error) {
			if (isAbortError(error, signal)) {
				throw error;
			}
			this.logger.error('Processing error', error);
			throw error;
		}
	}

	/**
	 * Create chunks from VAD frame decisions in a single pass
	 */
	private async createChunksFromVadFrames(
		int16Data: Int16Array,
		originalAudio: Float32Array,
		vadSampleRate: number,
		originalSampleRate: number,
		signal?: AbortSignal
	): Promise<AudioChunk[]> {
		const fvadModule = this.fvadModule;
		const vadInstance = this.vadInstance;
		const bufferPtr = this.bufferPtr;
		if (!this.available || !fvadModule || !vadInstance || bufferPtr === null) {
			throw new Error('VAD not initialized');
		}

		const chunks: AudioChunk[] = [];

		let currentChunk: ChunkInfo | null = null;

		// Frame processing variables
		const totalFrames = Math.floor(int16Data.length / this.frameSize);
		const frameDuration = this.frameSize / vadSampleRate; // 30ms per frame

		// Chunk management variables
		let lastChunkEndTime = 0;
		let consecutiveSilenceTime = 0;

		for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
			if (frameIndex > 0 && frameIndex % 256 === 0) {
				await yieldToEventLoop(signal);
			}
			const offset = frameIndex * this.frameSize;
			const frameTime = offset / vadSampleRate;

			// Copy frame data to WASM memory
			const frame = int16Data.subarray(offset, offset + this.frameSize);
			fvadModule.HEAP16.set(frame, bufferPtr >> 1);

			// VAD processing
			const isSpeech = fvadModule._fvad_process(
				vadInstance,
				bufferPtr,
				this.frameSize
			);

			if (isSpeech < 0) {
				this.logger.warn('Frame processing error', { frameIndex });
				continue;
			}

			if (isSpeech === 1) {
				consecutiveSilenceTime = 0;
			} else {
				consecutiveSilenceTime += frameDuration;
			}

			// Chunk creation logic
			// Start new chunk (if needed)
			currentChunk ??= this.createNewChunk(frameTime, frameIndex, lastChunkEndTime);

			currentChunk.endTime = frameTime + frameDuration;

			// Check if we should finalize the chunk
			const chunkDuration = currentChunk.endTime - currentChunk.startTime;
			const shouldSplit = this.shouldSplitChunk(
				chunkDuration,
				consecutiveSilenceTime,
				isSpeech === 1,
				frameIndex === totalFrames - 1
			);

			if (shouldSplit) {
				// Finalize current chunk
				const finalizedChunk = await this.finalizeChunk(
					currentChunk,
					chunks.length,
					originalAudio,
					originalSampleRate,
					lastChunkEndTime,
					signal
				);

				if (finalizedChunk) {
					chunks.push(finalizedChunk);
					lastChunkEndTime = currentChunk.endTime - this.overlapDuration;
				}

				currentChunk = null;
			}
		}

		// Handle last chunk
		if (currentChunk && currentChunk.endTime > currentChunk.startTime) {
			const finalizedChunk = await this.finalizeChunk(
				currentChunk,
				chunks.length,
				originalAudio,
				originalSampleRate,
				lastChunkEndTime,
				signal
			);
			if (finalizedChunk) {
				chunks.push(finalizedChunk);
			}
		}

		throwIfAborted(signal);
		return chunks;
	}

	/**
	 * Determine if we should split at current position
	 */
	private shouldSplitChunk(
		currentDuration: number,
		consecutiveSilenceTime: number,
		isCurrentFrameSpeech: boolean,
		isLastFrame: boolean
	): boolean {
		// Always split at the last frame
		if (isLastFrame) {
			return true;
		}

		// Must split if we've reached maximum duration
		if (currentDuration >= this.maxChunkDuration) {
			return true;
		}

		// Don't split if we haven't reached minimum duration
		if (currentDuration < this.minChunkDuration) {
			return false;
		}

		// If we're past preferred duration and found significant silence, split
		if (currentDuration >= this.preferredChunkDuration &&
		    consecutiveSilenceTime >= this.minSilenceForSplit &&
		    !isCurrentFrameSpeech) {
			return true;
		}

		// If we're way past preferred duration and found any silence, split
		if (currentDuration >= this.preferredChunkDuration + this.forceSplitAfterExtra &&
		    consecutiveSilenceTime > this.minSilenceForSplit / 5 && // 20% of minSilenceForSplit
		    !isCurrentFrameSpeech) {
			return true;
		}

		return false;
	}

	/**
	 * Create a new chunk info object
	 */
	private createNewChunk(startTime: number, frameIndex: number, lastChunkEndTime: number): ChunkInfo {
		// Add overlap from previous chunk if not the first chunk
		const actualStartTime = frameIndex === 0 ? startTime : lastChunkEndTime;

		return {
			startTime: actualStartTime,
			endTime: startTime
		};
	}

	/**
	 * Finalize a chunk and prepare it for output
	 */
	private async finalizeChunk(
		chunkInfo: ChunkInfo,
		chunkId: number,
		originalAudio: Float32Array,
		sampleRate: number,
		lastChunkEndTime: number,
		signal?: AbortSignal
	): Promise<AudioChunk | null> {
		throwIfAborted(signal);
		// Calculate actual samples from original audio
		const startSample = Math.floor(chunkInfo.startTime * sampleRate);
		const endSample = Math.min(
			originalAudio.length,
			Math.floor(chunkInfo.endTime * sampleRate)
		);

		// Extract chunk audio
		const chunkAudio = originalAudio.subarray(startSample, endSample);

		// Skip if too small
		if (chunkAudio.length < sampleRate * this.minChunkSize) {
			return null;
		}

		const encoding = await encodePcmForTranscription(chunkAudio, sampleRate, signal);

		// Determine if this chunk has overlap with next
		const hasOverlap = chunkInfo.endTime > lastChunkEndTime + this.overlapDuration;

		return {
			id: chunkId,
			data: encoding.data,
			fileExtension: encoding.fileExtension,
			mimeType: encoding.mimeType,
			codec: encoding.codec,
			startTime: chunkInfo.startTime,
			endTime: chunkInfo.endTime,
			hasOverlap,
			overlapDuration: hasOverlap ? this.overlapDuration : 0
		};
	}
}
