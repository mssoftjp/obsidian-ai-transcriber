/**
 * Standard cleaning pipeline implementation
 * Executes multiple text cleaners in sequence with error handling and monitoring
 */

import {
	CleaningPipeline,
	PipelineResult,
	CleaningStageResult,
	PipelineConfig
} from './interfaces/CleaningPipeline';
import { TextCleaner, CleaningContext } from './interfaces/TextCleaner';
import { Logger } from '../../../utils/Logger';

export class StandardCleaningPipeline implements CleaningPipeline {
	readonly name: string;
	readonly config: PipelineConfig;
	private modelId: string;
	private logger = Logger.getLogger('StandardCleaningPipeline');

	constructor(config: PipelineConfig) {
		this.name = config.name;
		this.modelId = config.modelId || 'gpt-4o-mini-transcribe'; // Default fallback
		this.config = {
			stopOnCriticalIssue: false,
			maxReductionRatio: 0.8,
			enableDetailedLogging: false,
			...config
		};
	}

	/**
	 * Execute the full cleaning pipeline
	 */
	async execute(text: string, language: string, context?: CleaningContext): Promise<PipelineResult> {
		const startTime = Date.now();
		const stageResults: CleaningStageResult[] = [];
		const originalLength = text.length;
		let currentText = text;
		let totalIssuesFound = 0;

		// Add original text length to context for validators
		const enhancedContext: CleaningContext = {
			...context,
			customData: {
				...context?.customData,
				originalLength
			}
		};

		for (const cleaner of this.config.cleaners) {
			if (!cleaner.enabled) {
				continue;
			}

			const stageStartTime = Date.now();
			
				try {
					if (this.config.enableDetailedLogging) {
						this.logger.debug('Executing cleaner', { cleaner: cleaner.name });
					}

				// Execute the cleaner
				const result = await Promise.resolve(cleaner.clean(currentText, language, enhancedContext));
				const stageEndTime = Date.now();
				
				// Record stage result
				const stageResult: CleaningStageResult = {
					cleanerName: cleaner.name,
					result,
					processingTimeMs: stageEndTime - stageStartTime
				};
				stageResults.push(stageResult);

				// Trust each cleaner's internal safety mechanisms
				// Each cleaner is responsible for its own safety thresholds
				currentText = result.cleanedText;
				
				totalIssuesFound += result.issues.length;

				// Log issues if found
					if (result.issues.length > 0 && this.config.enableDetailedLogging) {
						this.logger.warn(`Cleaner ${cleaner.name} reported issues`, {
							issues: result.issues
						});
					}

				// Check for critical issues that should stop the pipeline
				if (this.config.stopOnCriticalIssue && this.isCriticalIssue(result.issues)) {
					this.logger.warn(`Critical issue detected in ${cleaner.name}, stopping pipeline`);
					break;
				}

				// Trust the combined judgment of all cleaners
				// Each cleaner has already applied its own safety thresholds

			} catch (error) {
				this.logger.error(`Error in ${cleaner.name}:`, error);
				
				// Record the error but continue with other cleaners
				const stageResult: CleaningStageResult = {
					cleanerName: cleaner.name,
					result: {
						cleanedText: currentText, // Keep previous text
						issues: [`Error in ${cleaner.name}: ${error instanceof Error ? error.message : 'Unknown error'}`],
						hasSignificantChanges: false,
						metadata: {
							originalLength: currentText.length,
							cleanedLength: currentText.length,
							reductionRatio: 0
						}
					},
					processingTimeMs: Date.now() - stageStartTime
				};
				stageResults.push(stageResult);
				totalIssuesFound += 1;
			}
		}

		const endTime = Date.now();
		const finalLength = currentText.length;
		const totalReductionRatio = (originalLength - finalLength) / originalLength;

		const pipelineResult: PipelineResult = {
			finalText: currentText,
			stageResults,
			metadata: {
				totalOriginalLength: originalLength,
				totalFinalLength: finalLength,
				totalReductionRatio,
				stagesExecuted: stageResults.length,
				totalIssuesFound,
				processingTimeMs: endTime - startTime
			}
		};


			if (this.config.enableDetailedLogging) {
				this.logger.info('Standard cleaning pipeline summary', pipelineResult.metadata);
			}

		return pipelineResult;
	}

