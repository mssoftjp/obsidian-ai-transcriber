import { SUPPORTED_FORMATS } from '../config/constants';

import type { TFile, Vault } from 'obsidian';

export function collectAudioFiles(vault: Vault): TFile[] {
	const allowedExtensions = new Set(
		SUPPORTED_FORMATS.EXTENSIONS.map(extension => extension.toLowerCase())
	);
	return vault.getFiles().filter(file => allowedExtensions.has(file.extension.toLowerCase()));
}
