/**
 * Post-processor for transcription results
 * Handles the core logic of applying enhancements to transcribed text
 */

import type { TranscriptionResult } from './TranscriptionTypes';

export interface PostProcessingOptions {
	/** Apply speaker identification */
	identifySpeakers?: boolean;
	/** Apply punctuation correction */
	correctPunctuation?: boolean;
	/** Apply term standardization */
	standardizeTerms?: boolean;
	/** Remove filler words */
	removeFiller?: boolean;
	/** Format as conversation */
	formatConversation?: boolean;
}

export class PostProcessor {
	private options: PostProcessingOptions;

	constructor(options: PostProcessingOptions = {}) {
		this.options = {
			identifySpeakers: true,
			correctPunctuation: true,
			standardizeTerms: true,
			removeFiller: false,
			formatConversation: false,
			...options
		};
	}

	/**
	 * Apply post-processing to transcription result
	 */
	process(result: TranscriptionResult, processedText: string): TranscriptionResult {
		// Create enhanced result
		const enhancedResult: TranscriptionResult = {
			...result,
			text: processedText
		};

		// Apply formatting if needed
		if (this.options.formatConversation) {
			enhancedResult.text = this.formatAsConversation(processedText);
		}

		return enhancedResult;
	}

	/**
	 * Format text as conversation with speaker labels
	 */
	private formatAsConversation(text: string): string {
		// Simple heuristic: Look for patterns that might indicate speaker changes
		const lines = text.split('\n').filter(line => line.trim());
		const formatted: string[] = [];

		for (const line of lines) {
			// Check if line already has speaker label
			if (line.match(/^(話者\d+|Speaker\s*\d+|[\u4e00-\u9fa5]+さん)[:：]/)) {
				formatted.push(line);
			} else {
				// Add generic speaker label if missing
				formatted.push(`話者: ${line}`);
			}
		}

		return formatted.join('\n\n');
	}

	/**
	 * Merge original and processed results
	 */
	mergeResults(
		original: TranscriptionResult,
		processed: TranscriptionResult
	): TranscriptionResult {
		const merged: TranscriptionResult = {
			...original,
			text: processed.text
		};
		const confidence = processed.confidence ?? original.confidence;
		if (confidence !== undefined) {
			merged.confidence = confidence;
		}

		if (original.segments) {
			merged.segments = original.segments.map(segment => ({
				...segment,
				text: this.findCorrespondingText(segment, processed.text)
			}));
		}

		return merged;
	}

	/**
	 * Find corresponding text in processed version
	 */
	private findCorrespondingText(
		segment: { text: string; start: number; end: number },
		processedText: string
	): string {
		// Simple approach: Find similar text in processed version
		// This could be improved with more sophisticated text alignment
		const segmentWords = segment.text.split(/\s+/);
		const processedWords = processedText.split(/\s+/);

		// Find best matching sequence in processed text
		let bestMatch = segment.text;
		let bestScore = 0;

		for (let i = 0; i <= processedWords.length - segmentWords.length; i++) {
			const candidate = processedWords.slice(i, i + segmentWords.length).join(' ');
			const score = this.calculateSimilarity(segment.text, candidate);

			if (score > bestScore) {
				bestScore = score;
				bestMatch = candidate;
			}
		}

		return bestMatch;
	}

	/**
	 * Calculate text similarity (simple character-based)
	 */
	private calculateSimilarity(text1: string, text2: string): number {
		const longer = text1.length > text2.length ? text1 : text2;
		const shorter = text1.length > text2.length ? text2 : text1;

		if (longer.length === 0) {
			return 1.0;
		}

		const editDistance = this.levenshteinDistance(longer, shorter);
		return (longer.length - editDistance) / longer.length;
	}

	/**
	 * Calculate Levenshtein distance between two strings
	 */
		private levenshteinDistance(str1: string, str2: string): number {
			const matrix: number[][] = [];
			const firstRow: number[] = [];
			matrix[0] = firstRow;

			for (let i = 1; i <= str2.length; i++) {
				matrix[i] = [i];
			}

			for (let j = 0; j <= str1.length; j++) {
				firstRow[j] = j;
			}

		for (let i = 1; i <= str2.length; i++) {
			const row = matrix[i];
			const prevRow = matrix[i - 1];
			if (!row || !prevRow) {
				continue;
			}

			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					row[j] = prevRow[j - 1] ?? 0;
				} else {
					row[j] = Math.min(
						(prevRow[j - 1] ?? 0) + 1, // substitution
						(row[j - 1] ?? 0) + 1,     // insertion
						(prevRow[j] ?? 0) + 1      // deletion
					);
				}
			}
		}

		return matrix[str2.length]?.[str1.length] ?? 0;
	}

	/**
	 * Validate post-processing result
	 */
	validate(original: string, processed: string): {
		isValid: boolean;
		warnings: string[];
	} {
		const warnings: string[] = [];

		// Check if processed text is too different
		const similarity = this.calculateSimilarity(original, processed);
		if (similarity < 0.5) {
			warnings.push('Processed text significantly differs from original');
		}

		// Check if text was lost
		const originalLength = original.replace(/\s+/g, '').length;
		const processedLength = processed.replace(/\s+/g, '').length;
		const lengthRatio = processedLength / originalLength;

		if (lengthRatio < 0.8) {
			warnings.push('Processed text is significantly shorter than original');
		} else if (lengthRatio > 1.5) {
			warnings.push('Processed text is significantly longer than original');
		}

		return {
			isValid: warnings.length === 0,
			warnings
		};
	}
}
