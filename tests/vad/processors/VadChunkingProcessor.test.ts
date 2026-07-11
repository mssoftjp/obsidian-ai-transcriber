import { App } from 'obsidian';

import { PathUtils } from '../../../src/utils/PathUtils';
import { VADChunkingProcessor } from '../../../src/vad/processors/VadChunkingProcessor';

import type { ChunkingConfig } from '../../../src/core/chunking/ChunkingTypes';
import type { FvadWasmInstance } from '../../../src/types/global';
import type { VADConfig } from '../../../src/vad/VadTypes';

const SAMPLE_RATE = 16_000;

class InstrumentedProcessor extends VADChunkingProcessor {
	installSilentVad(): void {
		const fakeModule: FvadWasmInstance = {
			HEAP16: new Int16Array(1024),
			_malloc: () => 2,
			_free: () => undefined,
			_fvad_new: () => 1,
			_fvad_set_sample_rate: () => 0,
			_fvad_set_mode: () => 0,
			_fvad_process: () => 0,
			_fvad_free: () => undefined
		};
		this.fvadModule = fakeModule;
		this.vadInstance = 1;
		this.bufferPtr = 2;
		this.available = true;
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
		} finally {
			sliceSpy.mockRestore();
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

function createProcessor(): InstrumentedProcessor {
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
	processor.installSilentVad();
	return processor;
}
