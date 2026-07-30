import {
	getAvailableModelIds,
	getModelCleaningStrategy,
	hasCleaningStrategy
} from '../../src/config/ModelCleaningConfig';

describe('ModelCleaningConfig', () => {
	it('fails closed when the model is unknown', () => {
		expect(() => getModelCleaningStrategy('non-existent-model'))
			.toThrow(/Unknown model.*Available models: gpt-transcribe/);
	});

	const baseModels = [
		'gpt-transcribe',
		'gpt-4o-transcribe',
		'gpt-4o-mini-transcribe',
		'whisper-1',
		'whisper-1-ts'
	] as const;

	it.each(baseModels)('%s provides complete repetition thresholds', (modelId) => {
		const strategy = getModelCleaningStrategy(modelId);
		const thresholds = strategy.repetitionThresholds;
		expect(strategy.modelId).toBe(modelId);
		expect(thresholds).toBeDefined();
		expect(thresholds?.lengthFactor).toBeGreaterThan(0);
		expect(thresholds?.baseThreshold).toBeGreaterThan(0);
		expect(thresholds?.sentenceRepetition).toBeGreaterThan(0);
	});

	it('gives GPT Transcribe the recorded-accurate strategy with its own identity', () => {
		const gptTranscribe = getModelCleaningStrategy('gpt-transcribe');
		const gpt4o = getModelCleaningStrategy('gpt-4o-transcribe');

		expect(gptTranscribe).toMatchObject({
			modelId: 'gpt-transcribe',
			modelName: 'GPT Transcribe',
			pipelineType: 'gpt4o'
		});
		expect(gptTranscribe.repetitionThresholds).toEqual(gpt4o.repetitionThresholds);
		expect(gptTranscribe.safetyThresholds).toEqual(gpt4o.safetyThresholds);
	});

	it('derives model availability from the canonical profiles', () => {
		expect(getAvailableModelIds()).toEqual(baseModels);
		expect(hasCleaningStrategy('gpt-transcribe')).toBe(true);
		expect(hasCleaningStrategy('non-existent-model')).toBe(false);
	});

	it('debug variants preserve identity and required repetition threshold fields', () => {
		const debugStrategy = getModelCleaningStrategy('gpt-4o-mini-transcribe', true);
		const thresholds = debugStrategy.repetitionThresholds;
		expect(debugStrategy.modelId).toBe('gpt-4o-mini-transcribe');
		expect(thresholds).toBeDefined();
		expect(thresholds?.lengthFactor).toBeGreaterThan(0);
		expect(thresholds?.baseThreshold).toBeGreaterThan(0);
	});
});
