import { Logger } from '../../utils/Logger';
import { PathUtils } from '../../utils/PathUtils';

import type { App, TFile } from 'obsidian';

export interface TranscriptionNoteInput {
	requestedPath: string;
	content: string;
	frontmatter: Record<string, unknown>;
	signal?: AbortSignal;
}

export interface TranscriptionNoteResult {
	file: TFile;
	path: string;
	metadataWritten: boolean;
}

export class TranscriptionNoteWriter {
	private readonly logger = Logger.getLogger('TranscriptionNoteWriter');

	constructor(private readonly app: App) {}

	async create(input: TranscriptionNoteInput): Promise<TranscriptionNoteResult> {
		if (input.signal?.aborted) {
			throw new DOMException('Transcription operation was cancelled', 'AbortError');
		}

		const requestedPath = PathUtils.normalizeVaultRelativePath(input.requestedPath);
		if (!requestedPath) {
			throw new Error('A transcription output path is required');
		}

		const path = this.allocateAvailablePath(requestedPath);
		if (input.signal?.aborted) {
			throw new DOMException('Transcription operation was cancelled', 'AbortError');
		}
		const file = await this.app.vault.create(path, input.content);
		let metadataWritten = true;
		if (input.signal?.aborted) {
			metadataWritten = false;
		} else {
			try {
				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					Object.assign(frontmatter, input.frontmatter);
				});
			} catch (error) {
				metadataWritten = false;
				this.logger.warn('Transcription note body was saved, but metadata could not be updated', {
					path,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return { file, path, metadataWritten };
	}

	private allocateAvailablePath(requestedPath: string): string {
		if (!this.app.vault.getAbstractFileByPath(requestedPath)) {
			return requestedPath;
		}

		const slashIndex = requestedPath.lastIndexOf('/');
		const directory = slashIndex >= 0 ? requestedPath.slice(0, slashIndex + 1) : '';
		const fileName = slashIndex >= 0 ? requestedPath.slice(slashIndex + 1) : requestedPath;
		const dotIndex = fileName.lastIndexOf('.');
		const hasExtension = dotIndex > 0;
		const stem = hasExtension ? fileName.slice(0, dotIndex) : fileName;
		const extension = hasExtension ? fileName.slice(dotIndex) : '';

		for (let suffix = 2; suffix <= 10_000; suffix += 1) {
			const candidate = PathUtils.normalizeVaultRelativePath(`${directory}${stem}-${suffix}${extension}`);
			if (!this.app.vault.getAbstractFileByPath(candidate)) {
				return candidate;
			}
		}

		throw new Error(`Unable to allocate a unique transcription path for ${requestedPath}`);
	}
}
