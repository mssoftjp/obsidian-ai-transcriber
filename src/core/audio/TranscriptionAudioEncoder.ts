import { isAbortError, throwIfAborted, yieldToEventLoop } from '../utils/CooperativeTask';

import { assertRetainedChunkBytesWithinBudget } from './MediaWorkBudget';
import { encodePcmToWav } from './PcmWavEncoder';
import { muxOpusPacketsToWebm } from './WebmOpusMuxer';

import type { OpusPacket } from './WebmOpusMuxer';

const OPUS_BITRATE = 48_000;
const OPUS_FRAME_DURATION_MICROSECONDS = 20_000;
const MAX_ENCODER_QUEUE_SIZE = 20;

export interface TranscriptionAudioEncoding {
	data: ArrayBuffer;
	fileExtension: 'wav' | 'webm';
	mimeType: 'audio/wav' | 'audio/webm';
	codec: 'pcm' | 'opus';
}

export async function encodePcmForTranscription(
	pcmData: Float32Array,
	sampleRate: number,
	signal?: AbortSignal
): Promise<TranscriptionAudioEncoding> {
	throwIfAborted(signal);
	if (await supportsWebCodecsOpus(sampleRate)) {
		try {
			return await encodePcmToWebmOpus(pcmData, sampleRate, signal);
		} catch (error) {
			if (isAbortError(error, signal)) {
				throw error;
			}
		}
	}

	throwIfAborted(signal);
	const wavData = await encodePcmToWav(pcmData, sampleRate, signal);
	return {
		data: wavData,
		fileExtension: 'wav',
		mimeType: 'audio/wav',
		codec: 'pcm'
	};
}

export async function supportsWebCodecsOpus(sampleRate: number): Promise<boolean> {
	if (
		typeof AudioEncoder === 'undefined'
		|| typeof AudioData === 'undefined'
		|| !Number.isSafeInteger(sampleRate)
		|| sampleRate <= 0
	) {
		return false;
	}

	try {
		const support = await AudioEncoder.isConfigSupported(createEncoderConfig(sampleRate));
		return support.supported === true;
	} catch {
		return false;
	}
}

async function encodePcmToWebmOpus(
	pcmData: Float32Array,
	sampleRate: number,
	signal?: AbortSignal
): Promise<TranscriptionAudioEncoding> {
	throwIfAborted(signal);
	const frameSampleCount = sampleRate * OPUS_FRAME_DURATION_MICROSECONDS / 1_000_000;
	if (!Number.isSafeInteger(frameSampleCount) || frameSampleCount <= 0) {
		throw new RangeError('Sample rate cannot be represented as 20 ms Opus frames');
	}

	const packets: OpusPacket[] = [];
	let encoderError: unknown;
	const encoder = new AudioEncoder({
		output: chunk => {
			try {
				const data = new Uint8Array(chunk.byteLength);
				chunk.copyTo(data);
				packets.push({
					data,
					timestampMicroseconds: chunk.timestamp,
					durationMicroseconds: chunk.duration ?? OPUS_FRAME_DURATION_MICROSECONDS
				});
			} catch (error) {
				encoderError = error;
			}
		},
		error: error => {
			encoderError = error;
		}
	});

	try {
		encoder.configure(createEncoderConfig(sampleRate));
		for (let offset = 0; offset < pcmData.length; offset += frameSampleCount) {
			throwIfAborted(signal);
			while (encoder.encodeQueueSize > MAX_ENCODER_QUEUE_SIZE) {
				await yieldToEventLoop(signal);
			}

			const frameData = new Float32Array(frameSampleCount);
			frameData.set(pcmData.subarray(offset, Math.min(offset + frameSampleCount, pcmData.length)));
			const frame = new AudioData({
				format: 'f32-planar',
				sampleRate,
				numberOfFrames: frameSampleCount,
				numberOfChannels: 1,
				timestamp: Math.round(offset * 1_000_000 / sampleRate),
				data: frameData
			});
			try {
				encoder.encode(frame);
			} finally {
				frame.close();
			}
		}

		await encoder.flush();
		throwIfAborted(signal);
		if (encoderError) {
			throw toError(encoderError);
		}
		if (packets.length === 0) {
			throw new Error('Opus encoder produced no packets');
		}

		const durationMicroseconds = Math.max(1, Math.round(pcmData.length * 1_000_000 / sampleRate));
		const webm = muxOpusPacketsToWebm({
			packets,
			sampleRate,
			channelCount: 1,
			durationMicroseconds
		});
		assertRetainedChunkBytesWithinBudget(webm.byteLength);

		return {
			data: copyToArrayBuffer(webm),
			fileExtension: 'webm',
			mimeType: 'audio/webm',
			codec: 'opus'
		};
	} finally {
		if (encoder.state !== 'closed') {
			encoder.close();
		}
	}
}

function createEncoderConfig(sampleRate: number): AudioEncoderConfig {
	return {
		codec: 'opus',
		sampleRate,
		numberOfChannels: 1,
		bitrate: OPUS_BITRATE,
		bitrateMode: 'variable',
		opus: {
			format: 'opus',
			frameDuration: OPUS_FRAME_DURATION_MICROSECONDS,
			packetlossperc: 0,
			useinbandfec: false,
			usedtx: false
		}
	};
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

function toError(value: unknown): Error {
	return value instanceof Error ? value : new Error('Opus encoder failed');
}
