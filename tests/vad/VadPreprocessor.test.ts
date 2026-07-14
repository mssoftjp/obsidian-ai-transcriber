import { App, TFile } from 'obsidian';

import { VADPreprocessor } from '../../src/vad/VadPreprocessor';
import { PathUtils } from '../../src/utils/PathUtils';
import { WebRTCVADProcessor } from '../../src/vad/processors/WebrtcVadProcessor';

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
	it('falls back to no silence removal when local VAD initialization fails', async () => {
		const getPluginDir = jest.spyOn(PathUtils, 'getPluginDir')
			.mockReturnValue('.obsidian/plugins/ai-transcriber');
		const initialize = jest.spyOn(WebRTCVADProcessor.prototype, 'initialize')
			.mockRejectedValue(new Error('WebAssembly.instantiate failed'));
		const preprocessor = new VADPreprocessor(new App(), { enabled: true });
		const sourceBuffer = new ArrayBuffer(16);
		const converter: ConverterStub = {
			decodeAudioFile: jest.fn(),
			encodeToWAV: jest.fn(),
			cleanup: jest.fn()
		};

		try {
			await expect(preprocessor.initialize()).resolves.toBeUndefined();
			expect(preprocessor.getFallbackMode()).toBe('disabled');
			(preprocessor as unknown as PreprocessorInternals).audioConverter = converter;
			await expect(preprocessor.processFile(
				createFile(),
				undefined,
				undefined,
				{ sourceBuffer }
			)).resolves.toBe(sourceBuffer);
			expect(converter.decodeAudioFile).not.toHaveBeenCalled();
		} finally {
			initialize.mockRestore();
			getPluginDir.mockRestore();
		}
	});

	it('preserves range trimming when missing local VAD falls back to no silence removal', async () => {
		const getPluginDir = jest.spyOn(PathUtils, 'getPluginDir')
			.mockReturnValue('.obsidian/plugins/ai-transcriber');
		const initialize = jest.spyOn(WebRTCVADProcessor.prototype, 'initialize')
			.mockRejectedValue(new Error('WASM file not found'));
		const preprocessor = new VADPreprocessor(new App(), { enabled: true });
		const sourceBuffer = new ArrayBuffer(16);
		const trimmedWav = new ArrayBuffer(12);
		const audioData = new Float32Array([0.1, 0.2]);
		const converter: ConverterStub = {
			decodeAudioFile: jest.fn().mockResolvedValue({
				audioData,
				sampleRate: 16_000,
				rangeApplied: true,
				rangeStart: 5,
				rangeEnd: 10
			}),
			encodeToWAV: jest.fn().mockResolvedValue(trimmedWav),
			cleanup: jest.fn()
		};

		try {
			await preprocessor.initialize();
			(preprocessor as unknown as PreprocessorInternals).audioConverter = converter;
			await expect(preprocessor.processFile(
				createFile(),
				5,
				10,
				{ sourceBuffer }
			)).resolves.toBe(trimmedWav);
			expect(converter.decodeAudioFile).toHaveBeenCalledWith(
				sourceBuffer,
				'mp3',
				expect.objectContaining({ rangeStart: 5, rangeEnd: 10 })
			);
			expect(converter.encodeToWAV).toHaveBeenCalledWith(audioData, 16_000, undefined);
		} finally {
			initialize.mockRestore();
			getPluginDir.mockRestore();
		}
	});

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
			decodeAudioFile: jest.fn().mockResolvedValue({
				audioData,
				sampleRate: 16_000,
				rangeApplied: false,
				rangeStart: 0,
				rangeEnd: 2 / 16_000
			}),
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
			{
				signal: abortController.signal,
				targetSampleRate: 16_000
			}
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
