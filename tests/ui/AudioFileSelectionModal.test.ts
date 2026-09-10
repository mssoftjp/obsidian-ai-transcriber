import { TFile } from 'obsidian';

import { SUPPORTED_FORMATS } from '../../src/config/constants';

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
	it('lists every supported 0.11.1 format plus WMA through Vault.getFiles', () => {
		const collectAudioFiles = loadCollector();
		expect(collectAudioFiles).not.toBeNull();
		if (!collectAudioFiles) {
			return;
		}
		const supported = SUPPORTED_FORMATS.EXTENSIONS.map((extension, index) => (
			createFile(`media-${index}`, index % 2 === 0 ? extension.toUpperCase() : extension)
		));
		const markdown = createFile('notes', 'md');
		const vault = {
			getFiles: jest.fn().mockReturnValue([...supported, markdown])
		} as unknown as Vault;

		expect(collectAudioFiles(vault)).toEqual(supported);
		expect(vault.getFiles).toHaveBeenCalledTimes(1);
	});
});
