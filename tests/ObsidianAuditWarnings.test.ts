import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
	return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Obsidian audit source contracts', () => {
	it.each([
		['src/ApiSettingsTab.ts', 'TextComponent | null'],
		['src/main-api.ts', 'TFile | File'],
		['src/ui/ApiTranscriptionModal.ts', 'ButtonComponent | null'],
		['src/ui/ApiTranscriptionModal.ts', 'TextComponent | null'],
		['src/ui/AudioFileSelectionModal.ts', 'TFile | null'],
		['src/ui/AudioFileSelectionModal.ts', 'TFile | File'],
		['src/ui/AudioFileSelectionModal.ts', 'ButtonComponent | null'],
		['src/ui/TranscriptionView.ts', 'TFile | null'],
		['src/ui/TranscriptionView.ts', 'CachedMetadata | null']
	])('avoids audit-sensitive union %s: %s', (path, union) => {
		expect(source(path)).not.toContain(union);
	});

	it('keeps deliberate vault enumeration in the user-invoked media picker', () => {
		expect(source('src/ui/AudioFileCollection.ts')).toContain('vault.getFiles()');
	});
});
