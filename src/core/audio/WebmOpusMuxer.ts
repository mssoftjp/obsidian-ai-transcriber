const TIMECODE_SCALE_NANOSECONDS = 1_000_000;
const OPUS_CODEC_DELAY_NANOSECONDS = 6_500_000;
const OPUS_SEEK_PREROLL_NANOSECONDS = 80_000_000;
const OPUS_PRE_SKIP_SAMPLES_AT_48_KHZ = 312;
const MAX_CLUSTER_DURATION_MILLISECONDS = 30_000;

export interface OpusPacket {
	data: Uint8Array;
	timestampMicroseconds: number;
	durationMicroseconds: number;
}

export interface WebmOpusMuxInput {
	packets: readonly OpusPacket[];
	sampleRate: number;
	channelCount: number;
	durationMicroseconds: number;
}

export function muxOpusPacketsToWebm(input: WebmOpusMuxInput): Uint8Array {
	validateInput(input);

	const ebmlHeader = element(
		[0x1A, 0x45, 0xDF, 0xA3],
		concatBytes(
			unsignedElement([0x42, 0x86], 1),
			unsignedElement([0x42, 0xF7], 1),
			unsignedElement([0x42, 0xF2], 4),
			unsignedElement([0x42, 0xF3], 8),
			stringElement([0x42, 0x82], 'webm'),
			unsignedElement([0x42, 0x87], 4),
			unsignedElement([0x42, 0x85], 2)
		)
	);

	const segmentPayload = concatBytes(
		createInfo(input.durationMicroseconds),
		createTracks(input.sampleRate, input.channelCount),
		...createClusters(input.packets)
	);
	const segment = element([0x18, 0x53, 0x80, 0x67], segmentPayload);

	return concatBytes(ebmlHeader, segment);
}

function createInfo(durationMicroseconds: number): Uint8Array {
	return element(
		[0x15, 0x49, 0xA9, 0x66],
		concatBytes(
			unsignedElement([0x2A, 0xD7, 0xB1], TIMECODE_SCALE_NANOSECONDS),
			floatElement([0x44, 0x89], durationMicroseconds / 1_000),
			stringElement([0x4D, 0x80], 'AI Transcriber'),
			stringElement([0x57, 0x41], 'AI Transcriber')
		)
	);
}

function createTracks(sampleRate: number, channelCount: number): Uint8Array {
	const audio = element(
		[0xE1],
		concatBytes(
			floatElement([0xB5], sampleRate),
			unsignedElement([0x9F], channelCount)
		)
	);
	const trackEntry = element(
		[0xAE],
		concatBytes(
			unsignedElement([0xD7], 1),
			unsignedElement([0x73, 0xC5], 1),
			unsignedElement([0x83], 2),
			unsignedElement([0x9C], 0),
			stringElement([0x86], 'A_OPUS'),
			binaryElement([0x63, 0xA2], createOpusIdentificationHeader(sampleRate, channelCount)),
			unsignedElement([0x56, 0xAA], OPUS_CODEC_DELAY_NANOSECONDS),
			unsignedElement([0x56, 0xBB], OPUS_SEEK_PREROLL_NANOSECONDS),
			audio
		)
	);

	return element([0x16, 0x54, 0xAE, 0x6B], trackEntry);
}

function createOpusIdentificationHeader(sampleRate: number, channelCount: number): Uint8Array {
	const header = new Uint8Array(19);
	const view = new DataView(header.buffer);
	writeAscii(header, 0, 'OpusHead');
	header[8] = 1;
	header[9] = channelCount;
	view.setUint16(10, OPUS_PRE_SKIP_SAMPLES_AT_48_KHZ, true);
	view.setUint32(12, sampleRate, true);
	view.setInt16(16, 0, true);
	header[18] = 0;
	return header;
}

function createClusters(packets: readonly OpusPacket[]): Uint8Array[] {
	const clusters: Uint8Array[] = [];
	let clusterStartMilliseconds = toMilliseconds(packets[0]?.timestampMicroseconds ?? 0);
	let clusterPackets: OpusPacket[] = [];

	for (const packet of packets) {
		const packetTimestampMilliseconds = toMilliseconds(packet.timestampMicroseconds);
		if (
			clusterPackets.length > 0
			&& packetTimestampMilliseconds - clusterStartMilliseconds > MAX_CLUSTER_DURATION_MILLISECONDS
		) {
			clusters.push(createCluster(clusterStartMilliseconds, clusterPackets));
			clusterStartMilliseconds = packetTimestampMilliseconds;
			clusterPackets = [];
		}
		clusterPackets.push(packet);
	}

	if (clusterPackets.length > 0) {
		clusters.push(createCluster(clusterStartMilliseconds, clusterPackets));
	}
	return clusters;
}

