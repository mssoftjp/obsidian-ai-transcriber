import { WhisperTranscriptionStrategy } from '../../../src/application/strategies/WhisperTranscriptionStrategy';

import type { TranscriptionService } from '../../../src/core/transcription/TranscriptionService';
import type { TranscriptionResult } from '../../../src/core/transcription/TranscriptionTypes';

describe('WhisperTranscriptionStrategy', () => {
	it('removes a punctuation and spacing variant repeated at a chunk boundary', async () => {
		const service = {
			modelId: 'whisper-1',
			cleanText: jest.fn(async (text: string) => text)
		} as unknown as TranscriptionService;
		const strategy = new WhisperTranscriptionStrategy(service);
		const results: TranscriptionResult[] = [
			createResult(
				0,
				'第一章、識別番号は101です。第一章の結論は、順序を守って次へ進むことです。',
				0,
				25
			),
			createResult(
				1,
				'の結論は順序を守って次へ進む ことです 第二章、識別番号は202です。',
				20,
				45
			)
		];

		const merged = await strategy.mergeResults(results);

		expect(merged).toBe(
			'第一章、識別番号は101です。第一章の結論は、順序を守って次へ進むことです。第二章、識別番号は202です。'
		);
	});

	it('removes a one-word recognition variant anchored to a chunk boundary', async () => {
		const service = {
			modelId: 'whisper-1',
			cleanText: jest.fn(async (text: string) => text)
		} as unknown as TranscriptionService;
		const strategy = new WhisperTranscriptionStrategy(service);
		const results: TranscriptionResult[] = [
			createResult(
				0,
				'第三章です。ここでも同じ言い回しをもう一度使います。',
				40,
				65
			),
			createResult(
				1,
				'ここでも同じ言い回しをもう一度作ります。次の文章へ進みます。',
				60,
				85
			)
		];

		const merged = await strategy.mergeResults(results);

		expect(merged).toBe('第三章です。ここでも同じ言い回しをもう一度使います。次の文章へ進みます。');
	});

	it('preserves a similar but distinct sentence when its beginning differs', async () => {
		const service = {
			modelId: 'whisper-1',
			cleanText: jest.fn(async (text: string) => text)
		} as unknown as TranscriptionService;
		const strategy = new WhisperTranscriptionStrategy(service);
		const results: TranscriptionResult[] = [
			createResult(0, '青い資料と丸い時計について確認しました。', 80, 105),
			createResult(1, '赤い資料と三角の時計について確認しました。次へ進みます。', 100, 125)
		];

		const merged = await strategy.mergeResults(results);

		expect(merged).toBe(
			'青い資料と丸い時計について確認しました。\n\n赤い資料と三角の時計について確認しました。次へ進みます。'
		);
	});

	it('uses internal segment times to discard overlap fully covered by the previous chunk', async () => {
		const service = {
			modelId: 'whisper-1',
			cleanText: jest.fn(async (text: string) => text)
		} as unknown as TranscriptionService;
		const strategy = new WhisperTranscriptionStrategy(service);
		const results: TranscriptionResult[] = [
			{
				...createResult(0, '第一章の本文です。境界の文章です。', 0, 25),
				segments: [
					{ text: '第一章の本文です。', start: 0, end: 20 },
					{ text: '境界の文章です。', start: 20, end: 25 }
				]
			},
			{
				...createResult(1, '表記が大きく異なる境界文です。第二章の本文です。', 20, 45),
				segments: [
					{ text: '表記が大きく異なる境界文です。', start: 20, end: 24.8 },
					{ text: '第二章の本文です。', start: 24.8, end: 45 }
				]
			}
		];

		const merged = await strategy.mergeResults(results);

		expect(merged).toBe('第一章の本文です。境界の文章です。\n\n第二章の本文です。');
	});

	it('omits fully covered overlap segments from timestamp-formatted output', async () => {
		const service = {
			modelId: 'whisper-1-ts',
			cleanText: jest.fn(async (text: string) => text)
		} as unknown as TranscriptionService;
		const strategy = new WhisperTranscriptionStrategy(service);
		const results: TranscriptionResult[] = [
			{
				...createResult(0, '第一章です。境界文です。', 0, 25),
				segments: [
					{ text: '第一章です。', start: 0, end: 20 },
					{ text: '境界文です。', start: 20, end: 25 }
				]
			},
			{
				...createResult(1, '異なる表記の境界文です。第二章です。', 20, 45),
				segments: [
					{ text: '異なる表記の境界文です。', start: 20, end: 24.8 },
					{ text: '第二章です。', start: 25, end: 45 }
				]
			}
		];

		const merged = await strategy.mergeResults(results);

		expect(merged).toContain('[0:00 → 0:20] 第一章です。');
		expect(merged).toContain('[0:25 → 0:45] 第二章です。');
		expect(merged).not.toContain('異なる表記の境界文です。');
	});

	it('compresses a long consecutive block repeated three times in merged text', async () => {
		const service = {
			modelId: 'whisper-1',
			cleanText: jest.fn(async (text: string) => text)
		} as unknown as TranscriptionService;
		const strategy = new WhisperTranscriptionStrategy(service);
		const repeatedBlock = [
			'緑の資料と四角い時計について確認しました。',
			'次の文章は境界付近の欠落を見つけるため固有語アルファと番号五六七八を含みます。',
			'ただしこの直後にある第二章固有の本文は消えてはいけません。'
		].join('');
		const result = createResult(
			0,
			`第二章です。${repeatedBlock}${repeatedBlock}${repeatedBlock}第二章の結論です。`,
			0,
			25
		);

		const merged = await strategy.mergeResults([result]);

		expect(merged).toBe(`第二章です。${repeatedBlock}第二章の結論です。`);
	});
});

function createResult(
	id: number,
	text: string,
	startTime: number,
	endTime: number
): TranscriptionResult {
	return {
		id,
		text,
		startTime,
		endTime,
		success: true,
		segments: [{
			text,
			start: startTime,
			end: endTime
		}]
	};
}
