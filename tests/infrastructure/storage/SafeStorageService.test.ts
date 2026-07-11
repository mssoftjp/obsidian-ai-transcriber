import { SafeStorageService } from '../../../src/infrastructure/storage/SafeStorageService';

describe('SafeStorageService fallback', () => {
	beforeEach(() => {
		(SafeStorageService as unknown as { safeStorage: null }).safeStorage = null;
		Object.defineProperty(globalThis, 'window', {
			value: {},
			configurable: true
		});
	});

	it('refuses to persist a new key when OS encryption is unavailable', () => {
		const stored = SafeStorageService.encryptForStore(`sk-${'a'.repeat(40)}`);

		expect(stored).toBe('');
	});

	it.each([
		[`sk-${'r'.repeat(40)}`, `sk-${'r'.repeat(40)}`],
		[`PLAIN::sk-${'p'.repeat(40)}`, `sk-${'p'.repeat(40)}`],
		[
			`XOR_V1::${createLegacyXorValue(`sk-${'x'.repeat(40)}`)}`,
			`sk-${'x'.repeat(40)}`
		]
	])('migrates a legacy key without exposing it in the stored value', (legacyValue, apiKey) => {
		installSafeStorage();

		const migrated = SafeStorageService.migrateLegacyStoredValue(legacyValue);

		expect(migrated).toBe(`SAFE_V1::${Buffer.from(apiKey).toString('base64')}`);
		expect(migrated).not.toContain(apiKey);
	});

	it('does not rewrite an existing SafeStorage value', () => {
		installSafeStorage();
		const stored = `SAFE_V1::${Buffer.from(`sk-${'s'.repeat(40)}`).toString('base64')}`;

		expect(SafeStorageService.migrateLegacyStoredValue(stored)).toBeNull();
	});

	it('preserves a legacy key when OS encryption is unavailable', () => {
		const legacy = `PLAIN::sk-${'p'.repeat(40)}`;

		expect(SafeStorageService.migrateLegacyStoredValue(legacy)).toBeNull();
	});
});

function installSafeStorage(): void {
	Object.defineProperty(globalThis, 'window', {
		value: {
			require: jest.fn(() => ({
				safeStorage: {
					isEncryptionAvailable: () => true,
					encryptString: (value: string) => Buffer.from(value),
					decryptString: (value: Buffer) => value.toString()
				}
			}))
		},
		configurable: true
	});
}

function createLegacyXorValue(apiKey: string): string {
	const fixedKey = 'obsidian-ai-transcriber-2025';
	let encrypted = '';
	for (let index = 0; index < apiKey.length; index++) {
		encrypted += String.fromCharCode(
			apiKey.charCodeAt(index) ^ fixedKey.charCodeAt(index % fixedKey.length)
		);
	}
	return Buffer.from(encrypted, 'binary').toString('base64');
}
