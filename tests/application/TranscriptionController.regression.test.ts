import { App, TFile } from 'obsidian';

import { DEFAULT_API_SETTINGS } from '../../src/ApiSettings';
import { TranscriptionController } from '../../src/application/TranscriptionController';
import { AudioDecodingError } from '../../src/core/audio/AudioPreparationError';
import { MediaWorkBudgetError } from '../../src/core/audio/MediaWorkBudget';

// Replace I/O at the controller's boundaries, retaining its production routing.
interface ControllerHarness {
	initialize(): Promise<void>;
	vadPreprocessor: { processFile: jest.Mock; cleanup: jest.Mock } | null;
	transcribeDirectFile: jest.Mock;
	createWorkflow: jest.Mock;
}

function setup(extension = 'mp4') {
	const body = new ArrayBuffer(128);
	const app = new App();
	Object.assign(app.vault, { readBinary: jest.fn().mockResolvedValue(body) });
	const file = new TFile();
	Object.assign(file, { name: `video.${extension}`, basename: 'video', extension, stat: { size: body.byteLength } });
	const settings = structuredClone(DEFAULT_API_SETTINGS);
	settings.vadMode = 'local';
	const controller = new TranscriptionController(app, settings);
	const harness = controller as unknown as ControllerHarness;
	const processFile = jest.fn();
	const cleanup = jest.fn().mockResolvedValue(undefined);
	jest.spyOn(harness, 'initialize').mockImplementation(async () => {
		harness.vadPreprocessor = { processFile, cleanup };
	});
	const direct = jest.spyOn(harness, 'transcribeDirectFile').mockResolvedValue('direct');
	const execute = jest.fn().mockResolvedValue({ text: 'processed', modelUsed: 'gpt-transcribe', duration: 1, chunks: 1, strategy: { needsChunking: false } });
	jest.spyOn(harness, 'createWorkflow').mockReturnValue({
		workflow: { validate: jest.fn().mockResolvedValue({ valid: true }), execute },
		dictionaryCorrector: null
	});
	return { controller, body, file, processFile, cleanup, direct, execute };
}

describe('0.11.1 onward controller regression boundaries', () => {
	beforeEach(() => {
		for (const method of ['debug', 'warn', 'error', 'log'] as const) {
			jest.spyOn(console, method).mockImplementation(() => {});
		}
	});
	afterEach(() => jest.restoreAllMocks());

	it('never uploads the whole original when a selected range cannot decode', async () => {
		const fixture = setup();
		fixture.processFile.mockRejectedValue(new AudioDecodingError('Unsupported codec'));
		await expect(fixture.controller.transcribe(fixture.file, 10, 20)).rejects.toBeInstanceOf(AudioDecodingError);
		expect(fixture.direct).not.toHaveBeenCalled();
		expect(fixture.execute).not.toHaveBeenCalled();
		expect(fixture.cleanup).toHaveBeenCalledTimes(1);
	});

	it.each(['wma', 'mov', 'mkv'])('does not send unsupported original %s to the direct endpoint', async extension => {
		const fixture = setup(extension);
		fixture.processFile.mockRejectedValue(new AudioDecodingError('Unsupported codec'));
		await expect(fixture.controller.transcribe(fixture.file)).rejects.toBeInstanceOf(AudioDecodingError);
		expect(fixture.direct).not.toHaveBeenCalled();
	});

	it.each([
		new MediaWorkBudgetError('too large'),
		new DOMException('cancelled', 'AbortError')
	])('does not treat budget or cancellation as permission to upload the original', async error => {
		const fixture = setup();
		fixture.processFile.mockRejectedValue(error);
		await expect(fixture.controller.transcribe(fixture.file)).rejects.toBe(error);
		expect(fixture.direct).not.toHaveBeenCalled();
	});

	it('falls back exactly once for eligible untrimmed MP4 after decoding fails', async () => {
		const fixture = setup();
		fixture.processFile.mockRejectedValue(new AudioDecodingError('Unsupported codec'));
		await expect(fixture.controller.transcribe(fixture.file)).resolves.toBe('direct');
		expect(fixture.direct).toHaveBeenCalledTimes(1);
		expect(fixture.direct).toHaveBeenCalledWith(fixture.file, fixture.body, undefined);
		expect(fixture.cleanup).toHaveBeenCalledTimes(1);
	});

	it('labels VAD output as WAV and does not trim the already-trimmed data twice', async () => {
		const fixture = setup('wma');
		const wav = new ArrayBuffer(256);
		fixture.processFile.mockResolvedValue(wav);
		await fixture.controller.transcribe(fixture.file, 1, 2);
		expect(fixture.direct).not.toHaveBeenCalled();
		const [file, audio, options] = fixture.execute.mock.calls[0] ?? [];
		expect(file).toBe(fixture.file);
		expect(audio).toBe(wav);
		expect(options).toMatchObject({ sourceExtension: 'wav', sourceFileName: 'video.wav' });
		expect(options.startTime).toBeUndefined();
		expect(options.endTime).toBeUndefined();
	});
});
