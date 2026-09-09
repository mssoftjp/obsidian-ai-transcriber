export class AudioDecodingError extends Error {
	readonly code = 'AUDIO_DECODING_FAILED' as const;
	readonly stage = 'decode' as const;
	readonly cause: unknown;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = 'AudioDecodingError';
		this.cause = cause;
	}
}
