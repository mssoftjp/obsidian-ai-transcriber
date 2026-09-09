/**
 * Fallback audio engine for when Web Audio API is not available
 * Simple implementation that works with pre-chunked files
 */

import { getModelConfig } from '../../config/ModelProcessingConfig';
import { AudioProcessor } from '../../core/audio/AudioProcessor';

import type {
	AudioInput,
	ProcessedAudio,
	AudioValidationResult,
	AudioProcessingConfig,
	AudioProcessingOptions
} from '../../core/audio/AudioTypes';

interface WavMetadata {
	sampleRate: number;
	bitsPerSample: 8 | 16;
	channels: number;
	dataOffset: number;
	dataSize: number;
	samplesPerChannel: number;
	duration: number;
}

export class FallbackEngine extends AudioProcessor {
	constructor(config: AudioProcessingConfig) {
		super(config);
		this.logger.warn('Using fallback audio processor - limited functionality');
	}

	/**
	 * Validate audio input
	 */
	validate(input: AudioInput): Promise<AudioValidationResult> {
		const validation: AudioValidationResult = {
			isValid: true,
			warnings: []
		};

		// More restrictive for fallback
		const maxSizeMB = 25; // Match API limits
		const sizeMB = input.size / (1024 * 1024);

		if (sizeMB > maxSizeMB) {
			validation.isValid = false;
			validation.error = `File size ${sizeMB.toFixed(1)}MB exceeds maximum ${maxSizeMB}MB for fallback processor`;
			return Promise.resolve(validation);
		}

		// Only support WAV in fallback mode
		if (input.extension.toLowerCase() !== 'wav') {
			validation.isValid = false;
			validation.error = `Fallback processor only supports WAV format, got '${input.extension}'`;
			return Promise.resolve(validation);
		}

		let metadata: WavMetadata;
		try {
			metadata = this.readWavMetadata(input.data);
		} catch (error) {
			validation.isValid = false;
			validation.error = error instanceof Error ? error.message : 'Invalid WAV file format';
			return Promise.resolve(validation);
		}
		const { sampleRate, bitsPerSample, channels, duration } = metadata;

		validation.properties = {
			format: 'wav',
			duration,
			sampleRate,
			channels,
			bitrate: sampleRate * channels * bitsPerSample
		};

		// Warnings for non-optimal settings
		if (sampleRate !== this.config.targetSampleRate) {
			validation.warnings ??= [];
			validation.warnings.push(`Sample rate ${sampleRate}Hz will be passed as-is (no resampling in fallback mode)`);
		}
		if (channels !== 1) {
			validation.warnings ??= [];
			validation.warnings.push(`${channels} channels detected (fallback mode does not support mixing to mono)`);
		}

		return Promise.resolve(validation);
	}

	/**
	 * Decode audio - in fallback mode, just parse WAV header
	 */
	decode(input: AudioInput): Promise<AudioBuffer> {
		const metadata = this.readWavMetadata(input.data);
		const { sampleRate, channels, bitsPerSample, samplesPerChannel, duration, dataOffset } = metadata;
		const view = new DataView(input.data);
		const bytesPerSample = bitsPerSample / 8;

		// Create pseudo AudioBuffer
		const audioBuffer = {
			sampleRate,
			length: samplesPerChannel,
			duration,
			numberOfChannels: channels,
			getChannelData: (channel: number) => {
				// Extract channel data from interleaved WAV data
				const channelData = new Float32Array(samplesPerChannel);
				for (let i = 0; i < samplesPerChannel; i++) {
					const sampleOffset = dataOffset + (i * channels + channel) * bytesPerSample;

					if (bitsPerSample === 16) {
						const sample = view.getInt16(sampleOffset, true) / 32768;
						channelData[i] = sample;
					} else {
						const sample = (view.getUint8(sampleOffset) - 128) / 128;
						channelData[i] = sample;
					}
				}

				return channelData;
			}
		} as unknown as AudioBuffer;


		return Promise.resolve(audioBuffer);
	}

	/**
	 * Convert to target format - limited in fallback mode
	 */
	convertToTargetFormat(
		audioBuffer: AudioBuffer,
		options: AudioProcessingOptions = {}
	): Promise<ProcessedAudio> {
		// In fallback mode, we can't resample, so just extract the data
		const start = Math.max(0, Math.min(options.startTime ?? 0, audioBuffer.duration));
		const end = Math.max(start, Math.min(options.endTime ?? audioBuffer.duration, audioBuffer.duration));
		if (end <= start) {
			throw new Error('Selected audio time range is empty');
		}
		const startFrame = Math.floor(start * audioBuffer.sampleRate);
		const endFrame = Math.min(audioBuffer.length, Math.ceil(end * audioBuffer.sampleRate));
		const pcmData = audioBuffer.getChannelData(0).subarray(startFrame, endFrame);

		if (audioBuffer.sampleRate !== this.config.targetSampleRate) {
			this.logger.warn('Cannot resample audio in fallback mode', {
				from: audioBuffer.sampleRate,
				to: this.config.targetSampleRate
			});
		}

		if (audioBuffer.numberOfChannels > 1) {
			this.logger.warn('Cannot mix channels to mono in fallback mode', {
				channels: audioBuffer.numberOfChannels
			});
		}

		return Promise.resolve({
			pcmData: new Float32Array(pcmData), // Make a copy
			sampleRate: audioBuffer.sampleRate, // Keep original sample rate
			duration: pcmData.length / audioBuffer.sampleRate,
			channels: 1
		});
	}

