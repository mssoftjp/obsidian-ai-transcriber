import { encodePcmForTranscription } from '../../../src/core/audio/TranscriptionAudioEncoder';

const originalAudioEncoder = Object.getOwnPropertyDescriptor(globalThis, 'AudioEncoder');
const originalAudioData = Object.getOwnPropertyDescriptor(globalThis, 'AudioData');

describe('encodePcmForTranscription', () => {
	afterEach(() => {
		restoreGlobal('AudioEncoder', originalAudioEncoder);
		restoreGlobal('AudioData', originalAudioData);
		MockAudioEncoder.supported = true;
		MockAudioEncoder.rejectFlush = false;
		MockAudioEncoder.closed = false;
	});

	it('encodes selected PCM as WebM Opus when WebCodecs supports the configuration', async () => {
		installWebCodecsMocks();
		const pcm = Float32Array.from({ length: 640 }, (_, index) => Math.sin(index / 10) * 0.1);

		const result = await encodePcmForTranscription(pcm, 16_000);

		expect(result.fileExtension).toBe('webm');
		expect(result.mimeType).toBe('audio/webm');
		expect(result.codec).toBe('opus');
		expect(Array.from(new Uint8Array(result.data).subarray(0, 4))).toEqual([0x1A, 0x45, 0xDF, 0xA3]);
		expect(MockAudioEncoder.closed).toBe(true);
	});

	it('falls back to WAV when WebCodecs Opus is unavailable', async () => {
		installWebCodecsMocks();
		MockAudioEncoder.supported = false;

		const result = await encodePcmForTranscription(new Float32Array(320), 16_000);

		expect(result.fileExtension).toBe('wav');
		expect(result.mimeType).toBe('audio/wav');
		expect(result.codec).toBe('pcm');
		expect(readAscii(new Uint8Array(result.data).subarray(0, 4))).toBe('RIFF');
	});

	it('falls back to WAV and closes the encoder when Opus encoding fails', async () => {
		installWebCodecsMocks();
		MockAudioEncoder.rejectFlush = true;

		const result = await encodePcmForTranscription(new Float32Array(320), 16_000);

		expect(result.fileExtension).toBe('wav');
		expect(result.mimeType).toBe('audio/wav');
		expect(MockAudioEncoder.closed).toBe(true);
	});
});

class MockAudioEncoder {
	static supported = true;
	static rejectFlush = false;
	static closed = false;

	static async isConfigSupported(config: AudioEncoderConfig): Promise<AudioEncoderSupport> {
		return { supported: MockAudioEncoder.supported, config };
	}

	readonly encodeQueueSize = 0;
	private readonly output: EncodedAudioChunkOutputCallback;

	constructor(init: AudioEncoderInit) {
		this.output = init.output;
	}

	configure(): void {
		// The mock accepts the same configuration that is reported as supported.
	}

	encode(data: MockAudioData): void {
		const packet = Uint8Array.of(0xF8, 0xFF, 0xFE);
		this.output({
			byteLength: packet.byteLength,
			duration: 20_000,
			timestamp: data.timestamp,
			type: 'key',
			copyTo: destination => {
				new Uint8Array(destination as ArrayBuffer).set(packet);
			}
		} as EncodedAudioChunk);
	}

	async flush(): Promise<void> {
		if (MockAudioEncoder.rejectFlush) {
			throw new Error('synthetic encoder failure');
		}
	}

	close(): void {
		MockAudioEncoder.closed = true;
	}
}

class MockAudioData {
	readonly timestamp: number;

	constructor(init: AudioDataInit) {
		this.timestamp = init.timestamp;
	}

	close(): void {
		// The production code must release every frame after enqueueing it.
	}
}

function installWebCodecsMocks(): void {
	Object.defineProperty(globalThis, 'AudioEncoder', {
		value: MockAudioEncoder,
		configurable: true
	});
	Object.defineProperty(globalThis, 'AudioData', {
		value: MockAudioData,
		configurable: true
	});
}

function restoreGlobal(name: 'AudioEncoder' | 'AudioData', descriptor?: PropertyDescriptor): void {
	if (descriptor) {
		Object.defineProperty(globalThis, name, descriptor);
		return;
	}
	Reflect.deleteProperty(globalThis, name);
}

function readAscii(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes);
}
