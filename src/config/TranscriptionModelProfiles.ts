export type TranscriptionWorkflow = 'openai-file' | 'whisper';
export type TranscriptionLanguageField = 'language' | 'languages';
export type TranscriptionProcessingPreset =
	| 'recorded-accurate'
	| 'recorded-economy'
	| 'whisper-standard'
	| 'whisper-timestamps';
export type TranscriptionCleaningPreset =
	| 'recorded-accurate'
	| 'recorded-economy'
	| 'whisper';
export type TranscriptionModelOptionLabelKey =
	| 'settings.model.gptTranscribeDefault'
	| 'settings.model.gpt4oHigh'
	| 'settings.model.gpt4oMiniCost'
	| 'settings.model.whisperNoTimestamp'
	| 'settings.model.whisperWithTimestamp';
export type TranscriptionModelProviderKey =
	| 'providers.gptTranscribe'
	| 'providers.gpt4o'
	| 'providers.gpt4oMini'
	| 'providers.whisper'
	| 'providers.whisperTs';
export type TranscriptionModelComparisonNameKey =
	| 'settings.model.gptTranscribe'
	| 'settings.model.gpt4o'
	| 'settings.model.gpt4oMini'
	| 'settings.model.whisper';
export type TranscriptionModelComparisonDescriptionKey =
	| 'settings.model.gptTranscribeDesc'
	| 'settings.model.gpt4oDesc'
	| 'settings.model.gpt4oMiniDesc'
	| 'settings.model.whisperDesc';

interface TranscriptionModelProfileDefinition {
	id: string;
	apiModel: string;
	displayName: string;
	isDefault: boolean;
	workflow: TranscriptionWorkflow;
	request: {
		languageField: TranscriptionLanguageField;
	};
	processingPreset: TranscriptionProcessingPreset;
	cleaningPreset: TranscriptionCleaningPreset;
	pricing: {
		costPerMinute: number;
		currency: 'USD';
	};
	capabilities: {
		originalDirectUpload: boolean;
		timestamps: boolean;
	};
	ui: {
		optionLabelKey: TranscriptionModelOptionLabelKey;
		providerKey: TranscriptionModelProviderKey;
		comparison: {
			nameKey: TranscriptionModelComparisonNameKey;
			descriptionKey: TranscriptionModelComparisonDescriptionKey;
		} | null;
	};
}

