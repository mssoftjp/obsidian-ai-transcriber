import { buildGPT4oTranscribeRequest } from '../../../src/config/openai/GPT4oTranscribeConfig';

describe('buildGPT4oTranscribeRequest', () => {
	it('uses the repeated-languages dialect for GPT Transcribe', () => {
		const request = buildGPT4oTranscribeRequest({
			model: 'gpt-transcribe',
			language: 'ja'
		});

		expect(request).toMatchObject({
			model: 'gpt-transcribe',
			temperature: 0,
			languages: ['ja']
		});
		expect(request).not.toHaveProperty('language');
		expect(request).not.toHaveProperty('reasoning_effort');
	});

	it('omits both language dialects for GPT Transcribe auto-detection', () => {
		const request = buildGPT4oTranscribeRequest({
			model: 'gpt-transcribe',
			language: 'auto'
		});

		expect(request).not.toHaveProperty('language');
		expect(request).not.toHaveProperty('languages');
	});

	it.each([
		'gpt-4o-transcribe',
		'gpt-4o-mini-transcribe'
	] as const)('retains singular language for %s', (model) => {
		const request = buildGPT4oTranscribeRequest({
			model,
			language: 'ja'
		});

		expect(request.language).toBe('ja');
		expect(request).not.toHaveProperty('languages');
	});

	it('rejects non-file and unknown models', () => {
		expect(() => buildGPT4oTranscribeRequest({
			model: 'whisper-1'
		} as unknown as Parameters<typeof buildGPT4oTranscribeRequest>[0]))
			.toThrow(/does not use the OpenAI file transcription workflow/);
		expect(() => buildGPT4oTranscribeRequest({
			model: 'unknown-model'
		} as unknown as Parameters<typeof buildGPT4oTranscribeRequest>[0]))
			.toThrow(/Unknown model/);
	});

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
