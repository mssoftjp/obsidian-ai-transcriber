import { getModelConfig } from '../../../src/config/ModelProcessingConfig';
import { WhisperTranscriptionService } from '../../../src/application/services/WhisperTranscriptionService';

describe('WhisperTranscriptionService', () => {
	it('derives timestamp capabilities and limits from the selected profile', () => {
		const service = new WhisperTranscriptionService('test-key', 'whisper-1-ts');
		const config = getModelConfig('whisper-1-ts');

		expect(service.modelId).toBe('whisper-1-ts');
		expect(service.modelName).toBe('OpenAI Whisper (timestamps)');
		expect(service.capabilities).toMatchObject({
			supportsTimestamps: true,
			supportsWordLevel: true,
			maxFileSizeMB: config.maxFileSizeMB,
			maxDurationSeconds: config.maxDurationSeconds
		});
	});

	it('rejects a valid model assigned to the wrong workflow', () => {
		expect(() => new WhisperTranscriptionService('test-key', 'gpt-transcribe'))
			.toThrow(/does not use the Whisper workflow/);
	});
});
