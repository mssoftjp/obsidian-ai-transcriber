const PREFERRED_BOUNDARY = /[\n。！？.!?、,]/;

export function segmentTranscriptionPreservingSeparators(
	text: string,
	maxCharacters: number
): string[] {
	if (maxCharacters <= 0) {
		throw new RangeError('maxCharacters must be greater than zero');
	}
	if (text.length === 0) {
		return [];
	}

	const segments: string[] = [];
	let offset = 0;
	while (text.length - offset > maxCharacters) {
		const window = text.slice(offset, offset + maxCharacters);
		const splitAt = findPreferredSplit(window);
		segments.push(text.slice(offset, offset + splitAt));
		offset += splitAt;
	}

	if (offset < text.length) {
		segments.push(text.slice(offset));
	}
	return segments;
}

export function restoreSegmentBoundaryWhitespace(source: string, processed: string): string {
	if (source.trim().length === 0) {
		return source;
	}
	const leadingWhitespace = source.match(/^\s*/)?.[0] ?? '';
	const trailingWhitespace = source.match(/\s*$/)?.[0] ?? '';
	return `${leadingWhitespace}${processed.trim()}${trailingWhitespace}`;
}

function findPreferredSplit(window: string): number {
	const minimumPreferredIndex = Math.floor(window.length / 2);
	for (let index = window.length - 1; index >= minimumPreferredIndex; index--) {
		const character = window[index];
		if (character && PREFERRED_BOUNDARY.test(character)) {
			let splitAt = index + 1;
			while (splitAt < window.length && /\s/.test(window[splitAt] ?? '')) {
				splitAt++;
			}
			return splitAt;
		}
	}
	return window.length;
}
