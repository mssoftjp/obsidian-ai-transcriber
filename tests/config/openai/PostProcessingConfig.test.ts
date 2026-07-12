import {
	buildPostProcessingMetaRequest,
	buildPostProcessingRequest,
	POST_PROCESSING_CONFIG
} from '../../../src/config/openai/PostProcessingConfig';

describe('PostProcessingConfig', () => {
	it('uses the pinned GPT-5 mini snapshot with documented limits', () => {
		expect(POST_PROCESSING_CONFIG.model).toBe('gpt-5-mini-2025-08-07');
		expect(POST_PROCESSING_CONFIG.limitations.maxInputTokens).toBe(272000);
		expect(POST_PROCESSING_CONFIG.limitations.maxOutputTokens).toBe(128000);
	});

	it('uses reasoning-model parameters for full-text processing', () => {
		const request = buildPostProcessingRequest('校正対象の文字起こしです。', '', [], 'ja');

		expect(request).toMatchObject({
			model: 'gpt-5-mini-2025-08-07',
			reasoning_effort: 'minimal'
		});
		expect(request.max_completion_tokens).toBeGreaterThan(0);
		expect(request).not.toHaveProperty('max_tokens');
		expect(request).not.toHaveProperty('temperature');
		expect(request).not.toHaveProperty('top_p');
	});

	it('uses reasoning-model parameters for metadata reduction', () => {
		const request = buildPostProcessingMetaRequest('話者: A', 'ja');

		expect(request).toMatchObject({
			model: 'gpt-5-mini-2025-08-07',
			max_completion_tokens: 500,
			reasoning_effort: 'minimal',
			response_format: { type: 'json_object' }
		});
		expect(request).not.toHaveProperty('max_tokens');
	});

	it('adds contextual dictionary guidance to the existing post-processing request', () => {
		const request = buildPostProcessingRequest(
			'こーでっくすを使います。',
			'',
			[],
			'ja',
			'文脈補正候補:\n- こーでっくす → Codex'
		);
		const userMessage = request.messages.find(message => message.role === 'user');

		expect(userMessage?.content).toContain('文脈補正候補');
		expect(userMessage?.content).toContain('こーでっくす → Codex');
	});

	it('omits the contextual dictionary section when no guidance is relevant', () => {
		const request = buildPostProcessingRequest('通常の本文です。', '', [], 'ja', '');
		const userMessage = request.messages.find(message => message.role === 'user');

		expect(userMessage?.content).not.toContain('文脈補正候補');
	});
});
