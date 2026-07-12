export function getDictionaryCorrectionDescriptionKey(
	dictionaryEnabled: boolean,
	postProcessingEnabled: boolean
): string {
	if (dictionaryEnabled && !postProcessingEnabled) {
		return 'modal.transcription.processingOptions.dictionaryFixedOnlyDesc';
	}
	return 'modal.transcription.processingOptions.enableDictionaryCorrectionDesc';
}
