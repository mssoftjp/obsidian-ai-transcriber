
import { DEFAULT_API_SETTINGS } from '../../ApiSettings';
import { UI_CONSTANTS } from '../../config/constants';

import type { APITranscriptionSettings, LanguageDictionaries, UserDictionary, DictionaryEntry, ContextualCorrection } from '../../ApiSettings';
import type { TranscriptionTask } from '../../ui/ProgressTracker';
import type { Plugin } from 'obsidian';

type StoredSettings = Omit<APITranscriptionSettings, 'userDictionaries'>;
type LegacyDictionaryEntry = Omit<DictionaryEntry, 'from'> & { from: string | string[] };
type LegacyContextualCorrection = Omit<ContextualCorrection, 'from' | 'contextKeywords'> & {
	from: string | string[];
	contextKeywords?: string | string[];
};

interface SettingsSegment {
	version: number;
	data: StoredSettings;
}

interface DictionariesSegment {
	version: number;
	languages: LanguageDictionaries;
}

interface HistorySegment {
	version: number;
	items: TranscriptionTask[];
}

export interface PluginState {
	meta: {
		version: number;
		format: 'ai-transcriber-state';
		updatedAt: string;
	};
	settings: SettingsSegment;
	dictionaries: DictionariesSegment;
	history: HistorySegment;
}

const STATE_VERSION = 1;
const SETTINGS_VERSION = 1;
const DICTIONARIES_VERSION = 1;
const HISTORY_VERSION = 1;

function deepClone<T>(value: T): T {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}

function cloneStoredSettings(settings: StoredSettings): StoredSettings {
	return deepClone(settings);
}

function cloneDictionaries(dictionaries: LanguageDictionaries): LanguageDictionaries {
	return deepClone(dictionaries);
}

function createEmptyDictionary(): UserDictionary {
	return {
		definiteCorrections: [],
		contextualCorrections: []
	};
}

const DEFAULT_SETTINGS_CORE = (({ userDictionaries: _ignored, ...rest }) => rest)(DEFAULT_API_SETTINGS);

function getDefaultState(): PluginState {
	return {
		meta: {
			version: STATE_VERSION,
			format: 'ai-transcriber-state',
			updatedAt: new Date(0).toISOString()
		},
		settings: {
			version: SETTINGS_VERSION,
			data: cloneStoredSettings(DEFAULT_SETTINGS_CORE)
		},
		dictionaries: {
			version: DICTIONARIES_VERSION,
			languages: cloneDictionaries(DEFAULT_API_SETTINGS.userDictionaries)
		},
		history: {
			version: HISTORY_VERSION,
			items: []
		}
	};
}

export class PluginStateRepository {
	private state: PluginState = getDefaultState();
	private initialized = false;

	constructor(private readonly plugin: Plugin) {}

	async initialize(): Promise<PluginState> {
		if (this.initialized) {
			return this.state;
		}

		const raw: unknown = await this.plugin.loadData();
		if (this.isPluginState(raw)) {
			this.state = this.mergeWithDefaults(raw);
		} else if (raw && typeof raw === 'object') {
			this.state = this.createStateFromLegacy(raw as Partial<APITranscriptionSettings>);
		} else {
			this.state = getDefaultState();
		}
		await this.persistState();
		this.initialized = true;
		return this.state;
	}

	getSettings(): StoredSettings {
		this.ensureInitialized();
		return cloneStoredSettings(this.state.settings.data);
	}

	getDictionaries(): LanguageDictionaries {
		this.ensureInitialized();
		return cloneDictionaries(this.state.dictionaries.languages);
	}

	getHistory(): TranscriptionTask[] {
		this.ensureInitialized();
		return deepClone(this.state.history.items);
	}

	async saveSettings(settings: APITranscriptionSettings): Promise<void> {
		this.ensureInitialized();
		const { userDictionaries, ...stored } = settings;
		this.state.settings.data = cloneStoredSettings(stored);
		this.state.dictionaries.languages = cloneDictionaries(
			this.ensureAllLanguages(userDictionaries)
		);
		await this.persistState();
	}

