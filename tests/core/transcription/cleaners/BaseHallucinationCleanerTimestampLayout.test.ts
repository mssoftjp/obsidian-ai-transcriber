import { BaseHallucinationCleaner } from '../../../../src/core/transcription/cleaners/BaseHallucinationCleaner';

describe('BaseHallucinationCleaner (timestamp layout safety)', () => {
	it('does not collapse newlines after sentence-ending punctuation', async () => {
		const cleaner = new BaseHallucinationCleaner();
		const input = [
			'[0:00 → 0:01] これはテストです!',
			'',
			'[0:01 → 0:02] 続きです?',
			'',
			'[0:02 → 0:03] OK'
		].join('\n');

		const result = await cleaner.clean(input, 'ja');

		// Previously, sentence splitting consumed whitespace and joining removed it,
		// causing timestamp lines to become `![0:..]` / `?[0:..]`.
		expect(result.cleanedText).not.toContain('![0:01');
		expect(result.cleanedText).not.toContain('?[0:02');
	});
});

