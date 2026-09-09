import { App, TFile, TFolder } from 'obsidian';

import { TempFileManager } from '../../../src/infrastructure/storage/TempFileManager';

const ROOT = 'ai-transcriber-temp';
const MARKER = 'Managed by AI Transcriber. Safe to remove when the plugin is not processing audio.\n';

// Boundary host with persistent contents and parent/child relationships.
function host() {
	const app = new App();
	const entries = new Map<string, TFile | TFolder>();
	const contents = new Map<string, string | ArrayBuffer>();
	const root = new TFolder();
	root.path = ''; root.children = []; entries.set('', root);
	function add(path: string, content?: string | ArrayBuffer) {
		if (entries.has(path)) throw new Error('already exists');
		const name = path.split('/').pop() ?? '';
		const parent = entries.get(path.split('/').slice(0, -1).join('/')) as TFolder;
		const item = content === undefined ? new TFolder() : new TFile();
		item.path = path; item.name = name; item.parent = parent;
		if (item instanceof TFolder) item.children = [];
		if (item instanceof TFile) item.extension = name.split('.').pop() ?? '';
		parent.children.push(item); entries.set(path, item);
		if (content !== undefined) contents.set(path, content);
		return item;
	}
	jest.spyOn(app.vault, 'getRoot').mockReturnValue(root);
	jest.spyOn(app.vault, 'getAbstractFileByPath').mockImplementation(path => entries.get(path) ?? null);
	jest.spyOn(app.vault, 'createFolder').mockImplementation(async path => add(path) as TFolder);
	app.vault.create = jest.fn(async (path: string, data: string) => add(path, data) as TFile);
	jest.spyOn(app.vault, 'createBinary').mockImplementation(async (path, data) => add(path, data) as TFile);
	app.vault.cachedRead = jest.fn(async (file: TFile) => contents.get(file.path) as string);
	jest.spyOn(app.fileManager, 'trashFile').mockImplementation(async item => {
		if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item);
		for (const path of entries.keys()) {
			if (path === item.path || path.startsWith(`${item.path}/`)) { entries.delete(path); contents.delete(path); }
		}
	});
	return { app, add, entries, contents };
}

describe('external import with existing temporary folder collisions', () => {
	const originalReader = globalThis.FileReader;
	beforeEach(() => {
		globalThis.FileReader = class {
			onload?: (event: unknown) => void;
			readAsArrayBuffer() {
				this.onload?.({ target: { result: new Uint8Array([1, 2, 3]).buffer } });
			}
		} as unknown as typeof FileReader;
	});
	afterEach(() => { jest.restoreAllMocks(); globalThis.FileReader = originalReader; });

	it.each(['session', 'startup', 'file'])('preserves legacy data and cleans the new owned root through %s cleanup', async mode => {
		const h = host();
		h.add(ROOT); h.add(`${ROOT}/notes.md`, 'original user data');
		const manager = new TempFileManager(h.app);
		const imported = await manager.copyExternalFile(new File(['audio'], 'audio.mp3'));
		expect(imported.tFile.path).toMatch(/^ai-transcriber-temp-managed\//);
		expect(new Uint8Array(h.contents.get(imported.tFile.path) as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
		const restarted = new TempFileManager(h.app);
		if (mode === 'session') await restarted.cleanupSession(imported.sessionId);
		else if (mode === 'file') await restarted.cleanup(imported.tFile);
		else await restarted.cleanup();
		expect([...h.entries.keys()].sort()).toEqual(['', ROOT, `${ROOT}/notes.md`].sort());
		expect(h.contents.get(`${ROOT}/notes.md`)).toBe('original user data');
	});

	it('skips file collisions and invalid ownership markers and reuses an owned alternative', async () => {
		const h = host();
		h.add(ROOT, 'user file'); h.add(`${ROOT}-managed`);
		h.add(`${ROOT}-managed/AI_TRANSCRIBER_TEMP_FOLDER.md`, 'not the ownership marker');
		const manager = new TempFileManager(h.app);
		const first = await manager.copyExternalFile(new File(['a'], 'a.mp3'));
		const second = await manager.copyExternalFile(new File(['b'], 'b.mp3'));
		expect(first.tFile.path).toMatch(/^ai-transcriber-temp-managed-2\//);
		expect(second.tFile.path).toMatch(/^ai-transcriber-temp-managed-2\//);
		await manager.cleanupSession(first.sessionId);
		expect(h.entries.has(second.tFile.path)).toBe(true);
		await new TempFileManager(h.app).cleanup();
		expect(h.contents.get(ROOT)).toBe('user file');
		expect(h.contents.get(`${ROOT}-managed/AI_TRANSCRIBER_TEMP_FOLDER.md`)).toBe('not the ownership marker');
		expect(h.entries.has(`${ROOT}-managed-2`)).toBe(false);
	});

	it('rolls back only the new owned session if copying fails', async () => {
		const h = host(); h.add(ROOT); h.add(`${ROOT}/notes.md`, 'keep');
		jest.mocked(h.app.vault.createBinary).mockRejectedValue(new Error('write failed'));
		await expect(new TempFileManager(h.app).copyExternalFile(new File(['a'], 'a.mp3'))).rejects.toThrow('write failed');
		expect([...h.entries.keys()]).toEqual(['', ROOT, `${ROOT}/notes.md`]);
		expect(h.contents.get(`${ROOT}/notes.md`)).toBe('keep');
	});

	it('does not guess which root an ambiguous session ID belongs to', async () => {
		const h = host(); const id = 'ait-mrg23hpz-abcdef12';
		for (const path of [ROOT, `${ROOT}-managed`]) {
			h.add(path); h.add(`${path}/AI_TRANSCRIBER_TEMP_FOLDER.md`, MARKER);
			h.add(`${path}/${id}`); h.add(`${path}/${id}/AI_TRANSCRIBER_TEMP_SESSION.md`, MARKER);
			h.add(`${path}/${id}/a.mp3`, 'audio');
		}
		const manager = new TempFileManager(h.app);
		await manager.cleanupSession(id);
		expect(h.app.fileManager.trashFile).not.toHaveBeenCalled();
		await manager.cleanup(h.entries.get(`${ROOT}-managed/${id}/a.mp3`) as TFile);
		expect(h.entries.has(`${ROOT}/${id}/a.mp3`)).toBe(true);
		expect(h.entries.has(`${ROOT}-managed`)).toBe(false);
	});
});
