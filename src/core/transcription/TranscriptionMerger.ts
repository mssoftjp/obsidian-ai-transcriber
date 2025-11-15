/**
 * Handles merging of transcription results
 * Provides different strategies for combining chunk results
 */

import { TranscriptionResult, TranscriptionSegment } from './TranscriptionTypes';
import { getTranscriptionConfig, getModelConfig, ModelConfig } from '../../config/ModelProcessingConfig';
import { OverlapDebugger } from '../utils/OverlapDebugger';
import { OverlapAnalyzer } from '../utils/OverlapAnalyzer';
import { FuzzyOverlapDetector, FuzzyMatchOptions } from './FuzzyOverlapDetector';
import {
	buildNGramIndex,
	findPotentialMatches,
	getOptimalNGramSize,
	calculateNormalizedNGramSimilarity
} from './utils/TextSimilarity';
import { Logger } from '../../utils/Logger';

export interface MergeOptions {
	/** Remove duplicate content from overlaps */
	removeOverlaps: boolean;
	/** Minimum characters to consider as duplicate */
	minMatchLength: number;
	/** Use timestamps for alignment */
	useTimestamps: boolean;
	/** Separator for simple concatenation */
	separator: string;
	/** Include failed chunk information */
	includeFailures: boolean;
}

export class TranscriptionMerger {
	private defaultOptions: MergeOptions;
	private config = getTranscriptionConfig();
	private mergingConfig: ModelConfig['merging'];
	private modelConfig: ModelConfig;
	private fuzzyDetector: FuzzyOverlapDetector;
	private logger: Logger;

	constructor(modelName: string) {
		this.logger = Logger.getLogger('TranscriptionMerger');

		// Get model-specific merging config
		const modelConfig = getModelConfig(modelName);
		this.modelConfig = modelConfig;
		this.mergingConfig = modelConfig.merging;
		if (!this.mergingConfig) {
			throw new Error(`[TranscriptionMerger] Model "${modelName}" does not have merging configuration`);
		}

		// Initialize fuzzy detector with model-specific options
		const fuzzyOptions: Partial<FuzzyMatchOptions> = {
			minSimilarity: this.mergingConfig.fuzzyMatchSimilarity || 0.8,
			minMatchLength: this.mergingConfig.minMatchLength,
			useNGramScreening: this.mergingConfig.useNGramScreening !== false,
			nGramSize: this.mergingConfig.nGramSize || 3
		};
		this.fuzzyDetector = new FuzzyOverlapDetector(fuzzyOptions);

		this.defaultOptions = {
			removeOverlaps: true,
			minMatchLength: this.mergingConfig.minMatchLength,
			useTimestamps: true,
			separator: '\n\n',
			includeFailures: true
		};

		this.logger.debug('TranscriptionMerger initialized', {
			modelName,
			fuzzyMatchSimilarity: this.mergingConfig.fuzzyMatchSimilarity || 0.8,
			minMatchLength: this.mergingConfig.minMatchLength,
			useNGramScreening: this.mergingConfig.useNGramScreening !== false
		});
	}

	/**
	 * Merge transcription results with simple concatenation
	 */
	simpleMerge(
		results: TranscriptionResult[],
		separator: string = '\n\n'
	): string {
		const validResults = results.filter(r => r.success);
		return validResults.map(r => r.text).join(separator);
	}

