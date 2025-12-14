import { GPT4oTranscriptionStrategy } from '../../../src/application/strategies/GPT4oTranscriptionStrategy';

import type { TranscriptionService } from '../../../src/core/transcription/TranscriptionService';
import type { TranscriptionResult } from '../../../src/core/transcription/TranscriptionTypes';

describe('GPT4oTranscriptionStrategy', () => {
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

  it('passes requested language to cleanText when language is explicit', async () => {
    const cleanText = jest.fn(async (text: string, _language: string) => text);
    const service = {
      modelId: 'gpt-4o-transcribe',
      cleanText
    } as unknown as TranscriptionService;

    const strategy = new GPT4oTranscriptionStrategy(service);
    await strategy.processChunks([], { language: 'en' });

    const results: TranscriptionResult[] = [{
      id: 0,
      text: 'hello',
      startTime: 0,
      endTime: 1,
      success: true
    }];

    await strategy.mergeResults(results);

    expect(cleanText).toHaveBeenCalledTimes(1);
    expect((cleanText as jest.Mock).mock.calls[0][1]).toBe('en');
  });

  it('normalizes requested language codes (e.g., en-US -> en)', async () => {
    const cleanText = jest.fn(async (text: string, _language: string) => text);
    const service = {
      modelId: 'gpt-4o-transcribe',
      cleanText
    } as unknown as TranscriptionService;

    const strategy = new GPT4oTranscriptionStrategy(service);
    await strategy.processChunks([], { language: 'en-US' });

    const results: TranscriptionResult[] = [{
      id: 0,
      text: 'hello',
      startTime: 0,
      endTime: 1,
      success: true
    }];

    await strategy.mergeResults(results);

    expect(cleanText).toHaveBeenCalledTimes(1);
    expect((cleanText as jest.Mock).mock.calls[0][1]).toBe('en');
  });

  it('uses detected language when requested language is auto', async () => {
    const cleanText = jest.fn(async (text: string, _language: string) => text);
    const service = {
      modelId: 'gpt-4o-transcribe',
      cleanText
    } as unknown as TranscriptionService;

    const strategy = new GPT4oTranscriptionStrategy(service);
    await strategy.processChunks([], { language: 'auto' });

    const results: TranscriptionResult[] = [{
      id: 0,
      text: '감사합니다',
      startTime: 0,
      endTime: 1,
      success: true,
      language: 'ko'
    }];

    await strategy.mergeResults(results);

    expect(cleanText).toHaveBeenCalledTimes(1);
    expect((cleanText as jest.Mock).mock.calls[0][1]).toBe('ko');
  });
});

