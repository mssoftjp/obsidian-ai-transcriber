import { ChunkingService } from '../../../src/core/chunking/ChunkingService';
import { ChunkingConfig } from '../../../src/core/chunking/ChunkingTypes';
import { ProcessedAudio } from '../../../src/core/audio/AudioTypes';

class TestChunkingService extends ChunkingService {
  async createChunks(): Promise<never[]> {
    return [];
  }
}

const baseConfig: ChunkingConfig = {
  constraints: {
    maxSizeMB: 50,
    maxDurationSeconds: 600,
    chunkDurationSeconds: 60,
    recommendedOverlapSeconds: 5,
    supportsParallelProcessing: false
  },
  processingMode: 'sequential',
  mergeStrategy: { type: 'simple', config: { separator: '\n' } }
};

function createAudio(duration: number, samples: number): ProcessedAudio {
  return {
    pcmData: new Float32Array(samples),
    sampleRate: 16000,
    duration,
    channels: 1,
    source: {
      data: new ArrayBuffer(0),
      fileName: 'test.wav',
      extension: 'wav',
      size: 0
    }
  };
}

describe('ChunkingService.calculateStrategy', () => {
  it('returns no chunking without adding undefined reason', () => {
    const service = new TestChunkingService(baseConfig);
    const strategy = service.calculateStrategy(createAudio(30, 16000 * 30));

    expect(strategy.needsChunking).toBe(false);
    expect(strategy.reason).toBeUndefined();
    expect('reason' in strategy).toBe(false);
  });

  it('uses duration as reason when chunking is required', () => {
    const service = new TestChunkingService(baseConfig);
    const strategy = service.calculateStrategy(createAudio(180, 16000 * 180));

    expect(strategy.needsChunking).toBe(true);
    expect(strategy.reason).toBe('duration');
    expect(strategy.totalChunks).toBeGreaterThan(1);
  });
});
