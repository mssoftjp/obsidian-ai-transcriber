import { App } from 'obsidian';

import { PathUtils } from '../../../src/utils/PathUtils';
import { VADChunkingProcessor } from '../../../src/vad/processors/VadChunkingProcessor';

import type { ChunkingConfig } from '../../../src/core/chunking/ChunkingTypes';
import type { FvadWasmInstance } from '../../../src/types/global';
import type { SpeechSegment, VADConfig } from '../../../src/vad/VadTypes';

const SAMPLE_RATE = 16_000;

class InstrumentedProcessor extends VADChunkingProcessor {
	secondaryExtractionCalls = 0;

	installSilentVad(): void {
		this.installVad(() => 0);
	}

	installVad(decideFrame: (frameIndex: number) => number): void {
		let frameIndex = 0;
		const fakeModule: FvadWasmInstance = {
			HEAP16: new Int16Array(1024),
			_malloc: () => 2,
			_free: () => undefined,
			_fvad_new: () => 1,
			_fvad_set_sample_rate: () => 0,
			_fvad_set_mode: () => 0,
			_fvad_process: () => decideFrame(frameIndex++),
			_fvad_free: () => undefined
		};
		this.fvadModule = fakeModule;
		this.vadInstance = 1;
		this.bufferPtr = 2;
		this.available = true;
	}

	protected override async extractSpeechSegments(
		originalAudio: Float32Array,
		segments: SpeechSegment[],
		sampleRate: number,
		signal?: AbortSignal
	): Promise<Float32Array> {
		this.secondaryExtractionCalls++;
		return await super.extractSpeechSegments(originalAudio, segments, sampleRate, signal);
	}
}

describe('VADChunkingProcessor bounded renderer work', () => {
	beforeEach(() => {
		PathUtils.setPluginDir('plugins/ai-transcriber');
		Object.defineProperty(globalThis, 'window', {
			value: { setTimeout: globalThis.setTimeout.bind(globalThis) },
			configurable: true
		});
	});

	it('yields to the renderer without retaining per-frame Float32 copies', async () => {
		const processor = createProcessor();
		const sliceSpy = jest.spyOn(Float32Array.prototype, 'slice');
		let timerFired = false;
		globalThis.setTimeout(() => {
			timerFired = true;
		}, 0);

		try {
			const result = await processor.processAudioWithChunking(
				new Float32Array(SAMPLE_RATE * 10),
				SAMPLE_RATE
			);
			expect(timerFired).toBe(true);
			expect(sliceSpy).not.toHaveBeenCalled();
			expect(result.chunks.length).toBeGreaterThan(0);
			expect(processor.secondaryExtractionCalls).toBe(0);
		} finally {
			sliceSpy.mockRestore();
			await processor.cleanup();
		}
	});

	it('preserves silence-based boundaries, overlap, and encoded chunk sizes', async () => {
		const processor = createProcessor(frameIndex => frameIndex < Math.floor(20 / 0.03) ? 1 : 0);

		try {
			const result = await processor.processAudioWithChunking(
				new Float32Array(SAMPLE_RATE * 35),
				SAMPLE_RATE
			);

			expect(result).toEqual({ chunks: result.chunks });
			expect(result.chunks).toHaveLength(2);
			const [first, second] = result.chunks;
			expect(first).toBeDefined();
			expect(second).toBeDefined();
			if (!first || !second) {
				throw new Error('Expected two VAD chunks');
			}

			expect(first.startTime).toBe(0);
			expect(first.endTime).toBeCloseTo(20.1, 6);
			expect(second.startTime).toBeCloseTo(first.endTime - 5, 6);
			expect(second.endTime).toBeCloseTo(34.98, 6);
			expect(first.overlapDuration).toBe(5);
			expect(second.overlapDuration).toBe(5);
			expect(first.codec).toBe('pcm');
			expect(second.codec).toBe('pcm');
			expect(first.data.byteLength).toBe(expectedWavByteLength(first.startTime, first.endTime));
			expect(second.data.byteLength).toBe(expectedWavByteLength(second.startTime, second.endTime));
			expect(processor.secondaryExtractionCalls).toBe(0);
		} finally {
			await processor.cleanup();
		}
	});

	it('preserves maximum-duration splitting and the final trailing chunk', async () => {
		const processor = createProcessor(() => 1);

		try {
			const { chunks } = await processor.processAudioWithChunking(
				new Float32Array(SAMPLE_RATE * 65),
				SAMPLE_RATE
			);

			expect(chunks).toHaveLength(3);
			expect(chunks[0]?.startTime).toBe(0);
			expect(chunks[0]?.endTime).toBeCloseTo(30, 6);
			expect(chunks[1]?.startTime).toBeCloseTo((chunks[0]?.endTime ?? 0) - 5, 6);
			expect(chunks[1]?.endTime).toBeGreaterThanOrEqual(55);
			expect(chunks[1]?.endTime).toBeLessThanOrEqual(55.03);
			expect(chunks[2]?.startTime).toBeCloseTo((chunks[1]?.endTime ?? 0) - 5, 6);
			expect(chunks[2]?.endTime).toBeCloseTo(64.98, 6);
			expect(chunks.every(chunk => chunk.overlapDuration === 5)).toBe(true);
			expect(processor.secondaryExtractionCalls).toBe(0);
		} finally {
			await processor.cleanup();
		}
	});

	it('stops chunk construction after a mid-work cancellation', async () => {
		const processor = createProcessor();
		const abortController = new AbortController();
		globalThis.setTimeout(() => abortController.abort(), 0);

		try {
			await expect(processor.processAudioWithChunking(
				new Float32Array(SAMPLE_RATE * 60),
				SAMPLE_RATE,
				abortController.signal
			)).rejects.toMatchObject({ name: 'AbortError' });
		} finally {
			await processor.cleanup();
		}
	});
});

function createProcessor(decideFrame?: (frameIndex: number) => number): InstrumentedProcessor {
	const vadConfig: VADConfig = {
		enabled: true,
		processor: 'webrtc',
		sensitivity: 0.7,
		minSpeechDuration: 0.3,
		maxSilenceDuration: 0.5,
		speechPadding: 0.2,
		debug: false
	};
	const chunkingConfig: ChunkingConfig = {
		constraints: {
			maxSizeMB: 25,
			maxDurationSeconds: Number.POSITIVE_INFINITY,
			chunkDurationSeconds: 15,
			recommendedOverlapSeconds: 5,
			supportsParallelProcessing: true,
			maxConcurrentChunks: 2
		},
		processingMode: 'parallel',
		mergeStrategy: { type: 'overlap_removal' },
		modelName: 'whisper-1'
	};
	const processor = new InstrumentedProcessor(
		new App(),
		vadConfig,
		chunkingConfig,
		'ai-transcriber'
	);
	if (decideFrame) {
		processor.installVad(decideFrame);
	} else {
		processor.installSilentVad();
	}
	return processor;
}

function expectedWavByteLength(startTime: number, endTime: number): number {
	const samples = Math.floor(endTime * SAMPLE_RATE) - Math.floor(startTime * SAMPLE_RATE);
	return 44 + samples * Int16Array.BYTES_PER_ELEMENT;
}
