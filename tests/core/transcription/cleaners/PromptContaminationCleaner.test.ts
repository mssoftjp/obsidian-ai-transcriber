import * as ModelCleaningConfig from '../../../../src/config/ModelCleaningConfig';
import { DEFAULT_TRANSCRIPTION_MODEL } from '../../../../src/config/TranscriptionModelProfiles';
import { PromptContaminationCleaner } from '../../../../src/core/transcription/cleaners/PromptContaminationCleaner';

describe('PromptContaminationCleaner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the canonical default profile when no model is supplied', () => {
    const getStrategy = jest.spyOn(ModelCleaningConfig, 'getModelCleaningStrategy');

    new PromptContaminationCleaner();

    expect(getStrategy).toHaveBeenCalledWith(DEFAULT_TRANSCRIPTION_MODEL);
  });

  it('preserves ordinary transcript text that asks the listener to confirm something', () => {
    const cleaner = new PromptContaminationCleaner({ modelId: 'gpt-4o-transcribe' });
    const text = '第20章です。最後の固有語シリウスが残っていることを確認してください。これで合成音声を終了します。';

    const result = cleaner.clean(text, 'ja');

    expect(result.cleanedText).toBe(text);
    expect(result.metadata?.patternsMatched).not.toContain('Context pattern');
  });
});
