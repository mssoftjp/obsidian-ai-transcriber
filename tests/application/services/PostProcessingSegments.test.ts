import {
	restoreSegmentBoundaryWhitespace,
	segmentTranscriptionPreservingSeparators
} from '../../../src/application/services/PostProcessingSegments';

describe('segmentTranscriptionPreservingSeparators', () => {
	it('keeps short text as one segment', () => {
		expect(segmentTranscriptionPreservingSeparators('短い本文です。', 100)).toEqual(['短い本文です。']);
	});

	it.each([
		['newline', '第一段落です。\n\n第二段落です。\n第三段落です。'],
		['punctuation', '第一文です。第二文です！第三文です？第四文です。'],
		['blank lines', '冒頭\n\n\n中間\n\n末尾'],
		['forced split', 'あ'.repeat(83)]
	])('recombines %s text byte-for-byte', (_label, text) => {
		const segments = segmentTranscriptionPreservingSeparators(text, 20);

		expect(segments.join('')).toBe(text);
		expect(segments.every(segment => segment.length <= 20)).toBe(true);
		expect(segments.every(segment => segment.length > 0)).toBe(true);
	});

	it('retains ordered markers across a two-hour-equivalent Japanese transcript', () => {
		const markers = ['START', 'BOUNDARY_A', 'BOUNDARY_B', 'END'];
		const text = [
			markers[0],
			'本文。'.repeat(5000),
			markers[1],
			'内容。'.repeat(5000),
			markers[2],
			'会話。'.repeat(5000),
			markers[3]
		].join('');

		const segments = segmentTranscriptionPreservingSeparators(text, 15000);
		const recombined = segments.join('');

		expect(text.length).toBeGreaterThanOrEqual(40000);
		expect(segments.length).toBeGreaterThanOrEqual(3);
		expect(recombined).toBe(text);
		for (const marker of markers) {
			expect(recombined.split(marker)).toHaveLength(2);
		}
		expect(markers.map(marker => recombined.indexOf(marker))).toEqual(
			[...markers].map(marker => text.indexOf(marker))
		);
	});

	it('restores exact leading and trailing whitespace after AI processing', () => {
		expect(restoreSegmentBoundaryWhitespace(
			'\n\n元の本文\n\n',
			'  修正後の本文  '
		)).toBe('\n\n修正後の本文\n\n');
		expect(restoreSegmentBoundaryWhitespace('\n\n', 'ignored')).toBe('\n\n');
	});
});
