import { TranscriptionMerger } from '../../../src/core/transcription/TranscriptionMerger';

describe('TranscriptionMerger.mergeWithTimestampsFormatted', () => {
	it('keeps one timestamp per line even when segment text contains newlines', () => {
		const merger = new TranscriptionMerger('whisper-1-ts');

		const output = merger.mergeWithTimestampsFormatted(
			[
				{
					id: 0,
					startTime: 0,
					endTime: 2,
					success: true,
					text: '',
					segments: [
						{ start: 0, end: 1, text: '行1\n行2' },
						{ start: 1, end: 2, text: '次の行です。' }
					]
				}
			],
			{ includeFailures: false }
		);

		expect(output).toContain('行1 行2');

		const nonEmptyLines = output.split('\n').filter(line => line.trim().length > 0);
		expect(nonEmptyLines.every(line => line.startsWith('['))).toBe(true);
	});
});

