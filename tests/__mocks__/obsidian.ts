// Mock for Obsidian API
export abstract class TAbstractFile {
	vault?: any;
	path: string;
	name: string;
	parent: TFolder | null;

	constructor() {
		this.path = '';
		this.name = '';
		this.parent = null;
	}
}

export class TFile extends TAbstractFile {
	basename: string;
	extension: string;
	stat: { ctime: number; mtime: number; size: number };

	constructor() {
		super();
		this.basename = '';
		this.extension = '';
		this.stat = {
			ctime: Date.now(),
			mtime: Date.now(),
			size: 1024
		};
	}

	// Helper method to set properties for testing
	setProperties(path: string, basename: string, extension: string) {
		this.path = path;
		this.basename = basename;
		this.extension = extension;
		this.name = `${basename}.${extension}`;
		return this;
	}
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[];

	constructor() {
		super();
		this.children = [];
	}

	// Helper method to set properties for testing
	setProperties(path: string, name: string) {
		this.path = path;
		this.name = name;
		return this;
	}

	isRoot(): boolean {
		return this.path === '';
	}
}

export class App {
	vault: Vault;
	fileManager: FileManager;

	constructor() {
		this.vault = new Vault();
		this.fileManager = new FileManager();
	}
}

export class Vault {
	private files: Map<string, TFile | TFolder> = new Map();

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		return this.files.get(path) || null;
	}

	getFiles(): TFile[] {
		return Array.from(this.files.values()).filter(file => file instanceof TFile) as TFile[];
	}

	async createFolder(path: string): Promise<TFolder> {
		const folder = new TFolder();
		folder.path = path;
		folder.name = path.split('/').pop() || '';
		this.files.set(path, folder);
		return folder;
	}

	async createBinary(path: string, buffer: ArrayBuffer): Promise<TFile> {
		const parts = path.split('/');
		const name = parts.pop() || '';
		const [basename, extension] = name.split('.');
		const file = new TFile();
		file.path = path;
		file.basename = basename;
		file.extension = extension;
		file.name = name;
		this.files.set(path, file);
		return file;
	}

	private shouldThrowOnDelete: boolean = true;

	setDeleteBehavior(shouldThrow: boolean): void {
		this.shouldThrowOnDelete = shouldThrow;
	}

	async delete(file: TFile | TFolder, force?: boolean): Promise<void> {
		if (this.shouldThrowOnDelete) {
			// This is the old method that should not be used
			throw new Error('app.vault.delete should not be used - use app.fileManager.trashFile instead');
		}
		// Simulate deletion for testing purposes
		this.files.delete(file.path);
	}
}

export class FileManager {
	async trashFile(file: TFile | TFolder): Promise<void> {
		// Mock implementation of trashFile - the recommended method
		return Promise.resolve();
	}
}

export class Notice {
	constructor(message: string) {
		console.log(`Notice: ${message}`);
	}
}