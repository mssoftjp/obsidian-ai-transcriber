import { AudioConverter } from '../../../src/vad/utils/AudioConverter';

describe('AudioConverter cooperative work', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'window', {
			value: {
				setTimeout: globalThis.setTimeout.bind(globalThis)
			},
			configurable: true
		});
	});

	it('stops WAV encoding when cancellation is delivered between batches', async () => {
		const converter = new AudioConverter();
		const abortController = new AbortController();
		globalThis.setTimeout(() => abortController.abort(), 0);

		await expect(converter.encodeToWAV(
			new Float32Array(100_000),
			16_000,
			abortController.signal
		)).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('preserves the WAV contract for bounded audio', async () => {
		const converter = new AudioConverter();
		const wav = await converter.encodeToWAV(
			new Float32Array([0, 0.5, -0.5]),
			16_000
		);
		const view = new DataView(wav);

		expect(wav.byteLength).toBe(50);
		expect(view.getUint32(24, true)).toBe(16_000);
		expect(view.getUint32(40, true)).toBe(6);
	});
});
