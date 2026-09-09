import { decodeWmaStandard } from '../../../src/infrastructure/audio/WmaDecoder';

describe('WmaDecoder input validation', () => {
	it('rejects a non-ASF payload before creating a worker', async () => {
		const worker = jest.fn();
		Object.defineProperty(globalThis, 'Worker', { value: worker, configurable: true });

		await expect(decodeWmaStandard(new ArrayBuffer(64))).rejects.toMatchObject({
			code: 'AUDIO_DECODING_FAILED',
			message: 'The selected .wma file is not an ASF/WMA container.'
		});
		expect(worker).not.toHaveBeenCalled();
	});

	it('preserves cancellation before allocating decoder resources', async () => {
		const abortController = new AbortController();
		abortController.abort();

		await expect(decodeWmaStandard(new ArrayBuffer(64), abortController.signal))
			.rejects.toMatchObject({ name: 'AbortError' });
	});
});
