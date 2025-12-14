/**
 * Fuzzy overlap detection for transcription merging
 * Handles text variations and minor differences in overlapping regions
 */

import {
	calculateNGramSimilarity,
	generateNGrams,
	getOptimalNGramSize
} from './utils/TextSimilarity';

export interface FuzzyMatchResult {
	/** Start position in the previous text */
	previousStart: number;
	/** Start position in the current text */
	currentStart: number;
	/** Length of the match */
	length: number;
	/** Similarity score (0-1) */
	similarity: number;
	/** The matched text from previous chunk */
	matchedText: string;
}

export interface FuzzyMatchOptions {
	/** Minimum similarity threshold (0-1) */
	minSimilarity: number;
	/** Minimum match length in characters */
	minMatchLength: number;
	/** Use N-gram based fast screening */
	useNGramScreening: boolean;
	/** N-gram size for screening */
	nGramSize: number;
}

export class FuzzyOverlapDetector {
	private readonly defaultOptions: FuzzyMatchOptions = {
		minSimilarity: 0.8,
		minMatchLength: 20,
		useNGramScreening: true,
		nGramSize: 3
	};

	constructor(private options: Partial<FuzzyMatchOptions> = {}) {
		this.options = { ...this.defaultOptions, ...options };
	}

	/**
	 * Find fuzzy overlap between two texts
	 */
	findFuzzyOverlap(
		previousText: string,
		currentText: string,
		searchStart: number,
		searchEnd: number
	): FuzzyMatchResult | null {
		const opts = { ...this.defaultOptions, ...this.options };

		// Extract search regions
		const searchRegion = previousText.slice(searchStart);
		const targetRegion = currentText.slice(0, searchEnd);

		if (searchRegion.length < opts.minMatchLength || targetRegion.length < opts.minMatchLength) {
			return null;
		}

		// Use N-gram screening for performance if enabled
		if (opts.useNGramScreening) {
			const candidates = this.findCandidateRegions(searchRegion, targetRegion, opts.nGramSize);
			if (candidates.length === 0) {
				return null;
			}

			// Find best match among candidates
			return this.findBestMatch(searchRegion, targetRegion, candidates, searchStart, opts);
		} else {
			// Exhaustive search (slower but more thorough)
			return this.exhaustiveSearch(searchRegion, targetRegion, searchStart, opts);
		}
	}


	/**
	 * Find candidate regions using N-gram matching
	 */
	private findCandidateRegions(source: string, target: string, nGramSize: number): Array<{sourcePos: number, targetPos: number}> {
		const sourceNGrams = generateNGrams(source, nGramSize);
		const targetNGrams = generateNGrams(target, nGramSize);

		const candidates: Array<{sourcePos: number, targetPos: number}> = [];
		const positionPairs = new Set<string>();

		// Find matching N-grams
		for (const [gram, sourcePositions] of sourceNGrams) {
			const targetPositions = targetNGrams.get(gram);
			if (targetPositions) {
				for (const sourcePos of sourcePositions) {
					for (const targetPos of targetPositions) {
						const key = `${sourcePos},${targetPos}`;
						if (!positionPairs.has(key)) {
							positionPairs.add(key);
							candidates.push({ sourcePos, targetPos });
						}
					}
				}
			}
		}

		// Sort by source position
		candidates.sort((a, b) => a.sourcePos - b.sourcePos);

		// Cluster nearby candidates
		const clusters: Array<{sourcePos: number, targetPos: number}> = [];
		let lastCluster: {sourcePos: number, targetPos: number} | null = null;

		for (const candidate of candidates) {
			if (!lastCluster ||
				Math.abs(candidate.sourcePos - lastCluster.sourcePos) > 50 ||
				Math.abs(candidate.targetPos - lastCluster.targetPos) > 50) {
				clusters.push(candidate);
				lastCluster = candidate;
			}
		}

		return clusters;
	}

	/**
	 * Find best match among candidate regions
	 */
	private findBestMatch(
		source: string,
		target: string,
		candidates: Array<{sourcePos: number, targetPos: number}>,
		searchStart: number,
		options: FuzzyMatchOptions
	): FuzzyMatchResult | null {
		let bestMatch: FuzzyMatchResult | null = null;
		let bestScore = 0;

		for (const candidate of candidates) {
			// Extend match in both directions
			const match = this.extendMatch(source, target, candidate.sourcePos, candidate.targetPos);

			if (match.length >= options.minMatchLength) {
				const sourceText = source.slice(match.sourceStart, match.sourceStart + match.length);
				const targetText = target.slice(match.targetStart, match.targetStart + match.length);

				const similarity = calculateNGramSimilarity(sourceText, targetText, options.nGramSize);

				if (similarity >= options.minSimilarity) {
					const score = similarity * match.length; // Prefer longer matches with high similarity

					if (score > bestScore) {
						bestScore = score;
						bestMatch = {
							previousStart: searchStart + match.sourceStart,
							currentStart: match.targetStart,
							length: match.length,
							similarity: similarity,
							matchedText: sourceText
						};
					}
				}
			}
		}

		return bestMatch;
	}

