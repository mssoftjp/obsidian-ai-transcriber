import { TFile } from 'obsidian';

import type { Vault } from 'obsidian';

type CollectAudioFiles = (vault: Vault) => TFile[];

function loadCollector(): CollectAudioFiles | null {
	try {
		const module = jest.requireActual('../../src/ui/AudioFileCollection') as {
			collectAudioFiles?: CollectAudioFiles;
		};
		return module.collectAudioFiles ?? null;
	} catch {
		return null;
	}
}

function createFile(name: string, extension: string): TFile {
	const file = new TFile();
	Object.assign(file, {
		path: `folder/${name}.${extension}`,
		name: `${name}.${extension}`,
		basename: name,
		extension
	});
	return file;
}

describe('collectAudioFiles', () => {
	it('lists supported audio files through Vault.getFiles', () => {
		const collectAudioFiles = loadCollector();
		expect(collectAudioFiles).not.toBeNull();
		if (!collectAudioFiles) {
			return;
		}
		const audio = createFile('recording', 'MP3');
		const video = createFile('meeting', 'mp4');
		const markdown = createFile('notes', 'md');
		const vault = {
			getFiles: jest.fn().mockReturnValue([audio, video, markdown])
		} as unknown as Vault;

		expect(collectAudioFiles(vault)).toEqual([audio, video]);
		expect(vault.getFiles).toHaveBeenCalledTimes(1);
	});
});
