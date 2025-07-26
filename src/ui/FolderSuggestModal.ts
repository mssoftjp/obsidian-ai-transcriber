import { App, FuzzySuggestModal, TFolder } from 'obsidian';

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	currentFolder: string;
	onChooseFolderPath: (folder: string) => void;

	constructor(app: App, currentFolder: string) {
		super(app);
		this.currentFolder = currentFolder;
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		this.app.vault.getAllLoadedFiles().forEach(file => {
			if (file instanceof TFolder) {
				folders.push(file);
			}
		});
		return folders.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(folder: TFolder): string {
		return folder.path || '/';
	}

	onChooseItem(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
		if (this.onChooseFolderPath) {
			this.onChooseFolderPath(folder.path);
		}
	}
}