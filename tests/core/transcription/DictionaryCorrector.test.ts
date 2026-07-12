import { DictionaryCorrector } from '../../../src/core/transcription/DictionaryCorrector';

describe('DictionaryCorrector', () => {
	it('applies definite and contextual rules locally', async () => {
		const corrector = new DictionaryCorrector();
		corrector.addDictionary({
			name: 'test',
			language: 'ja',
			enabled: true,
			entries: [
				{ pattern: 'おーぷんえーあい', replacement: 'OpenAI' },
				{
					pattern: 'こーでっくす',
					replacement: 'Codex',
					condition: text => text.includes('開発')
				}
			]
		});

		await expect(corrector.correct(
			'開発では、おーぷんえーあいのこーでっくすを使います。',
			'ja'
		)).resolves.toBe('開発では、OpenAIのCodexを使います。');
	});

	it('does not apply contextual rules when their condition is not met', async () => {
		const corrector = new DictionaryCorrector();
		corrector.addDictionary({
			name: 'test',
			language: 'ja',
			enabled: true,
			entries: [{
				pattern: 'こーでっくす',
				replacement: 'Codex',
				condition: text => text.includes('開発')
			}]
		});

		await expect(corrector.correct('こーでっくす', 'ja')).resolves.toBe('こーでっくす');
	});

	it('rejects before processing when cancelled', async () => {
		const abortController = new AbortController();
		abortController.abort();

		await expect(new DictionaryCorrector().correct(
			'original',
			'ja',
			abortController.signal
		)).rejects.toMatchObject({ name: 'AbortError' });
	});
});
