import { muxOpusPacketsToWebm } from '../../../src/core/audio/WebmOpusMuxer';

describe('muxOpusPacketsToWebm', () => {
	it('creates an audio-only WebM file with Opus track metadata and packet payloads', () => {
		const firstPacket = Uint8Array.from([0x11, 0x22, 0x33]);
		const secondPacket = Uint8Array.from([0x44, 0x55]);

		const webm = muxOpusPacketsToWebm({
			packets: [
				{ data: firstPacket, timestampMicroseconds: 0, durationMicroseconds: 20_000 },
				{ data: secondPacket, timestampMicroseconds: 20_000, durationMicroseconds: 20_000 }
			],
			sampleRate: 16_000,
			channelCount: 1,
			durationMicroseconds: 40_000
		});

		expect(Array.from(webm.subarray(0, 4))).toEqual([0x1A, 0x45, 0xDF, 0xA3]);
		expect(readAscii(webm)).toContain('webm');
		expect(readAscii(webm)).toContain('A_OPUS');
		expect(readAscii(webm)).toContain('OpusHead');
		expect(containsSequence(webm, firstPacket)).toBe(true);
		expect(containsSequence(webm, secondPacket)).toBe(true);
	});

	it('starts a new cluster before SimpleBlock timecodes exceed their signed range', () => {
		const webm = muxOpusPacketsToWebm({
			packets: [
				{ data: Uint8Array.of(0x01), timestampMicroseconds: 0, durationMicroseconds: 20_000 },
				{ data: Uint8Array.of(0x02), timestampMicroseconds: 31_000_000, durationMicroseconds: 20_000 }
			],
			sampleRate: 16_000,
			channelCount: 1,
			durationMicroseconds: 31_020_000
		});

		expect(countSequence(webm, Uint8Array.from([0x1F, 0x43, 0xB6, 0x75]))).toBe(2);
	});

	it('rejects packets whose timestamps are not monotonic', () => {
		expect(() => muxOpusPacketsToWebm({
			packets: [
				{ data: Uint8Array.of(0x01), timestampMicroseconds: 20_000, durationMicroseconds: 20_000 },
				{ data: Uint8Array.of(0x02), timestampMicroseconds: 0, durationMicroseconds: 20_000 }
			],
			sampleRate: 16_000,
			channelCount: 1,
			durationMicroseconds: 40_000
		})).toThrow('timestamps must be monotonic');
	});
});

function readAscii(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes);
}

function containsSequence(haystack: Uint8Array, needle: Uint8Array): boolean {
	return countSequence(haystack, needle) > 0;
}

function countSequence(haystack: Uint8Array, needle: Uint8Array): number {
	let count = 0;
	for (let index = 0; index <= haystack.length - needle.length; index++) {
		let matches = true;
		for (let offset = 0; offset < needle.length; offset++) {
			if (haystack[index + offset] !== needle[offset]) {
				matches = false;
				break;
			}
		}
		if (matches) {
			count++;
		}
	}
	return count;
}
