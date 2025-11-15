/**
 * Post-processing service for transcription enhancement
 * Coordinates the post-processing workflow
 */

import { APITranscriptionSettings } from '../../ApiSettings';
import { TranscriptionMetaInfo } from '../../core/transcription/TranscriptionTypes';
import { PostProcessingClient, PostProcessingResult } from '../../infrastructure/api/openai/PostProcessingClient';
import { buildPostProcessingMetaRequest, POST_PROCESSING_CONFIG, estimateTokenCount } from '../../config/openai/PostProcessingConfig';
import { LanguageDetector } from '../../core/utils/LanguageDetector';
import { Logger } from '../../utils/Logger';
import { OpenAIChatResponse } from '../../infrastructure/api/openai/OpenAIChatTypes';

export interface ProcessedTranscription {
	originalText: string;
	processedText: string;
	metaInfo: TranscriptionMetaInfo;
	processingResult: PostProcessingResult;
	duration: number;
}

export class PostProcessingService {
	private client: PostProcessingClient;
	private settings: APITranscriptionSettings;
	private logger: Logger;

	constructor(settings: APITranscriptionSettings) {
		this.settings = settings;
		this.client = new PostProcessingClient(settings);
		this.logger = Logger.getLogger('PostProcessingService');
		this.logger.debug('PostProcessingService initialized', {
			postProcessingModel: settings.postProcessingModel
		});
	}

	/**
	 * Process transcription with meta information
	 */
	async processTranscription(
		transcription: string,
		metaInfo: TranscriptionMetaInfo,
		signal?: AbortSignal
	): Promise<ProcessedTranscription> {
		const startTime = Date.now();
		this.logger.info('Starting post-processing', {
			textLength: transcription.length,
			hasMetaInfo: !!metaInfo
		});

		try {

			// Step 1: Extract and reduce meta information
			this.logger.debug('Step 1: Reducing meta information');
			const reducedMeta = await this.reduceMetaInfo(metaInfo, signal);

			// Step 2: Check if segmentation is needed
			this.logger.debug('Step 2: Checking segmentation requirements');
			const language = this.detectLanguage(transcription);
			const maxChars = POST_PROCESSING_CONFIG.segmentation.maxSegmentChars[language] ||
			                POST_PROCESSING_CONFIG.segmentation.maxSegmentChars.ja;
			this.logger.debug('Segmentation check', {
				language,
				textLength: transcription.length,
				maxChars,
				needsSegmentation: transcription.length > maxChars
			});


			if (transcription.length <= maxChars) {
				// Process as single segment
				this.logger.debug('Processing as single segment');
				const result = await this.client.processTranscription(
					transcription,
					reducedMeta.context,
					reducedMeta.keywords,
					signal
				);

				const duration = (Date.now() - startTime) / 1000;
				this.logger.info('Post-processing completed', {
					duration: `${duration.toFixed(2)}s`,
					originalLength: transcription.length,
					processedLength: result.processedText.length
				});

				return {
					originalText: transcription,
					processedText: result.processedText,
					metaInfo,
					processingResult: result,
					duration
				};
			} else {
				// Process with segmentation
				this.logger.debug('Processing with segmentation');
				const segments = this.segmentTranscription(transcription, language);
				this.logger.debug('Text segmented', {
					segmentCount: segments.length
				});

				const processedSegments: string[] = [];

				for (let i = 0; i < segments.length; i++) {
					const segmentStartTime = Date.now();
					this.logger.trace(`Processing segment ${i + 1}/${segments.length}`, {
						segmentLength: segments[i].length
					});

					const segmentResult = await this.client.processTranscription(
						segments[i],
						reducedMeta.context,
						reducedMeta.keywords,
						signal
					);

					processedSegments.push(segmentResult.processedText);
					const segmentDuration = (Date.now() - segmentStartTime) / 1000;
					this.logger.trace(`Segment ${i + 1} processed`, {
						duration: `${segmentDuration.toFixed(2)}s`
					});
				}

				const processedText = processedSegments.join('');
				const duration = (Date.now() - startTime) / 1000;

				this.logger.info('Segmented post-processing completed', {
					duration: `${duration.toFixed(2)}s`,
					segmentCount: segments.length,
					originalLength: transcription.length,
					processedLength: processedText.length
				});

				return {
					originalText: transcription,
					processedText,
					metaInfo,
					processingResult: {
						processedText,
						modelUsed: POST_PROCESSING_CONFIG.model,
						confidence: 0.9
					},
					duration
				};
			}

		} catch (error) {
			this.logger.error('Post-processing failed', error);
			if (error instanceof Error && error.name === 'AbortError') {
				throw error;
			}

			this.logger.error('Processing failed', error);

			// Return original transcription on error
			return {
				originalText: transcription,
				processedText: transcription,
				metaInfo,
				processingResult: {
					processedText: transcription,
					modelUsed: 'none',
					confidence: 0
				},
				duration: (Date.now() - startTime) / 1000
			};
		}
	}

