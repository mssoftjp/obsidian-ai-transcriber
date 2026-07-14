import { buildGPT4oTranscribeRequest } from '../../../src/config/openai/GPT4oTranscribeConfig';

describe('buildGPT4oTranscribeRequest', () => {
	it('ignores a legacy server chunking strategy', () => {
		const request = buildGPT4oTranscribeRequest({
			model: 'gpt-4o-transcribe',
			language: 'auto',
			chunkingStrategy: 'auto'
		} as Parameters<typeof buildGPT4oTranscribeRequest>[0] & { chunkingStrategy: 'auto' });

		expect(request).not.toHaveProperty('chunking_strategy');
	});

	it('omits the optional prompt when no user or continuation context exists', () => {
		const request = buildGPT4oTranscribeRequest({
			model: 'gpt-4o-transcribe',
			language: 'ja'
		}, true);

		expect(request.prompt).toBeUndefined();
	});

	it('sends only the bounded previous tail for a continuation chunk', () => {
		const previousContext = `${'前'.repeat(100)}${'末'.repeat(300)}`;
		const request = buildGPT4oTranscribeRequest({
			model: 'gpt-4o-transcribe',
			language: 'ja',
			previousContext
		}, false);

		expect(request.prompt).toBe('末'.repeat(300));
	});

	it('preserves both the user prompt and continuation tail', () => {
		const request = buildGPT4oTranscribeRequest({
			model: 'gpt-4o-mini-transcribe',
			language: 'ja',
			prompt: '固有語を正確に記録してください。',
			previousContext: '直前チャンクの末尾です。'
		}, false);

		expect(request.prompt).toBe(
			'固有語を正確に記録してください。\n\n直前チャンクの末尾です。'
		);
	});
});
