import { TFile } from 'obsidian';

import { TranscriptionWorkflow } from '../../../src/application/workflows/TranscriptionWorkflow';
import { ResourceManager } from '../../../src/core/resources/ResourceManager';

import type { AudioPipeline } from '../../../src/core/audio/AudioPipeline';
import type { TranscriptionStrategy } from '../../../src/core/transcription/TranscriptionStrategy';

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
});

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
