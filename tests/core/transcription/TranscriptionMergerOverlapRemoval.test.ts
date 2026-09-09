import { TranscriptionMerger } from '../../../src/core/transcription/TranscriptionMerger';

describe('TranscriptionMerger.mergeWithOverlapRemoval', () => {
	const originalConsoleWarn = console.warn;
	const originalConsoleDebug = console.debug;

	beforeEach(() => {
		console.warn = jest.fn();
		console.debug = jest.fn();
	});

	afterEach(() => {
		console.warn = originalConsoleWarn;
		console.debug = originalConsoleDebug;
	});

	it('keeps the configured separator when overlap is expected but no match is found', () => {
		const merger = new TranscriptionMerger('gpt-4o-mini-transcribe');

		const output = merger.mergeWithOverlapRemoval(
			[
				{
					id: 0,
					startTime: 0,
					endTime: 10,
					success: true,
					text: '中途半端'
				},
				{
					id: 1,
					startTime: 8,
					endTime: 18,
					success: true,
					text: '続き'
				}
			],
			{ separator: '\n\n', includeFailures: false }
		);

		expect(output).toContain('中途半端\n\n続き');
	});
});
