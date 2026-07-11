import {
	assertDecodedMediaWithinBudget,
	assertEncodedMediaWithinBudget,
	assertRetainedChunkBytesWithinBudget,
	CLIENT_MEDIA_BUDGET
} from '../../../src/core/audio/MediaWorkBudget';

describe('client media work budget', () => {
	it('accepts the encoded-byte boundary and rejects one byte above it', () => {
		expect(() => assertEncodedMediaWithinBudget(
			CLIENT_MEDIA_BUDGET.maxEncodedBytes
		)).not.toThrow();
		expect(() => assertEncodedMediaWithinBudget(
			CLIENT_MEDIA_BUDGET.maxEncodedBytes + 1
		)).toThrow(/size limit/);
	});

	it('rejects invalid and excessive decoded metadata before conversion', () => {
		const safeBuffer = {
			length: 16_000 * 60,
			sampleRate: 16_000,
			duration: 60,
			numberOfChannels: 1
		};
		expect(() => assertDecodedMediaWithinBudget(1024, safeBuffer, 16_000)).not.toThrow();
		expect(() => assertDecodedMediaWithinBudget(1024, {
			...safeBuffer,
			duration: Number.POSITIVE_INFINITY
		}, 16_000)).toThrow(/metadata/);
		expect(() => assertDecodedMediaWithinBudget(1024, {
			...safeBuffer,
			numberOfChannels: CLIENT_MEDIA_BUDGET.maxChannels + 1
		}, 16_000)).toThrow(/channel limit/);
	});

	it('rejects a projected working set above the memory budget', () => {
		const frames = 50_000_000;
		expect(() => assertDecodedMediaWithinBudget(1024, {
			length: frames,
			sampleRate: 48_000,
			duration: frames / 48_000,
			numberOfChannels: 2
		}, 16_000)).toThrow(/memory budget/);
	});

	it('allows a bounded range when only that range is retained after source decode', () => {
		const duration = 3362.9;
		const source = {
			length: Math.floor(duration * 48_000),
			sampleRate: 48_000,
			duration,
			numberOfChannels: 1
		};
		expect(() => assertDecodedMediaWithinBudget(
			28_649_954,
			source,
			16_000
		)).toThrow(/memory budget/);
		expect(() => assertDecodedMediaWithinBudget(
			28_649_954,
			source,
			16_000,
			{ workingDurationSeconds: 16 * 60 }
		)).not.toThrow();
	});

	it('bounds the aggregate retained chunk output', () => {
		expect(() => assertRetainedChunkBytesWithinBudget(
			CLIENT_MEDIA_BUDGET.maxRetainedChunkBytes
		)).not.toThrow();
		expect(() => assertRetainedChunkBytesWithinBudget(
			CLIENT_MEDIA_BUDGET.maxRetainedChunkBytes + 1
		)).toThrow(/retained-output budget/);
	});
});