function createCluster(clusterStartMilliseconds: number, packets: readonly OpusPacket[]): Uint8Array {
	const blocks = packets.map(packet => {
		const relativeTimestamp = toMilliseconds(packet.timestampMicroseconds) - clusterStartMilliseconds;
		if (relativeTimestamp < -32_768 || relativeTimestamp > 32_767) {
			throw new RangeError('Opus packet timestamp exceeds the WebM SimpleBlock range');
		}

		const block = new Uint8Array(4 + packet.data.byteLength);
		const view = new DataView(block.buffer);
		block[0] = 0x81;
		view.setInt16(1, relativeTimestamp, false);
		block[3] = 0x80;
		block.set(packet.data, 4);
		return binaryElement([0xA3], block);
	});

	return element(
		[0x1F, 0x43, 0xB6, 0x75],
		concatBytes(unsignedElement([0xE7], clusterStartMilliseconds), ...blocks)
	);
}

function validateInput(input: WebmOpusMuxInput): void {
	if (!Number.isSafeInteger(input.sampleRate) || input.sampleRate <= 0) {
		throw new RangeError('Opus sample rate is invalid');
	}
	if (!Number.isSafeInteger(input.channelCount) || input.channelCount < 1 || input.channelCount > 2) {
		throw new RangeError('Only mono or stereo Opus tracks are supported');
	}
	if (!Number.isSafeInteger(input.durationMicroseconds) || input.durationMicroseconds <= 0) {
		throw new RangeError('Opus duration is invalid');
	}
	if (input.packets.length === 0) {
		throw new RangeError('At least one Opus packet is required');
	}

	let previousTimestamp = -1;
	for (const packet of input.packets) {
		if (
			!Number.isSafeInteger(packet.timestampMicroseconds)
			|| packet.timestampMicroseconds < 0
			|| packet.timestampMicroseconds < previousTimestamp
		) {
			throw new RangeError('Opus packet timestamps must be monotonic non-negative integers');
		}
		if (!Number.isSafeInteger(packet.durationMicroseconds) || packet.durationMicroseconds <= 0) {
			throw new RangeError('Opus packet duration is invalid');
		}
		if (packet.data.byteLength === 0) {
			throw new RangeError('Opus packets must not be empty');
		}
		previousTimestamp = packet.timestampMicroseconds;
	}
}

function element(id: readonly number[], payload: Uint8Array): Uint8Array {
	return concatBytes(Uint8Array.from(id), encodeVariableSize(payload.byteLength), payload);
}

function unsignedElement(id: readonly number[], value: number): Uint8Array {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError('EBML unsigned integer is invalid');
	}
	let byteLength = 1;
	while (value >= 2 ** (byteLength * 8) && byteLength < 8) {
		byteLength++;
	}
	const payload = new Uint8Array(byteLength);
	let remaining = value;
	for (let index = byteLength - 1; index >= 0; index--) {
		payload[index] = remaining % 256;
		remaining = Math.floor(remaining / 256);
	}
	return element(id, payload);
}

function floatElement(id: readonly number[], value: number): Uint8Array {
	if (!Number.isFinite(value)) {
		throw new RangeError('EBML float is invalid');
	}
	const payload = new Uint8Array(8);
	new DataView(payload.buffer).setFloat64(0, value, false);
	return element(id, payload);
}

function stringElement(id: readonly number[], value: string): Uint8Array {
	return element(id, new TextEncoder().encode(value));
}

function binaryElement(id: readonly number[], value: Uint8Array): Uint8Array {
	return element(id, value);
}

function encodeVariableSize(value: number): Uint8Array {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError('EBML element size is invalid');
	}
	let byteLength = 1;
	while (value > 2 ** (7 * byteLength) - 2 && byteLength < 8) {
		byteLength++;
	}
	if (value > 2 ** (7 * byteLength) - 2) {
		throw new RangeError('EBML element is too large');
	}

	const encoded = new Uint8Array(byteLength);
	let remaining = value;
	for (let index = byteLength - 1; index >= 0; index--) {
		encoded[index] = remaining % 256;
		remaining = Math.floor(remaining / 256);
	}
	encoded[0] = (encoded[0] ?? 0) | (1 << (8 - byteLength));
	return encoded;
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
	const byteLength = parts.reduce((total, part) => total + part.byteLength, 0);
	if (!Number.isSafeInteger(byteLength)) {
		throw new RangeError('EBML output is too large');
	}
	const output = new Uint8Array(byteLength);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.byteLength;
	}
	return output;
}

function toMilliseconds(microseconds: number): number {
	return Math.round(microseconds / 1_000);
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
	for (let index = 0; index < value.length; index++) {
		target[offset + index] = value.charCodeAt(index);
	}
}
