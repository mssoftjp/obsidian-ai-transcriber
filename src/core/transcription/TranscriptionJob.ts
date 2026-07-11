export interface ActiveTranscriptionJob {
	readonly id: string;
	readonly abortController: AbortController;
	taskId: string | null;
}

export class TranscriptionBusyError extends Error {
	readonly code = 'TRANSCRIPTION_BUSY' as const;

	constructor() {
		super('A transcription is already in progress');
		this.name = 'TranscriptionBusyError';
	}
}
