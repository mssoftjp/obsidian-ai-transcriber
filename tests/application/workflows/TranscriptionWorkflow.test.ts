import { TFile } from 'obsidian';

import { GPT4oTranscriptionStrategy } from '../../../src/application/strategies/GPT4oTranscriptionStrategy';
import { TranscriptionWorkflow } from '../../../src/application/workflows/TranscriptionWorkflow';
import { ResourceManager } from '../../../src/core/resources/ResourceManager';

import type { AudioChunk } from '../../../src/core/audio/AudioTypes';
import type { AudioPipeline } from '../../../src/core/audio/AudioPipeline';
import type { TranscriptionService } from '../../../src/core/transcription/TranscriptionService';
import type { TranscriptionStrategy } from '../../../src/core/transcription/TranscriptionStrategy';
import type { ModelSpecificOptions, TranscriptionOptions, TranscriptionResult } from '../../../src/core/transcription/TranscriptionTypes';

describe('TranscriptionWorkflow cancellation', () => {
	it('does not begin audio processing when the external signal is already aborted', async () => {
		const process = jest.fn();
		const pipeline = { process } as unknown as AudioPipeline;
		const strategy = {
			strategyName: 'test',
			processingMode: 'sequential',
			getModelUsed: () => 'test-model',
			execute: jest.fn()
		} as unknown as TranscriptionStrategy;
		const workflow = new TranscriptionWorkflow(pipeline, strategy);
		const abortController = new AbortController();
		abortController.abort();
		const resourcesBefore = ResourceManager.getInstance().getStatistics();

		await expect(workflow.execute(
			createAudioFile(),
			new ArrayBuffer(8),
			{ signal: abortController.signal }
		)).rejects.toThrow();

		expect(process).not.toHaveBeenCalled();
		expect(strategy.execute).not.toHaveBeenCalled();
		expect(ResourceManager.getInstance().getStatistics()).toEqual(resourcesBefore);
	});

	it('continues normally when the external signal is active', async () => {
		const chunk = {
			id: 0,
			data: new ArrayBuffer(8),
			startTime: 0,
			endTime: 1,
			hasOverlap: false,
			overlapDuration: 0
		};
		const chunkStrategy = {
			needsChunking: false,
			totalChunks: 1,
			chunkDuration: 1,
			overlapDuration: 0,
			totalDuration: 1
		};
		const process = jest.fn().mockResolvedValue({
			chunks: [chunk],
			strategy: chunkStrategy,
			processedAudio: {
				pcmData: new Float32Array(1),
				sampleRate: 16_000,
				duration: 1,
				channels: 1,
				source: {}
			}
		});
		const pipeline = { process } as unknown as AudioPipeline;
		const execute = jest.fn().mockResolvedValue({ text: 'transcribed' });
		const strategy = {
			strategyName: 'test',
			processingMode: 'sequential',
			getModelUsed: () => 'test-model',
			execute
		} as unknown as TranscriptionStrategy;
		const workflow = new TranscriptionWorkflow(pipeline, strategy);

		const result = await workflow.execute(
			createAudioFile(),
			new ArrayBuffer(8),
			{ signal: new AbortController().signal }
		);

		expect(result.text).toBe('transcribed');
		expect(process).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it('merges a long multi-chunk transcription once and in timeline order without an API call', async () => {
		const firstOverlap = '境界一では固有語アルファと時刻十二時三十四分を確認し、次の話題へ安全に引き継ぎます。';
		const secondOverlap = '境界二では固有語ベータと番号五六七八を確認し、結論へ安全に引き継ぎます。';
		const chunkTexts = [
			`第一部の本文です。${firstOverlap}`,
			`${firstOverlap}第二部の本文です。${secondOverlap}`,
			`${secondOverlap}第三部の本文です。`
		];
		const chunks: AudioChunk[] = [
			createChunk(0, 0, 300, false),
			createChunk(1, 270, 570, true),
			createChunk(2, 540, 840, true)
		];
		const chunkStrategy = {
			needsChunking: true,
			totalChunks: chunks.length,
			chunkDuration: 300,
			overlapDuration: 30,
			totalDuration: 840
		};
		const process = jest.fn().mockResolvedValue({
			chunks,
			strategy: chunkStrategy,
			processedAudio: {
				pcmData: new Float32Array(1),
				sampleRate: 16_000,
				duration: 840,
				channels: 1,
				source: {}
			}
		});
		const transcribe = jest.fn(async (
			chunk: AudioChunk,
			_options: TranscriptionOptions,
			_modelOptions?: ModelSpecificOptions
		): Promise<TranscriptionResult> => ({
			id: chunk.id,
			text: chunkTexts[chunk.id] ?? '',
			startTime: chunk.startTime,
			endTime: chunk.endTime,
			success: true
		}));
		const cleanText = jest.fn(async (text: string) => text);
		const service = {
			modelId: 'gpt-4o-transcribe',
			transcribe,
			cleanText
		} as unknown as TranscriptionService;
		const strategy = new GPT4oTranscriptionStrategy(service);
		const workflow = new TranscriptionWorkflow(
			{ process } as unknown as AudioPipeline,
			strategy
		);

		const result = await workflow.execute(
			createAudioFile(),
			new ArrayBuffer(8),
			{ language: 'ja' }
		);

		expect(result.text).toBe(
			`第一部の本文です。${firstOverlap}第二部の本文です。${secondOverlap}第三部の本文です。`
		);
		expect(result.chunks).toBe(3);
		expect(result.partial).toBeUndefined();
		expect(transcribe).toHaveBeenCalledTimes(3);
		expect(transcribe.mock.calls.map(([chunk]) => chunk.id)).toEqual([0, 1, 2]);
		for (const call of transcribe.mock.calls) {
			expect(call[2]?.gpt4o?.previousContext).toBeUndefined();
		}
	});
});

function createChunk(id: number, startTime: number, endTime: number, hasOverlap: boolean): AudioChunk {
	return {
		id,
		data: new ArrayBuffer(8),
		startTime,
		endTime,
		hasOverlap,
		overlapDuration: hasOverlap ? 30 : 0
	};
}

function createAudioFile(): TFile {
	const file = new TFile();
	Object.assign(file, {
		path: 'audio/test.mp3',
		name: 'test.mp3',
		basename: 'test',
		extension: 'mp3'
	});
	return file;
}
