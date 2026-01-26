/**
 * Consecutive block repeat cleaner
 *
 * Compresses consecutive duplicated sentence blocks anywhere in the transcript.
 * This targets "A B C A B C" style loops (often seen with GPT models) while
 * keeping false positives low by requiring a minimum normalized block length.
 */

import { Logger } from '../../../utils/Logger';

import { splitIntoSentences } from './utils/TextSegmentation';
import { normalizeForComparison } from './utils/TextSimilarity';

import type { TextCleaner, CleaningContext, CleaningResult } from './interfaces/TextCleaner';

export interface ConsecutiveBlockRepeatConfig {
	/** Enable consecutive block repeat compression */
	enabled: boolean;
	/** Minimum total normalized characters in a block to consider */
	minBlockNormalizedChars: number;
	/** Maximum sentence unit size to try */
	maxUnitSentences: number;
	/** Allow compressing repeated single long sentences */
	allowSingleSentence: boolean;
}

const DEFAULT_CONFIG: ConsecutiveBlockRepeatConfig = {
	enabled: true,
	minBlockNormalizedChars: 80,
	maxUnitSentences: 12,
	allowSingleSentence: true
};

export class ConsecutiveBlockRepeatCleaner implements TextCleaner {
	readonly name = 'ConsecutiveBlockRepeatCleaner';
	readonly enabled = true;

	private config: ConsecutiveBlockRepeatConfig;
	private logger = Logger.getLogger('ConsecutiveBlockRepeatCleaner');

	constructor(config?: Partial<ConsecutiveBlockRepeatConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
	}

	clean(text: string, language: string = 'auto', context?: CleaningContext): CleaningResult {
		if (!this.config.enabled) {
			return this.buildResult(text, text, []);
		}

		const enableDetailedLogging = context?.enableDetailedLogging ?? false;
		const original = this.normalizeNewlines(text);
		if (!original.trim()) {
			return this.buildResult(text, text, []);
		}

		const sentences = splitIntoSentences(original, language);
		if (sentences.length < 2) {
			return this.buildResult(text, original, []);
		}

		const normalizedSentences = sentences.map(normalizeForComparison);
		const patternsMatched: string[] = [];
		const output: string[] = [];

		let i = 0;
		while (i < sentences.length) {
			const maxUnit = Math.min(
				this.config.maxUnitSentences,
				Math.floor((sentences.length - i) / 2)
			);
			const minUnit = this.config.allowSingleSentence ? 1 : 2;

			let best: { unit: number; repeats: number; removedNormalizedChars: number } | null = null;
			for (let unit = maxUnit; unit >= minUnit; unit--) {
				const blockChars = this.getBlockNormalizedLength(normalizedSentences, i, unit);
				if (blockChars < this.config.minBlockNormalizedChars) {
					continue;
				}

				const repeats = this.countRepeats(normalizedSentences, i, unit);
				if (repeats < 2) {
					continue;
				}

				const removedNormalizedChars = (repeats - 1) * blockChars;
				if (
					!best ||
					removedNormalizedChars > best.removedNormalizedChars ||
					(removedNormalizedChars === best.removedNormalizedChars && unit > best.unit)
				) {
					best = { unit, repeats, removedNormalizedChars };
				}
			}

			if (best) {
				output.push(...sentences.slice(i, i + best.unit));
				patternsMatched.push(`consecutive_block_repeat: unit=${best.unit}, repeats=${best.repeats}`);
				i += best.unit * best.repeats;
				continue;
			}

			output.push(sentences[i] ?? '');
			i++;
		}

		const cleanedText = output.join('');
		if (cleanedText === original) {
			return this.buildResult(text, original, []);
		}

		if (enableDetailedLogging) {
			this.logger.debug('Compressed consecutive duplicated blocks', {
				compressions: patternsMatched.length,
				removedChars: original.length - cleanedText.length
			});
		}

		return this.buildResult(text, cleanedText, patternsMatched);
	}

	private countRepeats(normalized: string[], start: number, unit: number): number {
		let repeats = 1;
		for (;;) {
			const nextStart = start + repeats * unit;
			if (nextStart + unit > normalized.length) {
				break;
			}
			if (!this.areBlocksEqual(normalized, start, nextStart, unit)) {
				break;
			}
			repeats++;
		}
		return repeats;
	}

	private areBlocksEqual(normalized: string[], aStart: number, bStart: number, unit: number): boolean {
		for (let i = 0; i < unit; i++) {
			if ((normalized[aStart + i] ?? '') !== (normalized[bStart + i] ?? '')) {
				return false;
			}
		}
		return true;
	}

	private getBlockNormalizedLength(normalized: string[], start: number, unit: number): number {
		let total = 0;
		for (let i = 0; i < unit; i++) {
			total += (normalized[start + i] ?? '').length;
		}
		return total;
	}

	private normalizeNewlines(text: string): string {
		return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	}

	private buildResult(originalText: string, cleanedText: string, patternsMatched: string[]): CleaningResult {
		const originalLength = originalText.length;
		const cleanedLength = cleanedText.length;
		const reductionRatio = originalLength > 0 ? (originalLength - cleanedLength) / originalLength : 0;

		return {
			cleanedText,
			issues: [],
			hasSignificantChanges: reductionRatio > 0.01,
			metadata: {
				originalLength,
				cleanedLength,
				reductionRatio,
				patternsMatched
			}
		};
	}
}

