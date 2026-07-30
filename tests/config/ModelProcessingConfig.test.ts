import {
	clearConfigCache,
	getModelConfig
} from '../../src/config/ModelProcessingConfig';

describe('ModelProcessingConfig', () => {
	beforeEach(() => {
		clearConfigCache();
	});

	it('shares the recorded-accurate preset without sharing model pricing', () => {
		const gptTranscribe = getModelConfig('gpt-transcribe');
		const gpt4o = getModelConfig('gpt-4o-transcribe');

		expect(gptTranscribe.chunkDurationSeconds).toBe(300);
		expect(gptTranscribe.vadChunking).toEqual(gpt4o.vadChunking);
		expect(gptTranscribe.merging).toEqual(gpt4o.merging);
		expect(gptTranscribe.pricing).toEqual({
			costPerMinute: 0.0045,
			currency: 'USD'
		});
		expect(gpt4o.pricing).toEqual({
			costPerMinute: 0.006,
			currency: 'USD'
		});
	});

	it('preserves economy and Whisper processing presets', () => {
		expect(getModelConfig('gpt-4o-mini-transcribe')).toMatchObject({
			chunkDurationSeconds: 240,
			pricing: {
				costPerMinute: 0.003,
				currency: 'USD'
			}
		});
		expect(getModelConfig('whisper-1')).toMatchObject({
			chunkDurationSeconds: 25,
			pricing: {
				costPerMinute: 0.006,
				currency: 'USD'
			}
		});
		expect(getModelConfig('whisper-1-ts')).toMatchObject({
			chunkDurationSeconds: 25,
			pricing: {
				costPerMinute: 0.006,
				currency: 'USD'
			}
		});
	});

	it('fails closed for an unknown model', () => {
		expect(() => getModelConfig('non-existent-model'))
			.toThrow(/Unknown model.*Available models: gpt-transcribe/);
	});
});
