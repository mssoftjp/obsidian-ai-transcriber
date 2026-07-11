import { SafeStorageService } from '../../../src/infrastructure/storage/SafeStorageService';

describe('SafeStorageService fallback', () => {
	beforeAll(() => {
		Object.defineProperty(globalThis, 'window', {
			value: {},
			configurable: true
		});
	});

	it('refuses to persist a new key when OS encryption is unavailable', () => {
		const stored = SafeStorageService.encryptForStore(`sk-${'a'.repeat(40)}`);

		expect(stored).toBe('');
	});
});
