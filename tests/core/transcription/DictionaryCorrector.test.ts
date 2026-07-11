import { DictionaryCorrector } from '../../../src/core/transcription/DictionaryCorrector';

import type { IGPTCorrectionService } from '../../../src/core/transcription/DictionaryCorrector';

describe('DictionaryCorrector cancellation', () => {
	it('passes the operation signal to GPT correction and does not swallow cancellation', async () => {
		const abortController = new AbortController();
		const service: IGPTCorrectionService = {
			correctWithGPT: jest.fn(async (_text, _language, _hints, signal) => {
				expect(signal).toBe(abortController.signal);
				abortController.abort();
				throw new DOMException('cancelled', 'AbortError');
			})
		};
		const corrector = createCorrector(service);

		await expect(corrector.correct(
			'teh value',
			'en',
			abortController.signal
		)).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('preserves rule-based output when a non-cancellation GPT error occurs', async () => {
		const service: IGPTCorrectionService = {
			correctWithGPT: jest.fn().mockRejectedValue(new Error('provider unavailable'))
		};
		const corrector = createCorrector(service);

		await expect(corrector.correct('teh value', 'en')).resolves.toBe('the value');
	});
});

function createCorrector(service: IGPTCorrectionService): DictionaryCorrector {
	const corrector = new DictionaryCorrector(true, service);
	corrector.addDictionary({
		name: 'test',
		language: 'en',
		enabled: true,
		entries: [{ pattern: 'teh', replacement: 'the' }]
	});
	return corrector;
}
