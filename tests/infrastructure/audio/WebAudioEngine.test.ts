import { WebAudioEngine } from '../../../src/infrastructure/audio/WebAudioEngine';
import { ResourceManager } from '../../../src/core/resources/ResourceManager';

import type { AudioProcessingConfig, AudioInput } from '../../../src/core/audio/AudioTypes';

const config: AudioProcessingConfig = {
	targetSampleRate: 16_000,
	targetBitDepth: 16,
	targetChannels: 1,
	enableVAD: false
};

describe('WebAudioEngine media budget', () => {
	afterEach(async () => {
		await ResourceManager.getInstance().cleanupAll();
	});

	it('rejects excessive decoded metadata before conversion', async () => {
		installAudioContext({
			length: 50_000_000,
			sampleRate: 48_000,
			duration: 50_000_000 / 48_000,
			numberOfChannels: 2
		});
		const engine = new WebAudioEngine(config);

		await expect(engine.decode(createInput())).rejects.toMatchObject({
			code: 'MEDIA_WORK_BUDGET_EXCEEDED'
		});
	});

	it('continues to decode bounded media', async () => {
		const decoded = {
			length: 16_000,
			sampleRate: 16_000,
			duration: 1,
			numberOfChannels: 1
		};
		installAudioContext(decoded);
		const engine = new WebAudioEngine(config);

		await expect(engine.decode(createInput())).resolves.toMatchObject(decoded);
	});
});

function createInput(): AudioInput {
	return {
		data: new ArrayBuffer(1024),
		fileName: 'audio.mp3',
		extension: 'mp3',
		size: 1024
	};
}

function installAudioContext(decoded: Record<string, number>): void {
	class FakeAudioContext {
		readonly sampleRate = 16_000;
		readonly state = 'running';

		decodeAudioData(): Promise<AudioBuffer> {
			return Promise.resolve(decoded as unknown as AudioBuffer);
		}

		close(): Promise<void> {
			return Promise.resolve();
		}
	}

	Object.defineProperty(globalThis, 'window', {
		value: { AudioContext: FakeAudioContext },
		configurable: true
	});
}
