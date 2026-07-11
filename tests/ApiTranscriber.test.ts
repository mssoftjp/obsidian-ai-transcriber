import { App, TFile } from 'obsidian';

import { DEFAULT_API_SETTINGS } from '../src/ApiSettings';
import { APITranscriber } from '../src/ApiTranscriber';

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function createFile(name: string): TFile {
	const file = new TFile();
	Object.assign(file, {
		path: `audio/${name}.mp3`,
		name: `${name}.mp3`,
		basename: name,
		extension: 'mp3'
	});
	return file;
}

describe('APITranscriber job ownership', () => {
	it('estimates cost from file metadata without reading the audio body', async () => {
		const app = new App();
		const readBinary = jest.fn().mockRejectedValue(new Error('audio body should not be read'));
		Object.assign(app.vault, { readBinary });
		const transcriber = new APITranscriber(app, structuredClone(DEFAULT_API_SETTINGS));
		const file = createFile('estimate');
		file.stat.size = 10 * 1024 * 1024;

		const estimate = await transcriber.estimateCost(file);

		expect(readBinary).not.toHaveBeenCalled();
		expect(estimate.cost).toBeGreaterThan(0);
	});

	it('rejects a second transcription while the first job owns the facade', async () => {
		const controllerResult = deferred<string>();
		const app = new App();
		const transcriber = new APITranscriber(app, structuredClone(DEFAULT_API_SETTINGS));
		const controller = {
			transcribe: jest.fn()
				.mockReturnValueOnce(controllerResult.promise)
				.mockResolvedValueOnce('second result')
		};
		(transcriber as unknown as { controller: typeof controller }).controller = controller;

		const first = transcriber.transcribe(createFile('first'));

		await expect(transcriber.transcribe(createFile('second'))).rejects.toMatchObject({
			code: 'TRANSCRIPTION_BUSY'
		});
		expect(controller.transcribe).toHaveBeenCalledTimes(1);

		controllerResult.resolve('first result');
		await expect(first).resolves.toBe('first result');
	});

	it('aborts only the active job and permits the next job after release', async () => {
		const firstResult = deferred<string>();
		const app = new App();
		const transcriber = new APITranscriber(app, structuredClone(DEFAULT_API_SETTINGS));
		const controller = {
			transcribe: jest.fn()
				.mockReturnValueOnce(firstResult.promise)
				.mockResolvedValueOnce('next result')
		};
		(transcriber as unknown as { controller: typeof controller }).controller = controller;

		const first = transcriber.transcribe(createFile('first'));
		const firstSignal = controller.transcribe.mock.calls[0]?.[3] as AbortSignal;
		await transcriber.cancelTranscription();

		expect(firstSignal.aborted).toBe(true);
		firstResult.resolve('late result');
		await first;

		await expect(transcriber.transcribe(createFile('next'))).resolves.toBe('next result');
	});
});
