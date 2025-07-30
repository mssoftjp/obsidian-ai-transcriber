import { App } from 'obsidian';

/**
 * Utility functions for dynamic path resolution
 * Replaces hardcoded .obsidian paths with dynamic resolution
 */
export class PathUtils {
	/**
	 * Get the plugin directory path dynamically
	 * @param app Obsidian App instance
	 * @param pluginId Plugin ID (optional, defaults to this plugin's ID)
	 * @returns Plugin directory path
	 */
	static getPluginDir(app: App, pluginId?: string): string {
		const id = pluginId || PathUtils.getCurrentPluginId(); // Use manifest ID as default
		return `${app.vault.configDir}/plugins/${id}`;
	}

	/**
	 * Get a file path within the plugin directory
	 * @param app Obsidian App instance
	 * @param filename Filename relative to plugin directory
	 * @param pluginId Plugin ID (optional)
	 * @returns Full file path
	 */
	static getPluginFilePath(app: App, filename: string, pluginId?: string): string {
		return `${this.getPluginDir(app, pluginId)}/${filename}`;
	}

	/**
	 * Get the transcription history file path
	 * @param app Obsidian App instance
	 * @returns History file path
	 */
	static getHistoryFilePath(app: App): string {
		return this.getPluginFilePath(app, 'transcription-history.json');
	}

	/**
	 * Get the user dictionary file path
	 * @param app Obsidian App instance
	 * @returns Dictionary file path
	 */
	static getUserDictionaryPath(app: App): string {
		return this.getPluginFilePath(app, 'user-dictionary.json');
	}

	/**
	 * Get WASM file path with fallback locations
	 * @param app Obsidian App instance
	 * @param filename WASM filename
	 * @param pluginId Plugin ID (optional)
	 * @returns Array of possible WASM file paths in order of preference
	 */
	static getWasmFilePaths(app: App, filename: string, pluginId?: string): string[] {
		const pluginDir = this.getPluginDir(app, pluginId);
		return [
			`${pluginDir}/node_modules/@echogarden/fvad-wasm/${filename}`,
			`${pluginDir}/${filename}`
		];
	}

	/**
	 * Get the plugin ID from manifest (current plugin)
	 * @returns Plugin ID
	 */
	static getCurrentPluginId(): string {
		return 'ai-transcriber';
	}
}