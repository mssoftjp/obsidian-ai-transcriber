import { SettingsUIBuilder } from '../src/SettingsUiBuilder';
import { DEFAULT_API_SETTINGS } from '../src/ApiSettings';
import { initializeTranslations, setLocale, t } from '../src/i18n';
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
	href = '';
	target = '';
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

	setText(text: string): void {
		this.textContent = text;
	}
}

describe('SettingsUIBuilder descriptions', () => {
	const originalCreateFragment = globalThis.createFragment;

	beforeAll(() => {
		initializeTranslations({ en, ja, zh, ko });
	});

	afterEach(() => {
		globalThis.createFragment = originalCreateFragment;
		setLocale('en');
	});

	it('renders profile-driven model comparisons as four separate list items', () => {
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
		expect(list?.children).toHaveLength(4);
		expect(list?.children.every(child => child.tagName === 'li')).toBe(true);
		expect(list?.children.map(child => child.textContent)).toEqual([
			'GPT Transcribe: Latest high-accuracy model (recommended)',
			'GPT-4o transcribe: Existing high-accuracy model',
			'GPT-4o mini transcribe: Lowest-cost GPT transcription option',
			'Whisper-1: Use when timestamps are needed'
		]);
	});

	it.each([
		['ja', ['最新の高精度モデル（推奨）', '既存の高精度モデル', 'GPT系で最も低コスト', 'タイムスタンプが必要な場合']],
		['zh', ['最新高精度模型（推荐）', '现有的高精度模型', '成本最低的 GPT 转录选项', '需要时间戳时使用']],
		['ko', ['최신 고정확도 모델(권장)', '기존 고정확도 모델', '가장 저렴한 GPT 전사 옵션', '타임스탬프가 필요할 때 사용']]
	])('uses the approved model descriptions for %s', (locale, expected) => {
		setLocale(locale);

		expect([
			t('settings.model.gptTranscribeDesc'),
			t('settings.model.gpt4oDesc'),
			t('settings.model.gpt4oMiniDesc'),
			t('settings.model.whisperDesc')
		]).toEqual(expected);
	});

	it.each([
		['en', 'GPT Transcribe (recommended)'],
		['ja', 'GPT Transcribe（推奨）'],
		['zh', 'GPT Transcribe（推荐）'],
		['ko', 'GPT Transcribe(권장)']
	])('renders a concise recommended model option in %s', (locale, expected) => {
		setLocale(locale);

		expect(
			(SettingsUIBuilder as unknown as {
				getModelLabel(model: 'gpt-transcribe'): string;
			}).getModelLabel('gpt-transcribe')
		).toBe(expected);
	});

	it('renders the supported VAD modes as separate comparison items', () => {
		const fragment = new FakeElement('fragment');
		globalThis.createFragment = () => fragment as unknown as DocumentFragment;

		const description = (
			SettingsUIBuilder as unknown as {
				createVADDescription(baseDesc: string, includeMissingNote: boolean): DocumentFragment;
			}
		).createVADDescription('Choose a mode.', false);
		const root = description as unknown as FakeElement;
		const comparison = root.children.find(child => (
			child.className === 'ai-transcriber-vad-comparison'
		));
		const list = comparison?.children.find(child => child.tagName === 'ul');

		expect(comparison).toBeDefined();
		expect(list?.children.map(child => child.textContent)).toEqual([
			'Off: Accuracy first. Processes the full audio, including quiet voices and short utterances.',
			'Local: May reduce costs for audio with long silences. Quiet voices and short utterances may be lost, reducing accuracy.'
		]);
	});

	it.each([
		['ja', [
			'精度優先。小さな声や短い発話を含め、音声全体を処理します。',
			'無音が多い音声では、料金を削減できる可能性があります。小さな声や短い発話が欠け、精度が下がる可能性があります。'
		]],
		['zh', [
			'优先保证准确度。处理包括轻声和短句在内的完整音频。',
			'对于静音较多的音频，可能降低费用。轻声和短句可能丢失，从而降低准确度。'
		]],
		['ko', [
			'정확도 우선. 작은 목소리와 짧은 발화를 포함한 전체 오디오를 처리합니다.',
			'무음이 많은 오디오는 비용을 줄일 수 있습니다. 작은 목소리와 짧은 발화가 누락되어 정확도가 낮아질 수 있습니다.'
		]]
	])('uses the approved VAD descriptions for %s', (locale, expected) => {
		setLocale(locale);

		expect([
			t('settings.vadMode.descriptions.disabled'),
			t('settings.vadMode.descriptions.local')
		]).toEqual(expected);
	});

	it('uses no silence removal as the default VAD mode', () => {
		expect(DEFAULT_API_SETTINGS.vadMode).toBe('disabled');
	});

	it('keeps the local VAD missing-WASM guidance link', () => {
		const fragment = new FakeElement('fragment');
		globalThis.createFragment = () => fragment as unknown as DocumentFragment;

		const description = (
			SettingsUIBuilder as unknown as {
				createVADDescription(baseDesc: string, includeMissingNote: boolean): DocumentFragment;
			}
		).createVADDescription('Choose a mode.', true);
		const root = description as unknown as FakeElement;
		const link = root.children.find(child => child.tagName === 'a');

		expect(link?.href).toBe('https://github.com/echogarden-project/fvad-wasm');
		expect(link?.target).toBe('_blank');
	});
});
