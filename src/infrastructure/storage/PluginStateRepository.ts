
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function normalizeStoredSettings(data: Record<string, unknown>): StoredSettings {
	const getString = (key: keyof StoredSettings): string => {
		const value = data[key];
		const fallback = DEFAULT_SETTINGS_CORE[key];
		return typeof value === 'string' ? value : String(fallback);
	};
	const getBoolean = (key: keyof StoredSettings): boolean => {
		const value = data[key];
		const fallback = DEFAULT_SETTINGS_CORE[key];
		return typeof value === 'boolean' ? value : Boolean(fallback);
	};
	const modelValue = data['model'];
	const model = modelValue === 'whisper-1'
		|| modelValue === 'whisper-1-ts'
		|| modelValue === 'gpt-4o-transcribe'
		|| modelValue === 'gpt-4o-mini-transcribe'
		? modelValue
		: DEFAULT_SETTINGS_CORE.model;
	const vadValue = data['vadMode'];
	const vadMode = vadValue === 'local' ? 'local' : 'disabled';

	const normalized: StoredSettings = {
		language: getString('language'),
		outputFormat: getString('outputFormat'),
		openaiApiKey: getString('openaiApiKey'),
		model,
		vadMode,
		postProcessingEnabled: getBoolean('postProcessingEnabled'),
		dictionaryCorrectionEnabled: getBoolean('dictionaryCorrectionEnabled'),
		transcriptionOutputFolder: getString('transcriptionOutputFolder'),
		debugMode: getBoolean('debugMode')
	};
	if (typeof data['postProcessingModel'] === 'string') {
		normalized.postProcessingModel = data['postProcessingModel'];
	}
	return normalized;
}

