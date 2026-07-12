import { DEFAULT_API_SETTINGS } from '../../../src/ApiSettings';
import { PostProcessingService } from '../../../src/application/services/PostProcessingService';

import type { ContextualCorrection } from '../../../src/ApiSettings';
import type { TranscriptionMetaInfo } from '../../../src/core/transcription/TranscriptionTypes';
import type { PostProcessingClient } from '../../../src/infrastructure/api/openai/PostProcessingClient';

describe('PostProcessingService dictionary guidance', () => {
	it('selects guidance per segment and falls back only the failed segment', async () => {
		const prefix = '開発でこーでっくすを使います。';
		const firstSegment = `${prefix}${'あ'.repeat(15000 - prefix.length)}`;
		const secondSegment = 'APIでおーぷんえーあいを使います。';
		const transcription = firstSegment + secondSegment;
		const processTranscription = jest
			.fn()
			.mockResolvedValueOnce({
				processedText: firstSegment.replace('こーでっくす', 'Codex'),
				modelUsed: 'gpt-5-mini-2025-08-07'
			})
			.mockRejectedValueOnce(new Error('temporary failure'));
		const client = { processTranscription } as unknown as PostProcessingClient;
		const settings = structuredClone(DEFAULT_API_SETTINGS);
		settings.postProcessingEnabled = true;
		const service = new PostProcessingService(settings, client);
		const metaInfo: TranscriptionMetaInfo = {
			rawContent: '',
			language: 'ja',
			enablePostProcessing: true
		};
		const contextualCorrections: ContextualCorrection[] = [
			{
				from: ['こーでっくす'],
				to: 'Codex',
				priority: 5,
				contextKeywords: ['開発']
			},
			{
				from: ['おーぷんえーあい'],
				to: 'OpenAI',
				priority: 4,
				contextKeywords: ['API']
			}
		];

		const result = await service.processTranscription(
			transcription,
			metaInfo,
			contextualCorrections
		);

		expect(processTranscription).toHaveBeenCalledTimes(2);
		expect(processTranscription.mock.calls[0]?.[3]).toContain('こーでっくす → Codex');
		expect(processTranscription.mock.calls[0]?.[3]).not.toContain('おーぷんえーあい → OpenAI');
		expect(processTranscription.mock.calls[1]?.[3]).toContain('おーぷんえーあい → OpenAI');
		expect(processTranscription.mock.calls[1]?.[3]).not.toContain('こーでっくす → Codex');
		expect(result.processedText).toBe(
			firstSegment.replace('こーでっくす', 'Codex') + secondSegment
		);
	});
});
