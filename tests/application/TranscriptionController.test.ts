import { App, TFile } from 'obsidian';

import { DEFAULT_API_SETTINGS } from '../../src/ApiSettings';
import { TranscriptionController } from '../../src/application/TranscriptionController';
import { GPT4oTranscriptionService } from '../../src/application/services/GPT4oTranscriptionService';
import { CLIENT_MEDIA_BUDGET } from '../../src/core/audio/MediaWorkBudget';

describe('TranscriptionController direct upload plan', () => {
	it('applies only fixed corrections before optional AI post-processing', async () => {
		const audioBody = new Uint8Array([1, 2, 3, 4]).buffer;
		const app = new App();
		Object.assign(app.vault, { readBinary: jest.fn().mockResolvedValue(audioBody) });
		const file = new TFile();
		Object.assign(file, {
			path: 'audio/dictionary.mp3',
			name: 'dictionary.mp3',
			basename: 'dictionary',
			extension: 'mp3',
			stat: { ctime: 1, mtime: 1, size: audioBody.byteLength }
		});
		const settings = structuredClone(DEFAULT_API_SETTINGS);
		settings.openaiApiKey = `sk-${'a'.repeat(40)}`;
		settings.vadMode = 'disabled';
		settings.language = 'ja';
		settings.dictionaryCorrectionEnabled = true;
		settings.userDictionaries.ja.definiteCorrections = [{
			from: ['おーぷんえーあい'],
			to: 'OpenAI'
		}];
		settings.userDictionaries.ja.contextualCorrections = [{
			from: ['こーでっくす'],
			to: 'Codex',
			contextKeywords: ['開発']
		}];
		jest.spyOn(GPT4oTranscriptionService.prototype, 'transcribeFile').mockResolvedValue({
			id: 0,
			text: '開発では、おーぷんえーあいのこーでっくすを使います。',
			startTime: 0,
			endTime: 0,
			success: true
		});
		const controller = new TranscriptionController(app, settings);

		await expect(controller.transcribe(file)).resolves.toEqual({
			text: '開発では、OpenAIのこーでっくすを使います。',
			modelUsed: 'gpt-transcribe'
		});
	});

	it('bypasses client audio decoding for an eligible no-processing file', async () => {
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
		settings.vadMode = 'disabled';
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
			modelUsed: 'gpt-transcribe'
		});
		expect(readBinary).toHaveBeenCalledTimes(1);
		expect(directTranscription).toHaveBeenCalledWith(
			audioBody,
			'meeting.mp3',
			'audio/mpeg',
			expect.objectContaining({ language: 'auto' })
		);
	});

	it('keeps GPT Transcribe unchanged in the client-processing workflow', () => {
		const app = new App();
		const settings = structuredClone(DEFAULT_API_SETTINGS);
		settings.openaiApiKey = `sk-${'a'.repeat(40)}`;
		settings.model = 'gpt-transcribe';
		const controller = new TranscriptionController(app, settings);

		const { workflow } = (
			controller as unknown as {
				createWorkflow(): {
					workflow: {
						strategy: { getModelUsed(): string };
					};
				};
			}
		).createWorkflow();

		expect(workflow.strategy.getModelUsed()).toBe('gpt-transcribe');
	});

	it('fails closed for an unknown runtime model instead of selecting Mini', () => {
		const app = new App();
		const settings = structuredClone(DEFAULT_API_SETTINGS);
		settings.openaiApiKey = `sk-${'a'.repeat(40)}`;
		settings.model = 'unknown-model' as typeof settings.model;
		const controller = new TranscriptionController(app, settings);

		expect(() => (
			controller as unknown as { createWorkflow(): unknown }
		).createWorkflow()).toThrow(/Unknown model/);
	});

	it('rejects an oversized client job before reading it into memory', async () => {
		const app = new App();
		const readBinary = jest.fn();
		Object.assign(app.vault, { readBinary });
		const file = new TFile();
		Object.assign(file, {
			path: 'audio/oversized.mp3',
			name: 'oversized.mp3',
			basename: 'oversized',
			extension: 'mp3',
			stat: {
				ctime: 1,
				mtime: 1,
				size: CLIENT_MEDIA_BUDGET.maxEncodedBytes + 1
			}
		});
		const settings = structuredClone(DEFAULT_API_SETTINGS);
		settings.vadMode = 'local';
		const controller = new TranscriptionController(app, settings);

		await expect(controller.transcribe(file)).rejects.toMatchObject({
			code: 'MEDIA_WORK_BUDGET_EXCEEDED'
		});
		expect(readBinary).not.toHaveBeenCalled();
	});
});
