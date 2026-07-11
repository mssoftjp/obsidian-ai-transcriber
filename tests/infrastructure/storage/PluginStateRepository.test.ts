import { DEFAULT_API_SETTINGS } from '../../../src/ApiSettings';
import { PluginStateRepository } from '../../../src/infrastructure/storage/PluginStateRepository';

import type { TranscriptionTask } from '../../../src/ui/ProgressTracker';
import type { Plugin } from 'obsidian';

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function createPlugin(raw: unknown): Plugin & {
	loadData: jest.Mock;
	saveData: jest.Mock;
} {
	return {
		loadData: jest.fn().mockResolvedValue(raw),
		saveData: jest.fn().mockResolvedValue(undefined)
	} as unknown as Plugin & { loadData: jest.Mock; saveData: jest.Mock };
}

function createTask(): TranscriptionTask {
	return {
		id: 'task-1',
		inputFileName: 'input.mp3',
		inputFilePath: 'audio/input.mp3',
		startTime: 1,
		totalChunks: 1,
		completedChunks: 0,
		status: 'processing'
	};
}

describe('PluginStateRepository', () => {
	it('recovers a partial segmented state without throwing', async () => {
		const plugin = createPlugin({
			meta: { version: 1, format: 'ai-transcriber-state' },
			settings: { version: 1, data: {} }
		});
		const repository = new PluginStateRepository(plugin);

		await expect(repository.initialize()).resolves.toBeDefined();
		expect(repository.getDictionaries().ja.definiteCorrections).toEqual([]);
		expect(repository.getHistory()).toEqual([]);
	});

	it('does not rewrite a valid current state during initialization', async () => {
		const seedPlugin = createPlugin(null);
		const seedRepository = new PluginStateRepository(seedPlugin);
		const validState = await seedRepository.initialize();
		const plugin = createPlugin(structuredClone(validState));
		const repository = new PluginStateRepository(plugin);

		await repository.initialize();

		expect(plugin.saveData).not.toHaveBeenCalled();
	});

	it('normalizes malformed persisted setting types and persists the repair', async () => {
		const seedPlugin = createPlugin(null);
		const seedRepository = new PluginStateRepository(seedPlugin);
		const state = await seedRepository.initialize();
		const malformed = structuredClone(state) as unknown as {
			settings: { data: Record<string, unknown> };
		};
		malformed.settings.data['openaiApiKey'] = 42;
		malformed.settings.data['model'] = 'unsupported-model';
		malformed.settings.data['postProcessingEnabled'] = 'yes';
		const plugin = createPlugin(malformed);
		const repository = new PluginStateRepository(plugin);

		await repository.initialize();

		const settings = repository.getSettings();
		expect(settings.openaiApiKey).toBe(DEFAULT_API_SETTINGS.openaiApiKey);
		expect(settings.model).toBe(DEFAULT_API_SETTINGS.model);
		expect(settings.postProcessingEnabled).toBe(DEFAULT_API_SETTINGS.postProcessingEnabled);
		expect(plugin.saveData).toHaveBeenCalledTimes(1);
	});

	it('serializes overlapping settings and history writes', async () => {
		const plugin = createPlugin(null);
		const repository = new PluginStateRepository(plugin);
		await repository.initialize();
		plugin.saveData.mockReset();

		const firstWrite = deferred();
		let callCount = 0;
		let concurrentWrites = 0;
		let maxConcurrentWrites = 0;
		plugin.saveData.mockImplementation(async () => {
			const callIndex = callCount++;
			concurrentWrites += 1;
			maxConcurrentWrites = Math.max(maxConcurrentWrites, concurrentWrites);
			if (callIndex === 0) {
				await firstWrite.promise;
			}
			concurrentWrites -= 1;
		});

		const settingsWrite = repository.saveSettings(structuredClone(DEFAULT_API_SETTINGS));
		await Promise.resolve();
		const historyWrite = repository.saveHistory([createTask()]);
		await Promise.resolve();

		expect(maxConcurrentWrites).toBe(1);
		firstWrite.resolve();
		await Promise.all([settingsWrite, historyWrite]);
		expect(plugin.saveData).toHaveBeenCalledTimes(2);
		expect(plugin.saveData.mock.calls[1]?.[0].history.items).toEqual([createTask()]);
	});
});
