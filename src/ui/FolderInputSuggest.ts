import { AbstractInputSuggest } from 'obsidian';

import type { App } from 'obsidian';

/**
 * Folder path typeahead for text inputs.
 * Uses Obsidian's AbstractInputSuggest to surface vault folder paths.
 */
export class FolderInputSuggest extends AbstractInputSuggest<string> {
	private folders: string[];
	private readonly onSelectCallback: (value: string) => void;

	constructor(app: App, inputEl: HTMLInputElement, onSelect?: (value: string) => void) {
		super(app, inputEl);
		this.onSelectCallback = onSelect ?? (() => { /* no-op */ });
		this.folders = this.loadFolders();
	}

	getSuggestions(query: string): string[] {
		const normalized = query.toLowerCase();
		return this.folders.filter(folder => folder.toLowerCase().includes(normalized));
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value === '' ? '/' : value);
	}

	override selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
		const normalized = value === '/' ? '' : value;
		this.setValue(normalized);
		this.onSelectCallback(normalized);
	}

	private loadFolders(): string[] {
		const folders = this.app.vault.getAllFolders()
			.map(folder => folder.path || '')
			.filter((path, index, array) => array.indexOf(path) === index)
			.sort((a, b) => a.localeCompare(b));

		// Ensure root appears as a selectable option
		if (!folders.includes('')) {
			folders.unshift('');
		}

		return folders;
	}
}
