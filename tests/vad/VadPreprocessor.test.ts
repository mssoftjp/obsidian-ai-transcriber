import { App, TFile } from 'obsidian';

import { VADPreprocessor } from '../../src/vad/VadPreprocessor';

import type { VADProcessor, VADResult } from '../../src/vad/VadTypes';

interface ConverterStub {
	decodeAudioFile: jest.Mock;
	encodeToWAV: jest.Mock;
	cleanup: jest.Mock;
}

interface PreprocessorInternals {
	processor: VADProcessor;
	initialized: boolean;
	audioConverter: ConverterStub;
}

describe('VADPreprocessor operation ownership', () => {
	it('reuses the controller buffer and passes one signal through every stage', async () => {
		const app = new App();
		const readBinary = jest.fn();
		Object.assign(app.vault, { readBinary });
		const preprocessor = new VADPreprocessor(app, { enabled: true });
		const sourceBuffer = new ArrayBuffer(16);
		const audioData = new Float32Array([0.1, 0.2]);
		const processedWav = new ArrayBuffer(12);
		const abortController = new AbortController();
		const vadResult: VADResult = {
			processedAudio: audioData,
			originalDuration: 2 / 16_000,
			processedDuration: 2 / 16_000,
			segments: [{ start: 0, end: 2 / 16_000 }],
			statistics: {
				totalSegments: 1,
				speechRatio: 1,
				silenceRatio: 0,
				compressionRatio: 0,
				processingTimeMs: 1
			}
		};
		const processor = {
			initialize: jest.fn().mockResolvedValue(undefined),
			processAudio: jest.fn().mockResolvedValue(vadResult),
			cleanup: jest.fn().mockResolvedValue(undefined),
			isAvailable: jest.fn().mockReturnValue(true)
		} as VADProcessor;
		const converter: ConverterStub = {
			decodeAudioFile: jest.fn().mockResolvedValue({ audioData, sampleRate: 16_000 }),
			encodeToWAV: jest.fn().mockResolvedValue(processedWav),
			cleanup: jest.fn()
		};
		const internals = preprocessor as unknown as PreprocessorInternals;
		internals.processor = processor;
		internals.initialized = true;
		internals.audioConverter = converter;

		await expect(preprocessor.processFile(
			createFile(),
			undefined,
			undefined,
			{ sourceBuffer, signal: abortController.signal }
		)).resolves.toBe(processedWav);

		expect(readBinary).not.toHaveBeenCalled();
		expect(converter.decodeAudioFile).toHaveBeenCalledWith(
			sourceBuffer,
			'mp3',
			abortController.signal
		);
		expect(processor.processAudio).toHaveBeenCalledWith(
			audioData,
			16_000,
			abortController.signal
		);
		expect(converter.encodeToWAV).toHaveBeenCalledWith(
			audioData,
			16_000,
			abortController.signal
		);
	});
});

function createFile(): TFile {
	const file = new TFile();
	Object.assign(file, {
		path: 'audio/input.mp3',
		name: 'input.mp3',
		basename: 'input',
		extension: 'mp3'
	});
	return file;
}
