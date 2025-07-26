import { Setting, Notice } from 'obsidian';
import { APITranscriber } from './ApiTranscriber';
import { APITranscriptionSettings } from './ApiSettings';

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
		containerEl.createEl('h3', { text: 'Connection Test' });

		const testSetting = new Setting(containerEl)
			.setName('Test API Connection')
			.setDesc('Verify your API key and connection')
			.addButton(button => button
				.setButtonText('Test Connection')
				.onClick(async () => {
					button.setButtonText('Testing...');
					button.setDisabled(true);

					try {
						const isConnected = await transcriber.checkApiConnection();
						
						if (isConnected) {
							new Notice(`✅ ${transcriber.getProviderDisplayName()} connection successful!`);
							button.setButtonText('✅ Connected');
							button.setCta();
						} else {
							new Notice(`❌ ${transcriber.getProviderDisplayName()} connection failed. Check your API key.`);
							button.setButtonText('❌ Failed');
							button.removeCta();
						}
					} catch (error) {
						new Notice(`❌ Connection test failed: ${error.message}`);
						button.setButtonText('❌ Error');
						button.removeCta();
					} finally {
						setTimeout(() => {
							button.setButtonText('Test Connection');
							button.setDisabled(false);
							button.removeCta();
						}, 3000);
					}
				}));

		// Clear API keys button
		new Setting(containerEl)
			.setName('Clear API Keys')
			.setDesc('Remove all stored API keys (useful for troubleshooting)')
			.addButton(button => button
				.setButtonText('Clear All Keys')
				.setWarning()
				.onClick(async () => {
					settings.openaiApiKey = '';
					await saveSettings();
					new Notice('API key cleared');
					refreshDisplay(); // Refresh display
				}));
	}
}