	/**
	 * Merge with overlap removal (for Whisper-style processing)
	 */
	mergeWithOverlapRemoval(
		results: TranscriptionResult[],
		options: Partial<MergeOptions> = {}
	): string {
		const startTime = performance.now();
		const opts = { ...this.defaultOptions, ...options };

		this.logger.debug('Starting overlap removal merge', {
			resultCount: results.length,
			removeOverlaps: opts.removeOverlaps
		});

		// Separate valid and failed results
		const validResults = results.filter(r => r.success);
		const failedResults = results.filter(r => !r.success);

		if (validResults.length === 0) {
			return this.formatFailures(failedResults);
		}

		// Sort by start time
		validResults.sort((a, b) => a.startTime - b.startTime);

		// Merge with overlap detection
		let mergedText = validResults[0].text;

		for (let i = 1; i < validResults.length; i++) {
			const previous = validResults[i - 1];
			const current = validResults[i];


			// Analyze the overlap problem
			OverlapAnalyzer.analyzeOverlapProblem(
				previous.endTime,
				current.startTime,
				mergedText,
				current.text,
				this.modelConfig
			);

			// Calculate overlap duration
			const overlapStart = Math.max(previous.startTime, current.startTime);
			const overlapEnd = Math.min(previous.endTime, current.endTime);
			const overlapDuration = Math.max(0, overlapEnd - overlapStart);


			if (overlapDuration > 0 && opts.removeOverlaps) {
				// Find and remove overlap
				const overlap = this.findOverlap(
					mergedText,
					current.text,
					overlapDuration,
					opts.minMatchLength
				);

				mergedText += overlap.connector + overlap.trimmedText;
			} else {
				// No overlap, simple concatenation
				mergedText += opts.separator + current.text;
			}
		}

		// Add failure information if requested
		if (opts.includeFailures && failedResults.length > 0) {
			mergedText += '\n\n---\n' + this.formatFailures(failedResults);
		}

		// Apply duplicate removal if enabled
		// Note: For GPT-4o, this is disabled as overlap removal in findOverlap handles 150-500 char duplicates
		if (this.mergingConfig.duplicateRemoval?.enabled) {
			const minLength = this.mergingConfig.duplicateRemoval.minDuplicateLength || 150;


			mergedText = this.detectAndRemoveAllDuplicates(mergedText, minLength);
		}

		const elapsedTime = performance.now() - startTime;
		this.logger.info('Overlap removal merge completed', {
			elapsedTime: `${elapsedTime.toFixed(2)}ms`,
			validResults: validResults.length,
			failedResults: failedResults.length,
			finalTextLength: mergedText.length
		});

		return mergedText.trim();
	}

	/**
	 * Merge using timestamp alignment (for precise segment-based merging)
	 */
	mergeWithTimestamps(
		results: TranscriptionResult[],
		options: Partial<MergeOptions> = {}
	): string {
		const opts = { ...this.defaultOptions, ...options };
		const validResults = results.filter(r => r.success && r.segments);

		if (validResults.length === 0) {
			return this.simpleMerge(results, opts.separator);
		}

		// Collect all segments
		const allSegments: TranscriptionSegment[] = [];
		for (const result of validResults) {
			if (result.segments) {
				allSegments.push(...result.segments);
			}
		}

		// Sort by start time
		allSegments.sort((a, b) => a.start - b.start);

		// Remove overlapping segments
		const mergedSegments = this.deduplicateSegments(allSegments);

		// Join segment texts
		let mergedText = mergedSegments.map(s => s.text).join(' ').trim();

		// Apply duplicate removal if enabled
		// Note: For GPT-4o, this is disabled as overlap removal in findOverlap handles 150-500 char duplicates
		if (this.mergingConfig.duplicateRemoval?.enabled) {
			const minLength = this.mergingConfig.duplicateRemoval.minDuplicateLength || 150;


			mergedText = this.detectAndRemoveAllDuplicates(mergedText, minLength);
		}

		return mergedText;
	}

