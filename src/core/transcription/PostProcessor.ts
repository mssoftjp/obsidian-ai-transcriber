/**
 * Post-processor for transcription results
 * Handles the core logic of applying enhancements to transcribed text
 */

import { TranscriptionResult } from './TranscriptionTypes';

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
		return {
			...original,
			text: processed.text,
			confidence: processed.confidence || original.confidence,
			// Preserve original segments but update text
			segments: original.segments?.map(segment => ({
				...segment,
				text: this.findCorrespondingText(segment, original.text, processed.text)
			}))
		};
	}

	/**
	 * Find corresponding text in processed version
	 */
	private findCorrespondingText(
		segment: { text: string; start: number; end: number },
		originalText: string,
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

		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}

		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}

		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1, // substitution
						matrix[i][j - 1] + 1,     // insertion
						matrix[i - 1][j] + 1      // deletion
					);
				}
			}
		}

		return matrix[str2.length][str1.length];
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