function isValidStoredSettings(data: Record<string, unknown>): boolean {
	const normalized = normalizeStoredSettings(data);
	return data['language'] === normalized.language
		&& data['outputFormat'] === normalized.outputFormat
		&& data['openaiApiKey'] === normalized.openaiApiKey
		&& data['model'] === normalized.model
		&& data['vadMode'] === normalized.vadMode
		&& data['postProcessingEnabled'] === normalized.postProcessingEnabled
		&& data['dictionaryCorrectionEnabled'] === normalized.dictionaryCorrectionEnabled
		&& data['transcriptionOutputFolder'] === normalized.transcriptionOutputFolder
		&& data['debugMode'] === normalized.debugMode
		&& (data['postProcessingModel'] === undefined || typeof data['postProcessingModel'] === 'string');
}

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
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly plugin: Plugin) {}

	async initialize(): Promise<PluginState> {
		if (this.initialized) {
			return this.state;
		}

		const raw: unknown = await this.plugin.loadData();
		let shouldPersist = false;
		if (this.isSegmentedState(raw)) {
			this.state = this.mergeWithDefaults(raw);
			shouldPersist = !this.isCurrentPluginState(raw);
		} else if (isRecord(raw)) {
			this.state = this.createStateFromLegacy(raw as Partial<APITranscriptionSettings>);
			shouldPersist = true;
		} else {
			this.state = getDefaultState();
			shouldPersist = true;
		}
		if (shouldPersist) {
			await this.persistState();
		}
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

	private ensureAllLanguages(dictionaries: unknown): LanguageDictionaries {
		const dictionaryRecord = isRecord(dictionaries) ? dictionaries : {};
		const ensure = (dict: unknown): UserDictionary => {
			if (!isRecord(dict)) {
				return createEmptyDictionary();
			}
			const definiteCorrections = Array.isArray(dict['definiteCorrections'])
				? dict['definiteCorrections'].filter(isRecord).map(entry => this.normalizeDictionaryEntry(entry))
				: [];
			const contextualCorrections = Array.isArray(dict['contextualCorrections'])
				? dict['contextualCorrections'].filter(isRecord).map(entry => this.normalizeContextualEntry(entry))
				: [];
			return {
				definiteCorrections,
				contextualCorrections
			};
		};

		return {
			ja: ensure(dictionaryRecord['ja']),
			en: ensure(dictionaryRecord['en']),
			zh: ensure(dictionaryRecord['zh']),
			ko: ensure(dictionaryRecord['ko'])
		};
	}

	private migrateDictionaryFormat(data: LanguageDictionaries): LanguageDictionaries {
		const clone = cloneDictionaries(data);
		const languages: (keyof LanguageDictionaries)[] = ['ja', 'en', 'zh', 'ko'];
		languages.forEach((lang) => {
			clone[lang] = {
				definiteCorrections: clone[lang].definiteCorrections.map(entry => this.normalizeDictionaryEntry(entry)),
				contextualCorrections: (clone[lang].contextualCorrections ?? []).map(entry => this.normalizeContextualEntry(entry))
			};
		});
		return clone;
	}

	private normalizeDictionaryEntry(entry: DictionaryEntry | LegacyDictionaryEntry | Record<string, unknown>): DictionaryEntry {
		const fromValue = entry['from'];
		const toValue = typeof entry['to'] === 'string' ? entry['to'] : '';
		if (Array.isArray(fromValue)) {
			return {
				...entry,
				from: fromValue.filter((value): value is string => typeof value === 'string'),
				to: toValue
			} as DictionaryEntry;
		}
		const normalized = typeof fromValue === 'string'
			? fromValue.split(',').map(value => value.trim()).filter(Boolean)
			: [];
		return {
			...entry,
			from: normalized,
			to: toValue
		} as DictionaryEntry;
	}

	private normalizeContextualEntry(entry: ContextualCorrection | LegacyContextualCorrection | Record<string, unknown>): ContextualCorrection {
		const normalized = this.normalizeDictionaryEntry(entry) as ContextualCorrection;
		const keywords = entry['contextKeywords'];
		if (keywords === undefined) {
			return normalized;
		}
		if (Array.isArray(keywords)) {
			normalized.contextKeywords = keywords.filter((value): value is string => typeof value === 'string');
		} else if (typeof keywords === 'string' && keywords.length) {
			normalized.contextKeywords = [keywords];
		}
		return normalized;
	}

	private async persistState(): Promise<void> {
		this.state.meta.updatedAt = new Date().toISOString();
		const snapshot = deepClone(this.state);
		const write = this.writeQueue.then(async () => {
			await this.plugin.saveData(snapshot);
		});
		this.writeQueue = write.catch(() => undefined);
		await write;
	}

	private mergeWithDefaults(raw: Record<string, unknown>): PluginState {
		const merged = getDefaultState();
		const meta = isRecord(raw['meta']) ? raw['meta'] : {};
		const settings = isRecord(raw['settings']) ? raw['settings'] : {};
		const settingsData = isRecord(settings['data']) ? settings['data'] : {};
		const dictionaries = isRecord(raw['dictionaries']) ? raw['dictionaries'] : {};
		const history = isRecord(raw['history']) ? raw['history'] : {};
		merged.meta = {
			...merged.meta,
			...meta,
			version: STATE_VERSION,
			format: 'ai-transcriber-state'
		};
		merged.settings = {
			version: SETTINGS_VERSION,
			data: normalizeStoredSettings(settingsData)
		};
		merged.dictionaries = {
			version: DICTIONARIES_VERSION,
			languages: this.migrateDictionaryFormat(
				this.ensureAllLanguages(dictionaries['languages'])
			)
		};
		merged.history = {
			version: HISTORY_VERSION,
			items: Array.isArray(history['items']) ? deepClone(history['items']) as TranscriptionTask[] : []
		};
		return merged;
	}

	private createStateFromLegacy(raw: Partial<APITranscriptionSettings>): PluginState {
		const state = getDefaultState();
		const { userDictionaries } = raw;
		state.settings.data = normalizeStoredSettings(raw as Record<string, unknown>);
		if (userDictionaries) {
			state.dictionaries.languages = this.migrateDictionaryFormat(
				this.ensureAllLanguages(userDictionaries)
			);
		}
		return state;
	}

	private isSegmentedState(data: unknown): data is Record<string, unknown> {
		if (!isRecord(data)) {
			return false;
		}
		const meta = isRecord(data['meta']) ? data['meta'] : null;
		return meta?.['format'] === 'ai-transcriber-state'
			|| 'settings' in data
			|| 'dictionaries' in data
			|| 'history' in data;
	}

	private isCurrentPluginState(data: unknown): data is PluginState {
		if (!this.isSegmentedState(data)) {
			return false;
		}
		const meta = data['meta'];
		const settings = data['settings'];
		const dictionaries = data['dictionaries'];
		const history = data['history'];
		if (!isRecord(meta) || !isRecord(settings) || !isRecord(dictionaries) || !isRecord(history)) {
			return false;
		}
		return meta['format'] === 'ai-transcriber-state'
			&& meta['version'] === STATE_VERSION
			&& settings['version'] === SETTINGS_VERSION
			&& isRecord(settings['data'])
			&& isValidStoredSettings(settings['data'])
			&& dictionaries['version'] === DICTIONARIES_VERSION
			&& isRecord(dictionaries['languages'])
			&& history['version'] === HISTORY_VERSION
			&& Array.isArray(history['items']);
	}

	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error('PluginStateRepository not initialized');
		}
	}
}
