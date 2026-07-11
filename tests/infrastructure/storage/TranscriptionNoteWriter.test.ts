import { TFile } from 'obsidian';

import type { App } from 'obsidian';

interface WriterResult {
	file: TFile;
	path: string;
	metadataWritten: boolean;
}

interface WriterInstance {
	create(input: {
		requestedPath: string;
		content: string;
		frontmatter: Record<string, unknown>;
		signal?: AbortSignal;
	}): Promise<WriterResult>;
}

type WriterConstructor = new (app: App) => WriterInstance;

function loadWriter(): WriterConstructor | null {
	try {
		const module = jest.requireActual('../../../src/infrastructure/storage/TranscriptionNoteWriter') as {
			TranscriptionNoteWriter?: WriterConstructor;
		};
		return module.TranscriptionNoteWriter ?? null;
	} catch {
		return null;
	}
}

function createHarness(): {
	app: App;
	getAbstractFileByPath: jest.Mock;
	create: jest.Mock;
	modify: jest.Mock;
	processFrontMatter: jest.Mock;
} {
	const getAbstractFileByPath = jest.fn().mockReturnValue(null);
	const create = jest.fn().mockImplementation(async (path: string) => {
		const file = new TFile();
		Object.assign(file, { path, name: path.split('/').pop() ?? path });
		return file;
	});
	const modify = jest.fn();
	const processFrontMatter = jest.fn().mockImplementation(async (_file, updater) => {
		updater({});
	});
	const app = {
		vault: { getAbstractFileByPath, create, modify },
		fileManager: { processFrontMatter }
	} as unknown as App;
	return { app, getAbstractFileByPath, create, modify, processFrontMatter };
}

describe('TranscriptionNoteWriter', () => {
	it('creates a note with its complete body in one call', async () => {
		const Writer = loadWriter();
		expect(Writer).not.toBeNull();
		if (!Writer) {
			return;
		}
		const harness = createHarness();
		const writer = new Writer(harness.app);

		const result = await writer.create({
			requestedPath: 'Transcriptions/out.md',
			content: '# complete body',
			frontmatter: { transcription_status: 'complete' }
		});

		expect(harness.create).toHaveBeenCalledWith('Transcriptions/out.md', '# complete body');
		expect(harness.modify).not.toHaveBeenCalled();
		expect(harness.processFrontMatter).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ path: 'Transcriptions/out.md', metadataWritten: true });
	});

	it('allocates a collision-free path before creating', async () => {
		const Writer = loadWriter();
		expect(Writer).not.toBeNull();
		if (!Writer) {
			return;
		}
		const harness = createHarness();
		harness.getAbstractFileByPath
			.mockReturnValueOnce(new TFile())
			.mockReturnValueOnce(null);
		const writer = new Writer(harness.app);

		const result = await writer.create({
			requestedPath: 'Transcriptions/out.md',
			content: '# complete body',
			frontmatter: {}
		});

		expect(result.path).toBe('Transcriptions/out-2.md');
		expect(harness.create).toHaveBeenCalledWith('Transcriptions/out-2.md', '# complete body');
	});

	it('keeps a durable body when frontmatter update fails', async () => {
		const Writer = loadWriter();
		expect(Writer).not.toBeNull();
		if (!Writer) {
			return;
		}
		const harness = createHarness();
		harness.processFrontMatter.mockRejectedValue(new Error('metadata unavailable'));
		const writer = new Writer(harness.app);

		await expect(writer.create({
			requestedPath: 'out.md',
			content: '# complete body',
			frontmatter: { transcription_status: 'complete' }
		})).resolves.toMatchObject({ path: 'out.md', metadataWritten: false });
		expect(harness.create).toHaveBeenCalledWith('out.md', '# complete body');
	});

	it('does not create a note when the operation was already cancelled', async () => {
		const Writer = loadWriter();
		expect(Writer).not.toBeNull();
		if (!Writer) {
			return;
		}
		const harness = createHarness();
		const writer = new Writer(harness.app);
		const abortController = new AbortController();
		abortController.abort();

		await expect(writer.create({
			requestedPath: 'out.md',
			content: '# should not be written',
			frontmatter: {},
			signal: abortController.signal
		})).rejects.toMatchObject({ name: 'AbortError' });
		expect(harness.create).not.toHaveBeenCalled();
		expect(harness.processFrontMatter).not.toHaveBeenCalled();
	});

	it.each([
		'../outside.md',
		'/tmp/outside.md',
		'C:\\tmp\\outside.md',
		'folder\\..\\outside.md'
	])('rejects a non-contained output path before creating: %s', async (requestedPath) => {
		const Writer = loadWriter();
		expect(Writer).not.toBeNull();
		if (!Writer) {
			return;
		}
		const harness = createHarness();
		const writer = new Writer(harness.app);

		await expect(writer.create({
			requestedPath,
			content: '# should not be written',
			frontmatter: {}
		})).rejects.toThrow();
		expect(harness.create).not.toHaveBeenCalled();
		expect(harness.processFrontMatter).not.toHaveBeenCalled();
	});

	it('does not begin a metadata write when cancellation wins during note creation', async () => {
		const Writer = loadWriter();
		expect(Writer).not.toBeNull();
		if (!Writer) {
			return;
		}
		const harness = createHarness();
		const writer = new Writer(harness.app);
		const abortController = new AbortController();
		harness.create.mockImplementation(async (path: string) => {
			abortController.abort();
			const file = new TFile();
			Object.assign(file, { path, name: path });
			return file;
		});

		await expect(writer.create({
			requestedPath: 'out.md',
			content: '# body write already began',
			frontmatter: { transcription_status: 'complete' },
			signal: abortController.signal
		})).resolves.toMatchObject({ metadataWritten: false });
		expect(harness.create).toHaveBeenCalledTimes(1);
		expect(harness.processFrontMatter).not.toHaveBeenCalled();
	});
});
