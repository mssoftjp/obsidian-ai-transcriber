import ja from '../../src/i18n/translations/ja';
import { getDictionaryCorrectionDescriptionKey } from '../../src/ui/DictionaryCorrectionDescription';

describe('dictionary correction descriptions', () => {
	it('uses the fixed-only explanation when dictionary correction is on and AI is off', () => {
		expect(getDictionaryCorrectionDescriptionKey(true, false)).toBe(
			'modal.transcription.processingOptions.dictionaryFixedOnlyDesc'
		);
	});

	it('uses the general explanation for other setting combinations', () => {
		expect(getDictionaryCorrectionDescriptionKey(false, false)).toBe(
			'modal.transcription.processingOptions.enableDictionaryCorrectionDesc'
		);
		expect(getDictionaryCorrectionDescriptionKey(true, true)).toBe(
			'modal.transcription.processingOptions.enableDictionaryCorrectionDesc'
		);
	});

	it('uses concise Japanese copy that explicitly states API cost behavior', () => {
		expect(ja.modal.transcription.processingOptions.enablePostProcessingDesc).toBe(
			'AIで文字起こしを読みやすく整えます。文字起こしとは別にAPI利用料金がかかります。'
		);
		expect(ja.modal.transcription.processingOptions.enableDictionaryCorrectionDesc).toBe(
			'固定補正はAPIを使わないため、追加料金はかかりません。文脈補正はAI後処理がオンの場合のみ適用され、AI後処理の料金がかかります。'
		);
		expect(ja.modal.transcription.processingOptions.dictionaryFixedOnlyDesc).toBe(
			'現在は固定補正のみ有効です。追加料金はかかりません。文脈補正を使うにはAI後処理をオンにしてください。'
		);
		expect(ja.settings.dictionaryCorrection.desc).toBe(
			'固定補正は追加料金なし。文脈補正はAI後処理がオンの場合のみ適用されます。'
		);
		expect(ja.settings.postProcessing.desc).toBe(
			'AIで文字起こしを読みやすく整えます。文字起こしとは別にAPI利用料金がかかります。'
		);
		expect(ja.settings.dictionary.autoModeDesc).toContain(
			'AI文脈補正はAI後処理がオンの場合のみ適用されます'
		);
	});
});
