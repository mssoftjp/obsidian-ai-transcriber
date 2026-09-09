import { ConsecutiveBlockRepeatCleaner } from '../../../../src/core/transcription/cleaners/ConsecutiveBlockRepeatCleaner';

describe('ConsecutiveBlockRepeatCleaner', () => {
	it('compresses consecutive duplicated sentence blocks', () => {
		const cleaner = new ConsecutiveBlockRepeatCleaner({
			minBlockNormalizedChars: 40,
			maxUnitSentences: 6,
			allowSingleSentence: true
		});

		const s1 = `前段${'共通'.repeat(15)}です。`;
		const s2 = `後段${'共通'.repeat(15)}です。`;
		const block = `${s1}${s2}`;
		const input = `${block}${block}終端です。`;

		const result = cleaner.clean(input, 'ja');
		expect(result.cleanedText).toBe(`${block}終端です。`);
		expect(result.metadata?.patternsMatched?.length).toBeGreaterThan(0);
	});

	it('compresses repeated single long sentences when allowed', () => {
		const cleaner = new ConsecutiveBlockRepeatCleaner({
			minBlockNormalizedChars: 60,
			maxUnitSentences: 3,
			allowSingleSentence: true
		});

		const sentence = `${'共通'.repeat(40)}です。`;
		const input = `${sentence}${sentence}続きです。`;

		const result = cleaner.clean(input, 'ja');
		expect(result.cleanedText).toBe(`${sentence}続きです。`);
	});

	it('does not compress short repeats below threshold', () => {
		const cleaner = new ConsecutiveBlockRepeatCleaner({
			minBlockNormalizedChars: 80,
			maxUnitSentences: 6,
			allowSingleSentence: true
		});

		const input = 'はい。はい。終わりです。';
		const result = cleaner.clean(input, 'ja');
		expect(result.cleanedText).toBe(input);
	});

	it('does not compress non-consecutive duplicates', () => {
		const cleaner = new ConsecutiveBlockRepeatCleaner({
			minBlockNormalizedChars: 40,
			maxUnitSentences: 6,
			allowSingleSentence: true
		});

		const s1 = `${'共通'.repeat(20)}です。`;
		const input = `${s1}間です。${s1}終わりです。`;
		const result = cleaner.clean(input, 'ja');
		expect(result.cleanedText).toBe(input);
	});
});