export const TRANSCRIPTION_MODEL_PROFILES = [
	{
		id: 'gpt-transcribe',
		apiModel: 'gpt-transcribe',
		displayName: 'GPT Transcribe',
		isDefault: true,
		workflow: 'openai-file',
		request: {
			languageField: 'languages'
		},
		processingPreset: 'recorded-accurate',
		cleaningPreset: 'recorded-accurate',
		pricing: {
			costPerMinute: 0.0045,
			currency: 'USD'
		},
		capabilities: {
			originalDirectUpload: true,
			timestamps: false
		},
		ui: {
			optionLabelKey: 'settings.model.gptTranscribeDefault',
			providerKey: 'providers.gptTranscribe',
			comparison: {
				nameKey: 'settings.model.gptTranscribe',
				descriptionKey: 'settings.model.gptTranscribeDesc'
			}
		}
	},
	{
		id: 'gpt-4o-transcribe',
		apiModel: 'gpt-4o-transcribe',
		displayName: 'GPT-4o Transcribe',
		isDefault: false,
		workflow: 'openai-file',
		request: {
			languageField: 'language'
		},
		processingPreset: 'recorded-accurate',
		cleaningPreset: 'recorded-accurate',
		pricing: {
			costPerMinute: 0.006,
			currency: 'USD'
		},
		capabilities: {
			originalDirectUpload: true,
			timestamps: false
		},
		ui: {
			optionLabelKey: 'settings.model.gpt4oHigh',
			providerKey: 'providers.gpt4o',
			comparison: {
				nameKey: 'settings.model.gpt4o',
				descriptionKey: 'settings.model.gpt4oDesc'
			}
		}
	},
	{
		id: 'gpt-4o-mini-transcribe',
		apiModel: 'gpt-4o-mini-transcribe',
		displayName: 'GPT-4o Mini Transcribe',
		isDefault: false,
		workflow: 'openai-file',
		request: {
			languageField: 'language'
		},
		processingPreset: 'recorded-economy',
		cleaningPreset: 'recorded-economy',
		pricing: {
			costPerMinute: 0.003,
			currency: 'USD'
		},
		capabilities: {
			originalDirectUpload: true,
			timestamps: false
		},
		ui: {
			optionLabelKey: 'settings.model.gpt4oMiniCost',
			providerKey: 'providers.gpt4oMini',
			comparison: {
				nameKey: 'settings.model.gpt4oMini',
				descriptionKey: 'settings.model.gpt4oMiniDesc'
			}
		}
	},
	{
		id: 'whisper-1',
		apiModel: 'whisper-1',
		displayName: 'OpenAI Whisper',
		isDefault: false,
		workflow: 'whisper',
		request: {
			languageField: 'language'
		},
		processingPreset: 'whisper-standard',
		cleaningPreset: 'whisper',
		pricing: {
			costPerMinute: 0.006,
			currency: 'USD'
		},
		capabilities: {
			originalDirectUpload: false,
			timestamps: false
		},
		ui: {
			optionLabelKey: 'settings.model.whisperNoTimestamp',
			providerKey: 'providers.whisper',
			comparison: {
				nameKey: 'settings.model.whisper',
				descriptionKey: 'settings.model.whisperDesc'
			}
		}
	},
	{
		id: 'whisper-1-ts',
		apiModel: 'whisper-1',
		displayName: 'OpenAI Whisper (timestamps)',
		isDefault: false,
		workflow: 'whisper',
		request: {
			languageField: 'language'
		},
		processingPreset: 'whisper-timestamps',
		cleaningPreset: 'whisper',
		pricing: {
			costPerMinute: 0.006,
			currency: 'USD'
		},
		capabilities: {
			originalDirectUpload: false,
			timestamps: true
		},
		ui: {
			optionLabelKey: 'settings.model.whisperWithTimestamp',
			providerKey: 'providers.whisperTs',
			comparison: null
		}
	}
] as const satisfies readonly TranscriptionModelProfileDefinition[];

export type TranscriptionModel = (typeof TRANSCRIPTION_MODEL_PROFILES)[number]['id'];
export type TranscriptionModelProfile = (typeof TRANSCRIPTION_MODEL_PROFILES)[number];
export type OpenAIFileTranscriptionModel = Extract<
	TranscriptionModelProfile,
	{ workflow: 'openai-file' }
>['id'];

const profilesById = new Map<string, TranscriptionModelProfile>(
	TRANSCRIPTION_MODEL_PROFILES.map(profile => [profile.id, profile])
);

function findDefaultProfile(): TranscriptionModelProfile {
	const defaultProfiles = TRANSCRIPTION_MODEL_PROFILES.filter(profile => profile.isDefault);
	const profile = defaultProfiles[0];
	if (defaultProfiles.length !== 1 || !profile) {
		throw new Error('[TranscriptionModelProfiles] Exactly one default model is required');
	}
	return profile;
}

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModel = findDefaultProfile().id;

export function isTranscriptionModel(value: unknown): value is TranscriptionModel {
	return typeof value === 'string' && profilesById.has(value);
}

export function getTranscriptionModelProfile(model: string): TranscriptionModelProfile {
	const profile = profilesById.get(model);
	if (!profile) {
		const availableModels = TRANSCRIPTION_MODEL_PROFILES.map(candidate => candidate.id).join(', ');
		throw new Error(
			`[TranscriptionModelProfiles] Unknown model: "${model}". Available models: ${availableModels}`
		);
	}
	return profile;
}
