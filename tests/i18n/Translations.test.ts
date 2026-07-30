import { TRANSCRIPTION_MODEL_PROFILES } from '../../src/config/TranscriptionModelProfiles';
import en from '../../src/i18n/translations/en';
import ja from '../../src/i18n/translations/ja';
import ko from '../../src/i18n/translations/ko';
import zh from '../../src/i18n/translations/zh';

import type { SupportedLocale, TranslationKeys } from '../../src/i18n/locales';

const translations: Record<SupportedLocale, TranslationKeys> = {
	en,
	ja,
	zh,
	ko
};

function resolveTranslation(source: unknown, path: string): unknown {
	let current = source;
	for (const key of path.split('.')) {
		if (typeof current !== 'object' || current === null || !(key in current)) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

describe('transcription model translations', () => {
	it.each(Object.entries(translations))(
		'resolves every profile UI key in %s',
		(_locale, translation) => {
			for (const profile of TRANSCRIPTION_MODEL_PROFILES) {
				expect(resolveTranslation(translation, profile.ui.optionLabelKey))
					.toEqual(expect.any(String));
				expect(resolveTranslation(translation, profile.ui.providerKey))
					.toEqual(expect.any(String));
				if (profile.ui.comparison) {
					expect(resolveTranslation(translation, profile.ui.comparison.nameKey))
						.toEqual(expect.any(String));
					expect(resolveTranslation(translation, profile.ui.comparison.descriptionKey))
						.toEqual(expect.any(String));
				}
			}
		}
	);

	it('uses the approved model comparison wording', () => {
		expect({
			en: [
				en.settings.model.gptTranscribeDesc,
				en.settings.model.gpt4oDesc,
				en.settings.model.gpt4oMiniDesc,
				en.settings.model.whisperDesc
			],
			ja: [
				ja.settings.model.gptTranscribeDesc,
				ja.settings.model.gpt4oDesc,
				ja.settings.model.gpt4oMiniDesc,
				ja.settings.model.whisperDesc
			],
			zh: [
				zh.settings.model.gptTranscribeDesc,
				zh.settings.model.gpt4oDesc,
				zh.settings.model.gpt4oMiniDesc,
				zh.settings.model.whisperDesc
			],
			ko: [
				ko.settings.model.gptTranscribeDesc,
				ko.settings.model.gpt4oDesc,
				ko.settings.model.gpt4oMiniDesc,
				ko.settings.model.whisperDesc
			]
		}).toEqual({
			en: [
				'Recommended for recorded speech',
				'Existing high-accuracy model',
				'Lowest-cost GPT transcription option',
				'Use when timestamps are needed'
			],
			ja: [
				'録音済み音声向けの推奨モデル',
				'既存の高精度モデル',
				'GPT系で最も低コスト',
				'タイムスタンプが必要な場合'
			],
			zh: [
				'录制语音的推荐模型',
				'现有的高精度模型',
				'成本最低的 GPT 转录选项',
				'需要时间戳时使用'
			],
			ko: [
				'녹음된 음성에 권장되는 모델',
				'기존 고정확도 모델',
				'가장 저렴한 GPT 전사 옵션',
				'타임스탬프가 필요할 때 사용'
			]
		});
	});

	it('keeps pricing out of translated model labels', () => {
		for (const translation of Object.values(translations)) {
			for (const profile of TRANSCRIPTION_MODEL_PROFILES) {
				const label = resolveTranslation(translation, profile.ui.optionLabelKey);
				expect(label).not.toMatch(/\$\d/);
			}
		}
	});
});
