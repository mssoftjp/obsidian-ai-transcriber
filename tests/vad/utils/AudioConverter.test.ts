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

	it('retains and resamples only the selected decoded range', async () => {
		const channelData = Float32Array.from(
			{ length: 48 },
			(_value, index) => index / 48
		);
		const decoded = {
			length: channelData.length,
			sampleRate: 48,
			duration: 1,
			numberOfChannels: 1,
			getChannelData: () => channelData
		} as unknown as AudioBuffer;
		class TestAudioContext {
			decodeAudioData(): Promise<AudioBuffer> {
				return Promise.resolve(decoded);
			}

			close(): Promise<void> {
				return Promise.resolve();
			}
		}
		Object.defineProperty(globalThis, 'AudioContext', {
			value: TestAudioContext,
			configurable: true
		});

		const converter = new AudioConverter();
		const result = await converter.decodeAudioFile(new ArrayBuffer(16), 'wav', {
			rangeStart: 0.25,
			rangeEnd: 0.75,
			targetSampleRate: 16
		});

		expect(result.rangeApplied).toBe(true);
		expect(result.rangeStart).toBe(0.25);
		expect(result.rangeEnd).toBe(0.75);
		expect(result.sampleRate).toBe(16);
		expect(result.audioData).toHaveLength(8);
		expect(result.audioData[0]).toBeCloseTo(0.25);
	});
});
