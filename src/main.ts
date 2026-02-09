import {Editor, MarkdownView, Modal, Notice, Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS, CopilotConfig, CopilotSettingTab} from "./settings";
import {LLMService} from "./services/LLMService";
import {DocumentService} from "./services/DocumentService";
import {ConversationService} from "./services/ConversationService";
import {CopilotView, COPILOT_VIEW_TYPE} from "./views/CopilotView";
import {ToolExecutor} from "./mcp/ToolExecutor";
import {FunctionCallHandler} from "./ai/FunctionCallHandler";

export default class CopilotPlugin extends Plugin {
	settings: CopilotConfig;
	llmService: LLMService;
	documentService: DocumentService;
	conversationService: ConversationService;
	toolExecutor: ToolExecutor;
	functionCallHandler: FunctionCallHandler;

	async onload() {
		await this.loadSettings();

		// Initialize services
		this.llmService = new LLMService(this.settings);
		this.documentService = new DocumentService(this.app, this.llmService);
		this.conversationService = new ConversationService(this.app, this);
		this.toolExecutor = new ToolExecutor(this.app, this);
		this.functionCallHandler = new FunctionCallHandler(this, this.toolExecutor);

		// Initialize conversation service and tool executor
		await this.conversationService.initialize();
		await this.toolExecutor.initialize();

		// Register the copilot view
		this.registerView(
			COPILOT_VIEW_TYPE,
			(leaf) => new CopilotView(leaf, this)
		);

		// Create ribbon icon for opening the copilot panel
		this.addRibbonIcon('brain-circuit', 'AI Copilot', () => {
			void this.activateView();
		});

		// Add commands for AI operations
		this.addCommand({
			id: 'open-copilot-panel',
			name: 'Open AI Copilot Panel',
			callback: () => {
				void this.activateView();
			}
		});

		//Could be removed, we dont need this one.
		this.addCommand({
			id: 'analyze-document',
			name: 'Analyze Current Document',
			callback: async () => {
				try {
					const analysis = await this.documentService.analyzeActiveDocument();
					if (analysis) {
						new Notice(`Document analysis: ${analysis.wordCount} words, ${analysis.paragraphs} paragraphs`);
					}
				} catch (error: unknown) {
					new Notice(`Analysis failed: ${this.getErrorMessage(error)}`);
				}
			}
		});

		//this is also a p2 requirement.
		this.addCommand({
			id: 'improve-selection',
			name: 'Improve Selected Text',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				try {
					const improved = await this.documentService.improveText();
					this.documentService.replaceSelection(improved);
					new Notice('Text improved!');
				} catch (error: unknown) {
					new Notice(`Improvement failed: ${this.getErrorMessage(error)}`);
				}
			}
		});

		//Did not understand what it is, how it will help the users
		//Will pick this in the next iteration.
		this.addCommand({
			id: 'continue-writing',
			name: 'Continue Writing',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				try {
					const continuation = await this.documentService.continueText();
					this.documentService.insertAtCursor('\n' + continuation);
					new Notice('Text continued!');
				} catch (error: unknown) {
					new Notice(`Continuation failed: ${this.getErrorMessage(error)}`);
				}
			}
		});


		//This could be use full, but - need to understand how do we send the mcp and tool setting to the llm.
		this.addCommand({
			id: 'summarize-document',
			name: 'Summarize Document',
			callback: async () => {
				try {
					const summary = await this.documentService.summarizeDocument();
					// TODO: Display summary in copilot panel once implemented
					new Notice('Summary generated (check copilot panel)');
				} catch (error: unknown) {
					new Notice(`Summarization failed: ${this.getErrorMessage(error)}`);
				}
			}
		});

		this.addCommand({
			id: 'generate-tags',
			name: 'Generate Tags',
			callback: async () => {
				try {
					const tags = await this.documentService.generateTags();
					const tagString = tags.map(tag => `#${tag}`).join(' ');
					new Notice(`Suggested tags: ${tagString}`);
				} catch (error: unknown) {
					new Notice(`Tag generation failed: ${this.getErrorMessage(error)}`);
				}
			}
		});

		this.addCommand({
			id: 'test-llm-connection',
			name: 'Test LLM Connection',
			callback: async () => {
				try {
					new Notice('Testing connection...');
					const isConnected = await this.llmService.testConnection();
					new Notice(isConnected ? 'Connection successful!' : 'Connection failed!');
				} catch (error: unknown) {
					new Notice(`Connection test failed: ${this.getErrorMessage(error)}`);
				}
			}
		});

		this.addCommand({
			id: 'test-vault-tools',
			name: 'Test Vault Tools',
			callback: async () => {
				try {
					const success = await this.toolExecutor.testToolExecution();
					if (success) {
						new Notice('✅ Vault tools are working correctly!');
					}
				} catch (error: unknown) {
					new Notice(`Vault tools test failed: ${this.getErrorMessage(error)}`);
				}
			}
		});

		this.addCommand({
			id: 'show-vault-tools-help',
			name: 'Show Available Vault Tools',
			callback: () => {
				const help = this.toolExecutor.getToolsHelp();
				// Create a new note with the help content
				this.app.vault.create(`Vault Tools Help - ${new Date().toISOString().split('T')[0]}.md`, help)
					.then(() => {
						new Notice('Created help file with available vault tools');
					})
					.catch(() => {
						new Notice('Failed to create help file');
					});
			}
		});

		this.addCommand({
			id: 'show-tool-stats',
			name: 'Show Tool Usage Statistics',
			callback: () => {
				const stats = this.toolExecutor.getToolStats();
				const message = `Tool Statistics:
📊 Total Tools: ${stats.totalTools} (${stats.safeTools} safe, ${stats.sensitiveTools} sensitive)
🔧 Total Executions: ${stats.totalExecutions}
✅ Successful: ${stats.successfulExecutions}
❌ Failed: ${stats.failedExecutions}
🚫 Denied: ${stats.deniedExecutions}
📅 Recent (24h): ${stats.recentExecutions}`;

				new Notice(message);
			}
		});

		this.addCommand({
			id: 'test-function-calling',
			name: 'Test Function Calling',
			callback: async () => {
				try {
					await this.functionCallHandler.testFunctionCalling();
				} catch (error: unknown) {
					new Notice(`Function calling test failed: ${this.getErrorMessage(error)}`);
				}
			}
		});

		// Add settings tab
		this.addSettingTab(new CopilotSettingTab(this.app, this));
	}

	onunload() {
		// Clean up services
		if (this.llmService) {
			this.llmService.abort();
		}

		if (this.conversationService) {
			void this.conversationService.purgeStoredConversations();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CopilotConfig>);
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Update services with new settings
		if (this.llmService) {
			this.llmService.updateConfig(this.settings);
		}
	}

	private getErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}

		if (typeof error === 'string') {
			return error;
		}

		return 'Unknown error';
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(COPILOT_VIEW_TYPE);

		if (leaves.length > 0) {
			// A copilot view already exists, use it
			leaf = leaves[0] || null;
		} else {
			// Create new leaf in the right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: COPILOT_VIEW_TYPE,
					active: true,
				});
			}
		}

		// Reveal the leaf
		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}
}
