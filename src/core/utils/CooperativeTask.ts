export const COOPERATIVE_BATCH_SIZE = 32_768;

export function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException('Operation was cancelled', 'AbortError');
	}
}

export async function yieldToEventLoop(signal?: AbortSignal): Promise<void> {
	throwIfAborted(signal);
	await new Promise<void>((resolve) => {
		window.setTimeout(resolve, 0);
	});
	throwIfAborted(signal);
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
	return (signal?.aborted ?? false)
		|| (error instanceof DOMException && error.name === 'AbortError');
}
