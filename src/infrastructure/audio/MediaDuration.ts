/** Read container metadata without loading the whole file or decoding PCM. */
export async function readMediaDuration(
	resourceUrl: string,
	signal: AbortSignal,
	timeoutMs = 10_000
): Promise<number> {
	if (signal.aborted) {
		throw new DOMException('Media metadata load cancelled', 'AbortError');
	}
	const media = createEl('video');
	media.preload = 'metadata';
	media.muted = true;
	return new Promise<number>((resolve, reject) => {
		const cleanup = () => {
			window.clearTimeout(timer);
			media.removeEventListener('loadedmetadata', onMetadata);
			media.removeEventListener('durationchange', onMetadata);
			media.removeEventListener('error', onError);
			signal.removeEventListener('abort', onAbort);
			media.removeAttribute('src');
			media.load();
		};
		const onMetadata = () => {
			if (Number.isFinite(media.duration) && media.duration > 0) {
				const duration = media.duration;
				cleanup();
				resolve(duration);
			}
		};
		const onError = () => {
			cleanup();
			reject(new Error('Could not read media duration metadata'));
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException('Media metadata load cancelled', 'AbortError'));
		};
		const timer = window.setTimeout(onError, timeoutMs);
		media.addEventListener('loadedmetadata', onMetadata);
		media.addEventListener('durationchange', onMetadata);
		media.addEventListener('error', onError);
		signal.addEventListener('abort', onAbort, { once: true });
		try {
			media.src = resourceUrl;
			media.load();
		} catch {
			onError();
		}
	});
}
