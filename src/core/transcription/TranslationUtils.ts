/**
 * Translation utilities for external plugins
 * Provides chunking and optimization functions for large transcriptions
 */

import { estimateTokenCount as tokenEstimateTokenCount, estimateCharCount } from '../../config/TokenConstants';

export interface TranslationChunk {
	text: string;
	index: number;
	estimatedTokens: number;
	boundaries: {
		start: number;
		end: number;
	};
}

export interface ChunkingOptions {
	maxTokens?: number;
	preserveParagraphs?: boolean;
	preserveSentences?: boolean;
	overlapSize?: number;
}

/**
 * Split large transcription text into translation-friendly chunks
 * Respects paragraph and sentence boundaries to maintain context
 */
export function getRecommendedTranslationChunks(
	text: string,
	options: ChunkingOptions = {}
): TranslationChunk[] {
	const {
		maxTokens = 3000,
		preserveParagraphs = true,
		preserveSentences = true,
		overlapSize = 100
	} = options;

	// Use 'auto' language for mixed content estimation
	const estimatedTokens = tokenEstimateTokenCount(text, 'auto');

	// If text is small enough, return as single chunk
	if (estimatedTokens <= maxTokens) {
		return [{
			text,
			index: 0,
			estimatedTokens,
			boundaries: { start: 0, end: text.length }
		}];
	}

	const chunks: TranslationChunk[] = [];
	let currentPosition = 0;

	while (currentPosition < text.length) {
		// Convert tokens back to chars using 'auto' language
		const targetChunkSize = estimateCharCount(maxTokens, 'auto');

		let chunkEnd = Math.min(currentPosition + targetChunkSize, text.length);
		let chunkText = text.slice(currentPosition, chunkEnd);

		// If not at the end and we want to preserve boundaries
		if (chunkEnd < text.length) {
			// Try to break at paragraph boundary first
			if (preserveParagraphs) {
				const lastParagraph = chunkText.lastIndexOf('\n\n');
				if (lastParagraph > targetChunkSize * 0.7) { // Don't make chunks too small
					chunkEnd = currentPosition + lastParagraph + 2;
					chunkText = text.slice(currentPosition, chunkEnd);
				}
			}

			// If no good paragraph break, try sentence boundary
			if (preserveSentences && chunkEnd === currentPosition + targetChunkSize) {
				const sentenceEnders = /[.!?。！？]\s+/g;
				let lastSentence = -1;
				let match;

				while ((match = sentenceEnders.exec(chunkText)) !== null) {
					if (match.index > targetChunkSize * 0.7) {
						break;
					}
					lastSentence = match.index + match[0].length;
				}

				if (lastSentence > 0) {
					chunkEnd = currentPosition + lastSentence;
					chunkText = text.slice(currentPosition, chunkEnd);
				}
			}
		}

		// Create chunk
		chunks.push({
			text: chunkText.trim(),
			index: chunks.length,
			estimatedTokens: Math.ceil(chunkText.length / 4),
			boundaries: {
				start: currentPosition,
				end: chunkEnd
			}
		});

		// Move to next position with overlap if specified
		currentPosition = Math.max(chunkEnd - overlapSize, chunkEnd);

		// Ensure we don't get stuck in infinite loop
		if (currentPosition >= text.length) {
			break;
		}
	}

	return chunks;
}

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokenCount(text: string, language = 'auto'): number {
	// Use centralized token constants
	return tokenEstimateTokenCount(text, language);
}

/**
 * Check if transcription needs chunking for translation
 */
export function needsChunking(
	text: string,
	maxTokens = 3000,
	language = 'auto'
): boolean {
	const estimatedTokens = estimateTokenCount(text, language);
	return estimatedTokens > maxTokens;
}

/**
 * Get optimal chunk size based on target model and language
 */
export function getOptimalChunkSize(
	_totalLength: number,
	targetModel = 'gpt-4o-mini',
	language = 'auto'
): number {
	// Model-specific token limits (conservative estimates)
	const modelLimits: Record<string, number> = {
		'gpt-4o-mini': 3000,
		'gpt-4o': 4000,
		'gpt-3.5-turbo': 2500,
		'claude-3-haiku': 3500,
		'claude-3-sonnet': 4000,
		'gemini-pro': 3000
	};

	const baseLimit = modelLimits[targetModel] || 3000;

	// Adjust for language density
	const languageAdjustments: Record<string, number> = {
		'ja': 0.8, // Japanese is denser, use smaller chunks
		'zh': 0.85,
		'ko': 0.9,
		'en': 1.0,
		'auto': 0.9 // Conservative default
	};

	const adjustment = languageAdjustments[language] || 0.9;
	return Math.floor(baseLimit * adjustment);
}

/**
 * Merge translated chunks back into coherent text
 */
export function mergeTranslatedChunks(
	translatedChunks: Array<{ index: number; text: string }>,
	_originalChunks: TranslationChunk[]
): string {
	// Sort by index to ensure correct order
	const sortedChunks = translatedChunks.sort((a, b) => a.index - b.index);

	// Simple concatenation with paragraph breaks
	// TODO: Could be enhanced with overlap detection and smart merging
	return sortedChunks
		.map(chunk => chunk.text.trim())
		.filter(text => text.length > 0)
		.join('\n\n');
}

/**
 * Create translation metadata for external plugins
 */
export function createTranslationMetadata(
	originalText: string,
	language: string,
	targetModel?: string
) {
	const chunks = getRecommendedTranslationChunks(originalText, {
		maxTokens: getOptimalChunkSize(originalText.length, targetModel, language)
	});

	return {
		totalLength: originalText.length,
		estimatedTokens: estimateTokenCount(originalText, language),
		recommendedChunkCount: chunks.length,
		needsChunking: chunks.length > 1,
		optimalChunkSize: getOptimalChunkSize(originalText.length, targetModel, language),
		language,
		targetModel: targetModel || 'gpt-4o-mini',
		chunks: chunks.map(chunk => ({
			index: chunk.index,
			length: chunk.text.length,
			estimatedTokens: chunk.estimatedTokens,
			boundaries: chunk.boundaries
		}))
	};
}