	/**
	 * Reduce meta information to fit within token limits
	 */
	private async reduceMetaInfo(
		metaInfo: TranscriptionMetaInfo,
		signal?: AbortSignal
	): Promise<{
		keywords: string[];
		context: string;
	}> {
		try {
			// If meta info is already small enough, parse it directly
			const estimatedTokens = estimateTokenCount(metaInfo.rawContent, metaInfo.language);
			if (estimatedTokens <= POST_PROCESSING_CONFIG.limitations.targetPromptTokens) {
				const parsed = this.parseMetaInfo(metaInfo.rawContent);
				return parsed;
			}

			// Use AI to reduce meta information
			const request = buildPostProcessingMetaRequest(
				metaInfo.rawContent,
				metaInfo.language
			);

			const response = await this.client['post']<OpenAIChatResponse>(
				POST_PROCESSING_CONFIG.endpoint,
				request,
				{},
				signal
			);

			if (!response.choices || response.choices.length === 0) {
				throw new Error('No response from meta reduction');
			}

			const content = response.choices[0].message?.content;
			if (!content) {
				throw new Error('Empty response from meta reduction');
			}

			// Parse JSON response
			try {
				const reduced = JSON.parse(content) as {
					keywords?: string[] | string;
					context?: string;
				};
				const keywords = Array.isArray(reduced.keywords)
					? reduced.keywords
					: typeof reduced.keywords === 'string'
						? [reduced.keywords]
						: [];
				const context = typeof reduced.context === 'string' ? reduced.context : '';
				return {
					keywords,
					context
				};
			} catch (parseError) {
				this.logger.error('Failed to parse meta reduction response', parseError);
				return this.parseMetaInfo(metaInfo.rawContent);
			}

		} catch (error) {
			this.logger.error('Meta reduction failed', error);
			// Fallback to simple parsing
			return this.parseMetaInfo(metaInfo.rawContent);
		}
	}

	/**
	 * Simple parser for meta information
	 */
	private parseMetaInfo(rawContent: string): {
		keywords: string[];
		context: string;
	} {
		const lines = rawContent.split('\n');
		const keywords: string[] = [];
		const contextParts: string[] = [];
		const parsedInfo: { [key: string]: string } = {};

		// Define label patterns for multiple languages
		const labelPatterns = {
			speakers: /^(話者|発言者|参加者|Speakers?|发言人|參加者|화자|발언자)[：:：]?\s*/i,
			topic: /^(トピック・議題|トピック|議題|主題|Topics?|Agenda|主题|议题|議題|주제|안건|의제)[：:：]?\s*/i,
			datetime: /^(日時|日付|時間|Date\/Time|Date|Time|日期时间|日期時間|일시|날짜|시간)[：:：]?\s*/i,
			location: /^(場所|会場|Location|Place|地点|地點|장소|회장)[：:：]?\s*/i,
			keywords: /^(キーワード|Keywords?|关键词|關鍵詞|키워드)[：:：]?\s*/i,
			summary: /^(要約|概要|Summary|概要|摘要|개요|요약)[：:：]?\s*/i,
			notes: /^(その他|備考|メモ|Notes?|Other|备注|備註|기타|비고|메모)[：:：]?\s*/i
		};

		let currentKey: string | null = null;
		let currentValue: string[] = [];

		// Parse each line
		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) {
				continue;
			}

			// Check if line matches any label pattern
			let matched = false;
			for (const [key, pattern] of Object.entries(labelPatterns)) {
				if (pattern.test(trimmedLine)) {
					// Save previous key-value pair
					if (currentKey && currentValue.length > 0) {
						parsedInfo[currentKey] = currentValue.join('\n').trim();
					}

					// Start new key-value pair
					currentKey = key;
					currentValue = [trimmedLine.replace(pattern, '').trim()];
					matched = true;
					break;
				}
			}

