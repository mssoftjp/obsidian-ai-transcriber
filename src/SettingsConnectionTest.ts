import { Setting, Notice } from 'obsidian';
import { APITranscriber } from './ApiTranscriber';
import { APITranscriptionSettings } from './ApiSettings';
import { t } from './i18n';

export class SettingsConnectionTest {
	/**
	 * Create connection test section with API key management
	 */
	static displayConnectionTest(
		containerEl: HTMLElement, 
		transcriber: APITranscriber,
		settings: APITranscriptionSettings,
		saveSettings: () => Promise<void>,
		refreshDisplay: () => void
	): void {
		containerEl.createEl('h3', { text: t('settings.connection.title') });

		new Setting(containerEl)
			.setName(t('settings.connection.name'))
			.setDesc(t('settings.connection.desc'))
			.addButton(button => button
				.setButtonText(t('settings.connection.testButton'))
				.onClick(async () => {
					button.setButtonText(t('settings.connection.testing'));
					button.setDisabled(true);

					try {
						const isConnected = await transcriber.checkApiConnection();
						
						if (isConnected) {
							new Notice(t('settings.connection.successNotice', { provider: transcriber.getProviderDisplayName() }));
							button.setButtonText(t('settings.connection.successButton'));
							button.setCta();
						} else {
							new Notice(t('settings.connection.failureNotice', { provider: transcriber.getProviderDisplayName() }));
							button.setButtonText(t('settings.connection.failureButton'));
							button.removeCta();
						}
					} catch (error) {
						new Notice(t('settings.connection.errorNotice', { error: (error as Error).message }));
						button.setButtonText(t('settings.connection.errorButton'));
						button.removeCta();
					} finally {
						setTimeout(() => {
							button.setButtonText(t('settings.connection.testButton'));
							button.setDisabled(false);
							button.removeCta();
						}, 3000);
					}
				}));

		// Clear API keys button
		new Setting(containerEl)
			.setName(t('settings.connection.clearTitle'))
			.setDesc(t('settings.connection.clearDesc'))
			.addButton(button => button
				.setButtonText(t('settings.connection.clearButton'))
				.setWarning()
				.onClick(async () => {
					settings.openaiApiKey = '';
					await saveSettings();
					new Notice(t('settings.connection.clearedNotice'));
					refreshDisplay(); // Refresh display
				}));
	}
}
