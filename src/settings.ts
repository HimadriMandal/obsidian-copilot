import {App, PluginSettingTab, Setting} from "obsidian";
import MyPlugin from "./main";

export interface CopilotConfig {
	// API Configuration
	apiKey: string;
	apiEndpoint: string;
	model: string;
	temperature: number;
	maxTokens: number;

	// UI Preferences
	sidebarPosition: 'left' | 'right';
	theme: 'light' | 'dark' | 'auto';
	autoSave: boolean;

	// Feature Flags
	enableStreaming: boolean;
	enableKnowledgeBase: boolean;
	enableAdvancedTools: boolean;
	enableVaultTools: boolean;
	includeActiveNoteContext: boolean;

	// Conversation Settings
	conversationHistory: boolean;
	maxHistoryLength: number;
}

export const DEFAULT_SETTINGS: CopilotConfig = {
	apiKey: '',
	apiEndpoint: 'https://api.openai.com/v1',
	model: 'gpt-3.5-turbo',
	temperature: 0.7,
	maxTokens: 2048,
	sidebarPosition: 'right',
	theme: 'auto',
	autoSave: true,
	enableStreaming: true,
	enableKnowledgeBase: true,
	enableAdvancedTools: true,
	enableVaultTools: true,
	includeActiveNoteContext: true,
	conversationHistory: true,
	maxHistoryLength: 100
}

export class CopilotSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// API Configuration Section
		new Setting(containerEl)
			.setName('API configuration')
			.setHeading();

		new Setting(containerEl)
			.setName('API endpoint')
			.setDesc('Enter the API endpoint of the large language model service.')
			.addText(text => text
				.setPlaceholder('Enter endpoint URL')
				.setValue(this.plugin.settings.apiEndpoint)
				.onChange(async (value: string) => {
					this.plugin.settings.apiEndpoint = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Enter your API key for authentication.')
			.addText(text => text
				.setPlaceholder('Paste API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value: string) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Model')
			.setDesc('Select the AI model to use.')
			.addText(text => text
				.setPlaceholder('Example: gpt-3.5-turbo')
				.setValue(this.plugin.settings.model)
				.onChange(async (value: string) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Controls randomness in responses (0-2, higher = more creative).')
			.addSlider(slider => slider
				.setLimits(0, 2, 0.1)
				.setValue(this.plugin.settings.temperature)
				.setDynamicTooltip()
				.onChange(async (value: number) => {
					this.plugin.settings.temperature = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max tokens')
			.setDesc('Maximum number of tokens in the response.')
			.addSlider(slider => slider
				.setLimits(256, 4096, 256)
				.setValue(this.plugin.settings.maxTokens)
				.setDynamicTooltip()
				.onChange(async (value: number) => {
					this.plugin.settings.maxTokens = value;
					await this.plugin.saveSettings();
				}));

		// UI Preferences Section
		new Setting(containerEl)
			.setName('UI preferences')
			.setHeading();

		new Setting(containerEl)
			.setName('Sidebar position')
			.setDesc('Choose which side to display the copilot panel.')
			.addDropdown(dropdown => dropdown
				.addOption('right', 'Right sidebar')
				.addOption('left', 'Left sidebar')
				.setValue(this.plugin.settings.sidebarPosition)
				.onChange(async (value: 'left' | 'right') => {
					this.plugin.settings.sidebarPosition = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Theme')
			.setDesc('Choose the theme for the copilot interface.')
			.addDropdown(dropdown => dropdown
				.addOption('auto', 'Auto (follow Obsidian)')
				.addOption('light', 'Light')
				.addOption('dark', 'Dark')
				.setValue(this.plugin.settings.theme)
				.onChange(async (value: 'light' | 'dark' | 'auto') => {
					this.plugin.settings.theme = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto save')
			.setDesc('Automatically save conversations and settings.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSave)
				.onChange(async (value: boolean) => {
					this.plugin.settings.autoSave = value;
					await this.plugin.saveSettings();
				}));

		// Features Section
		new Setting(containerEl)
			.setName('Features')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable streaming')
			.setDesc('Enable real-time streaming of AI responses.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableStreaming)
				.onChange(async (value: boolean) => {
					this.plugin.settings.enableStreaming = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable knowledge base')
			.setDesc('Enable AI-powered knowledge base analysis and organization.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableKnowledgeBase)
				.onChange(async (value: boolean) => {
					this.plugin.settings.enableKnowledgeBase = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable advanced tools')
			.setDesc('Enable advanced AI editing and analysis tools.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAdvancedTools)
				.onChange(async (value: boolean) => {
					this.plugin.settings.enableAdvancedTools = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable vault tools')
			.setDesc('Allow AI to read and modify files in your vault (with approval for sensitive operations).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableVaultTools)
				.onChange(async (value: boolean) => {
					this.plugin.settings.enableVaultTools = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include active note context')
			.setDesc('Include selection or note content when sending chat messages.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeActiveNoteContext)
				.onChange(async (value: boolean) => {
					this.plugin.settings.includeActiveNoteContext = value;
					await this.plugin.saveSettings();
				}));

		// Conversation Settings Section
		new Setting(containerEl)
			.setName('Conversation')
			.setHeading();

		new Setting(containerEl)
			.setName('Conversation history')
			.setDesc('Keep conversation history between sessions.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.conversationHistory)
				.onChange(async (value: boolean) => {
					this.plugin.settings.conversationHistory = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max history length')
			.setDesc('Maximum number of messages to keep in history.')
			.addSlider(slider => slider
				.setLimits(10, 500, 10)
				.setValue(this.plugin.settings.maxHistoryLength)
				.setDynamicTooltip()
				.onChange(async (value: number) => {
					this.plugin.settings.maxHistoryLength = value;
					await this.plugin.saveSettings();
				}));

		// Connection Test Section
		new Setting(containerEl)
			.setName('Connection test')
			.setHeading();

		new Setting(containerEl)
	  .setName("Test connection")
	  .setDesc("Test the connection to large language model API with current settings.")
      .addButton((button) =>
        button
          .setButtonText("Test connection")
          .setCta()
          .onClick(() => {
            button.setButtonText("Testing...");
            button.setDisabled(true);
            // TODO: Implement connection testing in Phase 1.2
            setTimeout(() => {
              button.setButtonText("Test connection");
              button.setDisabled(false);
            }, 2000);
          }),
      );
	}
}
