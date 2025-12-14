import { getModelCleaningStrategy } from '../../../../src/config/ModelCleaningConfig';
import { BaseHallucinationCleaner } from '../../../../src/core/transcription/cleaners/BaseHallucinationCleaner';

describe('BaseHallucinationCleaner', () => {
  const originalConsoleDebug = console.debug;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    console.debug = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.debug = originalConsoleDebug;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  it('removes Korean artifacts when language is ko', async () => {
    const strategy = getModelCleaningStrategy('gpt-4o-transcribe');
    const cleaner = new BaseHallucinationCleaner(undefined, strategy);

    const longText = `[음악] ${'a'.repeat(200)}`;
    const result = await cleaner.clean(longText, 'ko');
    expect(result.cleanedText).not.toContain('[음악]');
  });

  it('removes Korean artifacts when language is auto', async () => {
    const strategy = getModelCleaningStrategy('gpt-4o-transcribe');
    const cleaner = new BaseHallucinationCleaner(undefined, strategy);

    const longText = `[음악] ${'a'.repeat(200)}`;
    const result = await cleaner.clean(longText, 'auto');
    expect(result.cleanedText).not.toContain('[음악]');
  });

  it('removes Chinese artifacts when language is zh', async () => {
    const strategy = getModelCleaningStrategy('gpt-4o-transcribe');
    const cleaner = new BaseHallucinationCleaner(undefined, strategy);

    const longText = `[音乐] ${'a'.repeat(200)}`;
    const result = await cleaner.clean(longText, 'zh');
    expect(result.cleanedText).not.toContain('[音乐]');
  });

  it('removes Chinese artifacts when language is auto', async () => {
    const strategy = getModelCleaningStrategy('gpt-4o-transcribe');
    const cleaner = new BaseHallucinationCleaner(undefined, strategy);

    const longText = `[音乐] ${'a'.repeat(200)}`;
    const result = await cleaner.clean(longText, 'auto');
    expect(result.cleanedText).not.toContain('[音乐]');
  });
});
