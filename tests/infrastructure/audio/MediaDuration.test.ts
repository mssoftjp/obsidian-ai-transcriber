import { readMediaDuration } from '../../../src/infrastructure/audio/MediaDuration';

class FakeMedia extends EventTarget {
	duration = Number.NaN;
	preload = '';
	muted = false;
	src = '';
	load = jest.fn();
	removeAttribute = jest.fn();
}

describe('media duration lifecycle', () => {
	let media: FakeMedia;
	beforeEach(() => {
		jest.useFakeTimers();
		media = new FakeMedia();
		Object.defineProperty(globalThis, 'createEl', { configurable: true, value: () => media });
		Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
	});
	afterEach(() => {
		jest.useRealTimers();
		Reflect.deleteProperty(globalThis, 'createEl');
		Reflect.deleteProperty(globalThis, 'window');
	});

	it('waits for finite metadata and releases the local media resource', async () => {
		const pending = readMediaDuration('app://local/video.mp4', new AbortController().signal);
		media.duration = Infinity;
		media.dispatchEvent(new Event('loadedmetadata'));
		media.duration = 780.5;
		media.dispatchEvent(new Event('durationchange'));
		await expect(pending).resolves.toBe(780.5);
		expect(media.preload).toBe('metadata');
		expect(media.removeAttribute).toHaveBeenCalledWith('src');
		expect(jest.getTimerCount()).toBe(0);
	});

	it.each([Number.NaN, Infinity, 0, -1])('does not accept invalid duration %s', async duration => {
		const pending = readMediaDuration('app://local/video.mp4', new AbortController().signal, 50);
		const rejection = expect(pending).rejects.toThrow('Could not read media duration');
		media.duration = duration;
		media.dispatchEvent(new Event('loadedmetadata'));
		jest.advanceTimersByTime(50);
		await rejection;
		expect(media.removeAttribute).toHaveBeenCalledWith('src');
	});

	it('cancels a pending load and clears its timeout', async () => {
		const controller = new AbortController();
		const pending = readMediaDuration('app://local/video.mp4', controller.signal);
		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(jest.getTimerCount()).toBe(0);
		expect(media.removeAttribute).toHaveBeenCalledWith('src');
	});

	it('does not open media when already cancelled', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(readMediaDuration('app://local/video.mp4', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
		expect(media.load).not.toHaveBeenCalled();
	});

	it('releases media on a codec or file error', async () => {
		const pending = readMediaDuration('app://local/video.mp4', new AbortController().signal);
		media.dispatchEvent(new Event('error'));
		await expect(pending).rejects.toThrow('Could not read media duration');
		expect(jest.getTimerCount()).toBe(0);
	});
});
