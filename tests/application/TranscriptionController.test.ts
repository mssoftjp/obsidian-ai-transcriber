import { App, TFile } from 'obsidian';

import { DEFAULT_API_SETTINGS } from '../../src/ApiSettings';
import { TranscriptionController } from '../../src/application/TranscriptionController';
import { GPT4oTranscriptionService } from '../../src/application/services/GPT4oTranscriptionService';

describe('TranscriptionController direct upload plan', () => {
	it('bypasses client audio decoding for an eligible server-VAD file', async () => {
		const audioBody = new Uint8Array([1, 2, 3, 4]).buffer;
		const app = new App();
		const readBinary = jest.fn().mockResolvedValue(audioBody);
		Object.assign(app.vault, { readBinary });
		const file = new TFile();
		Object.assign(file, {
			path: 'audio/meeting.mp3',
			name: 'meeting.mp3',
			basename: 'meeting',
			extension: 'mp3',
			stat: { ctime: 1, mtime: 1, size: audioBody.byteLength }
		});
		const settings = structuredClone(DEFAULT_API_SETTINGS);
		settings.openaiApiKey = `sk-${'a'.repeat(40)}`;
		settings.vadMode = 'server';
		const directTranscription = jest
			.spyOn(GPT4oTranscriptionService.prototype, 'transcribeFile')
			.mockResolvedValue({
				id: 0,
				text: 'direct result',
				startTime: 0,
				endTime: 0,
				success: true
			});
		const controller = new TranscriptionController(app, settings);

		await expect(controller.transcribe(file)).resolves.toEqual({
			text: 'direct result',
			modelUsed: 'gpt-4o-transcribe'
		});
		expect(readBinary).toHaveBeenCalledTimes(1);
		expect(directTranscription).toHaveBeenCalledWith(
			audioBody,
			'meeting.mp3',
			'audio/mpeg',
			expect.objectContaining({ language: 'auto' }),
			'auto'
		);
	});
});