	/**
	 * Preprocess - not supported in fallback mode
	 */
	preprocess(audio: ProcessedAudio): Promise<ProcessedAudio> {
		if (this.config.enableVAD) {
			this.logger.warn('VAD preprocessing not supported in fallback mode');
		}
		return Promise.resolve(audio);
	}

	/**
	 * Get engine capabilities
	 */
	getCapabilities(): {
		supportsResampling: boolean;
		supportsVAD: boolean;
		maxChannels: number;
		supportedFormats: string[];
		} {
		return {
			supportsResampling: false,
			supportsVAD: false,
			maxChannels: 2,
			supportedFormats: ['wav']
		};
	}

	/**
	 * Check if fallback engine can handle the input
	 */
	static canHandle(input: AudioInput): boolean {
		// デフォルトでWhisperモデルの制限を使用（最も一般的なケース）
		const whisperConfig = getModelConfig('whisper-1');
		const maxSizeBytes = whisperConfig.maxFileSizeMB * 1024 * 1024;

		return input.extension.toLowerCase() === 'wav' &&
		       input.size < maxSizeBytes;
	}

	private readWavMetadata(data: ArrayBuffer): WavMetadata {
		if (data.byteLength < 44) {
			throw new Error('WAV header is truncated');
		}
		const view = new DataView(data);
		const readTag = (offset: number) => String.fromCharCode(
			view.getUint8(offset),
			view.getUint8(offset + 1),
			view.getUint8(offset + 2),
			view.getUint8(offset + 3)
		);
		if (readTag(0) !== 'RIFF' || readTag(8) !== 'WAVE') {
			throw new Error('Invalid WAV file format');
		}
		const riffEnd = view.getUint32(4, true) + 8;
		if (!Number.isSafeInteger(riffEnd) || riffEnd > data.byteLength) {
			throw new Error('WAV RIFF chunk exceeds the file size');
		}

		let audioFormat: number | undefined;
		let channels: number | undefined;
		let sampleRate: number | undefined;
		let bits: number | undefined;
		let dataOffset: number | undefined;
		let dataSize: number | undefined;
		let offset = 12;
		while (offset + 8 <= riffEnd) {
			const chunkId = readTag(offset);
			const chunkSize = view.getUint32(offset + 4, true);
			const chunkDataOffset = offset + 8;
			const chunkEnd = chunkDataOffset + chunkSize;
			if (!Number.isSafeInteger(chunkEnd) || chunkEnd > riffEnd) {
				throw new Error(`WAV ${chunkId} chunk exceeds the file size`);
			}
			if (chunkId === 'fmt ') {
				if (chunkSize < 16) {
					throw new Error('WAV fmt chunk is truncated');
				}
				audioFormat = view.getUint16(chunkDataOffset, true);
				channels = view.getUint16(chunkDataOffset + 2, true);
				sampleRate = view.getUint32(chunkDataOffset + 4, true);
				bits = view.getUint16(chunkDataOffset + 14, true);
			} else if (chunkId === 'data' && dataOffset === undefined) {
				dataOffset = chunkDataOffset;
				dataSize = chunkSize;
			}
			offset = chunkEnd + (chunkSize % 2);
		}

		if (audioFormat === undefined || channels === undefined || sampleRate === undefined
			|| bits === undefined || dataOffset === undefined || dataSize === undefined) {
			throw new Error('WAV fmt or data chunk is missing');
		}
		if (audioFormat !== 1 || (bits !== 8 && bits !== 16)) {
			throw new Error('Fallback processor supports only 8-bit or 16-bit PCM WAV');
		}
		if (channels < 1 || channels > 2 || sampleRate < 8_000 || sampleRate > 192_000) {
			throw new Error('WAV channel count or sample rate is invalid');
		}
		const bitsPerSample = bits;
		const bytesPerFrame = channels * (bitsPerSample / 8);
		if (dataSize % bytesPerFrame !== 0) {
			throw new Error('WAV data chunk is not frame-aligned');
		}
		const samplesPerChannel = dataSize / bytesPerFrame;
		return {
			sampleRate,
			bitsPerSample,
			channels,
			dataOffset,
			dataSize,
			samplesPerChannel,
			duration: samplesPerChannel / sampleRate
		};
	}
}
