import { App, Notice } from 'obsidian';
import { ChatMessage } from './LLMService';
import CopilotPlugin from '../main';

export interface Conversation {
    id: string;
    title: string;
    messages: ConversationMessage[];
    createdAt: number;
    updatedAt: number;
    tokenCount: number;
    model: string;
}

export interface ConversationMessage extends ChatMessage {
    id: string;
    timestamp: number;
    tokenCount?: number;
    parentId?: string; // for branching conversations
    metadata?: {
        regenerated?: boolean;
        edited?: boolean;
        toolCalls?: any[];
        toolName?: string;
        toolCallId?: string;
    };
}

export interface ConversationSummary {
    id: string;
    title: string;
    lastMessage: string;
    messageCount: number;
    createdAt: number;
    updatedAt: number;
    model: string;
}

export class ConversationService {
    private app: App;
    private plugin: CopilotPlugin;
    private conversations: Map<string, Conversation> = new Map();
    private currentConversationId: string | null = null;
    private maxContextTokens: number = 8000; // Configurable context window

    constructor(app: App, plugin: CopilotPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    async initialize(): Promise<void> {
        try {
            await this.loadConversations();
            // Create default conversation if none exist
            if (this.conversations.size === 0) {
                await this.createNewConversation();
            }
        } catch (error) {
            console.error('Failed to initialize ConversationService:', error);
            new Notice('Failed to load chat history');
        }
    }

    /**
     * Create a new conversation
     */
    async createNewConversation(title?: string): Promise<string> {
        const conversationId = this.generateConversationId();
        const conversation: Conversation = {
            id: conversationId,
            title: title || this.generateConversationTitle(),
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            tokenCount: 0,
            model: this.plugin.settings.model
        };

        this.conversations.set(conversationId, conversation);
        this.currentConversationId = conversationId;

        await this.saveConversation(conversationId);
        await this.saveConversationIndex();

        return conversationId;
    }

    /**
     * Get current active conversation
     */
    getCurrentConversation(): Conversation | null {
        if (!this.currentConversationId) {
            return null;
        }
        return this.conversations.get(this.currentConversationId) || null;
    }

    /**
     * Switch to a different conversation
     */
    async switchToConversation(conversationId: string): Promise<boolean> {
        if (!this.conversations.has(conversationId)) {
            await this.loadConversation(conversationId);
        }

        if (this.conversations.has(conversationId)) {
            this.currentConversationId = conversationId;
            return true;
        }

        return false;
    }

    /**
     * Add a message to the current conversation
     */
    async addMessage(role: 'user' | 'assistant' | 'system' | 'tool', content: string, metadata?: {
        regenerated?: boolean;
        edited?: boolean;
        toolCalls?: any[];
        toolName?: string;
        toolCallId?: string;
    }): Promise<ConversationMessage> {
        let conversation = this.getCurrentConversation();

        if (!conversation) {
            const conversationId = await this.createNewConversation();
            conversation = this.getCurrentConversation()!;
        }

        const message: ConversationMessage = {
            id: this.generateMessageId(),
            role,
            content,
            timestamp: Date.now(),
            metadata
        };

        conversation.messages.push(message);
        conversation.updatedAt = Date.now();

        // Update conversation title based on first user message
        if (role === 'user' && conversation.messages.filter(m => m.role === 'user').length === 1) {
            conversation.title = this.generateTitleFromMessage(content);
        }

        await this.saveConversation(conversation.id);
        return message;
    }

    /**
     * Get messages for LLM context (respecting token limits)
     */
    getMessagesForContext(): ChatMessage[] {
        const conversation = this.getCurrentConversation();
        if (!conversation || conversation.messages.length === 0) {
            return [];
        }

        // Start from the most recent messages and work backwards
        const messages: ChatMessage[] = [];
        let tokenCount = 0;

        for (let i = conversation.messages.length - 1; i >= 0; i--) {
            const message = conversation.messages[i];
            if (!message) continue;

            // Estimate token count (rough approximation: 4 chars per token)
            const messageTokens = Math.ceil(message.content.length / 4);

            if (tokenCount + messageTokens > this.maxContextTokens) {
                break;
            }

            const chatMessage: ChatMessage = {
                role: message.role,
                content: message.content
            };

            if (message.metadata?.toolCalls) {
                chatMessage.tool_calls = message.metadata.toolCalls;
            }

            if (message.role === 'tool') {
                if (message.metadata?.toolCallId) {
                    chatMessage.tool_call_id = message.metadata.toolCallId;
                }
                if (message.metadata?.toolName) {
                    chatMessage.name = message.metadata.toolName;
                }
            }

            messages.unshift(chatMessage);

            tokenCount += messageTokens;
        }

        return messages;
    }

    /**
     * Update the last assistant message (for streaming)
     */
    async updateLastAssistantMessage(content: string): Promise<void> {
        const conversation = this.getCurrentConversation();
        if (!conversation) return;

        // Find the last assistant message
        for (let i = conversation.messages.length - 1; i >= 0; i--) {
            const message = conversation.messages[i];
            if (message && message.role === 'assistant') {
                message.content = content;
                message.timestamp = Date.now();
                conversation.updatedAt = Date.now();

                await this.saveConversation(conversation.id);
                break;
            }
        }
    }

    /**
     * Regenerate the last assistant message
     */
    async regenerateLastMessage(): Promise<ConversationMessage[]> {
        const conversation = this.getCurrentConversation();
        if (!conversation || conversation.messages.length === 0) {
            return [];
        }

        // Remove the last assistant message and return context for regeneration
        const messages = conversation.messages;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
            messages.pop();
            conversation.updatedAt = Date.now();
            await this.saveConversation(conversation.id);
        }

        return this.getMessagesForContext().map(msg => ({
            ...msg,
            id: this.generateMessageId(),
            timestamp: Date.now()
        }));
    }

