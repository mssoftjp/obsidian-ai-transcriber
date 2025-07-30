/**
 * Test for TempFileManager to verify it uses app.fileManager.trashFile instead of app.vault.delete
 */

import { TempFileManager } from '../../../src/infrastructure/storage/TempFileManager';
import { App, TFile, TFolder } from 'obsidian';

// Create helper functions to create properly configured test objects
function createTestFile(path: string, basename: string, extension: string): TFile {
	const file = new TFile();
	file.path = path;
	file.basename = basename;
	file.extension = extension;
	file.name = `${basename}.${extension}`;
	return file;
}

function createTestFolder(path: string, name: string): TFolder {
	const folder = new TFolder();
	folder.path = path;
	folder.name = name;
	return folder;
}

// Mock the Logger module
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

// Mock the i18n module  
jest.mock('../../../src/i18n', () => ({
	t: jest.fn((key: string, params?: any) => {
		if (key === 'errors.createFileFailed') {
			return `Create file failed: ${params?.error || 'Unknown error'}`;
		}
		if (key === 'errors.diskSpaceLow') {
			return `Disk space low: ${params?.available || '0'}GB`;
		}
		return key;
	})
}));

describe('TempFileManager', () => {
	let app: App;
	let tempFileManager: TempFileManager;
	let mockTrashFile: jest.SpyInstance;
	let mockVaultDelete: jest.SpyInstance;

	beforeEach(() => {
		app = new App();
		tempFileManager = new TempFileManager(app);

		// Spy on the methods to verify they are called correctly
		mockTrashFile = jest.spyOn(app.fileManager, 'trashFile');
		mockVaultDelete = jest.spyOn(app.vault, 'delete');
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('cleanupSession', () => {
		it('should use app.fileManager.trashFile to delete session folder', async () => {
			// Setup: Create a mock session folder
			const sessionId = 'test-session';
			const sessionPath = `ai-transcriber-temp/${sessionId}`;
			const sessionFolder = createTestFolder(sessionPath, sessionId);
			
			// Mock the getAbstractFileByPath to return our test folder
			jest.spyOn(app.vault, 'getAbstractFileByPath').mockReturnValue(sessionFolder);

			// Act: Call cleanupSession
			await tempFileManager.cleanupSession(sessionId);

			// Assert: Verify that trashFile was called with the session folder
			expect(mockTrashFile).toHaveBeenCalledWith(sessionFolder);
			expect(mockTrashFile).toHaveBeenCalledTimes(1);
			
			// Assert: Verify that vault.delete was NOT called
			expect(mockVaultDelete).not.toHaveBeenCalled();
		});

		it('should handle error gracefully when session folder does not exist', async () => {
			// Setup: Mock getAbstractFileByPath to return null
			jest.spyOn(app.vault, 'getAbstractFileByPath').mockReturnValue(null);

			// Act: Call cleanupSession - should not throw
			await expect(tempFileManager.cleanupSession('nonexistent-session')).resolves.toBeUndefined();

			// Assert: No delete methods should be called
			expect(mockTrashFile).not.toHaveBeenCalled();
			expect(mockVaultDelete).not.toHaveBeenCalled();
		});
	});

	describe('cleanup', () => {
		it('should use app.fileManager.trashFile for specific file cleanup', async () => {
			// Setup: Create a mock temp file
			const tempFile = createTestFile('ai-transcriber-temp/test-file.mp3', 'test-file', 'mp3');

			// Act: Call cleanup with specific file
			await tempFileManager.cleanup(tempFile);

			// Assert: Verify that trashFile was called with the specific file
			expect(mockTrashFile).toHaveBeenCalledWith(tempFile);
			expect(mockTrashFile).toHaveBeenCalledTimes(1);
			
			// Assert: Verify that vault.delete was NOT called
			expect(mockVaultDelete).not.toHaveBeenCalled();
		});

		it('should use app.fileManager.trashFile for full cleanup', async () => {
			// Setup: Create a mock temp folder
			const tempFolder = createTestFolder('ai-transcriber-temp', 'ai-transcriber-temp');
			jest.spyOn(app.vault, 'getAbstractFileByPath').mockReturnValue(tempFolder);

			// Act: Call cleanup without specific file (full cleanup)
			await tempFileManager.cleanup();

			// Assert: Verify that trashFile was called with the temp folder
			expect(mockTrashFile).toHaveBeenCalledWith(tempFolder);
			expect(mockTrashFile).toHaveBeenCalledTimes(1);
			
			// Assert: Verify that vault.delete was NOT called
			expect(mockVaultDelete).not.toHaveBeenCalled();
		});

		it('should not cleanup files outside temp directory', async () => {
			// Setup: Create a file outside the temp directory
			const regularFile = createTestFile('regular-folder/file.mp3', 'file', 'mp3');

			// Act: Call cleanup with non-temp file
			await tempFileManager.cleanup(regularFile);

			// Assert: No delete methods should be called for non-temp files
			expect(mockTrashFile).not.toHaveBeenCalled();
			expect(mockVaultDelete).not.toHaveBeenCalled();
		});

		it('should handle trashFile errors gracefully', async () => {
			// Setup: Create a mock temp file and make trashFile throw
			const tempFile = createTestFile('ai-transcriber-temp/test-file.mp3', 'test-file', 'mp3');
			mockTrashFile.mockRejectedValue(new Error('Trash operation failed'));

			// Act: Call cleanup - should not throw
			await expect(tempFileManager.cleanup(tempFile)).resolves.toBeUndefined();

			// Assert: trashFile was called but error was handled
			expect(mockTrashFile).toHaveBeenCalledWith(tempFile);
		});
	});

	describe('isTemporaryFile', () => {
		it('should correctly identify temporary files', () => {
			const tempFile = createTestFile('ai-transcriber-temp/test.mp3', 'test', 'mp3');
			const regularFile = createTestFile('regular/test.mp3', 'test', 'mp3');

			expect(tempFileManager.isTemporaryFile(tempFile)).toBe(true);
			expect(tempFileManager.isTemporaryFile(regularFile)).toBe(false);
		});
	});

	describe('Safety verification', () => {
		it('should never call app.vault.delete directly', async () => {
			// This test ensures that our mock setup works and vault.delete is never called
			const tempFolder = createTestFolder('ai-transcriber-temp', 'ai-transcriber-temp');
			const tempFile = createTestFile('ai-transcriber-temp/test.mp3', 'test', 'mp3');
			
			jest.spyOn(app.vault, 'getAbstractFileByPath').mockReturnValue(tempFolder);

			// Test all cleanup methods
			await tempFileManager.cleanup();
			await tempFileManager.cleanup(tempFile);
			await tempFileManager.cleanupSession('test-session');

			// Verify vault.delete was never called
			expect(mockVaultDelete).not.toHaveBeenCalled();
			
			// Verify trashFile was called instead
			expect(mockTrashFile).toHaveBeenCalled();
		});
	});
});