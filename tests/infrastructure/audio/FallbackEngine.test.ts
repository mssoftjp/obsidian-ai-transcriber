import { FallbackEngine } from '../../../src/infrastructure/audio/FallbackEngine';

import type { AudioInput, AudioProcessingConfig } from '../../../src/core/audio/AudioTypes';

const config: AudioProcessingConfig = {
	targetSampleRate: 16_000,
	targetBitDepth: 16,
	targetChannels: 1,
	enableVAD: false
};

describe('FallbackEngine WAV validation', () => {
	it('rejects truncated and oversized data chunks without allocating channel arrays', async () => {
		const engine = new FallbackEngine(config);
		await expect(engine.validate(createInput(new ArrayBuffer(20)))).resolves.toMatchObject({
			isValid: false,
			error: 'WAV header is truncated'
		});

		const invalidDataSize = createWav(2);
		new DataView(invalidDataSize).setUint32(40, 1_000_000, true);
		await expect(engine.validate(createInput(invalidDataSize))).resolves.toMatchObject({
			isValid: false,
			error: 'WAV data chunk exceeds the file size'
		});
	});

	it('preserves bounded PCM WAV decoding', async () => {
		const engine = new FallbackEngine(config);
		const input = createInput(createWav(4));

		await expect(engine.validate(input)).resolves.toMatchObject({
			isValid: true,
			properties: { sampleRate: 16_000, channels: 1 }
		});
		const decoded = await engine.decode(input);
		expect(decoded.length).toBe(4);
		expect(decoded.getChannelData(0)).toHaveLength(4);
	});

	it('finds PCM data after an intervening RIFF chunk', async () => {
		const source = createWav(4);
		const withJunk = new ArrayBuffer(source.byteLength + 10);
		const output = new Uint8Array(withJunk);
		output.set(new Uint8Array(source, 0, 36), 0);
		const view = new DataView(withJunk);
		writeTag(view, 36, 'JUNK');
		view.setUint32(40, 1, true);
		output[44] = 0xff;
		writeTag(view, 46, 'data');
		view.setUint32(50, 8, true);
		output.set(new Uint8Array(source, 44), 54);
		view.setUint32(4, withJunk.byteLength - 8, true);
		const engine = new FallbackEngine(config);

		await expect(engine.validate(createInput(withJunk))).resolves.toMatchObject({ isValid: true });
		await expect(engine.decode(createInput(withJunk))).resolves.toMatchObject({ length: 4 });
	});
});

function createInput(data: ArrayBuffer): AudioInput {
	return {
		data,
		fileName: 'input.wav',
		extension: 'wav',
		size: data.byteLength
	};
}

function createWav(sampleCount: number): ArrayBuffer {
	const dataSize = sampleCount * 2;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);
	writeTag(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeTag(view, 8, 'WAVE');
	writeTag(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, 16_000, true);
	view.setUint32(28, 32_000, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeTag(view, 36, 'data');
	view.setUint32(40, dataSize, true);
	return buffer;
}

function writeTag(view: DataView, offset: number, value: string): void {
	for (let index = 0; index < value.length; index++) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}
