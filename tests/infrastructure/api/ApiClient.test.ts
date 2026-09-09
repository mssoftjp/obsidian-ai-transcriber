import { requestUrl } from 'obsidian';

import { ApiClient } from '../../../src/infrastructure/api/ApiClient';
import { GPT4oClient } from '../../../src/infrastructure/api/openai/GPT4oClient';
import { WhisperClient } from '../../../src/infrastructure/api/openai/WhisperClient';

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

describe('transcription rate-limit recovery', () => {
	const reply = (status: number, headers: Record<string, string> = {}, code?: string, type?: string) => ({
		status, headers: { 'content-type': 'application/json', ...headers },
		json: status === 200 ? { text: 'ok' } : { error: { message: 'rejected', code, type } },
		text: '', arrayBuffer: new ArrayBuffer(0)
	});
	const client = () => new TestApiClient({ baseUrl: 'https://example.test', apiKey: 'test',
		retryMode: 'rate-limit-only', maxRetries: 2, retryDelay: 1000, timeout: 10000 });
	beforeEach(() => { jest.useFakeTimers(); jest.mocked(requestUrl).mockReset(); });
	afterEach(() => { jest.useRealTimers(); });

	it.each(['Retry-After', 'rEtRy-AfTeR'])('honors %s before retrying a rejected request', async header => {
		jest.mocked(requestUrl).mockResolvedValueOnce(reply(429, { [header]: '3' }, 'rate_limit_exceeded'))
			.mockResolvedValueOnce(reply(200));
		const result = client().request();
		await jest.advanceTimersByTimeAsync(2999);
		expect(requestUrl).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(1);
		await expect(result).resolves.toEqual({ text: 'ok' });
		expect(requestUrl).toHaveBeenCalledTimes(2);
	});

	it('honors an HTTP-date Retry-After', async () => {
		jest.setSystemTime(new Date('2026-09-10T00:00:00Z'));
		jest.mocked(requestUrl).mockResolvedValueOnce(reply(429, { 'retry-after': 'Thu, 10 Sep 2026 00:00:05 GMT' }))
			.mockResolvedValueOnce(reply(200));
		const result = client().request();
		await jest.advanceTimersByTimeAsync(4999);
		expect(requestUrl).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(1);
		await expect(result).resolves.toEqual({ text: 'ok' });
	});

	it.each(['insufficient_quota', 'billing_hard_limit_reached', 'unknown_code'])('does not retry %s', async code => {
		jest.mocked(requestUrl).mockResolvedValue(reply(429, {}, code));
		await expect(client().request()).rejects.toMatchObject({ status: 429, code });
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('does not retry quota reported through error.type', async () => {
		jest.mocked(requestUrl).mockResolvedValue(reply(429, {}, undefined, 'insufficient_quota'));
		await expect(client().request()).rejects.toMatchObject({ status: 429 });
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it.each([408, 500, 503])('does not resend an indeterminate HTTP %i', async status => {
		jest.mocked(requestUrl).mockResolvedValue(reply(status));
		await expect(client().request()).rejects.toMatchObject({ status });
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('bounds retry count and makes the following chunk respect cooldown', async () => {
		jest.mocked(requestUrl).mockResolvedValue(reply(429, { 'retry-after': '3' }));
		const api = client();
		const first = api.request().catch((error: unknown) => error);
		await jest.advanceTimersByTimeAsync(6000);
		expect(await first).toMatchObject({ status: 429 });
		expect(requestUrl).toHaveBeenCalledTimes(3);
		jest.mocked(requestUrl).mockResolvedValue(reply(200));
		const next = api.request();
		await jest.advanceTimersByTimeAsync(3999);
		expect(requestUrl).toHaveBeenCalledTimes(3);
		await jest.advanceTimersByTimeAsync(251);
		await expect(next).resolves.toEqual({ text: 'ok' });
	});

	it('rechecks cooldown when another in-flight chunk extends it', async () => {
		let rejectSecond!: (response: ReturnType<typeof reply>) => void;
		jest.mocked(requestUrl).mockResolvedValueOnce(reply(429, { 'retry-after': '3' }))
			.mockReturnValueOnce(new Promise(resolve => { rejectSecond = resolve; }) as ReturnType<typeof requestUrl>)
			.mockResolvedValue(reply(200));
		const api = client();
		const first = api.request();
		const second = api.request();
		await jest.advanceTimersByTimeAsync(1000);
		rejectSecond(reply(429, { 'retry-after': '5' }));
		await jest.advanceTimersByTimeAsync(4999);
		expect(requestUrl).toHaveBeenCalledTimes(2);
		await jest.advanceTimersByTimeAsync(1);
		await expect(Promise.all([first, second])).resolves.toEqual([{ text: 'ok' }, { text: 'ok' }]);
		expect(requestUrl).toHaveBeenCalledTimes(4);
	});

	it('bounds total wait without shortening a long Retry-After', async () => {
		jest.mocked(requestUrl).mockResolvedValue(reply(429, { 'retry-after': '40' }));
		const api = client();
		const result = api.request().catch((error: unknown) => error);
		await jest.advanceTimersByTimeAsync(40000);
		expect(await result).toMatchObject({ status: 429 });
		expect(requestUrl).toHaveBeenCalledTimes(2);
	});

	it('rejects immediately while an excessive server cooldown remains', async () => {
		jest.mocked(requestUrl).mockResolvedValue(reply(429, { 'retry-after': '120' }));
		const api = client();
		await expect(api.request()).rejects.toMatchObject({ status: 429 });
		await expect(api.request()).rejects.toMatchObject({ status: 429 });
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('cancels backoff without sending again', async () => {
		jest.mocked(requestUrl).mockResolvedValue(reply(429, { 'retry-after': '3' }));
		const controller = new AbortController();
		const result = client().request(controller.signal).catch((error: unknown) => error);
		await jest.advanceTimersByTimeAsync(1);
		controller.abort();
		await jest.advanceTimersByTimeAsync(5000);
		expect(await result).toMatchObject({ name: 'RequestCancelledError' });
		expect(requestUrl).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('does not retry a local timeout or network failure', async () => {
		jest.mocked(requestUrl).mockReturnValue(new Promise(() => undefined) as ReturnType<typeof requestUrl>);
		const result = client().request().catch((error: unknown) => error);
		await jest.advanceTimersByTimeAsync(10000);
		expect(await result).toMatchObject({ name: 'ApiTimeoutError' });
		expect(requestUrl).toHaveBeenCalledTimes(1);
		jest.mocked(requestUrl).mockReset().mockRejectedValue(new Error('network failed'));
		await expect(client().request()).rejects.toThrow('network failed');
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});
});

class TimedGPTClient extends GPT4oClient {
	constructor(key: string) { super(key, 'gpt-transcribe'); }
	protected override getTimerWindow(): Window { return globalThis as unknown as Window; }
}
class TimedWhisperClient extends WhisperClient {
	protected override getTimerWindow(): Window { return globalThis as unknown as Window; }
}

describe.each([TimedGPTClient, TimedWhisperClient])('%s production retry configuration', Client => {
	beforeEach(() => { jest.useFakeTimers(); jest.mocked(requestUrl).mockReset(); });
	afterEach(() => jest.useRealTimers());
	it('recovers from a temporary rejection using its constructor policy', async () => {
		jest.mocked(requestUrl).mockResolvedValueOnce({ status: 429, headers: { 'retry-after': '10' },
			json: { error: { code: 'rate_limit_exceeded' } }, text: '', arrayBuffer: new ArrayBuffer(0) })
			.mockResolvedValueOnce({ status: 200, headers: {}, json: {}, text: '', arrayBuffer: new ArrayBuffer(0) });
		const result = new Client('test-key').testConnection();
		await jest.advanceTimersByTimeAsync(9999);
		expect(requestUrl).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(1);
		await expect(result).resolves.toBe(true);
		expect(requestUrl).toHaveBeenCalledTimes(2);
	});
});
