import { requestUrl } from 'obsidian';

import { ApiClient } from '../../../src/infrastructure/api/ApiClient';

class TestApiClient extends ApiClient {
	testConnection(): Promise<boolean> {
		return Promise.resolve(true);
	}

	request(signal?: AbortSignal): Promise<unknown> {
		return this.get('/test', undefined, signal);
	}

	protected override getTimerWindow(): Window {
		return globalThis as unknown as Window;
	}
}

describe('ApiClient soft request boundary', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.mocked(requestUrl).mockReset();
		jest.mocked(requestUrl).mockReturnValue(
			new Promise(() => undefined) as unknown as ReturnType<typeof requestUrl>
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('rejects locally when requestUrl exceeds the configured timeout', async () => {
		const client = new TestApiClient({
			baseUrl: 'https://example.test',
			apiKey: 'test-key',
			timeout: 10,
			maxRetries: 0
		});
		const outcome = client.request().then(
			() => 'resolved',
			(error: unknown) => error instanceof Error ? error.name : 'unknown-error'
		);
		const sentinel = new Promise<string>(resolve => setTimeout(() => resolve('still-pending'), 50));
		const raced = Promise.race([outcome, sentinel]);

		await jest.advanceTimersByTimeAsync(50);

		await expect(raced).resolves.toBe('ApiTimeoutError');
	});

	it('rejects locally when a running request is cancelled', async () => {
		const client = new TestApiClient({
			baseUrl: 'https://example.test',
			apiKey: 'test-key',
			timeout: 1000,
			maxRetries: 0
		});
		const abortController = new AbortController();
		const outcome = client.request(abortController.signal).then(
			() => 'resolved',
			(error: unknown) => error instanceof Error ? error.name : 'unknown-error'
		);
		const sentinel = new Promise<string>(resolve => setTimeout(() => resolve('still-pending'), 50));
		const raced = Promise.race([outcome, sentinel]);

		abortController.abort();
		await jest.advanceTimersByTimeAsync(50);

		await expect(raced).resolves.toBe('RequestCancelledError');
	});
});