	/**
	 * Find overlapping content between two texts
	 */
	private findOverlap(
		previousText: string,
		currentText: string,
		overlapDuration: number,
		minMatchLength: number
	): { trimmedText: string; connector: string } {
		// Get overlap detection settings from config
		const overlapConfig = this.mergingConfig.overlapDetection || {
			minOverlapLength: 150,
			maxOverlapLength: 500,
			searchRangeInNext: 2000,
			candidateStepSize: 10,
			similarityThreshold: 0.85
		};

		const MIN_OVERLAP = overlapConfig.minOverlapLength;
		const MAX_OVERLAP = overlapConfig.maxOverlapLength;
		const SEARCH_RANGE = overlapConfig.searchRangeInNext;
		const STEP_SIZE = overlapConfig.candidateStepSize;
		const SIMILARITY_THRESHOLD = overlapConfig.similarityThreshold;

		// Validate inputs
		if (!previousText || !currentText) {
			this.logger.warn('Empty text provided to findOverlap');
			return { trimmedText: currentText || '', connector: '\n\n' };
		}

		// Debug logging using OverlapDebugger
		OverlapDebugger.logOverlapDetection(
			previousText,
			currentText,
			overlapDuration,
			this.mergingConfig.estimatedCharsPerSecond || 15,
			minMatchLength
		);

		// 長い候補から短い候補へ順に試す（より多くの重複を除去するため）
		for (let candidateLength = MAX_OVERLAP; candidateLength >= MIN_OVERLAP; candidateLength -= STEP_SIZE) {
			// 前のチャンクの末尾から候補テキストを抽出
			const candidateStart = Math.max(0, previousText.length - candidateLength);
			const candidateText = previousText.slice(candidateStart);

			// 候補が短すぎる場合はスキップ
			if (candidateText.length < MIN_OVERLAP) {
				continue;
			}

			// 次のチャンクの最初の1000文字内ですべての一致を検索
			const matches = this.findAllMatchesInRange(
				candidateText,
				currentText,
				0,  // 検索開始位置
				Math.min(SEARCH_RANGE, currentText.length),  // 検索終了位置
				SIMILARITY_THRESHOLD
			);

			if (matches.length > 0) {
				// Log match details
				const lastMatch = matches[matches.length - 1];
				const matchedText = currentText.slice(lastMatch.position, lastMatch.position + lastMatch.length);

				OverlapDebugger.logMatchFound(
					lastMatch.length,
					previousText.length - candidateLength, // previous start position
					lastMatch.position,
					matchedText
				);

				if (matches.length > 1) {
					this.logger.debug('Multiple overlap matches detected', {
						matchCount: matches.length,
						candidateLength
					});
				}

				const trimmedText = currentText.slice(lastMatch.position + lastMatch.length).trim();
				const connector = this.determineConnector(previousText);

				OverlapDebugger.logFinalResult(trimmedText, connector);
				return { trimmedText, connector };
			}
		}

		// 一致が見つからない場合
		OverlapDebugger.logNoMatchFound();
		return {
			trimmedText: currentText,
			connector: '\n\n'
		};
	}

	// すべての一致を検索するヘルパーメソッド
	private findAllMatchesInRange(
		candidateText: string,
		searchText: string,
		searchStart: number,
		searchEnd: number,
		similarityThreshold: number
	): Array<{position: number, length: number, similarity: number}> {
		const matches = [];
		const candidateLength = candidateText.length;

		// n-gramサイズを動的に決定（短いテキストには小さいn-gram）
		const nGramSize = candidateLength < 200 ? 3 : 5;

		// スライディングウィンドウで検索
		for (let pos = searchStart; pos <= searchEnd - candidateLength; pos++) {
			const targetText = searchText.slice(pos, pos + candidateLength);

			// 正規化してn-gram類似度を計算
			const similarity = calculateNormalizedNGramSimilarity(
				candidateText,
				targetText,
				nGramSize,
				{
					removeSpaces: true,
					removePunctuation: true,
					toLowerCase: true
				}
			);

			if (similarity >= similarityThreshold) {
				matches.push({
					position: pos,
					length: candidateLength,
					similarity: similarity
				});

				// 次の検索は現在の一致の後から開始（重複を避ける）
				// Skip forward by a configurable ratio to avoid overlapping matches
				const skipRatio = this.mergingConfig.overlapDetection?.matchSkipRatio || 0.5;
				pos += Math.floor(candidateLength * skipRatio);
			}
		}

		return matches;
	}

	// コネクタ決定のヘルパーメソッド
	private determineConnector(previousText: string): string {
		return previousText.match(/[。.!?！？]$/) ? '\n\n' : ' ';
	}

	/**
	 * Remove duplicate segments based on timestamp overlap
	 */
	private deduplicateSegments(segments: TranscriptionSegment[]): TranscriptionSegment[] {
		if (segments.length === 0) {
			return [];
		}

		const merged: TranscriptionSegment[] = [segments[0]];
		// Get duplicate window from config or model-specific config
		const duplicateWindowSeconds = this.mergingConfig.duplicateWindowSeconds;

		for (let i = 1; i < segments.length; i++) {
			const current = segments[i];
			const previous = merged[merged.length - 1];

			const currText = current.text.trim();
			const prevText = previous.text.trim();

			// Skip consecutive duplicate text within a short time window
			if (
				currText === prevText &&
                                current.start - previous.start <= duplicateWindowSeconds
			) {
				continue;
			}

			// Check for overlap
			if (current.start < previous.end) {
				// Overlapping segments - merge or skip
				if (current.end > previous.end) {
					// Partial overlap - extract non-overlapping part
					const overlapRatio =
                                                (previous.end - current.start) /
                                                (current.end - current.start);
					const overlapThreshold = this.mergingConfig.overlapThreshold;
					if (overlapRatio < overlapThreshold) {
						// Less than threshold overlap, keep both
						merged.push(current);
					} else {
						// Significant overlap, extend previous segment
						previous.end = current.end;
						previous.text += ' ' + current.text;
					}
				}
				// Else: current is completely contained, skip it
			} else {
				// No overlap
				merged.push(current);
			}
		}

		return merged;
	}

