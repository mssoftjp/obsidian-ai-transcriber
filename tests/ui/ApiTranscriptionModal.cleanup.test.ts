import { App, TFile } from 'obsidian';

import { DEFAULT_API_SETTINGS } from '../../src/ApiSettings';
import { TempFileManager } from '../../src/infrastructure/storage/TempFileManager';
import { APITranscriptionModal } from '../../src/ui/ApiTranscriptionModal';

import type { APITranscriber } from '../../src/ApiTranscriber';
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

describe('APITranscriptionModal temporary session cleanup', () => {
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
