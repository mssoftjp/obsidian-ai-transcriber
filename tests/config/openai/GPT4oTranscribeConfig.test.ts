import { buildGPT4oTranscribeRequest } from '../../../src/config/openai/GPT4oTranscribeConfig';

describe('buildGPT4oTranscribeRequest', () => {
	it('sends the server chunking strategy when requested', () => {
		const request = buildGPT4oTranscribeRequest({
			model: 'gpt-4o-transcribe',
			language: 'auto',
			chunkingStrategy: 'auto'
		} as Parameters<typeof buildGPT4oTranscribeRequest>[0] & { chunkingStrategy: 'auto' });

		expect(request).toMatchObject({ chunking_strategy: 'auto' });
	});
});
