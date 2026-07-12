import { DictionaryCorrector } from '../../../src/core/transcription/DictionaryCorrector';

describe('DictionaryCorrector', () => {
	it('applies fixed rules locally', async () => {
		const corrector = new DictionaryCorrector();
		corrector.addDictionary({
			name: 'test',
			language: 'ja',
			enabled: true,
			entries: [{ pattern: 'おーぷんえーあい', replacement: 'OpenAI' }]
		});

		await expect(corrector.correct(
			'おーぷんえーあいを使います。',
			'ja'
		)).resolves.toBe('OpenAIを使います。');
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
