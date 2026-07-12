import { SettingsUIBuilder } from '../src/SettingsUiBuilder';
import { initializeTranslations } from '../src/i18n';
import en from '../src/i18n/translations/en';
import ja from '../src/i18n/translations/ja';
import ko from '../src/i18n/translations/ko';
import zh from '../src/i18n/translations/zh';

interface FakeElementOptions {
	cls?: string;
	text?: string;
}

class FakeElement {
	readonly children: FakeElement[] = [];
	readonly className: string;
	readonly tagName: string;
	textContent = '';

	constructor(tagName: string, options: FakeElementOptions = {}) {
		this.tagName = tagName;
		this.className = options.cls ?? '';
		this.textContent = options.text ?? '';
	}

	appendText(text: string): void {
		this.textContent += text;
	}

	createEl(tagName: string, options: FakeElementOptions = {}): FakeElement {
		const element = new FakeElement(tagName, options);
		this.children.push(element);
		return element;
	}

	createDiv(options: FakeElementOptions = {}): FakeElement {
		return this.createEl('div', options);
	}
}

describe('SettingsUIBuilder model description', () => {
	const originalCreateFragment = globalThis.createFragment;

	beforeAll(() => {
		initializeTranslations({ en, ja, zh, ko });
	});

	afterEach(() => {
		globalThis.createFragment = originalCreateFragment;
	});

	it('renders model comparisons as three separate list items', () => {
		const fragment = new FakeElement('fragment');
		globalThis.createFragment = () => fragment as unknown as DocumentFragment;

		const description = (
			SettingsUIBuilder as unknown as { createModelDescription(): DocumentFragment }
		).createModelDescription();
		const root = description as unknown as FakeElement;
		const comparison = root.children.find(child => (
			child.className === 'ai-transcriber-model-comparison'
		));
		const list = comparison?.children.find(child => child.tagName === 'ul');

		expect(comparison).toBeDefined();
		expect(list?.children).toHaveLength(3);
		expect(list?.children.every(child => child.tagName === 'li')).toBe(true);
		expect(list?.children.map(child => child.textContent)).toEqual([
			'Whisper-1: Supports timestamped output',
			'GPT-4o transcribe: High accuracy',
			'GPT-4o mini transcribe: Low cost'
		]);
	});
});
