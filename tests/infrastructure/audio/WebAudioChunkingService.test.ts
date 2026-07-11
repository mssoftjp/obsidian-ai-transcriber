import { WebAudioChunkingService } from '../../../src/infrastructure/audio/WebAudioChunkingService';

import type { ProcessedAudio } from '../../../src/core/audio/AudioTypes';
import type { ChunkStrategy, ChunkingConfig } from '../../../src/core/chunking/ChunkingTypes';

const SAMPLE_RATE = 16_000;
const config: ChunkingConfig = {
	constraints: {
		maxSizeMB: 25,
		maxDurationSeconds: 600,
		chunkDurationSeconds: 5,
		recommendedOverlapSeconds: 1,
		supportsParallelProcessing: false
	},
	processingMode: 'sequential',
	mergeStrategy: { type: 'simple' },
	optimizeBoundaries: false
};

describe('WebAudioChunkingService bounded chunk generation', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'window', {
			value: { setTimeout: globalThis.setTimeout.bind(globalThis) },
			configurable: true
		});
	});

	it('yields while generating chunks without copying PCM slices', async () => {
		const service = new WebAudioChunkingService(config);
		const sliceSpy = jest.spyOn(Float32Array.prototype, 'slice');
		let timerFired = false;
		globalThis.setTimeout(() => {
			timerFired = true;
		}, 0);

		try {
			const chunks = await service.createChunks(createAudio(20), createStrategy());
			expect(timerFired).toBe(true);
			expect(sliceSpy).not.toHaveBeenCalled();
			expect(chunks.length).toBeGreaterThan(1);
			expect(chunks.every(chunk => chunk.data.byteLength > 44)).toBe(true);
		} finally {
			sliceSpy.mockRestore();
		}
	});

	it('stops before completing all chunk output after cancellation', async () => {
		const service = new WebAudioChunkingService(config);
		const abortController = new AbortController();
		globalThis.setTimeout(() => abortController.abort(), 0);

		await expect(service.createChunks(
			createAudio(60),
			createStrategy(60),
			abortController.signal
		)).rejects.toMatchObject({ name: 'AbortError' });
	});
});

function createAudio(duration: number): ProcessedAudio {
	return {
		pcmData: new Float32Array(SAMPLE_RATE * duration),
		sampleRate: SAMPLE_RATE,
		duration,
		channels: 1
	};
}

function createStrategy(duration = 20): ChunkStrategy {
	return {
		needsChunking: true,
		totalChunks: Math.ceil(duration / 4),
		chunkDuration: 5,
		overlapDuration: 1,
		totalDuration: duration
	};
}
