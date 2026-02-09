import { Component, MarkdownRenderer, App } from 'obsidian';

export interface MessageAction {
    id: string;
    label: string;
    icon: string;
    action: (content: string) => void | Promise<void>;
}

export interface MessageRenderOptions {
    showTimestamp?: boolean;
    showActions?: boolean;
    enableCodeCopy?: boolean;
    enableRegenerate?: boolean;
    maxHeight?: number;
}

export class MessageRenderer extends Component {
    private app: App;
    private defaultActions: MessageAction[] = [];

    constructor(app: App) {
        super();
        this.app = app;
        this.setupDefaultActions();
    }

    /**
     * Render a message with rich markdown support
     */
    async renderMessage(
        container: HTMLElement,
        role: 'user' | 'assistant' | 'system' | 'tool',
        content: string,
        timestamp?: number,
        options: MessageRenderOptions = {}
    ): Promise<void> {
        // Clear existing content
        container.empty();

        // Apply role-specific classes
        container.className = `message ${role}-message`;

        // Create message wrapper
        const messageWrapper = container.createDiv('message-wrapper');

        // Add timestamp if requested
        if (options.showTimestamp && timestamp) {
            const timestampEl = messageWrapper.createDiv('message-timestamp');
            timestampEl.textContent = this.formatTimestamp(timestamp);
        }

        // Create content container
        const contentContainer = messageWrapper.createDiv('message-content');

        // Apply max height if specified
        if (options.maxHeight) {
            contentContainer.style.maxHeight = `${options.maxHeight}px`;
            contentContainer.addClass('scrollable-content');
        }

        // Render content based on role
        if (role === 'system') {
            await this.renderSystemMessage(contentContainer, content);
        } else {
            await this.renderMarkdownContent(contentContainer, content, options);
        }

        // Add message actions if requested
        if (options.showActions) {
            this.addMessageActions(messageWrapper, content, role, options);
        }
    }

    /**
     * Render system message (simple HTML)
     */
    private async renderSystemMessage(container: HTMLElement, content: string): Promise<void> {
        container.innerHTML = this.parseSimpleMarkdown(content);
    }

    /**
     * Render markdown content with Obsidian's markdown renderer
     */
    public async renderMarkdownContent(
        container: HTMLElement,
        content: string,
        options: MessageRenderOptions
    ): Promise<void> {
        try {
            // Use Obsidian's markdown renderer for rich formatting
            await MarkdownRenderer.render(
                this.app,
                content,
                container,
                '', // sourcePath - empty for chat messages
                this // component for cleanup
            );

            // Post-process rendered content
            this.postProcessRenderedContent(container, options);

        } catch (error) {
            console.warn('Failed to render markdown, falling back to simple rendering:', error);
            // Fallback to simple markdown parsing
            container.innerHTML = this.parseSimpleMarkdown(content);
            this.postProcessRenderedContent(container, options);
        }
    }

    /**
     * Post-process rendered content for chat-specific enhancements
     */
    private postProcessRenderedContent(container: HTMLElement, options: MessageRenderOptions): void {
        // Add copy buttons to code blocks
        if (options.enableCodeCopy) {
            this.addCodeCopyButtons(container);
        }

        // Fix relative links and internal links for chat context
        this.processLinks(container);

        // Style tables for better chat display
        this.styleTables(container);

        // Handle math rendering if present
        this.processMath(container);

        // Add syntax highlighting classes
        this.enhanceSyntaxHighlighting(container);
    }

