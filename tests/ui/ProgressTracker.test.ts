import { TFile } from 'obsidian';

import { ProgressTracker } from '../../src/ui/ProgressTracker';

import type { PluginStateRepository } from '../../src/infrastructure/storage/PluginStateRepository';

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

describe('ProgressTracker task ownership', () => {
	it('rejects replacing an active processing task', () => {
		const stateRepo = {
			getHistory: jest.fn().mockReturnValue([]),
			saveHistory: jest.fn().mockResolvedValue(undefined)
		} as unknown as PluginStateRepository;
		const tracker = new ProgressTracker(stateRepo);

		tracker.startTask(createFile(), 1, 'OpenAI');

		expect(() => tracker.startTask(createFile(), 1, 'OpenAI')).toThrow(
			expect.objectContaining({ code: 'TRANSCRIPTION_BUSY' })
		);
	});
});