	/**
	 * Format failed chunk information
	 */
	private formatFailures(failures: TranscriptionResult[]): string {
		if (failures.length === 0) {
			return '';
		}

		const header = failures.length === 1
			? '**処理に失敗したチャンク:**'
			: `**処理に失敗した${failures.length}個のチャンク:**`;

		const details = failures.map(f =>
			`- チャンク ${f.id} (${this.formatTime(f.startTime)} - ${this.formatTime(f.endTime)}): ${f.error}`
		).join('\n');

		return `${header}\n${details}`;
	}

	/**
	 * Format time in MM:SS format
	 */
	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	/**
	 * Detect and remove all duplicates in the merged text
	 * This handles cases where the same text appears multiple times,
	 * regardless of chunk boundaries
	 */
	private detectAndRemoveAllDuplicates(text: string, minDuplicateLength: number = 150): string {

		// Get duplicate removal settings from config
		const duplicateRemovalConfig = this.mergingConfig.duplicateRemoval;
		if (!duplicateRemovalConfig || !duplicateRemovalConfig.enabled) {
			return text;
		}

		const duplicateSimilarity = duplicateRemovalConfig.duplicateSimilarityThreshold || 0.9;
		const useFuzzyMatching = duplicateRemovalConfig.useFuzzyMatching !== false;
		let processedText = text;



		// Track processed regions to avoid finding overlapping duplicates
		const processedRegions: Array<{start: number, end: number}> = [];

		// Use sliding window to detect duplicates
		const windowSize = minDuplicateLength; // Use exact minimum length for precision

		// Collect all duplicates first, then remove them in reverse order
		const duplicatesToRemove: Array<{start: number, end: number}> = [];

		// Early exit for texts shorter than 2x minimum duplicate length
		if (processedText.length < minDuplicateLength * 2) {
			return text;
		}

		// Build n-gram index for fast searching if using fuzzy matching
		const nGramSize = getOptimalNGramSize(minDuplicateLength, 'duplicate');
		const nGramIndex = useFuzzyMatching ? buildNGramIndex(processedText, nGramSize, 0) : null;


		// Only search within a reasonable range for performance
		const searchRange = 1000; // Search within 1000 characters as suggested

		for (let i = 0; i < processedText.length - windowSize; i++) {
			// Skip if this position is already part of a found duplicate
			if (processedRegions.some(r => i >= r.start && i < r.end)) {
				continue;
			}

			const candidateText = processedText.slice(i, i + windowSize);

			// Use n-gram index to find potential matches within search range
			const searchStartPos = Math.max(i - searchRange, i + windowSize);
			const searchEndPos = Math.min(i + searchRange, processedText.length);

			let potentialMatches = useFuzzyMatching && nGramIndex ?
				findPotentialMatches(candidateText, nGramIndex, nGramSize, searchStartPos) :
				[{ position: searchStartPos, endPosition: searchEndPos, score: 0 }];

			// Filter matches to stay within search range
			potentialMatches = potentialMatches.filter(m =>
				m.position >= searchStartPos && m.position <= searchEndPos
			);

			// If fuzzy matching found no matches, fall back to checking within range
			if (potentialMatches.length === 0) {
				potentialMatches = [{ position: searchStartPos, endPosition: searchEndPos, score: 0 }];
			}


			for (const match of potentialMatches) {
				let searchStart = match.position;
				const searchEnd = Math.min(match.endPosition, processedText.length);

				while (searchStart <= searchEnd - windowSize) {
					// Skip if this search position overlaps with a found duplicate
					if (processedRegions.some(r => searchStart >= r.start && searchStart < r.end)) {
						const nextRegion = processedRegions.find(r => searchStart >= r.start && searchStart < r.end);
						searchStart = nextRegion ? nextRegion.end : searchStart + 1;
						continue;
					}

					const compareText = processedText.slice(searchStart, searchStart + windowSize);
					let similarity: number;

					if (useFuzzyMatching) {
						// Use normalized n-gram similarity for better speech recognition handling
						similarity = calculateNormalizedNGramSimilarity(
							candidateText,
							compareText,
							nGramSize,
							{
								removeSpaces: true,
								removePunctuation: true,
								unifyKana: false, // Keep false for now to preserve meaning differences
								toLowerCase: true
							}
						);
					} else {
						// Exact match only
						similarity = candidateText === compareText ? 1.0 : 0.0;
					}


					if (similarity >= duplicateSimilarity) {
						// Found a potential duplicate, try to extend it
						let matchEnd = searchStart + windowSize;

						// Extend while characters match
						while (matchEnd < processedText.length &&
						       i + (matchEnd - searchStart) < processedText.length &&
						       processedText[i + (matchEnd - searchStart)] === processedText[matchEnd]) {
							matchEnd++;
						}

						const fullMatchLength = matchEnd - searchStart;

						if (fullMatchLength >= minDuplicateLength) {
							// Verify the full match still has high similarity
							const fullOrigText = processedText.slice(i, i + fullMatchLength);
							const fullDupText = processedText.slice(searchStart, matchEnd);
							let fullSimilarity: number;

							if (useFuzzyMatching) {
								// Re-calculate with normalized n-gram similarity for the full text
								fullSimilarity = calculateNormalizedNGramSimilarity(
									fullOrigText,
									fullDupText,
									nGramSize,
									{
										removeSpaces: true,
										removePunctuation: true,
										unifyKana: false,
										toLowerCase: true
									}
								);
							} else {
								fullSimilarity = fullOrigText === fullDupText ? 1.0 : 0.0;
							}

							if (fullSimilarity >= duplicateSimilarity) {


								// Add to removal list
								duplicatesToRemove.push({
									start: searchStart,
									end: matchEnd
								});

								// Mark this region as processed
								processedRegions.push({ start: searchStart, end: matchEnd });

								// Skip this entire matched region
								searchStart = matchEnd;
								continue;
							}
						}
					}

					searchStart++;
				}
			}

			// Skip ahead if we found a match starting at position i
			if (processedRegions.some(r => r.start === i)) {
				i += windowSize - 1;
			}
		}

		// Remove duplicates in reverse order to maintain correct positions
		if (duplicatesToRemove.length > 0) {
			// Sort by start position descending
			duplicatesToRemove.sort((a, b) => b.start - a.start);

			let totalRemoved = 0;
			for (const range of duplicatesToRemove) {
				processedText = processedText.slice(0, range.start) + processedText.slice(range.end);
				totalRemoved += range.end - range.start;
			}
			this.logger.info('Removed duplicate text segments', {
				segmentsRemoved: duplicatesToRemove.length,
				totalCharacters: totalRemoved
			});
		} else {
			this.logger.debug('No duplicates detected during merge');
		}

		return processedText;
	}


