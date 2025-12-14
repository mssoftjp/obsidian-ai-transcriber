import { getModelCleaningStrategy } from '../../src/config/ModelCleaningConfig';

describe('ModelCleaningConfig', () => {
  it('falls back to GPT-4o mini strategy when model is unknown', () => {
    const strategy = getModelCleaningStrategy('non-existent-model');
    expect(strategy.modelId).toBe('gpt-4o-mini-transcribe');
  });

  const baseModels = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'] as const;

  it.each(baseModels)('%s provides complete repetition thresholds', (modelId) => {
    const strategy = getModelCleaningStrategy(modelId);
    const thresholds = strategy.repetitionThresholds;
    expect(thresholds).toBeDefined();
    expect(thresholds?.lengthFactor).toBeGreaterThan(0);
    expect(thresholds?.baseThreshold).toBeGreaterThan(0);
    expect(thresholds?.sentenceRepetition).toBeGreaterThan(0);
  });

  it('debug variants preserve required repetition threshold fields', () => {
    const debugStrategy = getModelCleaningStrategy('gpt-4o-mini-transcribe', true);
    const thresholds = debugStrategy.repetitionThresholds;
    expect(thresholds).toBeDefined();
    expect(thresholds?.lengthFactor).toBeGreaterThan(0);
    expect(thresholds?.baseThreshold).toBeGreaterThan(0);
  });
});
