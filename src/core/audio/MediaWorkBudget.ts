const MEBIBYTE = 1024 * 1024;

export const CLIENT_MEDIA_BUDGET = {
	maxEncodedBytes: 128 * MEBIBYTE,
	maxDurationSeconds: 2 * 60 * 60,
	maxChannels: 8,
	maxWorkingSetBytes: 512 * MEBIBYTE,
	maxRangeWorkingSetBytes: 1024 * MEBIBYTE,
	maxRetainedChunkBytes: 256 * MEBIBYTE
} as const;

export interface DecodedMediaBudgetOptions {
	/** Duration retained after decoding the source, when a bounded range is selected. */
	workingDurationSeconds?: number;
}

export class MediaWorkBudgetError extends Error {
	readonly code = 'MEDIA_WORK_BUDGET_EXCEEDED' as const;

	constructor(message: string) {
		super(message);
		this.name = 'MediaWorkBudgetError';
	}
}

export function assertRetainedChunkBytesWithinBudget(retainedBytes: number): void {
	if (!Number.isSafeInteger(retainedBytes) || retainedBytes < 0) {
		throw new MediaWorkBudgetError('Retained chunk size is invalid');
	}
	if (retainedBytes > CLIENT_MEDIA_BUDGET.maxRetainedChunkBytes) {
		throw new MediaWorkBudgetError('Generated chunks exceed the retained-output budget');
	}
}

export function assertEncodedMediaWithinBudget(encodedBytes: number): void {
	if (!Number.isSafeInteger(encodedBytes) || encodedBytes < 0) {
		throw new MediaWorkBudgetError('Media size is invalid');
	}
	if (encodedBytes > CLIENT_MEDIA_BUDGET.maxEncodedBytes) {
		throw new MediaWorkBudgetError('Media exceeds the client-processing size limit');
	}
}

export function assertDecodedMediaWithinBudget(
	encodedBytes: number,
	audioBuffer: Pick<AudioBuffer, 'length' | 'sampleRate' | 'duration' | 'numberOfChannels'>,
	targetSampleRate: number,
	options: DecodedMediaBudgetOptions = {}
): void {
	assertEncodedMediaWithinBudget(encodedBytes);

	const { length: frames, sampleRate, duration, numberOfChannels: channels } = audioBuffer;
	const workingDuration = options.workingDurationSeconds ?? duration;
	const workingFrames = Math.ceil(workingDuration * sampleRate);
	const projectedTargetFrames = Math.ceil(workingDuration * targetSampleRate);
	const projectedBytes = encodedBytes * 2
		+ frames * channels * Float32Array.BYTES_PER_ELEMENT
		+ workingFrames * Float32Array.BYTES_PER_ELEMENT
		+ projectedTargetFrames * Float32Array.BYTES_PER_ELEMENT;

	const hasInvalidMetadata = !Number.isSafeInteger(frames)
		|| frames < 0
		|| !Number.isFinite(sampleRate)
		|| sampleRate <= 0
		|| !Number.isFinite(duration)
		|| duration < 0
		|| !Number.isSafeInteger(channels)
		|| channels <= 0
		|| !Number.isFinite(workingDuration)
		|| workingDuration <= 0
		|| workingDuration > duration
		|| !Number.isSafeInteger(workingFrames)
		|| !Number.isSafeInteger(projectedTargetFrames)
		|| !Number.isSafeInteger(projectedBytes);

	if (hasInvalidMetadata) {
		throw new MediaWorkBudgetError('Decoded media metadata is invalid');
	}
	if (duration > CLIENT_MEDIA_BUDGET.maxDurationSeconds) {
		throw new MediaWorkBudgetError('Decoded media exceeds the client-processing duration limit');
	}
	if (channels > CLIENT_MEDIA_BUDGET.maxChannels) {
		throw new MediaWorkBudgetError('Decoded media exceeds the client-processing channel limit');
	}
	const workingSetLimit = workingDuration < duration
		? CLIENT_MEDIA_BUDGET.maxRangeWorkingSetBytes
		: CLIENT_MEDIA_BUDGET.maxWorkingSetBytes;
	if (projectedBytes > workingSetLimit) {
		throw new MediaWorkBudgetError('Decoded media exceeds the client-processing memory budget');
	}
}
