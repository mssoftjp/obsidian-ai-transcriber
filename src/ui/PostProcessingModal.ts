/**
 * Modal for post-processing transcription results
 * This is for Phase 3 implementation - adding meta information after transcription
 */

import { Modal, Notice, TextAreaComponent, ButtonComponent } from 'obsidian';

import { POST_PROCESSING_CONFIG } from '../config/openai/PostProcessingConfig';
import { ErrorHandler } from '../ErrorHandler';
import { t } from '../i18n';

import type { APITranscriptionSettings } from '../ApiSettings';
import type { TranscriptionMetaInfo } from '../core/transcription/TranscriptionTypes';
import type { App } from 'obsidian';

export class PostProcessingModal extends Modal {
	private settings: APITranscriptionSettings;
	private transcription: string;
	private onSubmit: (metaInfo: TranscriptionMetaInfo | null) => void;

	// UI Elements
	private transcriptEl!: HTMLTextAreaElement;
	private metaInfoInput!: TextAreaComponent;

	constructor(
		app: App,
		transcription: string,
		settings: APITranscriptionSettings,
		onSubmit: (metaInfo: TranscriptionMetaInfo | null) => void
	) {
		super(app);
		this.transcription = transcription;
		this.settings = settings;
		this.onSubmit = onSubmit;
	}

	override onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('ai-transcriber-modal');

		// Add modal classes
		contentEl.addClass('transcription-meta-modal');

		// Header
		const isPreTranscription = !this.transcription || this.transcription.length === 0;
		contentEl.createEl('h2', { text: isPreTranscription ? t('modal.postProcessing.titlePre') : t('modal.postProcessing.titlePost') });

		// Description - use only metaInfoDescription
		contentEl.createEl('p', {
			text: t('modal.postProcessing.metaInfoDescription'),
			cls: 'setting-item-description'
		});

		// Transcription preview section (only if we have transcription)
		if (!isPreTranscription) {
			this.createTranscriptionPreview(contentEl);
		}

		// Meta information input section
		this.createMetaInputSection(contentEl);

		// Options section
		this.createOptionsSection(contentEl);

		// Button section
		this.createButtonSection(contentEl);

		// Focus on meta info input
		this.metaInfoInput.inputEl.focus();
	}

	private createTranscriptionPreview(containerEl: HTMLElement): void {
		const section = containerEl.createEl('div', { cls: 'transcription-section' });

		section.createEl('h3', { text: t('modal.postProcessing.transcriptionPreview') });

		const previewContainer = section.createEl('div', { cls: 'transcription-preview-container' });
		this.transcriptEl = previewContainer.createEl('textarea', {
			cls: 'transcription-preview',
			attr: {
				readonly: 'true',
				rows: '8'
			}
		});
		this.transcriptEl.value = this.truncateText(this.transcription, 500);

		// Character count
		section.createEl('div', {
			cls: 'transcription-char-count',
			text: `${t('common.processing')}: ${this.transcription.length}`
		});
	}

	private createMetaInputSection(containerEl: HTMLElement): void {
		const section = containerEl.createEl('div', { cls: 'ait-meta-input-section' });

		// Single unified meta info input (no additional description needed)
		const metaContainer = section.createEl('div', { cls: 'ait-meta-input-container' });

		this.metaInfoInput = new TextAreaComponent(metaContainer);

		// Get template based on language setting
		const language = this.settings.language || 'ja';
		const template = POST_PROCESSING_CONFIG.metaInfoTemplate[language as keyof typeof POST_PROCESSING_CONFIG.metaInfoTemplate] || POST_PROCESSING_CONFIG.metaInfoTemplate.ja;

		this.metaInfoInput.setValue(template);
		this.metaInfoInput.setPlaceholder(t('modal.postProcessing.metaInfoPlaceholder'));
		this.metaInfoInput.inputEl.addClass('ait-meta-input-textarea');
		this.metaInfoInput.inputEl.rows = 10;
	}

	private createOptionsSection(_containerEl: HTMLElement): void {
		// Options section removed - post-processing is now controlled in the main modal
	}

	private createButtonSection(containerEl: HTMLElement): void {
		const buttonContainer = containerEl.createEl('div', { cls: 'transcription-buttons' });

		// Save button
		const isPreTranscription = !this.transcription || this.transcription.length === 0;
		new ButtonComponent(buttonContainer)
			.setButtonText(isPreTranscription ? t('common.save') : t('modal.postProcessing.processButton'))
			.setCta()
			.onClick(() => this.handleSave());

		// Cancel button
		new ButtonComponent(buttonContainer)
			.setButtonText(t('common.cancel'))
			.onClick(() => this.handleCancel());
	}

	private handleSave(): void {
		try {
			// Get the raw content from the unified input
			const rawContent = this.metaInfoInput.getValue().trim();

			// Validate that something was entered
			if (!rawContent) {
				new Notice(t('modal.postProcessing.emptyInputError'));
				return;
			}

			// Check if only template is present (user didn't add any actual info)
			const language = this.settings.language || 'ja';
			const template = POST_PROCESSING_CONFIG.metaInfoTemplate[language as keyof typeof POST_PROCESSING_CONFIG.metaInfoTemplate] || POST_PROCESSING_CONFIG.metaInfoTemplate.ja;
			if (rawContent === template) {
				new Notice(t('modal.postProcessing.templateOnlyError'));
				return;
			}

			// Create meta info object with raw content
			const metaInfo: TranscriptionMetaInfo = {
				rawContent: rawContent,
				language: this.settings.language || 'ja',
				enablePostProcessing: true // Always true when submitting from this modal
			};

			// Close modal and return meta info
			this.close();
			this.onSubmit(metaInfo);

		} catch (error) {
			const err = error instanceof Error ? error : new Error(this.formatUnknownError(error));
			ErrorHandler.handleAndDisplay(err, 'メタ情報の保存');
		}
	}

	private handleCancel(): void {
		// Close modal and cancel entire operation
		this.close();
		// Call onSubmit with undefined to indicate cancellation
		// This preserves the existing metaInfo state
		this.onSubmit(null);
	}


	private truncateText(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}
		return text.substring(0, maxLength) + '...\n\n[以下省略]';
	}

	private formatUnknownError(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
			}
			try {
				const serialized = JSON.stringify(error);
				return serialized;
			} catch {
				return 'Unknown error';
			}
		}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
