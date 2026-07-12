import { App, TFile } from 'obsidian';

import { DEFAULT_API_SETTINGS } from '../../src/ApiSettings';
import { TempFileManager } from '../../src/infrastructure/storage/TempFileManager';
import { APITranscriptionModal } from '../../src/ui/ApiTranscriptionModal';

import type { APITranscriber } from '../../src/ApiTranscriber';
import type { ContextualCorrection } from '../../src/ApiSettings';
import type { Component } from 'obsidian';

jest.mock('../../src/utils/Logger', () => ({
	Logger: {
		getLogger: jest.fn(() => ({
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn()
		}))
	}
}));

interface TemporarySessionCleanup {
	cleanupTemporarySession(): Promise<void>;
}

interface ContextualCorrectionsAccessor {
	getContextualCorrectionsForPostProcessing(): ContextualCorrection[];
}

describe('APITranscriptionModal temporary session cleanup', () => {
	it('takes a contextual dictionary snapshot only when both features are enabled', () => {
		const app = new App();
		const audioFile = new TFile();
		const parent = { addChild: jest.fn(), removeChild: jest.fn() } as unknown as Component;
		const settings = structuredClone(DEFAULT_API_SETTINGS);
		settings.language = 'auto';
		settings.dictionaryCorrectionEnabled = true;
		settings.postProcessingEnabled = true;
		settings.userDictionaries.ja.contextualCorrections = [{
			from: ['こーでっくす'],
			to: 'Codex',
			contextKeywords: ['開発']
		}];
		settings.userDictionaries.en.contextualCorrections = [{
			from: ['open ai'],
			to: 'OpenAI',
			contextKeywords: ['API']
		}];
		const modal = new APITranscriptionModal(
			app,
			parent,
			{} as APITranscriber,
			audioFile,
			settings
		) as unknown as ContextualCorrectionsAccessor;

		const snapshot = modal.getContextualCorrectionsForPostProcessing();
		expect(snapshot.map(entry => entry.to)).toEqual(['Codex', 'OpenAI']);
		expect(snapshot[0]).not.toBe(settings.userDictionaries.ja.contextualCorrections?.[0]);

		settings.postProcessingEnabled = false;
		expect(modal.getContextualCorrectionsForPostProcessing()).toEqual([]);
		settings.postProcessingEnabled = true;
		settings.dictionaryCorrectionEnabled = false;
		expect(modal.getContextualCorrectionsForPostProcessing()).toEqual([]);
	});

	it('cleans an external session exactly once', async () => {
		const app = new App();
		const audioFile = new TFile();
		audioFile.path = 'ai-transcriber-temp/ait-mrg23hpz-abcdef12/audio.wav';
		audioFile.name = 'audio.wav';
		audioFile.basename = 'audio';
		audioFile.extension = 'wav';
		const parent = {
			addChild: jest.fn(),
			removeChild: jest.fn()
		} as unknown as Component;
		const cleanupSession = jest
			.spyOn(TempFileManager.prototype, 'cleanupSession')
			.mockResolvedValue();
		const modal = new APITranscriptionModal(
			app,
			parent,
			{} as APITranscriber,
			audioFile,
			structuredClone(DEFAULT_API_SETTINGS),
			undefined,
			undefined,
			'ait-mrg23hpz-abcdef12'
		) as unknown as TemporarySessionCleanup;

		await modal.cleanupTemporarySession();
		await modal.cleanupTemporarySession();

		expect(cleanupSession).toHaveBeenCalledWith('ait-mrg23hpz-abcdef12');
		expect(cleanupSession).toHaveBeenCalledTimes(1);
	});
});
