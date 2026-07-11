import { App } from 'obsidian';

import { PathUtils } from '../../../src/utils/PathUtils';
import { WebRTCVADProcessor } from '../../../src/vad/processors/WebrtcVadProcessor';

import type { FvadWasmInstance } from '../../../src/types/global';
import type { VADConfig, SpeechSegment } from '../../../src/vad/VadTypes';

const config: VADConfig = {
	enabled: true,
	processor: 'webrtc',
	sensitivity: 0.5,
	minSpeechDuration: 0.1,
	maxSilenceDuration: 0.5,
	speechPadding: 0,
	debug: false
};

interface ProcessorInternals {
	available: boolean;
	vadInstance: number;
	bufferPtr: number;
	fvadModule: FvadWasmInstance;
	detectVoiceSegments(data: Int16Array, signal?: AbortSignal): Promise<SpeechSegment[]>;
}

describe('WebRTCVADProcessor cooperative frame scanning', () => {
	beforeEach(() => {
		PathUtils.setPluginDir('plugins/ai-transcriber');
		Object.defineProperty(globalThis, 'window', {
			value: {
				setTimeout: globalThis.setTimeout.bind(globalThis)
			},
			configurable: true
		});
	});

	it('observes cancellation during a long frame scan', async () => {
		const processor = createReadyProcessor();
		const abortController = new AbortController();
		globalThis.setTimeout(() => abortController.abort(), 0);

		await expect(processor.detectVoiceSegments(
			new Int16Array(480 * 600),
			abortController.signal
		)).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('keeps normal speech-segment detection behavior', async () => {
		const processor = createReadyProcessor();

		await expect(processor.detectVoiceSegments(
			new Int16Array(480 * 2)
		)).resolves.toEqual([{ start: 0, end: 0.06 }]);
	});
});

function createReadyProcessor(): ProcessorInternals {
	const processor = new WebRTCVADProcessor(new App(), config) as unknown as ProcessorInternals;
	processor.available = true;
	processor.vadInstance = 1;
	processor.bufferPtr = 2;
	processor.fvadModule = {
		HEAP16: new Int16Array(481),
		_malloc: () => 2,
		_free: () => undefined,
		_fvad_new: () => 1,
		_fvad_set_sample_rate: () => 0,
		_fvad_set_mode: () => 0,
		_fvad_process: () => 1,
		_fvad_free: () => undefined
	};
	return processor;
}