    /**
     * Add copy buttons to code blocks
     */
    private addCodeCopyButtons(container: HTMLElement): void {
        const codeBlocks = container.querySelectorAll('pre code');

        codeBlocks.forEach((codeBlock, index) => {
            const pre = codeBlock.parentElement;
            if (!pre) return;

            // Create copy button
            const copyButton = pre.createEl('button', {
                cls: 'code-copy-button',
                attr: { 'aria-label': 'Copy code' }
            });

            copyButton.innerHTML = '📋';
            copyButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const code = codeBlock.textContent || '';
                navigator.clipboard.writeText(code)
                    .then(() => {
                        copyButton.innerHTML = '✅';
                        setTimeout(() => {
                            copyButton.innerHTML = '📋';
                        }, 2000);
                    })
                    .catch((error) => {
                        console.warn('Failed to copy code:', error);
                        copyButton.innerHTML = '❌';
                        setTimeout(() => {
                            copyButton.innerHTML = '📋';
                        }, 2000);
                    });
            });
        });
    }

    /**
     * Process links for chat context
     */
    private processLinks(container: HTMLElement): void {
        const links = container.querySelectorAll('a');

        links.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;

            // Handle internal Obsidian links
            if (href.startsWith('obsidian://') || href.match(/\[\[.*\]\]/)) {
                link.addClass('internal-link');
                return;
            }

            // Handle external links
            if (href.startsWith('http://') || href.startsWith('https://')) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
                link.addClass('external-link');

                // Add external link indicator
                if (!link.querySelector('.external-link-icon')) {
                    const icon = link.createSpan('external-link-icon');
                    icon.innerHTML = ' 🔗';
                }
            }
        });
    }

    /**
     * Style tables for better chat display
     */
    private styleTables(container: HTMLElement): void {
        const tables = container.querySelectorAll('table');

        tables.forEach(table => {
            table.addClass('chat-table');

            // Wrap table in scrollable container if it's wide
            if (!table.parentElement?.hasClass('table-wrapper')) {
                const wrapper = table.parentElement!.createDiv('table-wrapper');
                table.parentElement?.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
    }

    /**
     * Process math expressions
     */
    private processMath(container: HTMLElement): void {
        // Add math processing classes for proper styling
        const mathElements = container.querySelectorAll('.math, .math-block, .math-inline');
        mathElements.forEach(el => {
            el.addClass('chat-math');
        });
    }

    /**
     * Enhance syntax highlighting
     */
    private enhanceSyntaxHighlighting(container: HTMLElement): void {
        const codeBlocks = container.querySelectorAll('pre code');

        codeBlocks.forEach(codeBlock => {
            const pre = codeBlock.parentElement;
            if (!pre) return;

            // Get language from class
            const classes = Array.from(codeBlock.classList);
            const langClass = classes.find(cls => cls.startsWith('language-'));

            if (langClass) {
                const language = langClass.replace('language-', '');

                // Add language label
                if (!pre.querySelector('.code-language-label')) {
                    const label = pre.createEl('div', {
                        cls: 'code-language-label',
                        text: language.toUpperCase()
                    });
                    pre.insertBefore(label, codeBlock);
                }
            }

            // Add line numbers for long code blocks
            const lines = (codeBlock.textContent || '').split('\n');
            if (lines.length > 5) {
                pre.addClass('code-with-lines');
            }
        });
    }

    /**
     * Add message actions (copy, regenerate, etc.)
     */
    private addMessageActions(
        container: HTMLElement,
        content: string,
        role: 'user' | 'assistant' | 'system' | 'tool',
        options: MessageRenderOptions
    ): void {
        const actionsContainer = container.createDiv('message-actions');

        // Always add copy action
        this.addActionButton(actionsContainer, {
            id: 'copy',
            label: 'Copy',
            icon: '📋',
            action: async () => {
                try {
                    await navigator.clipboard.writeText(content);
                    // TODO: Show success feedback
                } catch (error) {
                    console.warn('Failed to copy message:', error);
                }
            }
        });

        // Add regenerate action for assistant messages
        if (role === 'assistant' && options.enableRegenerate) {
            this.addActionButton(actionsContainer, {
                id: 'regenerate',
                label: 'Regenerate',
                icon: '🔄',
                action: () => {
                    // TODO: Implement regeneration logic
                    console.debug('Regenerate message:', content);
                }
            });
        }

        // Add custom actions
        for (const action of this.defaultActions) {
            this.addActionButton(actionsContainer, action);
        }
    }

    /**
     * Add an action button
     */
    private addActionButton(container: HTMLElement, action: MessageAction): void {
        const button = container.createEl('button', {
            cls: 'message-action-button',
            attr: {
                'aria-label': action.label,
                'data-action-id': action.id
            }
        });

        button.innerHTML = action.icon;
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Get the message content from the parent message
            const messageContent = container.closest('.message')?.querySelector('.message-content');
            const content = messageContent?.textContent || '';
            void action.action(content);
        });
    }

    /**
     * Setup default actions
     */
    private setupDefaultActions(): void {
        // Default actions can be added here if needed
        this.defaultActions = [
            // Add default actions like quote, edit, etc.
        ];
    }

    /**
     * Simple markdown parser for fallback
     */
    private parseSimpleMarkdown(content: string): string {
        return content
            // Headers
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            // Code
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            // Line breaks
            .replace(/\n/g, '<br>');
    }

    /**
     * Format timestamp for display
     */
    private formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();

        // If today, show only time
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // If this week, show day and time
        const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff < 7) {
            return date.toLocaleDateString([], {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // Otherwise show full date
        return date.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Add custom action to all messages
     */
    addCustomAction(action: MessageAction): void {
        this.defaultActions.push(action);
    }

    /**
     * Remove custom action
     */
    removeCustomAction(actionId: string): void {
        this.defaultActions = this.defaultActions.filter(action => action.id !== actionId);
    }

    /**
     * Update message content in place
     */
    async updateMessageContent(
        container: HTMLElement,
        newContent: string,
        options: MessageRenderOptions = {}
    ): Promise<void> {
        const messageContent = container.querySelector('.message-content');
        if (messageContent) {
            messageContent.empty();
            await this.renderMarkdownContent(messageContent as HTMLElement, newContent, options);
        }
    }

    /**
     * Cleanup when component is unloaded
     */
    onunload(): void {
        // Cleanup event listeners or resources
        super.onunload();
    }
}
