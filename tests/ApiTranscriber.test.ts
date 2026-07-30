import { App, TFile } from 'obsidian';

import { DEFAULT_API_SETTINGS } from '../src/ApiSettings';
import { APITranscriber } from '../src/ApiTranscriber';
import { ErrorHandler } from '../src/ErrorHandler';

import type { ProgressTracker } from '../src/ui/ProgressTracker';

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
	it('uses GPT Transcribe provider metadata and exact per-minute pricing by default', async () => {
		const app = new App();
		const transcriber = new APITranscriber(app, structuredClone(DEFAULT_API_SETTINGS));
		const file = createFile('gpt-transcribe-estimate');
		file.stat.size = 5 * 1024 * 1024;

		const estimate = await transcriber.estimateCost(file);

		expect(transcriber.isGPT4oModel()).toBe(true);
		expect(transcriber.getProviderDisplayName()).toBe('providers.gptTranscribe');
		expect(estimate.currency).toBe('USD');
		expect(estimate.details).toMatchObject({
			costPerMinute: 0.0045
		});
	});

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

	it('estimates a selected range instead of the full file size', async () => {
		const app = new App();
		const settings = structuredClone(DEFAULT_API_SETTINGS);
		settings.model = 'gpt-4o-mini-transcribe';
		const transcriber = new APITranscriber(app, settings);
		const file = createFile('range-estimate');
		file.stat.size = 100 * 1024 * 1024;

		const estimate = await transcriber.estimateCost(file, 60, 16 * 60 + 60);

		expect(estimate.cost).toBe(0.05);
		expect(estimate.details).toMatchObject({ minutes: 16 });
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

	it('keeps cancellation ownership through downstream continuation', async () => {
		const continuationStarted = deferred<AbortSignal>();
		const continuationRelease = deferred<void>();
		const app = new App();
		const transcriber = new APITranscriber(app, structuredClone(DEFAULT_API_SETTINGS));
		const controller = {
			transcribe: jest.fn().mockResolvedValue('primary result')
		};
		(transcriber as unknown as { controller: typeof controller }).controller = controller;

		const operation = transcriber.transcribe(
			createFile('continued'),
			undefined,
			undefined,
			async (_result, signal) => {
				continuationStarted.resolve(signal);
				await continuationRelease.promise;
				if (signal.aborted) {
					throw new DOMException('cancelled', 'AbortError');
				}
			}
		);
		const signal = await continuationStarted.promise;

		expect(transcriber.isTranscribing()).toBe(true);
		await expect(transcriber.transcribe(createFile('blocked'))).rejects.toMatchObject({
			code: 'TRANSCRIPTION_BUSY'
		});
		await expect(transcriber.cancelTranscription()).resolves.toBe(true);
		expect(signal.aborted).toBe(true);
		continuationRelease.resolve(undefined);
		await expect(operation).resolves.toBe('');
		expect(transcriber.isTranscribing()).toBe(false);
		await expect(transcriber.cancelTranscription()).resolves.toBe(false);
	});

	it('returns the primary result after a successful downstream continuation', async () => {
		const app = new App();
		const transcriber = new APITranscriber(app, structuredClone(DEFAULT_API_SETTINGS));
		const controller = {
			transcribe: jest.fn().mockResolvedValue('primary result')
		};
		(transcriber as unknown as { controller: typeof controller }).controller = controller;
		const continuation = jest.fn().mockResolvedValue(undefined);

		await expect(transcriber.transcribe(
			createFile('continued'),
			undefined,
			undefined,
			continuation
		)).resolves.toBe('primary result');
		expect(continuation).toHaveBeenCalledTimes(1);
		expect((continuation.mock.calls[0]?.[1] as AbortSignal).aborted).toBe(false);
		expect(transcriber.isTranscribing()).toBe(false);
	});

	it('releases job ownership when progress task setup fails', async () => {
		const displayError = jest.spyOn(ErrorHandler, 'displayError');
		const app = new App();
		const progressTracker = {
			startTask: jest.fn()
				.mockImplementationOnce(() => {
					throw new Error('progress setup failed');
				})
				.mockReturnValueOnce('task-2')
		} as unknown as ProgressTracker;
		const transcriber = new APITranscriber(
			app,
			structuredClone(DEFAULT_API_SETTINGS),
			progressTracker
		);
		const controller = {
			transcribe: jest.fn().mockResolvedValue('second result')
		};
		(transcriber as unknown as { controller: typeof controller }).controller = controller;

		await expect(transcriber.transcribe(createFile('first'))).rejects.toThrow('progress setup failed');
		expect(displayError).not.toHaveBeenCalled();
		await expect(transcriber.transcribe(createFile('second'))).resolves.toBe('second result');
	});
});
