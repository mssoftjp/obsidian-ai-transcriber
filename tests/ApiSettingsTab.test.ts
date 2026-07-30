import { App } from 'obsidian';

import { DEFAULT_API_SETTINGS } from '../src/ApiSettings';
import { APISettingsTab } from '../src/ApiSettingsTab';
import { initializeTranslations } from '../src/i18n';
import en from '../src/i18n/translations/en';
import ja from '../src/i18n/translations/ja';
import ko from '../src/i18n/translations/ko';
import zh from '../src/i18n/translations/zh';

import type AITranscriberPlugin from '../src/main-api';

describe('APISettingsTab declarative settings', () => {
	beforeAll(() => {
		initializeTranslations({ en, ja, zh, ko });
	});

	it('indexes every visible settings row without performing I/O', () => {
		const saveSettings = jest.fn().mockResolvedValue(undefined);
		const plugin = {
			settings: structuredClone(DEFAULT_API_SETTINGS),
			getObsidianLanguage: jest.fn(() => 'en'),
			saveSettings
		} as unknown as AITranscriberPlugin;
		const tab = new APISettingsTab(new App(), plugin);

		const definitions = tab.getSettingDefinitions();

		expect(definitions).toHaveLength(9);
		const names = definitions.map(definition => 'name' in definition ? definition.name : undefined);
		expect(new Set(names).size).toBe(definitions.length);
		expect(definitions.every(definition => 'render' in definition)).toBe(true);
		expect(definitions.every(definition => (
			'aliases' in definition && Array.isArray(definition.aliases) && definition.aliases.length > 0
		))).toBe(true);
		const modelDefinition = definitions.find(definition => (
			'name' in definition && definition.name === en.settings.model.name
		));
		expect(modelDefinition).toMatchObject({
			aliases: expect.arrayContaining(['GPT Transcribe'])
		});
		expect(saveSettings).not.toHaveBeenCalled();
	});
});
