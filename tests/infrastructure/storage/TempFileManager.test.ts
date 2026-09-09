import { App, TFile, TFolder } from 'obsidian';

import { TempFileManager } from '../../../src/infrastructure/storage/TempFileManager';

const TEMP_DIR = 'ai-transcriber-temp';
const ROOT_MARKER_PATH = `${TEMP_DIR}/AI_TRANSCRIBER_TEMP_FOLDER.md`;
const SESSION_ID = 'ait-mrg23hpz-abcdef12';
const SESSION_PATH = `${TEMP_DIR}/${SESSION_ID}`;
const SESSION_MARKER_PATH = `${SESSION_PATH}/AI_TRANSCRIBER_TEMP_SESSION.md`;
const MARKER_CONTENT = 'Managed by AI Transcriber. Safe to remove when the plugin is not processing audio.\n';

function createTestFile(path: string, basename: string, extension: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = basename;
	file.extension = extension;
	file.name = extension ? `${basename}.${extension}` : basename;
	return file;
}

function createTestFolder(path: string, name: string, children: (TFile | TFolder)[] = []): TFolder {
	const folder = new TFolder();
	folder.path = path;
	folder.name = name;
	folder.children = children;
	return folder;
}

function createOwnedSession(): {
	root: TFolder;
	rootMarker: TFile;
	session: TFolder;
	sessionMarker: TFile;
	audio: TFile;
} {
	const rootMarker = createTestFile(ROOT_MARKER_PATH, 'AI_TRANSCRIBER_TEMP_FOLDER', 'md');
	const sessionMarker = createTestFile(
		SESSION_MARKER_PATH,
		'AI_TRANSCRIBER_TEMP_SESSION',
		'md'
	);
	const audio = createTestFile(`${SESSION_PATH}/audio.mp3`, 'audio', 'mp3');
	const session = createTestFolder(SESSION_PATH, SESSION_ID, [sessionMarker, audio]);
	const root = createTestFolder(TEMP_DIR, TEMP_DIR, [rootMarker, session]);
	return { root, rootMarker, session, sessionMarker, audio };
}

jest.mock('../../../src/utils/Logger', () => ({
	Logger: {
		getLogger: jest.fn(() => ({
			trace: jest.fn(),
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn()
		}))
	}
}));

jest.mock('../../../src/i18n', () => ({
	t: jest.fn((key: string, params?: { error?: string; available?: string }) => {
		if (key === 'errors.createFileFailed') {
			return `Create file failed: ${params?.error ?? 'Unknown error'}`;
		}
		if (key === 'errors.diskSpaceLow') {
			return `Disk space low: ${params?.available ?? '0'}GB`;
		}
		return key;
	})
}));

