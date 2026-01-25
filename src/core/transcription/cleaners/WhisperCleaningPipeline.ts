/**
 * Whisper-specific cleaning pipeline
 * Optimized for Whisper transcription output which typically has fewer prompt contamination issues
 */

import { getModelCleaningStrategy } from '../../../config/ModelCleaningConfig';

import { BaseHallucinationCleaner } from './BaseHallucinationCleaner';
import { JapaneseTextValidator } from './JapaneseTextValidator';
import { StandardCleaningPipeline } from './StandardCleaningPipeline';
import { TailRepeatCleaner } from './TailRepeatCleaner';
import { TimestampsTailRepeatCleaner } from './TimestampsTailRepeatCleaner';

import type { JapaneseValidationConfig } from './JapaneseTextValidator';
import type { DictionaryCorrector } from '../DictionaryCorrector';
import type { PipelineConfig } from './interfaces/CleaningPipeline';


export class WhisperCleaningPipeline extends StandardCleaningPipeline {

	constructor(dictionaryCorrector?: DictionaryCorrector, enableDetailedLogging: boolean = false, modelId: string = 'whisper-1') {
		// Get cleaning strategy from configuration
		const strategy = getModelCleaningStrategy(modelId);

		// Configure pipeline for Whisper using strategy settings
		const config: PipelineConfig = {
			name: 'WhisperCleaningPipeline',
			cleaners: [
				// 1. Remove basic hallucinations (repetitions, artifacts)
				new BaseHallucinationCleaner(dictionaryCorrector, strategy),

				// 2. Compress repeated tail blocks (timestamps-aware)
				new TimestampsTailRepeatCleaner({
					enabled: strategy.tailRepeat?.enabled ?? true,
					minRepeatCount: strategy.tailRepeat?.minRepeatCount ?? 3,
					similarityThreshold: strategy.tailRepeat?.similarityThreshold ?? 0.9
				}),

				// 3. Compress repeated tail blocks (endless loops)
				new TailRepeatCleaner(strategy.tailRepeat),

				// 4. Validate Japanese text quality
				...(strategy.japaneseValidation ? [
					(() => {
						const validationConfig: JapaneseValidationConfig = {};
						const jv = strategy.japaneseValidation;
						if (jv.maxReductionRatio !== undefined) {
							validationConfig.maxReductionRatio = jv.maxReductionRatio;
						}
						if (jv.expectedCharsPerSecond !== undefined) {
							validationConfig.expectedCharsPerSecond = jv.expectedCharsPerSecond;
						}
						if (jv.maxIncompleteWords !== undefined) {
							validationConfig.maxIncompleteWords = jv.maxIncompleteWords;
						}
						if (jv.maxMergedWords !== undefined) {
							validationConfig.maxMergedWords = jv.maxMergedWords;
						}
						if (jv.enableAdvancedChecks !== undefined) {
							validationConfig.enableAdvancedChecks = jv.enableAdvancedChecks;
						}
						return new JapaneseTextValidator(validationConfig, strategy);
					})()
				] : [])
			],
			stopOnCriticalIssue: strategy.stopOnCriticalIssue,
			maxReductionRatio: strategy.maxReductionRatio,
			enableDetailedLogging: strategy.enableDetailedLogging || enableDetailedLogging
		};

		super(config);
	}

	/**
	 * Create a Whisper pipeline with default settings
	 */
	static createDefault(dictionaryCorrector?: DictionaryCorrector, modelId: string = 'whisper-1'): WhisperCleaningPipeline {
		return new WhisperCleaningPipeline(dictionaryCorrector, false, modelId);
	}

	/**
	 * Create a Whisper pipeline with debug logging enabled
	 */
	static createWithLogging(dictionaryCorrector?: DictionaryCorrector, modelId: string = 'whisper-1'): WhisperCleaningPipeline {
		return new WhisperCleaningPipeline(dictionaryCorrector, true, modelId);
	}

	/**
	 * Get pipeline-specific summary
	 */
	getWhisperSummary(text: string, _language: string): string {
		// Quick analysis without full execution
		const issues: string[] = [];

		// Check for common Whisper-specific issues
		if (text.includes('[Music]') || text.includes('[Applause]')) {
			issues.push('Audio artifacts detected');
		}

		if (/(.)\1{10,}/.test(text)) {
			issues.push('Character repetition detected');
		}

		const approxWords = text.split(/\s+/).length;
		if (approxWords < 10) {
			issues.push('Very short transcription');
		}

		return `Whisper Pipeline Ready | Predicted issues: ${issues.length} | Text: ${text.length} chars`;
	}
}
