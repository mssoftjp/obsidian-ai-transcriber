import * as ModelCleaningConfig from '../../../src/config/ModelCleaningConfig';
import { getModelConfig } from '../../../src/config/ModelProcessingConfig';
import { DEFAULT_TRANSCRIPTION_MODEL } from '../../../src/config/TranscriptionModelProfiles';
import { GPT4oTranscriptionService } from '../../../src/application/services/GPT4oTranscriptionService';
import { GPT4oCleaningPipeline } from '../../../src/core/transcription/cleaners/GPT4oCleaningPipeline';

describe('GPT4oTranscriptionService', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('derives GPT Transcribe identity and operational limits from its profile-backed config', () => {
		const service = new GPT4oTranscriptionService('test-key', 'gpt-transcribe');
		const config = getModelConfig('gpt-transcribe');

		expect(service.modelId).toBe('gpt-transcribe');
		expect(service.modelName).toBe('GPT Transcribe');
		expect(service.capabilities.maxFileSizeMB).toBe(config.maxFileSizeMB);
		expect(service.capabilities.maxDurationSeconds).toBe(config.maxDurationSeconds);
		expect(service.estimateCost(60)).toEqual({
			amount: 0.0045,
			currency: 'USD',
			perMinute: 0.0045
		});
		expect(service.estimateCost(30).amount).toBe(0.00225);
	});

	it('uses the canonical default profile in the deprecated compatibility pipeline', () => {
		const getStrategy = jest.spyOn(ModelCleaningConfig, 'getModelCleaningStrategy');

		new GPT4oCleaningPipeline();

		expect(getStrategy).toHaveBeenCalledWith(DEFAULT_TRANSCRIPTION_MODEL);
	});
});
