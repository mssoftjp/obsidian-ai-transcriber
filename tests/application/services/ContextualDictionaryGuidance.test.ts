import {
	formatContextualGuidance,
	selectContextualGuidance
} from '../../../src/application/services/ContextualDictionaryGuidance';

import type { ContextualCorrection } from '../../../src/ApiSettings';

describe('ContextualDictionaryGuidance', () => {
	const entries: ContextualCorrection[] = [
		{
			from: ['おーぷんえーあい'],
			to: 'OpenAI',
			priority: 3,
			contextKeywords: ['API']
		},
		{
			from: ['こーでっくす'],
			to: 'Codex',
			priority: 5,
			contextKeywords: ['開発']
		},
		{
			from: ['おぶしでぃあん'],
			to: 'Obsidian',
			priority: 4,
			contextKeywords: ['ノート']
		}
	];

	it('selects entries relevant by variant, canonical spelling, or context keyword', () => {
		const selected = selectContextualGuidance(
			entries,
			'開発ではOpenAIと、おぶしでぃあんを使います。'
		);

		expect(selected.map(entry => entry.to)).toEqual(['Codex', 'Obsidian', 'OpenAI']);
	});

	it('uses stable dictionary order for equal priorities', () => {
		const equalPriorityEntries = entries.map(entry => ({ ...entry, priority: 3 }));

		const selected = selectContextualGuidance(
			equalPriorityEntries,
			'API、開発、ノート'
		);

		expect(selected.map(entry => entry.to)).toEqual(['OpenAI', 'Codex', 'Obsidian']);
	});

	it('limits guidance to 20 entries and 2000 formatted characters', () => {
		const manyEntries: ContextualCorrection[] = Array.from({ length: 30 }, (_, index) => ({
			from: [`誤認識${index}-${'長'.repeat(80)}`],
			to: `正表記${index}-${'正'.repeat(40)}`,
			priority: 5 - (index % 5),
			contextKeywords: ['共通']
		}));

		const selected = selectContextualGuidance(manyEntries, '共通');
		const formatted = formatContextualGuidance(selected);

		expect(selected.length).toBeLessThanOrEqual(20);
		expect(formatted.length).toBeLessThanOrEqual(2000);
	});

	it('formats correction assistance without instructing insertion of absent terms', () => {
		const formatted = formatContextualGuidance(selectContextualGuidance(entries, '開発'));

		expect(formatted).toContain('こーでっくす');
		expect(formatted).toContain('Codex');
		expect(formatted).toContain('開発');
		expect(formatted).toContain('本文にない用語を追加しない');
	});

	it('ignores incomplete contextual entries', () => {
		const incomplete: ContextualCorrection[] = [
			{ from: [], to: 'Missing source', contextKeywords: ['開発'] },
			{ from: ['みかん'], to: '', contextKeywords: ['開発'] }
		];

		expect(selectContextualGuidance(incomplete, '開発')).toEqual([]);
	});

	it('formats the guidance instruction for the detected language', () => {
		const selected = selectContextualGuidance(entries, 'development with Codex', 'en');

		expect(formatContextualGuidance(selected, 'en')).toContain('Do not add terms');
		expect(formatContextualGuidance(selected, 'en')).not.toContain('本文にない用語');
	});
});
