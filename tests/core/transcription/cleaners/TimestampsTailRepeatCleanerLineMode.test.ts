import { TimestampsTailRepeatCleaner } from '../../../../src/core/transcription/cleaners/TimestampsTailRepeatCleaner';

describe('TimestampsTailRepeatCleaner (line mode)', () => {
	it('compresses repeated timestamped tail lines without breaking line layout', () => {
		const cleaner = new TimestampsTailRepeatCleaner({
			maxTailBlocks: 30,
			minRepeatCount: 3,
			maxUnitBlocks: 2,
			similarityThreshold: 0.99,
			minTimestampedRatio: 0.5
		});

		const repeatX = 'REPEAT_X';
		const repeatY = 'REPEAT_Y';

		const input = [
			'[0:00 → 0:01] 先頭',
			'[0:01 → 0:02] 本文',
			'[0:02 → 0:03] ' + repeatX,
			'[0:03 → 0:04] ' + repeatY,
			'[0:04 → 0:05] ' + repeatX,
			'[0:05 → 0:06] ' + repeatY,
			'[0:06 → 0:07] ' + repeatX,
			'[0:07 → 0:08] ' + repeatY
		].join('\n');

		const result = cleaner.clean(input, 'ja');

		expect(result.cleanedText).not.toContain('\n\n');
		expect((result.cleanedText.match(new RegExp(repeatX, 'g')) ?? []).length).toBe(1);
		expect((result.cleanedText.match(new RegExp(repeatY, 'g')) ?? []).length).toBe(1);
	});
});

