import { GPT4oTranscriptionStrategy } from '../../../src/application/strategies/GPT4oTranscriptionStrategy';

import type { AudioChunk } from '../../../src/core/audio/AudioTypes';
import type { TranscriptionService } from '../../../src/core/transcription/TranscriptionService';
import type {
  ModelSpecificOptions,
  TranscriptionOptions,
  TranscriptionResult
} from '../../../src/core/transcription/TranscriptionTypes';

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

  it('defaults to serial chunk processing for stability', () => {
    const service = {
      modelId: 'gpt-4o-transcribe'
    } as unknown as TranscriptionService;

    const strategy = new GPT4oTranscriptionStrategy(service);

    expect(strategy.maxConcurrency).toBe(1);
  });

  it('preserves previous context across internal wave-group boundaries', async () => {
    const transcribe = jest.fn(async (
      chunk: AudioChunk,
      _options: TranscriptionOptions,
      _modelOptions?: ModelSpecificOptions
    ): Promise<TranscriptionResult> => ({
      id: chunk.id,
      text: `チャンク${chunk.id + 1}の本文と固有語です。`,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      success: true
    }));
    const service = {
      modelId: 'gpt-4o-transcribe',
      transcribe
    } as unknown as TranscriptionService;
    const chunks: AudioChunk[] = Array.from({ length: 6 }, (_, id) => ({
      id,
      data: new ArrayBuffer(8),
      startTime: id * 270,
      endTime: id * 270 + 300,
      hasOverlap: id > 0,
      overlapDuration: id > 0 ? 30 : 0
    }));

    const strategy = new GPT4oTranscriptionStrategy(service);
    await strategy.processChunks(chunks, { language: 'ja' });

    expect(transcribe).toHaveBeenCalledTimes(6);
    expect(transcribe.mock.calls[0]?.[2]).toBeUndefined();
    for (let i = 1; i < transcribe.mock.calls.length; i++) {
      expect(transcribe.mock.calls[i]?.[2]?.gpt4o?.previousContext)
        .toContain(`チャンク${i}の本文と固有語です。`);
    }
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

  it('normalizes Chinese language codes (e.g., zh-CN -> zh)', async () => {
    const cleanText = jest.fn(async (text: string, _language: string) => text);
    const service = {
      modelId: 'gpt-4o-transcribe',
      cleanText
    } as unknown as TranscriptionService;

    const strategy = new GPT4oTranscriptionStrategy(service);
    await strategy.processChunks([], { language: 'zh-CN' });

    const results: TranscriptionResult[] = [{
      id: 0,
      text: '你好',
      startTime: 0,
      endTime: 1,
      success: true
    }];

    await strategy.mergeResults(results);

    expect(cleanText).toHaveBeenCalledTimes(1);
    expect((cleanText as jest.Mock).mock.calls[0][1]).toBe('zh');
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

  it('uses detected Chinese language when requested language is auto', async () => {
    const cleanText = jest.fn(async (text: string, _language: string) => text);
    const service = {
      modelId: 'gpt-4o-transcribe',
      cleanText
    } as unknown as TranscriptionService;

    const strategy = new GPT4oTranscriptionStrategy(service);
    await strategy.processChunks([], { language: 'auto' });

    const results: TranscriptionResult[] = [{
      id: 0,
      text: '你好',
      startTime: 0,
      endTime: 1,
      success: true,
      language: 'zh'
    }];

    await strategy.mergeResults(results);

    expect(cleanText).toHaveBeenCalledTimes(1);
    expect((cleanText as jest.Mock).mock.calls[0][1]).toBe('zh');
  });

  it('merges successful chunks in timeline order even when results arrive out of order', async () => {
    const overlap = 'この境界文は十分に長く、順序が乱れた場合でも一度だけ残ることを確認するための固有文章です。';
    const cleanText = jest.fn(async (text: string) => text);
    const service = {
      modelId: 'gpt-4o-transcribe',
      cleanText
    } as unknown as TranscriptionService;
    const strategy = new GPT4oTranscriptionStrategy(service);
    const results: TranscriptionResult[] = [
      createResult(2, `${overlap}第三部です。`, 540, 840),
      createResult(0, `第一部です。${overlap}`, 0, 300),
      createResult(1, `${overlap}第二部です。${overlap}`, 270, 570)
    ];

    const firstBoundary = await strategy.mergeResults([results[1]!, results[2]!]);
    const merged = await strategy.mergeResults(results);

    expect(firstBoundary).toBe(`第一部です。${overlap}第二部です。${overlap}`);
    expect(merged).toBe(`第一部です。${overlap}第二部です。${overlap}第三部です。`);
  });

  it('keeps a visible timeline gap when a middle chunk fails', async () => {
    const cleanText = jest.fn(async (text: string) => text);
    const service = {
      modelId: 'gpt-4o-transcribe',
      cleanText
    } as unknown as TranscriptionService;
    const strategy = new GPT4oTranscriptionStrategy(service);
    const results: TranscriptionResult[] = [
      createResult(0, '第一部です。', 0, 300),
      {
        id: 1,
        text: '',
        startTime: 270,
        endTime: 570,
        success: false,
        error: 'network unavailable'
      },
      createResult(2, '第三部です。', 540, 840)
    ];

    const merged = await strategy.mergeResults(results);

    expect(merged).toContain('第一部です。');
    expect(merged).toContain('【欠損: チャンク2 (00:04:30–00:09:30)】');
    expect(merged).toContain('network unavailable');
    expect(merged).toContain('第三部です。');
    expect(merged.indexOf('第一部です。')).toBeLessThan(merged.indexOf('【欠損:'));
    expect(merged.indexOf('【欠損:')).toBeLessThan(merged.indexOf('第三部です。'));
  });
});

function createResult(
  id: number,
  text: string,
  startTime: number,
  endTime: number
): TranscriptionResult {
  return {
    id,
    text,
    startTime,
    endTime,
    success: true
  };
}