    /**
     * Delete a conversation
     */
    async deleteConversation(conversationId: string): Promise<void> {
        this.conversations.delete(conversationId);

        // Switch to another conversation if this was the current one
        if (this.currentConversationId === conversationId) {
            const remainingIds = Array.from(this.conversations.keys());
            if (remainingIds.length > 0) {
                this.currentConversationId = remainingIds[0] || null;
            } else {
                this.currentConversationId = null;
                await this.createNewConversation();
            }
        }

        // Delete from storage
        try {
            const adapter = this.app.vault.adapter;
            const filePath = `${this.plugin.manifest.dir}/conversations/${conversationId}.json`;
            if (await adapter.exists(filePath)) {
                await adapter.remove(filePath);
            }
        } catch (error) {
            console.warn('Failed to delete conversation file:', error);
        }

        await this.saveConversationIndex();
    }

    /**
     * Get all conversation summaries
     */
    getAllConversations(): ConversationSummary[] {
        return Array.from(this.conversations.values()).map(conv => ({
            id: conv.id,
            title: conv.title,
            lastMessage: conv.messages.length > 0 ? conv.messages[conv.messages.length - 1]?.content?.substring(0, 100) || '' : '',
            messageCount: conv.messages.length,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            model: conv.model
        })).sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /**
     * Export conversation as markdown
     */
    exportConversationAsMarkdown(conversationId: string): string {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) return '';

        let markdown = `# ${conversation.title}\n\n`;
        markdown += `*Created: ${new Date(conversation.createdAt).toLocaleString()}*\n`;
        markdown += `*Model: ${conversation.model}*\n\n`;

        for (const message of conversation.messages) {
            const timestamp = new Date(message.timestamp).toLocaleString();
            const roleLabel = message.role.charAt(0).toUpperCase() + message.role.slice(1);

            markdown += `## ${roleLabel} (${timestamp})\n\n`;
            markdown += `${message.content}\n\n`;
            markdown += '---\n\n';
        }

        return markdown;
    }

