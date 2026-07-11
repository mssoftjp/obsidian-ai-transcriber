import { COOPERATIVE_BATCH_SIZE, throwIfAborted, yieldToEventLoop } from '../utils/CooperativeTask';

import { assertRetainedChunkBytesWithinBudget } from './MediaWorkBudget';

const WAV_HEADER_BYTES = 44;
const PCM_BYTES_PER_SAMPLE = Int16Array.BYTES_PER_ELEMENT;

export function calculatePcmWavBytes(sampleCount: number): number {
	const bytes = WAV_HEADER_BYTES + sampleCount * PCM_BYTES_PER_SAMPLE;
	if (!Number.isSafeInteger(sampleCount) || sampleCount < 0 || !Number.isSafeInteger(bytes)) {
		throw new RangeError('PCM sample count is invalid');
	}
	return bytes;
}

export async function encodePcmToWav(
	pcmData: Float32Array,
	sampleRate: number,
	signal?: AbortSignal
): Promise<ArrayBuffer> {
	throwIfAborted(signal);
	const byteLength = calculatePcmWavBytes(pcmData.length);
	assertRetainedChunkBytesWithinBudget(byteLength);
	const arrayBuffer = new ArrayBuffer(byteLength);
	const view = new DataView(arrayBuffer);

	writeString(view, 0, 'RIFF');
	view.setUint32(4, 36 + pcmData.length * PCM_BYTES_PER_SAMPLE, true);
	writeString(view, 8, 'WAVE');
	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * PCM_BYTES_PER_SAMPLE, true);
	view.setUint16(32, PCM_BYTES_PER_SAMPLE, true);
	view.setUint16(34, 16, true);
	writeString(view, 36, 'data');
	view.setUint32(40, pcmData.length * PCM_BYTES_PER_SAMPLE, true);

	let offset = WAV_HEADER_BYTES;
	for (let index = 0; index < pcmData.length; index++) {
		if (index > 0 && index % COOPERATIVE_BATCH_SIZE === 0) {
			await yieldToEventLoop(signal);
		}
		const value = pcmData[index] ?? 0;
		const sample = Math.max(-1, Math.min(1, value));
		view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
		offset += PCM_BYTES_PER_SAMPLE;
	}

	throwIfAborted(signal);
	return arrayBuffer;
}

function writeString(view: DataView, offset: number, value: string): void {
	for (let index = 0; index < value.length; index++) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}
