export function clearApiKeyInput(input: HTMLInputElement | null): void {
	if (input) {
		input.value = '';
	}
}