	async saveHistory(history: TranscriptionTask[]): Promise<void> {
		this.ensureInitialized();
		const trimmed = [...history].slice(0, UI_CONSTANTS.MAX_HISTORY_ITEMS);
		this.state.history.items = deepClone(trimmed);
		await this.persistState();
	}

	private ensureAllLanguages(dictionaries: LanguageDictionaries | Partial<LanguageDictionaries>): LanguageDictionaries {
		const ensure = (dict?: UserDictionary): UserDictionary => {
			if (!dict) {
				return createEmptyDictionary();
			}
			return {
				definiteCorrections: dict.definiteCorrections,
				contextualCorrections: dict.contextualCorrections ?? []
			};
		};

		return {
			ja: ensure(dictionaries.ja),
			en: ensure(dictionaries.en),
			zh: ensure(dictionaries.zh),
			ko: ensure(dictionaries.ko)
		};
	}

	private migrateDictionaryFormat(data: LanguageDictionaries): LanguageDictionaries {
		const clone = this.ensureAllLanguages(data);
		const languages: (keyof LanguageDictionaries)[] = ['ja', 'en', 'zh', 'ko'];
			languages.forEach((lang) => {
				clone[lang] = {
					definiteCorrections: clone[lang].definiteCorrections.map(entry => this.normalizeDictionaryEntry(entry)),
					contextualCorrections: (clone[lang].contextualCorrections ?? []).map(entry => this.normalizeContextualEntry(entry))
				};
			});
			return clone;
		}

	private normalizeDictionaryEntry(entry: DictionaryEntry | LegacyDictionaryEntry): DictionaryEntry {
		const fromValue = (entry as LegacyDictionaryEntry).from;
		if (Array.isArray(fromValue)) {
			return {
				...entry,
				from: fromValue
			};
		}
		const normalized = typeof fromValue === 'string'
			? fromValue.split(',').map(value => value.trim()).filter(Boolean)
			: [];
		return {
			...entry,
			from: normalized
		};
	}

	private normalizeContextualEntry(entry: ContextualCorrection | LegacyContextualCorrection): ContextualCorrection {
		const normalized = this.normalizeDictionaryEntry(entry) as ContextualCorrection;
		const keywords = (entry as LegacyContextualCorrection).contextKeywords;
		if (keywords === undefined) {
			return normalized;
		}
		if (Array.isArray(keywords)) {
			normalized.contextKeywords = keywords;
		} else if (typeof keywords === 'string' && keywords.length) {
			normalized.contextKeywords = [keywords];
		}
		return normalized;
	}

	private async persistState(): Promise<void> {
		this.state.meta.updatedAt = new Date().toISOString();
		await this.plugin.saveData(this.state);
	}

		private mergeWithDefaults(raw: PluginState): PluginState {
		const merged = getDefaultState();
		merged.meta = {
			...merged.meta,
			...raw.meta,
			version: STATE_VERSION,
			format: 'ai-transcriber-state'
		};
			merged.settings = {
				version: SETTINGS_VERSION,
				data: {
					...merged.settings.data,
					...raw.settings.data
				}
			};
				merged.dictionaries = {
					version: DICTIONARIES_VERSION,
					languages: this.migrateDictionaryFormat(
						this.ensureAllLanguages(raw.dictionaries.languages)
					)
				};
			merged.history = {
				version: HISTORY_VERSION,
				items: Array.isArray(raw.history.items) ? raw.history.items : []
			};
			return merged;
		}

		private createStateFromLegacy(raw: Partial<APITranscriptionSettings>): PluginState {
		const state = getDefaultState();
		const { userDictionaries, ...rest } = raw;
		state.settings.data = {
			...state.settings.data,
			...rest
		};
			if (userDictionaries) {
				state.dictionaries.languages = this.migrateDictionaryFormat(
					this.ensureAllLanguages(userDictionaries)
				);
			}
			return state;
		}

	private isPluginState(data: unknown): data is PluginState {
		return typeof data === 'object' && data !== null && 'meta' in data && 'settings' in data;
	}

		private ensureInitialized(): void {
			if (!this.initialized) {
				throw new Error('PluginStateRepository not initialized');
			}
		}
}