describe('TempFileManager', () => {
	let app: App;
	let manager: TempFileManager;
	let trashFile: jest.SpyInstance;
	let vaultDelete: jest.SpyInstance;

	beforeEach(() => {
		app = new App();
		app.vault.cachedRead = jest.fn().mockResolvedValue(MARKER_CONTENT);
		manager = new TempFileManager(app);
		trashFile = jest.spyOn(app.fileManager, 'trashFile');
		vaultDelete = jest.spyOn(app.vault, 'delete');
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('deletes only an owned session with visible Vault markers', async () => {
		const owned = createOwnedSession();
		jest.spyOn(app.vault, 'getAbstractFileByPath').mockImplementation((path) => {
			if (path === ROOT_MARKER_PATH) {
				return owned.rootMarker;
			}
			if (path === SESSION_MARKER_PATH) {
				return owned.sessionMarker;
			}
			if (path === SESSION_PATH) {
				return owned.session;
			}
			return null;
		});

		await manager.cleanupSession(SESSION_ID);

		expect(trashFile).toHaveBeenCalledWith(owned.session);
		expect(vaultDelete).not.toHaveBeenCalled();
	});

	it('does not delete a session when either ownership marker is missing', async () => {
		const owned = createOwnedSession();
		jest.spyOn(app.vault, 'getAbstractFileByPath').mockImplementation((path) => {
			if (path === ROOT_MARKER_PATH) {
				return owned.rootMarker;
			}
			if (path === SESSION_PATH) {
				return owned.session;
			}
			return null;
		});

		await manager.cleanupSession(SESSION_ID);

		expect(trashFile).not.toHaveBeenCalled();
	});

	it('does not trust a marker whose contents do not match', async () => {
		const owned = createOwnedSession();
		app.vault.cachedRead = jest.fn().mockResolvedValue('user-created file');
		jest.spyOn(app.vault, 'getAbstractFileByPath').mockImplementation((path) => {
			if (path === ROOT_MARKER_PATH) {
				return owned.rootMarker;
			}
			if (path === SESSION_MARKER_PATH) {
				return owned.sessionMarker;
			}
			if (path === SESSION_PATH) {
				return owned.session;
			}
			return null;
		});

		await manager.cleanupSession(SESSION_ID);

		expect(trashFile).not.toHaveBeenCalled();
	});

	it('rejects traversal and malformed session identifiers', async () => {
		await manager.cleanupSession('../user-folder');
		await manager.cleanupSession('test-session');

		expect(trashFile).not.toHaveBeenCalled();
	});

	it('cleans the complete owned session when given its audio file', async () => {
		const owned = createOwnedSession();
		jest.spyOn(app.vault, 'getAbstractFileByPath').mockImplementation((path) => {
			if (path === ROOT_MARKER_PATH) {
				return owned.rootMarker;
			}
			if (path === SESSION_MARKER_PATH) {
				return owned.sessionMarker;
			}
			if (path === SESSION_PATH) {
				return owned.session;
			}
			return null;
		});

		await manager.cleanup(owned.audio);

		expect(trashFile).toHaveBeenCalledWith(owned.session);
		expect(vaultDelete).not.toHaveBeenCalled();
	});

	it('does not clean files outside a direct managed session path', async () => {
		const outside = createTestFile('regular-folder/file.mp3', 'file', 'mp3');
		const nested = createTestFile(`${SESSION_PATH}/nested/file.mp3`, 'file', 'mp3');

		await manager.cleanup(outside);
		await manager.cleanup(nested);

		expect(trashFile).not.toHaveBeenCalled();
	});

	it('does not adopt or delete an unmarked legacy-looking directory', async () => {
		const legacyId = 'mrg23hpziwae46cjsy';
		const legacyPath = `${TEMP_DIR}/${legacyId}`;
		const audio = createTestFile(`${legacyPath}/audio.wav`, 'audio', 'wav');
		const legacySession = createTestFolder(legacyPath, legacyId, [audio]);
		const root = createTestFolder(TEMP_DIR, TEMP_DIR, [legacySession]);
		const create = jest.fn();
		app.vault.create = create;
		jest.spyOn(app.vault, 'getAbstractFileByPath').mockImplementation((path) => {
			if (path === TEMP_DIR) {
				return root;
			}
			return null;
		});

		await manager.cleanup();

		expect(create).not.toHaveBeenCalled();
		expect(trashFile).not.toHaveBeenCalled();
	});

	it('does not adopt or delete a legacy-looking directory containing unknown data', async () => {
		const legacyId = 'mrg23hpziwae46cjsy';
		const session = createTestFolder(`${TEMP_DIR}/${legacyId}`, legacyId, [
			createTestFile(`${TEMP_DIR}/${legacyId}/audio.wav`, 'audio', 'wav'),
			createTestFile(`${TEMP_DIR}/${legacyId}/notes.md`, 'notes', 'md')
		]);
		const root = createTestFolder(TEMP_DIR, TEMP_DIR, [session]);
		const create = jest.fn();
		app.vault.create = create;
		jest.spyOn(app.vault, 'getAbstractFileByPath').mockImplementation((path) =>
			path === TEMP_DIR ? root : null
		);

		await manager.cleanup();

		expect(create).not.toHaveBeenCalled();
		expect(trashFile).not.toHaveBeenCalled();
	});

	it('never calls Vault.delete even when trashing fails', async () => {
		const owned = createOwnedSession();
		jest.spyOn(app.vault, 'getAbstractFileByPath').mockImplementation((path) => {
			if (path === ROOT_MARKER_PATH) {
				return owned.rootMarker;
			}
			if (path === SESSION_MARKER_PATH) {
				return owned.sessionMarker;
			}
			if (path === SESSION_PATH) {
				return owned.session;
			}
			return null;
		});
		trashFile.mockRejectedValue(new Error('Trash failed'));

		await expect(manager.cleanupSession(SESSION_ID)).resolves.toBeUndefined();

		expect(trashFile).toHaveBeenCalledWith(owned.session);
		expect(vaultDelete).not.toHaveBeenCalled();
	});

	it('identifies only files within the exact temporary directory prefix', () => {
		const temporary = createTestFile(`${SESSION_PATH}/test.mp3`, 'test', 'mp3');
		const similar = createTestFile('ai-transcriber-temp-backup/test.mp3', 'test', 'mp3');
		const regular = createTestFile('regular/test.mp3', 'test', 'mp3');

		expect(manager.isTemporaryFile(temporary)).toBe(true);
		expect(manager.isTemporaryFile(similar)).toBe(false);
		expect(manager.isTemporaryFile(regular)).toBe(false);
	});
});