			// If no label matched, add to current value
			if (!matched) {
				if (currentKey) {
					// Special handling for keywords - they should be single line
					if (currentKey === 'keywords') {
						// If we have a keyword line and encounter non-label text, save keywords and start new context
						if (currentValue.length > 0 && currentValue[0]) {
							parsedInfo[currentKey] = currentValue.join('\n').trim();
							currentKey = null;
							currentValue = [];
						}
						contextParts.push(trimmedLine);
					} else {
						// For other fields, allow multi-line values
						currentValue.push(trimmedLine);
					}
				} else {
					// If no current key, treat as general context
					contextParts.push(trimmedLine);
				}
			}
		}

		// Save last key-value pair
		if (currentKey && currentValue.length > 0) {
			parsedInfo[currentKey] = currentValue.join('\n').trim();
		}

		// Extract keywords
		if (parsedInfo.keywords) {
			const keywordText = parsedInfo.keywords;
			keywords.push(...keywordText.split(/[,、，]/).map(k => k.trim()).filter(k => k));
			delete parsedInfo.keywords;
		}

		// Build context from parsed information
		const contextElements: string[] = [];

		// Add structured information to context
		if (parsedInfo.speakers) {
			contextElements.push(`話者: ${parsedInfo.speakers}`);
		}
		if (parsedInfo.topic) {
			contextElements.push(`議題: ${parsedInfo.topic}`);
		}
		if (parsedInfo.datetime) {
			contextElements.push(`日時: ${parsedInfo.datetime}`);
		}
		if (parsedInfo.location) {
			contextElements.push(`場所: ${parsedInfo.location}`);
		}
		if (parsedInfo.summary) {
			contextElements.push(`要約: ${parsedInfo.summary}`);
		}
		if (parsedInfo.notes) {
			contextElements.push(`備考: ${parsedInfo.notes}`);
		}

		// Add any unmatched context
		if (contextParts.length > 0) {
			contextElements.push(...contextParts);
		}

		const context = contextElements.join('\n');

		// Limit keywords to configured maximum
		const maxKeywords = POST_PROCESSING_CONFIG.limitations.maxKeywords;
		if (keywords.length > maxKeywords) {
			keywords.splice(maxKeywords);
		}

		return { keywords, context };
	}

	/**
	 * Validate service configuration
	 */
	async validateConfiguration(): Promise<{
		isValid: boolean;
		error?: string;
		model: string;
	}> {
		return await this.client.validateConfiguration();
	}

	/**
	 * Get service information
	 */
	getServiceInfo(): {
		model: string;
		enabled: boolean;
		maxInputTokens: number;
		maxOutputTokens: number;
		} {
		return {
			model: POST_PROCESSING_CONFIG.model,
			enabled: this.settings.postProcessingEnabled ?? false,
			maxInputTokens: POST_PROCESSING_CONFIG.limitations.maxInputTokens,
			maxOutputTokens: POST_PROCESSING_CONFIG.limitations.maxOutputTokens
		};
	}

	/**
	 * Detect language from text
	 */
	private detectLanguage(text: string): 'ja' | 'en' | 'zh' | 'ko' {
		return LanguageDetector.detectLanguage(text);
	}

	/**
	 * Segment transcription into manageable chunks
	 */
	private segmentTranscription(text: string, language: 'ja' | 'en' | 'zh' | 'ko'): string[] {
		const maxChars = POST_PROCESSING_CONFIG.segmentation.maxSegmentChars[language];
		const segments: string[] = [];

		// 文末パターン（優先順位順）
		const sentenceEndPatterns = [
			/[。！？]\s*$/,     // 日本語の文末
			/[.!?]\s*$/,        // 英語の文末
			/[。！？.!?]\s*$/  // 混在
		];

		// 読点パターン
		const commaPattern = /[、,]\s*$/;

		let currentSegment = '';
		let currentLength = 0;

		// 改行で分割して処理
		const lines = text.split('\n');

		for (const line of lines) {
			const lineLength = line.length + 1; // +1 for newline

			// 現在のセグメントに追加しても制限内の場合
			if (currentLength + lineLength <= maxChars) {
				currentSegment += (currentSegment ? '\n' : '') + line;
				currentLength += lineLength;
			} else {
				// 制限を超える場合、現在のセグメントを保存
				if (currentSegment) {
					segments.push(currentSegment);
				}

				// 単一行が制限を超える場合は、文末で分割を試みる
				if (lineLength > maxChars) {
					const subSegments = this.splitLongLine(line, maxChars, sentenceEndPatterns, commaPattern);
					segments.push(...subSegments.slice(0, -1));
					currentSegment = subSegments[subSegments.length - 1];
					currentLength = currentSegment.length;
				} else {
					currentSegment = line;
					currentLength = lineLength;
				}
			}
		}

		// 最後のセグメントを追加
		if (currentSegment) {
			segments.push(currentSegment);
		}

		return segments;
	}

	/**
	 * Split a long line into smaller segments
	 */
	private splitLongLine(
		line: string,
		maxChars: number,
		sentenceEndPatterns: RegExp[],
		commaPattern: RegExp
	): string[] {
		const segments: string[] = [];
		let remaining = line;

		while (remaining.length > maxChars) {
			let splitPoint = -1;

			// 文末を探す
			for (const pattern of sentenceEndPatterns) {
				const searchText = remaining.substring(0, maxChars);
				const matches = Array.from(searchText.matchAll(new RegExp(pattern.source.replace(/\$$/, ''), 'g')));

				if (matches.length > 0) {
					const lastMatch = matches[matches.length - 1];
					splitPoint = lastMatch.index + lastMatch[0].length;
					break;
				}
			}

			// 文末が見つからない場合、読点を探す
			if (splitPoint === -1) {
				const searchText = remaining.substring(0, maxChars);
				const matches = Array.from(searchText.matchAll(new RegExp(commaPattern.source.replace(/\$$/, ''), 'g')));

				if (matches.length > 0) {
					const lastMatch = matches[matches.length - 1];
					splitPoint = lastMatch.index + lastMatch[0].length;
				}
			}

			// それでも見つからない場合は、強制的に分割
			if (splitPoint === -1) {
				splitPoint = maxChars;
			}

			segments.push(remaining.substring(0, splitPoint));
			remaining = remaining.substring(splitPoint).trim();
		}

		if (remaining) {
			segments.push(remaining);
		}

		return segments;
	}
}