    /**
     * Clear all conversations
     */
    async clearAllConversations(): Promise<void> {
        this.conversations.clear();
        this.currentConversationId = null;

        // Create a new default conversation
        await this.createNewConversation();

        // Clear storage
        try {
            const adapter = this.app.vault.adapter;
            const conversationsDir = `${this.plugin.manifest.dir}/conversations`;
            if (await adapter.exists(conversationsDir)) {
                const files = await adapter.list(conversationsDir);
                for (const file of files.files) {
                    await adapter.remove(file);
                }
            }
        } catch (error) {
            console.warn('Failed to clear conversation files:', error);
        }
    }

    // Private methods

    private async loadConversations(): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const indexPath = `${this.plugin.manifest.dir}/conversations/index.json`;

            if (await adapter.exists(indexPath)) {
                const indexData = await adapter.read(indexPath);
                const index = JSON.parse(indexData) as { currentConversationId?: string; conversations?: string[] };

                this.currentConversationId = index.currentConversationId || null;

                // Load individual conversations
                for (const conversationId of index.conversations || []) {
                    await this.loadConversation(conversationId);
                }
            }
        } catch (error) {
            console.warn('Failed to load conversation index:', error);
        }
    }

    private async loadConversation(conversationId: string): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const conversationPath = `${this.plugin.manifest.dir}/conversations/${conversationId}.json`;

            if (await adapter.exists(conversationPath)) {
                const conversationData = await adapter.read(conversationPath);
                const conversation = JSON.parse(conversationData) as Conversation;
                this.conversations.set(conversationId, conversation);
            }
        } catch (error) {
            console.warn(`Failed to load conversation ${conversationId}:`, error);
        }
    }

    private async saveConversation(conversationId: string): Promise<void> {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) return;

        try {
            const adapter = this.app.vault.adapter;
            const conversationsDir = `${this.plugin.manifest.dir}/conversations`;

            // Ensure directory exists
            if (!(await adapter.exists(conversationsDir))) {
                await adapter.mkdir(conversationsDir);
            }

            const conversationPath = `${conversationsDir}/${conversationId}.json`;
            await adapter.write(conversationPath, JSON.stringify(conversation, null, 2));
        } catch (error) {
            console.error(`Failed to save conversation ${conversationId}:`, error);
            new Notice('Failed to save conversation');
        }
    }

    private async saveConversationIndex(): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const conversationsDir = `${this.plugin.manifest.dir}/conversations`;

            // Ensure directory exists
            if (!(await adapter.exists(conversationsDir))) {
                await adapter.mkdir(conversationsDir);
            }

            const index = {
                currentConversationId: this.currentConversationId,
                conversations: Array.from(this.conversations.keys()),
                lastUpdated: Date.now()
            };

            const indexPath = `${conversationsDir}/index.json`;
            await adapter.write(indexPath, JSON.stringify(index, null, 2));
        } catch (error) {
            console.error('Failed to save conversation index:', error);
        }
    }

    private generateConversationId(): string {
        return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 9)}`;
    }

    private generateConversationTitle(): string {
        const adjectives = ['New', 'Quick', 'Brief', 'Deep', 'Creative', 'Important'];
        const nouns = ['Chat', 'Conversation', 'Discussion', 'Session', 'Talk'];

        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];

        return `${adjective} ${noun}`;
    }

    private generateTitleFromMessage(message: string): string {
        // Take first few words and clean up
        const words = message.trim().split(' ').slice(0, 5);
        let title = words.join(' ');

        // Remove common chat starters
        title = title.replace(/^(hi|hello|hey|can you|could you|please|help me)/i, '').trim();

        // Capitalize first letter
        if (title) {
            title = title.charAt(0).toUpperCase() + title.slice(1);
        }

        // Fallback to default if title is too short
        if (title.length < 3) {
            title = this.generateConversationTitle();
        }

        // Truncate if too long
        if (title.length > 50) {
            title = title.substring(0, 47) + '...';
        }

        return title;
    }
}
