import { App, TFile, TFolder, Vault, Notice, MarkdownView } from 'obsidian';
import { LLMService } from './LLMService';

export interface DocumentAnalysis {
    wordCount: number;
    characterCount: number;
    paragraphs: number;
    headings: number;
    links: string[];
    tags: string[];
    summary?: string;
    keyTopics?: string[];
}

export interface TextSelection {
    text: string;
    start: number;
    end: number;
    line: number;
    ch: number;
}

export interface ActiveDocumentContext {
    path: string;
    content: string;
    contentType: 'selection' | 'full';
    selection?: string;
    selectionRange?: {
        start: number;
        end: number;
        line: number;
        ch: number;
    };
}

export class DocumentService {
    private app: App;
    private llmService: LLMService;

    constructor(app: App, llmService: LLMService) {
        this.app = app;
        this.llmService = llmService;
    }

    /**
     * Analyze the current active document
     */
    async analyzeActiveDocument(): Promise<DocumentAnalysis | null> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active document found');
            return null;
        }

        const content = await this.app.vault.read(activeFile);
        return this.analyzeContent(content);
    }

    /**
     * Analyze content and return detailed analysis
     */
    async analyzeContent(content: string): Promise<DocumentAnalysis> {
        const lines = content.split('\n');

        // Basic text analysis
        const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
        const characterCount = content.length;
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

        // Extract headings (markdown headers)
        const headingRegex = /^#{1,6}\s+(.+)$/gm;
        const headingMatches = content.match(headingRegex) || [];
        const headings = headingMatches.length;

        // Extract links
        const linkRegex = /\[\[([^\]]+)\]\]|\[([^\]]+)\]\([^)]+\)/g;
        const links: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = linkRegex.exec(content)) !== null) {
            const linkText = match[1] || match[2];
            if (linkText) {
                links.push(linkText);
            }
        }

        // Extract tags
        const tagRegex = /#([a-zA-Z0-9_/-]+)/g;
        const tags: string[] = [];
        while ((match = tagRegex.exec(content)) !== null) {
            const tagText = match[1];
            if (tagText) {
                tags.push(tagText);
            }
        }

        // Use LLM for advanced analysis if content is substantial
        let summary: string | undefined;
        let keyTopics: string[] | undefined;

        if (content.length > 100) {
            try {
                const aiAnalysis = await this.llmService.analyzeDocument(content);
                summary = aiAnalysis.summary;
                keyTopics = aiAnalysis.keyPoints;
            } catch (error) {
                console.warn('AI analysis failed:', error);
            }
        }

        return {
            wordCount,
            characterCount,
            paragraphs,
            headings,
            links: Array.from(new Set(links)), // Remove duplicates
            tags: Array.from(new Set(tags)), // Remove duplicates
            summary,
            keyTopics
        };
    }

    /**
     * Get current text selection from the active editor
     */
    getCurrentSelection(): TextSelection | null {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor) {
            return null;
        }

        const editor = view.editor;
        const selection = editor.getSelection();

        if (!selection) {
            return null;
        }

        const cursor = editor.getCursor();
        const selectionStart = editor.getCursor('from');
        const selectionEnd = editor.getCursor('to');

        return {
            text: selection,
            start: editor.posToOffset(selectionStart),
            end: editor.posToOffset(selectionEnd),
            line: cursor.line,
            ch: cursor.ch
        };
    }

    /**
     * Get active document context (selection-first)
     */
    async getActiveDocumentContext(): Promise<ActiveDocumentContext | null> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            return null;
        }

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        let selection: TextSelection | null = null;

        if (editor) {
            const selectionText = editor.getSelection();
            if (selectionText && selectionText.trim().length > 0) {
                const cursor = editor.getCursor();
                const selectionStart = editor.getCursor('from');
                const selectionEnd = editor.getCursor('to');
                selection = {
                    text: selectionText,
                    start: editor.posToOffset(selectionStart),
                    end: editor.posToOffset(selectionEnd),
                    line: cursor.line,
                    ch: cursor.ch
                };
            }
        }

        const fullContent = await this.app.vault.read(activeFile);
        const content = selection ? selection.text : fullContent;

        return {
            path: activeFile.path,
            content,
            contentType: selection ? 'selection' : 'full',
            selection: selection?.text,
            selectionRange: selection
                ? {
                    start: selection.start,
                    end: selection.end,
                    line: selection.line,
                    ch: selection.ch
                }
                : undefined
        };
    }

    /**
     * Replace selected text in the active editor
     */
    replaceSelection(newText: string): boolean {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor) {
            new Notice('No active editor found');
            return false;
        }

        view.editor.replaceSelection(newText);
        return true;
    }

    /**
     * Insert text at cursor position
     */
    insertAtCursor(text: string): boolean {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor) {
            new Notice('No active editor found');
            return false;
        }

        const cursor = view.editor.getCursor();
        view.editor.replaceRange(text, cursor);
        return true;
    }

    /**
     * Get context around the current cursor position
     */
    getContextAroundCursor(lines: number = 5): string {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor) {
            return '';
        }

        const editor = view.editor;
        const cursor = editor.getCursor();
        const totalLines = editor.lineCount();

        const startLine = Math.max(0, cursor.line - lines);
        const endLine = Math.min(totalLines - 1, cursor.line + lines);

        let context = '';
        for (let i = startLine; i <= endLine; i++) {
            const line = editor.getLine(i);
            if (i === cursor.line) {
                // Mark the current line
                context += `>>> ${line}\n`;
            } else {
                context += `${line}\n`;
            }
        }

        return context;
    }

    /**
     * Generate text continuation based on current context
     */
    async continueText(maxTokens: number = 150): Promise<string> {
        const context = this.getContextAroundCursor(10);
        if (!context) {
            throw new Error('No context available');
        }

        const systemPrompt = 'You are a writing assistant. Continue the text naturally based on the provided context. The line marked with >>> is where the cursor is currently positioned.';

        return await this.llmService.generateText(context, systemPrompt);
    }

    /**
     * Improve selected text or text around cursor
     */
    async improveText(instruction: string = 'Improve and refine this text'): Promise<string> {
        const selection = this.getCurrentSelection();
        let textToImprove: string;

        if (selection && selection.text.trim()) {
            textToImprove = selection.text;
        } else {
            // Use context around cursor if no selection
            textToImprove = this.getContextAroundCursor(3);
        }

        if (!textToImprove.trim()) {
            throw new Error('No text found to improve');
        }

        return await this.llmService.improveText(textToImprove, instruction);
    }

    /**
     * Generate tags for the current document
     */
    async generateTags(): Promise<string[]> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            throw new Error('No active document found');
        }

        const content = await this.app.vault.read(activeFile);
        const analysis = await this.llmService.analyzeDocument(content);

        return analysis.tags || [];
    }

    /**
     * Create a new note with AI-generated content
     */
    async createNoteWithAI(title: string, prompt: string, folder?: string): Promise<TFile> {
        try {
            const content = await this.llmService.generateText(prompt);

            let filePath = `${title}.md`;
            if (folder) {
                // Ensure folder exists
                const folderObj = this.app.vault.getAbstractFileByPath(folder);
                if (!folderObj || !(folderObj instanceof TFolder)) {
                    await this.app.vault.createFolder(folder);
                }
                filePath = `${folder}/${title}.md`;
            }

            const file = await this.app.vault.create(filePath, content);
            new Notice(`Created note: ${title}`);

            return file;
        } catch (error: any) {
            new Notice(`Failed to create note: ${error.message}`);
            throw error;
        }
    }

    /**
     * Summarize the current document
     */
    async summarizeDocument(length: 'short' | 'medium' | 'long' = 'medium'): Promise<string> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            throw new Error('No active document found');
        }

        const content = await this.app.vault.read(activeFile);

        const lengthInstruction = {
            short: 'Write a brief 1-2 sentence summary',
            medium: 'Write a comprehensive paragraph summary',
            long: 'Write a detailed summary with key points'
        };

        const systemPrompt = `You are a document summarizer. ${lengthInstruction[length]} of the provided document.`;

        return await this.llmService.generateText(content, systemPrompt);
    }

    /**
     * Get all notes in the vault for knowledge base analysis
     */
    async getAllNotesContent(): Promise<{ file: TFile; content: string }[]> {
        const files = this.app.vault.getMarkdownFiles();
        const notesContent: { file: TFile; content: string }[] = [];

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                notesContent.push({ file, content });
            } catch (error) {
                console.warn(`Failed to read file ${file.path}:`, error);
            }
        }

        return notesContent;
    }
}