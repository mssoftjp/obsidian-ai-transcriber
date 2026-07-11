import { encodePcmForTranscription } from '../../../src/core/audio/TranscriptionAudioEncoder';
import { WebAudioChunkingService } from '../../../src/infrastructure/audio/WebAudioChunkingService';

import type { ProcessedAudio } from '../../../src/core/audio/AudioTypes';
import type { ChunkingConfig } from '../../../src/core/chunking/ChunkingTypes';

jest.mock('../../../src/core/audio/TranscriptionAudioEncoder', () => ({
	encodePcmForTranscription: jest.fn()
}));

const encodeMock = encodePcmForTranscription as jest.MockedFunction<typeof encodePcmForTranscription>;

describe('WebAudioChunkingService upload encoding', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'window', {
			value: { setTimeout: globalThis.setTimeout.bind(globalThis) },
			configurable: true
		});
		encodeMock.mockResolvedValue({
			data: Uint8Array.of(0x1A, 0x45, 0xDF, 0xA3).buffer,
			fileExtension: 'webm',
			mimeType: 'audio/webm',
			codec: 'opus'
		});
	});

	it('preserves the encoder format metadata on every generated chunk', async () => {
		const service = new WebAudioChunkingService(createConfig());
		const chunks = await service.createChunks(createAudio(12), {
			needsChunking: true,
			totalChunks: 3,
			chunkDuration: 5,
			overlapDuration: 1,
			totalDuration: 12
		});

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.every(chunk => chunk.fileExtension === 'webm')).toBe(true);
		expect(chunks.every(chunk => chunk.mimeType === 'audio/webm')).toBe(true);
		expect(chunks.every(chunk => chunk.codec === 'opus')).toBe(true);
		expect(encodeMock).toHaveBeenCalledTimes(chunks.length);
	});
});

function createAudio(duration: number): ProcessedAudio {
	return {
		pcmData: new Float32Array(16_000 * duration),
		sampleRate: 16_000,
		duration,
		channels: 1
	};
}

function createConfig(): ChunkingConfig {
	return {
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
}
