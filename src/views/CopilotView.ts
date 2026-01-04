import { ItemView, WorkspaceLeaf } from 'obsidian';
import CopilotPlugin from '../main';
import { ChatMessage, StreamChunk, ToolCall } from '../services/LLMService';
import { MessageRenderer } from '../ui/MessageRenderer';

export const COPILOT_VIEW_TYPE = 'copilot-view';

export class CopilotView extends ItemView {
    plugin: CopilotPlugin;
    private viewContainerEl: HTMLElement;
    private activeTab: 'chat' | 'tools' | 'knowledge' = 'chat';
    private messageRenderer: MessageRenderer;

    constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.messageRenderer = new MessageRenderer(this.app);
    }

    getViewType(): string {
        return COPILOT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'AI Copilot';
    }

    getIcon(): string {
        return 'brain-circuit';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        if (!container) return;

        container.empty();
        container.addClass('copilot-view');

        // Create the main container
        this.viewContainerEl = container.createDiv('copilot-container');

        // Create header with tabs
        this.createHeader();

        // Create content area
        this.createContentArea();

        // Initialize with chat tab
        this.switchToTab('chat');

        // Load existing conversation messages
        void this.loadConversationHistory();
    }

    private async loadConversationHistory(): Promise<void> {
        const conversation = this.plugin.conversationService.getCurrentConversation();
        if (!conversation || conversation.messages.length === 0) {
            return;
        }

        // Clear existing messages (except welcome message)
        const chatHistory = this.viewContainerEl.querySelector('#copilot-chat-history');
        if (chatHistory) {
            // Keep only system messages (welcome message)
            const systemMessages = chatHistory.querySelectorAll('.system-message');
            chatHistory.empty();

            // Restore system messages
            systemMessages.forEach(msg => chatHistory.appendChild(msg));

            // Add conversation messages with rich rendering
            for (const message of conversation.messages) {
                if (message.role === 'system') {
                    continue;
                }

                await this.addMessageToChat(message.role, message.content);
            }
        }
    }

    async onClose(): Promise<void> {
        // Cleanup MessageRenderer
        this.messageRenderer.unload();
    }

    private createHeader(): void {
        const header = this.viewContainerEl.createDiv('copilot-header');

        // Title
        const title = header.createDiv('copilot-title');
        title.createEl('h3', { text: 'AI Copilot' });

        // Status indicator
        const status = header.createDiv('copilot-status');
        const statusDot = status.createSpan('status-dot');
        const statusText = status.createSpan('status-text');

        // Check connection status
        this.updateConnectionStatus(statusDot, statusText).catch((error) => {
            console.error('Failed to update connection status:', error);
        });

        // Tab navigation
        const tabNav = header.createDiv('copilot-tabs');

        const chatTab = tabNav.createDiv('tab-button');
        chatTab.setText('Chat');
        chatTab.addEventListener('click', () => this.switchToTab('chat'));

        const toolsTab = tabNav.createDiv('tab-button');
        toolsTab.setText('Tools');
        toolsTab.addEventListener('click', () => this.switchToTab('tools'));

        if (this.plugin.settings.enableKnowledgeBase) {
            const knowledgeTab = tabNav.createDiv('tab-button');
            knowledgeTab.setText('Knowledge');
            knowledgeTab.addEventListener('click', () => this.switchToTab('knowledge'));
        }
    }

    private createContentArea(): void {
        const contentArea = this.viewContainerEl.createDiv('copilot-content');

        // Chat content
        const chatContent = contentArea.createDiv('content-panel chat-panel active');
        this.createChatInterface(chatContent);

        // Tools content
        const toolsContent = contentArea.createDiv('content-panel tools-panel hidden');
        this.createToolsInterface(toolsContent);

        // Knowledge content (if enabled)
        if (this.plugin.settings.enableKnowledgeBase) {
            const knowledgeContent = contentArea.createDiv('content-panel knowledge-panel hidden');
            this.createKnowledgeInterface(knowledgeContent);
        }
    }

    private createChatInterface(container: HTMLElement): void {
        container.addClass('chat-layout');

        // Chat history area
        const chatHistory = container.createDiv('chat-history');
        chatHistory.id = 'copilot-chat-history';
        chatHistory.addClass('chat-history-scrollable');

        // Welcome message
        const welcomeMsg = chatHistory.createDiv('message system-message');
        welcomeMsg.innerHTML = `
            <div class="message-content">
                <p>👋 Welcome to AI Copilot!</p>
                <p>I can help you with:</p>
                <ul>
                    <li>Writing and editing text</li>
                    <li>Analyzing your documents</li>
                    <li>Generating summaries and tags</li>
                    <li>Organizing your knowledge base</li>
                </ul>
                <p>Start by typing a message below or use the Tools tab for quick actions.</p>
            </div>
        `;

        // Input area
        const inputArea = container.createDiv('chat-input-area');
        inputArea.addClass('no-shrink');

        const inputContainer = inputArea.createDiv('input-container');
        const textarea = inputContainer.createEl('textarea', {
            attr: {
                placeholder: 'Type your message here...',
                rows: '3'
            }
        });
        textarea.addClass('chat-input');

        const buttonContainer = inputArea.createDiv('button-container');

        const sendButton = buttonContainer.createEl('button', { text: 'Send' });
        sendButton.addClass('mod-cta');
        sendButton.addEventListener('click', () => {
            void this.sendMessage(textarea);
        });

        const clearButton = buttonContainer.createEl('button', { text: 'Clear' });
        clearButton.addEventListener('click', () => this.clearChat());

        // Handle Enter key (Shift+Enter for new line, Enter to send)
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void this.sendMessage(textarea);
            }
        });
    }

    private createToolsInterface(container: HTMLElement): void {
        const toolsTitle = container.createEl('h4', { text: 'Quick Actions' });

        // Document analysis section
        const docSection = container.createDiv('tool-section');
        docSection.createEl('h5', { text: 'Document Analysis' });

        const analyzeBtn = docSection.createEl('button', { text: 'Analyze Current Document' });
        analyzeBtn.addClass('tool-button');
        analyzeBtn.addEventListener('click', () => {
            void (async () => {
                try {
                    const analysis = await this.plugin.documentService.analyzeActiveDocument();
                    if (analysis) {
                        await this.displayAnalysisResults(analysis);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    this.showError(`Analysis failed: ${errorMessage}`);
                }
            })();
        });

        const summarizeBtn = docSection.createEl('button', { text: 'Summarize Document' });
        summarizeBtn.addClass('tool-button');
        summarizeBtn.addEventListener('click', () => {
            void (async () => {
                try {
                    const summary = await this.plugin.documentService.summarizeDocument();
                    await this.displayResult('Document Summary', summary);
                } catch (error: any) {
                    this.showError(`Summarization failed: ${error.message}`);
                }
            })();
        });

        // Text editing section
        const editSection = container.createDiv('tool-section');
        editSection.createEl('h5', { text: 'Text Editing' });

        const improveBtn = editSection.createEl('button', { text: 'Improve Selected Text' });
        improveBtn.addClass('tool-button');
        improveBtn.addEventListener('click', () => {
            void (async () => {
                try {
                    const improved = await this.plugin.documentService.improveText();
                    this.plugin.documentService.replaceSelection(improved);
                    this.showSuccess('Text improved successfully!');
                } catch (error: any) {
                    this.showError(`Improvement failed: ${error.message}`);
                }
            })();
        });

        const continueBtn = editSection.createEl('button', { text: 'Continue Writing' });
        continueBtn.addClass('tool-button');
        continueBtn.addEventListener('click', () => {
            void (async () => {
                try {
                    const continuation = await this.plugin.documentService.continueText();
                    this.plugin.documentService.insertAtCursor('\\n' + continuation);
                    this.showSuccess('Text continued successfully!');
                } catch (error: any) {
                    this.showError(`Continuation failed: ${error.message}`);
                }
            })();
        });

        // Tags and organization section
        const orgSection = container.createDiv('tool-section');
        orgSection.createEl('h5', { text: 'Organization' });

        const tagsBtn = orgSection.createEl('button', { text: 'Generate Tags' });
        tagsBtn.addClass('tool-button');
        tagsBtn.addEventListener('click', () => {
            void (async () => {
                try {
                    const tags = await this.plugin.documentService.generateTags();
                    const tagString = tags.map(tag => `#${tag}`).join(' ');
                    await this.displayResult('Suggested Tags', tagString);
                } catch (error: any) {
                    this.showError(`Tag generation failed: ${error.message}`);
                }
            })();
        });

        // Results area
        const resultsArea = container.createDiv('tool-results');
        resultsArea.id = 'copilot-tool-results';
    }

    private createKnowledgeInterface(container: HTMLElement): void {
        const knowledgeTitle = container.createEl('h4', { text: 'Knowledge Base' });

        const placeholder = container.createDiv('knowledge-placeholder');
        placeholder.innerHTML = `
            <p>📚 Knowledge Base features will be implemented in Phase 4.</p>
            <p>Coming soon:</p>
            <ul>
                <li>Vault content analysis</li>
                <li>Note relationship mapping</li>
                <li>Content discovery</li>
                <li>AI-powered organization</li>
            </ul>
        `;
    }

    private switchToTab(tab: 'chat' | 'tools' | 'knowledge'): void {
        this.activeTab = tab;

        // Update tab buttons
        const tabs = this.viewContainerEl.querySelectorAll('.tab-button');
        tabs.forEach((tabEl, index) => {
            tabEl.classList.remove('active');
            if ((tab === 'chat' && index === 0) ||
                (tab === 'tools' && index === 1) ||
                (tab === 'knowledge' && index === 2)) {
                tabEl.classList.add('active');
            }
        });

        // Update content panels
        const panels = this.viewContainerEl.querySelectorAll('.content-panel');
        panels.forEach(panel => {
            (panel as HTMLElement).classList.remove('active');
            (panel as HTMLElement).classList.add('hidden');
        });

        const activePanel = this.viewContainerEl.querySelector(`.${tab}-panel`);
        if (activePanel) {
            activePanel.classList.remove('hidden');
            activePanel.classList.add('active');
        }
    }

    private async sendMessage(textarea: HTMLTextAreaElement): Promise<void> {
        const message = textarea.value.trim();
        if (!message) return;

        // Clear input
        textarea.value = '';

        try {
            // Add user message to conversation and display
            const userMessage = await this.plugin.conversationService.addMessage('user', message);
            void this.addMessageToChat('user', message);

            // Add loading indicator
            const loadingId = this.addLoadingMessage();

            try {
                // Get conversation context for LLM
                let contextMessages: ChatMessage[] = this.plugin.conversationService.getMessagesForContext();

                // Add the current user message to context if not already included
                const lastContextMessage = contextMessages[contextMessages.length - 1];
                if (contextMessages.length === 0 || (lastContextMessage && lastContextMessage.content !== message)) {
                    contextMessages.push({ role: 'user', content: message });
                }

                const vaultToolsEnabled = this.plugin.functionCallHandler.isToolsEnabled();
                const availableTools = vaultToolsEnabled ? this.plugin.functionCallHandler.getAvailableToolsForLLM() : [];
                const shouldUseVaultTools = vaultToolsEnabled && availableTools.length > 0;

                if (shouldUseVaultTools) {
                    await this.handleMessageWithVaultTools(contextMessages, availableTools, loadingId);
                    return;
                }

                // Check if streaming is enabled
                if (this.plugin.settings.enableStreaming) {
                    // Stream the response
                    let assistantResponse = '';
                    let assistantMessageAdded = false;

                    await this.plugin.llmService.streamChat(contextMessages, (chunk: StreamChunk) => {
                        if (chunk.content) {
                            assistantResponse += chunk.content;

                            if (!assistantMessageAdded) {
                                // Remove loading and add initial assistant message
                                this.removeLoadingMessage(loadingId);
                                void this.addMessageToChat('assistant', assistantResponse);
                                assistantMessageAdded = true;
                            } else {
                                // Update the assistant message with accumulated content
                                void this.updateLastAssistantMessage(assistantResponse);
                            }
                        }

                        if (chunk.isComplete && assistantResponse.trim()) {
                            // Save the final assistant message to conversation
                            void this.plugin.conversationService.addMessage('assistant', assistantResponse);
                        }
                    });
                } else {
                    // Non-streaming response
                    const response = await this.plugin.llmService.chat(contextMessages);

                    // Remove loading and add assistant response
                    this.removeLoadingMessage(loadingId);
                    void this.addMessageToChat('assistant', response.content);

                    // Save assistant message to conversation
                    await this.plugin.conversationService.addMessage('assistant', response.content);
                }

            } catch (error: any) {
                this.removeLoadingMessage(loadingId);
                const errorMessage = `I apologize, but I encountered an error: ${error.message}`;
                void this.addMessageToChat('assistant', errorMessage);

                // Save error message to conversation for context
                await this.plugin.conversationService.addMessage('assistant', errorMessage);
            }

        } catch (error: any) {
            console.error('Chat error:', error);
            void this.addMessageToChat('assistant', `I apologize, but I encountered an unexpected error. Please try again.`);
        }
    }

    private async handleMessageWithVaultTools(
        initialContext: ChatMessage[],
        tools: any[],
        loadingId: string
    ): Promise<void> {
        let contextMessages = initialContext;
        let response = await this.plugin.llmService.chatWithTools(contextMessages, tools);
        let iterations = 0;
        const maxIterations = 5;
        let loadingCleared = false;

        const clearLoading = () => {
            if (!loadingCleared) {
                this.removeLoadingMessage(loadingId);
                loadingCleared = true;
            }
        };

        while (response && this.plugin.functionCallHandler.hasToolCalls(response) && iterations < maxIterations) {
            clearLoading();

            const toolCalls = response.tool_calls || [];
            const summary = this.formatToolCallSummary(toolCalls);

            await this.plugin.conversationService.addMessage('assistant', summary, {
                toolCalls
            });
            await this.addMessageToChat('assistant', summary);

            const executionResults = await this.plugin.functionCallHandler.processFunctionCalls(toolCalls);
            const formattedToolMessages = this.plugin.functionCallHandler.formatResultsForLLM(toolCalls, executionResults.results);

            for (const toolMessage of formattedToolMessages) {
                await this.plugin.conversationService.addMessage('tool', String(toolMessage.content), {
                    toolCallId: String(toolMessage.tool_call_id),
                    toolName: String(toolMessage.name)
                });
                await this.addMessageToChat('tool', String(toolMessage.content));
            }

            contextMessages = this.plugin.conversationService.getMessagesForContext();
            response = await this.plugin.llmService.chatWithTools(contextMessages, tools);
            iterations++;
        }

        clearLoading();

        if (!response) {
            const fallback = 'I was unable to generate a response.';
            await this.plugin.conversationService.addMessage('assistant', fallback);
            await this.addMessageToChat('assistant', fallback);
            return;
        }

        if (response.tool_calls && response.tool_calls.length > 0) {
            const warning = 'I reached the maximum number of tool attempts. Please refine your request and try again.';
            await this.plugin.conversationService.addMessage('assistant', warning, {
                toolCalls: response.tool_calls
            });
            await this.addMessageToChat('assistant', warning);
            return;
        }

        const finalContent = response.content?.trim() || 'Done.';
        await this.plugin.conversationService.addMessage('assistant', finalContent);
        await this.addMessageToChat('assistant', finalContent);
    }

    private formatToolCallSummary(toolCalls: ToolCall[]): string {
        if (!toolCalls || toolCalls.length === 0) {
            return '🔧 Executing vault tools...';
        }

        const toolNames = toolCalls.map(call => call.function?.name || 'unknown').join(', ');
        return `🔧 Executing vault tools: ${toolNames}`;
    }

    private async addMessageToChat(role: 'user' | 'assistant' | 'system' | 'tool', content: string): Promise<void> {
        const chatHistory = this.viewContainerEl.querySelector('#copilot-chat-history');
        if (!chatHistory) return;

        // Create message container
        const messageEl = chatHistory.createDiv();

        // Render message with rich formatting
        await this.messageRenderer.renderMessage(
            messageEl,
            role,
            content,
            Date.now(),
            {
                showTimestamp: true,
                showActions: true,
                enableCodeCopy: true,
                enableRegenerate: role === 'assistant'
            }
        );

        // Scroll to bottom with smooth behavior
        chatHistory.scrollTo({
            top: chatHistory.scrollHeight,
            behavior: 'smooth'
        });
    }

    private async updateLastAssistantMessage(content: string): Promise<void> {
        const chatHistory = this.viewContainerEl.querySelector('#copilot-chat-history');
        if (!chatHistory) return;

        // Find the last assistant message
        const messages = chatHistory.querySelectorAll('.assistant-message');
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1] as HTMLElement;

            // Update the message content using MessageRenderer
            await this.messageRenderer.updateMessageContent(lastMessage, content, {
                showTimestamp: true,
                showActions: true,
                enableCodeCopy: true,
                enableRegenerate: true
            });

            // Scroll to bottom to follow the streaming text with smooth behavior
            chatHistory.scrollTo({
                top: chatHistory.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    private addLoadingMessage(): string {
        const chatHistory = this.viewContainerEl.querySelector('#copilot-chat-history');
        if (!chatHistory) return '';

        const loadingId = `loading-${Date.now()}`;
        const messageEl = chatHistory.createDiv('message assistant-message loading');
        messageEl.id = loadingId;

        const messageContent = messageEl.createDiv('message-content');
        messageContent.innerHTML = '<div class="loading-dots">●●●</div>';

        chatHistory.scrollTo({
            top: chatHistory.scrollHeight,
            behavior: 'smooth'
        });
        return loadingId;
    }

    private removeLoadingMessage(loadingId: string): void {
        const loadingEl = this.viewContainerEl.querySelector(`#${loadingId}`);
        if (loadingEl) {
            loadingEl.remove();
        }
    }

    private clearChat(): void {
        const chatHistory = this.viewContainerEl.querySelector('#copilot-chat-history');
        if (chatHistory) {
            chatHistory.empty();
        }
    }

    private async updateConnectionStatus(statusDot: HTMLElement, statusText: HTMLElement): Promise<void> {
        try {
            const isConnected = await this.plugin.llmService.testConnection();
            if (isConnected) {
                statusDot.addClass('connected');
                statusText.setText('Connected');
            } else {
                statusDot.addClass('disconnected');
                statusText.setText('Disconnected');
            }
        } catch (error) {
            statusDot.addClass('error');
            statusText.setText('Error');
        }
    }

    private async displayAnalysisResults(analysis: any): Promise<void> {
        const content = `
            **Document Analysis Results:**

            - **Words:** ${analysis.wordCount}
            - **Characters:** ${analysis.characterCount}
            - **Paragraphs:** ${analysis.paragraphs}
            - **Headings:** ${analysis.headings}
            - **Links:** ${analysis.links.length}
            - **Tags:** ${analysis.tags.join(', ') || 'None'}

            ${analysis.summary ? `**Summary:** ${analysis.summary}` : ''}
        `;

        await this.displayResult('Document Analysis', content);
    }

    private async displayResult(title: string, content: string): Promise<void> {
        const resultsArea = this.viewContainerEl.querySelector('#copilot-tool-results');
        if (!resultsArea) return;

        resultsArea.empty();

        const resultEl = resultsArea.createDiv('tool-result');
        resultEl.createEl('h6', { text: title });

        const contentEl = resultEl.createDiv('result-content');

        // Use MessageRenderer for consistent markdown rendering
        await this.messageRenderer.renderMarkdownContent(contentEl, content, {
            enableCodeCopy: true,
            showActions: false
        });
    }

    private showSuccess(message: string): void {
        this.showMessage(message, 'success');
    }

    private showError(message: string): void {
        this.showMessage(message, 'error');
    }

    private showMessage(message: string, type: 'success' | 'error'): void {
        const resultsArea = this.viewContainerEl.querySelector('#copilot-tool-results');
        if (!resultsArea) return;

        resultsArea.empty();

        const messageEl = resultsArea.createDiv(`tool-message ${type}`);
        messageEl.setText(message);
    }
}
