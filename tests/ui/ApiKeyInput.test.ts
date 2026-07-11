import { clearApiKeyInput } from '../../src/ui/ApiKeyInput';

describe('clearApiKeyInput', () => {
	it('clears a password input through its retained element reference', () => {
		const input = { value: '********' } as HTMLInputElement;

		clearApiKeyInput(input);

		expect(input.value).toBe('');
	});

	it('is safe when the input is unavailable', () => {
		expect(() => clearApiKeyInput(null)).not.toThrow();
	});
});
