/**
 * Whisper-specific cleaning pipeline
 * Optimized for Whisper transcription output which typically has fewer prompt contamination issues
 */

import { StandardCleaningPipeline } from './StandardCleaningPipeline';
import { BaseHallucinationCleaner } from './BaseHallucinationCleaner';
import { JapaneseTextValidator } from './JapaneseTextValidator';
import { DictionaryCorrector } from '../DictionaryCorrector';
import { PipelineConfig } from './interfaces/CleaningPipeline';
import { getModelCleaningStrategy } from '../../../config/ModelCleaningConfig';

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
				
				// 2. Validate Japanese text quality
				...(strategy.japaneseValidation ? [
					new JapaneseTextValidator({
						maxReductionRatio: strategy.japaneseValidation.maxReductionRatio,
						expectedCharsPerSecond: strategy.japaneseValidation.expectedCharsPerSecond,
						maxIncompleteWords: strategy.japaneseValidation.maxIncompleteWords,
						maxMergedWords: strategy.japaneseValidation.maxMergedWords,
						enableAdvancedChecks: strategy.japaneseValidation.enableAdvancedChecks
					}, strategy)
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
	static createDefault(dictionaryCorrector?: DictionaryCorrector): WhisperCleaningPipeline {
		return new WhisperCleaningPipeline(dictionaryCorrector, false);
	}

	/**
	 * Create a Whisper pipeline with debug logging enabled
	 */
	static createWithLogging(dictionaryCorrector?: DictionaryCorrector): WhisperCleaningPipeline {
		return new WhisperCleaningPipeline(dictionaryCorrector, true);
	}

	/**
	 * Get pipeline-specific summary
	 */
	getWhisperSummary(text: string, language: string): string {
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