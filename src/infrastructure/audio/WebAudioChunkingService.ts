/**
 * Web Audio-based chunking service implementation
 * Creates audio chunks using Web Audio API
 */

import { assertRetainedChunkBytesWithinBudget } from '../../core/audio/MediaWorkBudget';
import { encodePcmForTranscription } from '../../core/audio/TranscriptionAudioEncoder';
import { ChunkingService } from '../../core/chunking/ChunkingService';
import { throwIfAborted } from '../../core/utils/CooperativeTask';

import type { ProcessedAudio, AudioChunk } from '../../core/audio/AudioTypes';
import type { ChunkStrategy, ChunkingConfig } from '../../core/chunking/ChunkingTypes';

export class WebAudioChunkingService extends ChunkingService {
	private preferredChunkDuration?: number;

	constructor(config: ChunkingConfig) {
		super(config);
	}

	/**
	 * Set preferred chunk duration from model config
	 */
	override setPreferredChunkDuration(duration: number): void {
		this.preferredChunkDuration = duration;
	}

	/**
	 * Calculate optimal chunk duration considering constraints and model preferences
	 * Priority: 1. Time constraint, 2. Size constraint, 3. Model preference
	 */
	protected override calculateOptimalChunkDuration(
		totalDuration: number,
		estimatedSizeMB: number,
		maxDuration: number,
		maxSizeMB: number
	): number {

		// Step 1: Check if we have a model-preferred duration
		if (this.preferredChunkDuration) {
			const preferredDuration = this.preferredChunkDuration;

			// Step 2: Check time constraint first
			if (preferredDuration > maxDuration) {
				return maxDuration;
			}

			// Step 3: Check size constraint
			const estimatedChunks = Math.ceil(totalDuration / preferredDuration);
			const estimatedChunkSizeMB = estimatedSizeMB / estimatedChunks;

			if (estimatedChunkSizeMB <= maxSizeMB) {
				return preferredDuration;
			}
			// Otherwise fall back to base calculation
		}

		// Step 4: Fallback to base constraint-based calculation
		return super.calculateOptimalChunkDuration(totalDuration, estimatedSizeMB, maxDuration, maxSizeMB);
	}

	/**
	 * Create chunks from processed audio
	 */
	override async createChunks(
		audio: ProcessedAudio,
		strategy: ChunkStrategy,
		signal?: AbortSignal
	): Promise<AudioChunk[]> {
		throwIfAborted(signal);
		if (!strategy.needsChunking) {
			return [await this.createSingleChunk(audio, signal)];
		}

		// Calculate chunk parameters
		const sampleRate = audio.sampleRate;
		const samplesPerChunk = Math.floor(strategy.chunkDuration * sampleRate);
		const overlapSamples = Math.floor(strategy.overlapDuration * sampleRate);
		const stepSamples = samplesPerChunk - overlapSamples;

		// Find natural boundaries if enabled
		const chunkStarts = this.calculateChunkStarts(
			audio.pcmData.length,
			samplesPerChunk,
			stepSamples,
			strategy.totalChunks
		);

		const boundaries = await this.findNaturalBoundaries(
			audio,
			chunkStarts.map(s => s / sampleRate),
			signal
		);
		throwIfAborted(signal);

		// Create chunks
		const chunks: AudioChunk[] = [];
		let retainedChunkBytes = 0;

		for (let i = 0; i < boundaries.length; i++) {
			throwIfAborted(signal);
			const boundary = boundaries[i] ?? 0;
			const nextBoundary = boundaries[i + 1] ?? boundary;
			const startSample = Math.floor(boundary * sampleRate);
			const endSample = i < boundaries.length - 1
				? Math.floor(nextBoundary * sampleRate) + overlapSamples
				: audio.pcmData.length;

			// Skip if chunk would be empty or too small
			if (endSample <= startSample) {
				continue;
			}

			// Extract chunk PCM data
			const chunkPcm = audio.pcmData.subarray(startSample, endSample);

			// Skip if chunk is too small (less than 0.1 seconds)
			const chunkDuration = (endSample - startSample) / sampleRate;
			if (chunkDuration < 0.1) {
				continue;
			}

			const encoding = await encodePcmForTranscription(chunkPcm, sampleRate, signal);
			retainedChunkBytes += encoding.data.byteLength;
			assertRetainedChunkBytesWithinBudget(retainedChunkBytes);

			// Calculate timing
			const startTime = startSample / sampleRate;
			const endTime = endSample / sampleRate;
			const hasOverlap = i < boundaries.length - 1;
			const overlapDuration = hasOverlap ? strategy.overlapDuration : 0;

			chunks.push({
				id: chunks.length, // Use actual chunk count, not loop index
				data: encoding.data,
				fileExtension: encoding.fileExtension,
				mimeType: encoding.mimeType,
				codec: encoding.codec,
				startTime,
				endTime,
				hasOverlap,
				overlapDuration
			});

		}

		return chunks;
	}

	/**
	 * Calculate chunk start positions
	 */
	private calculateChunkStarts(
		totalSamples: number,
		samplesPerChunk: number,
		stepSamples: number,
		expectedChunks: number
	): number[] {
		const starts: number[] = [0];
		let currentSample = 0;

		while (currentSample + samplesPerChunk < totalSamples && starts.length < expectedChunks) {
			currentSample += stepSamples;
			starts.push(currentSample);
		}

		// Adjust last chunk if necessary
		if (starts.length > expectedChunks) {
			starts.pop();
		}

		return starts;
	}

	/**
	 * Create a single chunk from all audio
	 */
	private async createSingleChunk(audio: ProcessedAudio, signal?: AbortSignal): Promise<AudioChunk> {
		const encoding = await encodePcmForTranscription(audio.pcmData, audio.sampleRate, signal);
		assertRetainedChunkBytesWithinBudget(encoding.data.byteLength);

		return {
			id: 0,
			data: encoding.data,
			fileExtension: encoding.fileExtension,
			mimeType: encoding.mimeType,
			codec: encoding.codec,
			startTime: 0,
			endTime: audio.duration,
			hasOverlap: false,
			overlapDuration: 0
		};
	}

}
