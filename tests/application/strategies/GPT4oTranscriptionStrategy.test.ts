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

  it('does not resend a chunk after an indeterminate local request timeout', async () => {
    const transcribe = jest.fn(async (chunk: AudioChunk): Promise<TranscriptionResult> => ({
      id: chunk.id,
      text: '',
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      success: false,
      error: 'API request exceeded the local 90000ms timeout'
    }));
    const service = {
      modelId: 'gpt-4o-mini-transcribe',
      transcribe
    } as unknown as TranscriptionService;
    const chunk = createChunk();

    const results = await new GPT4oTranscriptionStrategy(service)
      .processChunks([chunk], { language: 'ja' });

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(false);
  });

  it('retries once after an explicit HTTP 408 response without duplicating the result', async () => {
    const transcribe = jest.fn(async (chunk: AudioChunk): Promise<TranscriptionResult> => {
      if (transcribe.mock.calls.length === 1) {
        return {
          id: chunk.id,
          text: '',
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          success: false,
          error: 'API Error 408: Request timeout'
        };
      }
      return createResult(chunk.id, '再試行後の結果です。', chunk.startTime, chunk.endTime);
    });
    const service = {
      modelId: 'gpt-4o-mini-transcribe',
      transcribe
    } as unknown as TranscriptionService;
    const chunk = createChunk();

    const results = await new GPT4oTranscriptionStrategy(service)
      .processChunks([chunk], { language: 'ja' });

    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      createResult(chunk.id, '再試行後の結果です。', chunk.startTime, chunk.endTime)
    ]);
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

  it('trims a shifted GPT-4o overlap while preserving new content', async () => {
    const left = '本日は健康づくりの話をします。大阪に行くので、今後大阪府において健康づくりを広げます。';
    const right = 'その中で大阪に行くので、今後大阪府において健康づくりを広げます。次にフレイル予防の話に進みます。';
    const strategy = createMergeStrategy();

    const merged = await strategy.mergeResults([
      createResult(0, left, 0, 60),
      createResult(1, right, 30, 90)
    ]);

    expect(countOccurrences(merged, '大阪に行くので')).toBe(1);
    expect(countOccurrences(merged, '次にフレイル予防の話に進みます')).toBe(1);
  });

  it('trims a GPT-4o overlap after a generated preamble', async () => {
    const overlap = 'フレイルというのは心身の機能が衰え始める状態を指します。';
    const left = `今日は内容を一部抜粋してお話しします。${overlap}`;
    const right = `皆様、ありがとうございます。今日こちらの内容も一部抜粋してお話しいたします。まずですね、ここだけ覚えてください。${overlap}次に予防策の話をします。`;
    const strategy = createMergeStrategy();

    const merged = await strategy.mergeResults([
      createResult(0, left, 0, 90),
      createResult(1, right, 60, 150)
    ]);

    expect(countOccurrences(merged, overlap)).toBe(1);
    expect(countOccurrences(merged, '次に予防策の話をします')).toBe(1);
  });

  it('reconciles a varied overlap that continues after an exact boundary anchor', async () => {
    const anchor = '今回のサンプルは三種類あり、そのうち二種類はすでに使用されています。';
    const previousTail = '完全に安価品に置き換える話ではなく、もう一つ増やしても問題ないかを確認します。それにあたって、匂いを定量的に示せるか検討します。';
    const variedTail = '完全に安価品に置き換える話ではなくもう一つ増やしても問題ないか確認します。それにあたってにおいを定量的に示せるかを検討します。';
    const novelText = '次に分析装置の選定について説明します。';
    const left = `冒頭の説明です。${anchor}${previousTail}`;
    const right = `${anchor}${variedTail}${novelText}`;
    const strategy = createMergeStrategy();

    const merged = await strategy.mergeResults([
      createResult(0, left, 0, 240),
      createResult(1, right, 210, 450)
    ]);

    expect(merged).toBe(`${left}${novelText}`);
  });

  it('removes repeated varied copies of the same boundary while preserving novel speech', async () => {
    const anchor = '今回のサンプルは三種類あり、そのうち二種類はすでに使用されています。';
    const previousTail = '完全に安価品に置き換える話ではなく、もう一つ増やしても問題ないかを確認します。それにあたって、匂いを定量的に示せるか検討します。';
    const variedTailA = '完全に安価品に置き換える話ではなくもう一つ増やしても問題ないか確認します。それにあたってにおいを定量的に示せるかを検討します。';
    const variedTailB = '完全に安価品に置き換える話ではなく、もう一つ増やして問題ないかを確認します。それにあたって匂いを定量的に示せるか検討します。';
    const novelText = 'ここから新しい分析条件の説明に進みます。';
    const left = `冒頭の説明です。${anchor}${previousTail}`;
    const right = `${anchor}${variedTailA}${anchor}${variedTailB}${novelText}`;
    const strategy = createMergeStrategy();

    const merged = await strategy.mergeResults([
      createResult(0, left, 0, 240),
      createResult(1, right, 210, 450)
    ]);

    expect(merged).toBe(`${left}${novelText}`);
  });

  it('keeps unrelated text when an audio overlap has no confident text match', async () => {
    const left = '前半では原料の調達経路と品質確認の手順について詳しく説明しました。';
    const right = '後半では分析装置の校正方法と測定結果の保存方法について説明します。';
    const strategy = createMergeStrategy();

    const merged = await strategy.mergeResults([
      createResult(0, left, 0, 240),
      createResult(1, right, 210, 450)
    ]);

    expect(merged).toBe(`${left}\n\n${right}`);
  });

  it('preserves a short phrase genuinely repeated after the reconciled boundary', async () => {
    const anchor = '今回のサンプルは三種類あり、そのうち二種類はすでに使用されています。';
    const previousTail = '完全に置き換える話ではなく、追加して問題ないかを確認します。';
    const variedTail = '完全に置き換える話ではなく追加して問題ないか確認します。';
    const repeatedSpeech = '確認します。確認します。';
    const novelText = '次に分析条件を説明します。';
    const left = `冒頭の説明です。${anchor}${previousTail}`;
    const right = `${anchor}${variedTail}${repeatedSpeech}${novelText}`;
    const strategy = createMergeStrategy();

    const merged = await strategy.mergeResults([
      createResult(0, left, 0, 240),
      createResult(1, right, 210, 450)
    ]);

    expect(merged).toBe(`${left}${repeatedSpeech}${novelText}`);
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

function createMergeStrategy(): GPT4oTranscriptionStrategy {
  const service = {
    modelId: 'gpt-4o-transcribe',
    cleanText: jest.fn(async (text: string) => text)
  } as unknown as TranscriptionService;
  return new GPT4oTranscriptionStrategy(service);
}

function createChunk(): AudioChunk {
  return {
    id: 0,
    data: new ArrayBuffer(8),
    startTime: 0,
    endTime: 240,
    hasOverlap: false,
    overlapDuration: 0
  };
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}
