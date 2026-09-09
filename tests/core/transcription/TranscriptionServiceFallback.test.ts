import { TranscriptionService } from '../../../src/core/transcription/TranscriptionService';

import type { CleaningPipeline } from '../../../src/core/transcription/cleaners';
import type {
	ModelSpecificOptions,
	TranscriptionOptions,
	TranscriptionRequest,
	TranscriptionResult,
	TranscriptionValidation
} from '../../../src/core/transcription/TranscriptionTypes';
import type { AudioChunk } from '../../../src/core/audio/AudioTypes';

describe('TranscriptionService cleanText pipeline fallback', () => {
	const originalConsoleWarn = console.warn;
	const originalConsoleError = console.error;
	const originalConsoleDebug = console.debug;

	beforeEach(() => {
		console.warn = jest.fn();
		console.error = jest.fn();
		console.debug = jest.fn();
	});

	afterEach(() => {
		console.warn = originalConsoleWarn;
		console.error = originalConsoleError;
		console.debug = originalConsoleDebug;
	});

	it('keeps the continuation when a pipeline deletes everything', async () => {
		const emptyPipeline: CleaningPipeline = {
			name: 'EmptyPipeline',
			config: {
				name: 'EmptyPipeline',
				cleaners: []
			},
			execute: async (text: string) => ({
				finalText: '',
				stageResults: [],
				metadata: {
					totalOriginalLength: text.length,
					totalFinalLength: 0,
					totalReductionRatio: 1,
					stagesExecuted: 0,
					totalIssuesFound: 0
				}
			}),
			getCleaners: () => [],
			addCleaner: () => undefined,
			removeCleaner: () => false
		};

		class TestService extends TranscriptionService {
			readonly modelId = 'gpt-4o-mini-transcribe';
			readonly modelName = 'Test GPT-4o Mini';
			readonly capabilities = {
				supportsTimestamps: false,
				supportsWordLevel: false,
				supportsLanguageDetection: true,
				supportedLanguages: ['ja'],
				maxFileSizeMB: 25,
				maxDurationSeconds: 60 * 60
			};

			constructor() {
				super();
				this.cleaningPipeline = emptyPipeline;
			}

			async validate(_request: TranscriptionRequest): Promise<TranscriptionValidation> {
				return { isValid: true, errors: [], warnings: [] };
			}

			async transcribe(
				_chunk: AudioChunk,
				_options: TranscriptionOptions,
				_modelOptions?: ModelSpecificOptions
			): Promise<TranscriptionResult> {
				throw new Error('Not implemented');
			}

			async testConnection(_apiKey: string): Promise<boolean> {
				return true;
			}

			estimateCost(_durationSeconds: number): { amount: number; currency: string; perMinute: number } {
				return { amount: 0, currency: 'USD', perMinute: 0 };
			}

			getOptimalChunkDuration(): number {
				return 300;
			}
		}

		// Synthetic hallucination-like repetition with a continuation marker.
		const input = `前段の文です。${'あ'.repeat(600)}後続の内容です。`;
		const output = await new TestService().cleanText(input, 'ja', { audioDuration: 180 });

		expect(output.length).toBeGreaterThan(0);
		expect(output).toContain('後続の内容です。');
	});
});

