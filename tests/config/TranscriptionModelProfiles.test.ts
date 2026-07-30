import { DEFAULT_API_SETTINGS } from '../../src/ApiSettings';
import { MODEL_OPTIONS } from '../../src/config/ModelOptions';
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	TRANSCRIPTION_MODEL_PROFILES,
	getTranscriptionModelProfile,
	isTranscriptionModel
} from '../../src/config/TranscriptionModelProfiles';
import {
	getAvailableModels,
	getOpenAIModelConfig,
	WHISPER_CONFIG
} from '../../src/config/openai';

describe('TranscriptionModelProfiles', () => {
	const expectedIds = [
		'gpt-transcribe',
		'gpt-4o-transcribe',
		'gpt-4o-mini-transcribe',
		'whisper-1',
		'whisper-1-ts'
	];

	it('defines one ordered canonical list with GPT Transcribe as the default', () => {
		const ids = TRANSCRIPTION_MODEL_PROFILES.map(profile => profile.id);
		const defaultProfiles = TRANSCRIPTION_MODEL_PROFILES.filter(profile => profile.isDefault);

		expect(ids).toEqual(expectedIds);
		expect(new Set(ids).size).toBe(ids.length);
		expect(defaultProfiles).toHaveLength(1);
		expect(defaultProfiles[0]?.id).toBe('gpt-transcribe');
		expect(DEFAULT_TRANSCRIPTION_MODEL).toBe('gpt-transcribe');
		expect(DEFAULT_API_SETTINGS.model).toBe('gpt-transcribe');
	});

	it('declares the approved GPT Transcribe API and behavior contract', () => {
		expect(getTranscriptionModelProfile('gpt-transcribe')).toMatchObject({
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
				currency: 'USD',
				costPerMinute: 0.0045
			},
			capabilities: {
				originalDirectUpload: true,
				timestamps: false
			}
		});
	});

	it('defines positive USD pricing and complete UI metadata for every model', () => {
		for (const profile of TRANSCRIPTION_MODEL_PROFILES) {
			expect(profile.pricing.currency).toBe('USD');
			expect(profile.pricing.costPerMinute).toBeGreaterThan(0);
			expect(profile.ui.optionLabelKey).toMatch(/^settings\.model\./);
			expect(profile.ui.providerKey).toMatch(/^providers\./);
		}
	});

	it('fails closed for unknown model IDs', () => {
		expect(isTranscriptionModel('gpt-transcribe')).toBe(true);
		expect(isTranscriptionModel('not-a-transcription-model')).toBe(false);
		expect(isTranscriptionModel(null)).toBe(false);
		expect(() => getTranscriptionModelProfile('not-a-transcription-model'))
			.toThrow(/Available models: gpt-transcribe, gpt-4o-transcribe/);
	});

	it('derives compatibility model lists and workflow helpers from the profiles', () => {
		expect(MODEL_OPTIONS.map(option => option.value)).toEqual(expectedIds);
		expect(getAvailableModels().map(model => model.id)).toEqual(expectedIds);
		expect(getOpenAIModelConfig('gpt-transcribe')).toEqual({
			type: 'gpt4o-transcribe',
			module: 'gpt4o-transcribe.config'
		});
		expect(getOpenAIModelConfig('whisper-1-ts')).toEqual({
			type: 'whisper',
			module: 'whisper.config'
		});
	});

	it('keeps selectable-model pricing only in the canonical profiles', () => {
		expect(WHISPER_CONFIG.limitations).not.toHaveProperty('costPerMinute');
	});
});
