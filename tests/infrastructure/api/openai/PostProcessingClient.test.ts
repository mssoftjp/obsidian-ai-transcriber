import { getCompletedPostProcessingText } from '../../../../src/infrastructure/api/openai/PostProcessingClient';

import type { OpenAIChatResponse } from '../../../../src/infrastructure/api/openai/OpenAIChatTypes';

describe('getCompletedPostProcessingText', () => {
	it('accepts a completed response that preserves the full tail', () => {
		const original = `${'本文。'.repeat(200)}TAIL_MARKER`;
		const processed = `${'本文。'.repeat(200)}TAIL_MARKER`;

		expect(getCompletedPostProcessingText(response(processed, 'stop'), original)).toBe(processed);
	});

	it('rejects a token-limit response instead of saving a partial transcript', () => {
		const original = `${'本文。'.repeat(200)}TAIL_MARKER`;

		expect(() => getCompletedPostProcessingText(
			response('本文。'.repeat(100), 'length'),
			original
		)).toThrow('Post-processing output was incomplete: length');
	});

	it('rejects an abnormally short response even when the model reports stop', () => {
		const original = 'あ'.repeat(1000);

		expect(() => getCompletedPostProcessingText(
			response('あ'.repeat(500), 'stop'),
			original
		)).toThrow('unexpectedly shorter');
	});
});

function response(content: string, finishReason: string): OpenAIChatResponse {
	return {
		choices: [{
			message: { role: 'assistant', content },
			finish_reason: finishReason
		}]
	};
}