	/**
	 * Get list of cleaners in execution order
	 */
	getCleaners(): TextCleaner[] {
		return [...this.config.cleaners];
	}

	/**
	 * Add a cleaner to the pipeline
	 */
	addCleaner(cleaner: TextCleaner): void {
		this.config.cleaners.push(cleaner);
	}

	/**
	 * Remove a cleaner from the pipeline
	 */
	removeCleaner(cleanerName: string): boolean {
		const index = this.config.cleaners.findIndex(cleaner => cleaner.name === cleanerName);
		if (index !== -1) {
			this.config.cleaners.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Check if any issues are critical enough to stop the pipeline
	 */
	private isCriticalIssue(issues: string[]): boolean {
		const criticalPatterns = [
			/excessive text removal/i,
			/extreme text reduction/i,
			/encoding issues/i,
			/unicode replacement characters/i
		];

		return issues.some(issue => 
			criticalPatterns.some(pattern => pattern.test(issue))
		);
	}

	/**
	 * Highlight removed content by comparing before and after text
	 * This is a simple implementation that identifies removed sections
	 */
	private highlightRemovedContent(beforeText: string, afterText: string): string[] {
		const removedParts: string[] = [];
		
		// Simple approach: find chunks that are in before but not in after
		const beforeWords = beforeText.split(/\s+/);
		const afterWords = afterText.split(/\s+/);
		const afterSet = new Set(afterWords);
		
		let currentRemovedChunk: string[] = [];
		
		for (const word of beforeWords) {
			if (!afterSet.has(word)) {
				currentRemovedChunk.push(word);
			} else {
				if (currentRemovedChunk.length > 0) {
					removedParts.push(currentRemovedChunk.join(' '));
					currentRemovedChunk = [];
				}
			}
		}
		
		// Add final chunk if exists
		if (currentRemovedChunk.length > 0) {
			removedParts.push(currentRemovedChunk.join(' '));
		}
		
		return removedParts;
	}

	/**
	 * Get dynamic reduction threshold based on text length
	 * Shorter texts can tolerate higher reduction rates due to higher hallucination likelihood
	 * CURRENTLY DISABLED - using fixed threshold instead
	 */
	private getDynamicReductionThreshold(textLength: number): number {
		const baseThreshold = this.config.maxReductionRatio || 0.4;
		
		// DISABLED: Dynamic thresholds - using fixed threshold for now
		return baseThreshold;
		
		/*
		if (textLength <= 40) {
			// Very short texts: Allow up to 90% reduction (often heavy hallucination)
			return Math.min(0.9, baseThreshold + 0.2);
		} else if (textLength <= 80) {
			// Short texts: Allow up to 80% reduction
			return Math.min(0.8, baseThreshold + 0.1);
		} else if (textLength <= 150) {
			// Medium texts: Use base threshold
			return baseThreshold;
		} else {
			// Long texts: More conservative (less likely to be hallucination)
			return Math.max(0.5, baseThreshold - 0.1);
		}
		*/
	}

	/**
	 * Get summary of pipeline execution
	 */
	getSummary(result: PipelineResult): string {
		const { metadata } = result;
		const reductionPercent = Math.round(metadata.totalReductionRatio * 100);
		
		return [
			`Pipeline: ${this.name}`,
			`Stages: ${metadata.stagesExecuted}`,
			`Text: ${metadata.totalOriginalLength} → ${metadata.totalFinalLength} chars (${reductionPercent}% reduction)`,
			`Issues: ${metadata.totalIssuesFound}`,
			`Time: ${metadata.processingTimeMs}ms`
		].join(' | ');
	}
}