	/**
	 * Extend a match in both directions
	 */
	private extendMatch(
		source: string,
		target: string,
		sourcePos: number,
		targetPos: number
	): {sourceStart: number, targetStart: number, length: number} {
		// Extend backwards
		let startOffset = 0;
		while (sourcePos - startOffset > 0 &&
			   targetPos - startOffset > 0 &&
			   this.isSimilarChar(
				   source[sourcePos - startOffset - 1] ?? '',
				   target[targetPos - startOffset - 1] ?? ''
			   )) {
			startOffset++;
		}

		// Extend forwards
		let endOffset = 0;
		while (sourcePos + endOffset < source.length &&
			   targetPos + endOffset < target.length &&
			   this.isSimilarChar(
				   source[sourcePos + endOffset] ?? '',
				   target[targetPos + endOffset] ?? ''
			   )) {
			endOffset++;
		}

		return {
			sourceStart: sourcePos - startOffset,
			targetStart: targetPos - startOffset,
			length: startOffset + endOffset
		};
	}

	/**
	 * Check if two characters are similar (handles Japanese variations)
	 */
	private isSimilarChar(char1: string, char2: string): boolean {
		if (char1 === char2) {
			return true;
		}

		// Handle hiragana/katakana conversion
		const code1 = char1.charCodeAt(0);
		const code2 = char2.charCodeAt(0);

		// Hiragana to Katakana
		if (code1 >= 0x3040 && code1 <= 0x309F && code2 >= 0x30A0 && code2 <= 0x30FF) {
			return code1 + 0x60 === code2;
		}

		// Katakana to Hiragana
		if (code2 >= 0x3040 && code2 <= 0x309F && code1 >= 0x30A0 && code1 <= 0x30FF) {
			return code2 + 0x60 === code1;
		}

		// Common variations
		const variations: Record<string, string[]> = {
			'ー': ['〜', '～', '―'],
			'、': ['，', ','],
			'。': ['．', '.'],
			' ': ['　', '\t']
		};

		for (const [base, vars] of Object.entries(variations)) {
			if ((char1 === base && vars.includes(char2)) ||
				(char2 === base && vars.includes(char1))) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Exhaustive search for fuzzy matches
	 */
	private exhaustiveSearch(
		source: string,
		target: string,
		searchStart: number,
		options: FuzzyMatchOptions
	): FuzzyMatchResult | null {
		let bestMatch: FuzzyMatchResult | null = null;
		let bestScore = 0;

		// Sliding window approach
		const windowSize = Math.min(source.length, 200); // Max 200 chars for performance

		for (let i = 0; i <= source.length - options.minMatchLength; i++) {
			for (let j = 0; j <= target.length - options.minMatchLength; j++) {
				const sourceWindow = source.slice(i, i + windowSize);
				const targetWindow = target.slice(j, j + windowSize);

				// Quick similarity check on smaller window
				const quickSim = this.quickSimilarity(
					sourceWindow.slice(0, options.minMatchLength),
					targetWindow.slice(0, options.minMatchLength)
				);

				if (quickSim < options.minSimilarity * 0.8) {
					continue;
				} // Skip if too different

				// Find optimal alignment within windows
				const alignment = this.findOptimalAlignment(sourceWindow, targetWindow, options.minMatchLength);

				if (alignment && alignment.similarity >= options.minSimilarity) {
					const score = alignment.similarity * alignment.length;

					if (score > bestScore) {
						bestScore = score;
						bestMatch = {
							previousStart: searchStart + i + alignment.sourceStart,
							currentStart: j + alignment.targetStart,
							length: alignment.length,
							similarity: alignment.similarity,
							matchedText: sourceWindow.slice(alignment.sourceStart, alignment.sourceStart + alignment.length)
						};
					}
				}
			}
		}

		return bestMatch;
	}

	/**
	 * Quick similarity check using character frequency
	 */
	private quickSimilarity(text1: string, text2: string): number {
		const freq1 = this.getCharFrequency(text1);
		const freq2 = this.getCharFrequency(text2);

		let common = 0;
		let total = 0;

		for (const [char, count1] of freq1) {
			const count2 = freq2.get(char) || 0;
			common += Math.min(count1, count2);
			total += count1;
		}

		for (const [char, count2] of freq2) {
			if (!freq1.has(char)) {
				total += count2;
			}
		}

		return total > 0 ? common / total : 0;
	}

	/**
	 * Get character frequency map
	 */
	private getCharFrequency(text: string): Map<string, number> {
		const freq = new Map<string, number>();

		for (const char of text) {
			freq.set(char, (freq.get(char) || 0) + 1);
		}

		return freq;
	}

	/**
	 * Find optimal alignment between two text segments
	 */
	private findOptimalAlignment(
		source: string,
		target: string,
		minLength: number
	): {sourceStart: number, targetStart: number, length: number, similarity: number} | null {
		let bestAlignment = null;
		let bestScore = 0;

		// Try different alignments
		for (let i = 0; i <= source.length - minLength; i++) {
				for (let j = 0; j <= target.length - minLength; j++) {
					// Determine match length
					let length = 0;
					let matches = 0;

					while (i + length < source.length && j + length < target.length) {
						if (this.isSimilarChar(
							source[i + length] ?? '',
							target[j + length] ?? ''
						)) {
							matches++;
						}
					length++;

					// Check if we have enough similarity
					if (length >= minLength) {
						const similarity = matches / length;
						const score = similarity * length;

						if (score > bestScore && similarity >= 0.8) {
							bestScore = score;
							bestAlignment = {
								sourceStart: i,
								targetStart: j,
								length: length,
								similarity: similarity
							};
						}
					}
				}
			}
		}

		return bestAlignment;
	}

	/**
	 * Calculate similarity between two strings using n-gram similarity
	 * Public method for backward compatibility
	 */
	calculateSimilarity(text1: string, text2: string): number {
		// Use optimal n-gram size based on text length
		const nGramSize = getOptimalNGramSize(Math.min(text1.length, text2.length), 'overlap');
		return calculateNGramSimilarity(text1, text2, nGramSize);
	}
}