	/**
	 * Merge with timestamps included in the output text
	 */
	mergeWithTimestampsFormatted(
		results: TranscriptionResult[],
		options: Partial<MergeOptions> = {}
	): string {
		const opts = { ...this.defaultOptions, ...options };
		const validResults = results.filter(r => r.success && r.segments);

		if (validResults.length === 0) {
			return this.simpleMerge(results, opts.separator);
		}

		// Collect all segments
		const allSegments: TranscriptionSegment[] = [];
		for (const result of validResults) {
			if (result.segments) {
				allSegments.push(...result.segments);
			}
		}

		// Sort by start time
		allSegments.sort((a, b) => a.start - b.start);

		// Remove overlapping segments
		const mergedSegments = this.deduplicateSegments(allSegments);

		// Format segments with timestamps
		const formattedSegments = mergedSegments.map(segment => {
			const startTime = this.formatTime(segment.start);
			const endTime = this.formatTime(segment.end);
			return `[${startTime} → ${endTime}] ${segment.text}`;
		});

		// Join with line breaks
		let output = formattedSegments.join('\n\n');

		// Apply duplicate removal to the formatted output if enabled
		// Note: For GPT-4o, this is disabled as overlap removal is handled during merge
		if (this.mergingConfig.duplicateRemoval?.enabled) {
			const minLength = this.mergingConfig.duplicateRemoval.minDuplicateLength || 150;


			// Apply duplicate removal to the formatted text
			// This will remove duplicate segments including their timestamps
			output = this.detectAndRemoveAllDuplicates(output, minLength);
		}

		// Add failure information if requested
		const failedResults = results.filter(r => !r.success);
		if (opts.includeFailures && failedResults.length > 0) {
			output += '\n\n---\n' + this.formatFailures(failedResults);
		}

		return output.trim();
	}
}
