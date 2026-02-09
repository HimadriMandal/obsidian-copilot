import { App, TFile, TFolder, normalizePath, MarkdownView } from 'obsidian';
import CopilotPlugin from '../main';

export interface VaultTool {
    name: string;
    description: string;
    parameters: VaultToolParameter[];
    safe: boolean; // true = auto-execute, false = require approval
}

export interface VaultToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
    default?: unknown;
}

export interface VaultToolResult {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    message?: string;
}

interface FileMetadata {
    name: string;
    path: string;
    type: string;
    size?: number;
    created?: number;
    modified?: number;
    extension?: string;
    frontmatter?: Record<string, unknown>;
    tags?: string[];
    outlinks?: string[];
    headings?: Array<{ heading: string; level: number }>;
}

export class VaultToolProvider {
    private app: App;
    private plugin: CopilotPlugin;
    private tools: Map<string, VaultTool> = new Map();

    constructor(app: App, plugin: CopilotPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.initializeTools();
    }

    private initializeTools(): void {
        // Safe tools (auto-execute)
        this.registerTool({
            name: 'read_file',
            description: 'Read the contents of a file in the vault',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file relative to vault root',
                    required: true
                }
            ],
            safe: true
        });

        this.registerTool({
            name: 'search_files',
            description: 'Search for files in the vault by name pattern',
            parameters: [
                {
                    name: 'pattern',
                    type: 'string',
                    description: 'Search pattern (supports wildcards)',
                    required: true
                },
                {
                    name: 'limit',
                    type: 'number',
                    description: 'Maximum number of results',
                    required: false,
                    default: 20
                }
            ],
            safe: true
        });

        this.registerTool({
            name: 'list_files',
            description: 'List files in a directory',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Directory path (empty for root)',
                    required: false,
                    default: ''
                }
            ],
            safe: true
        });

        this.registerTool({
            name: 'get_file_metadata',
            description: 'Get metadata information about a file',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file',
                    required: true
                }
            ],
            safe: true
        });

        this.registerTool({
            name: 'search_content',
            description: 'Search for text content within files',
            parameters: [
                {
                    name: 'query',
                    type: 'string',
                    description: 'Text to search for',
                    required: true
                },
                {
                    name: 'file_pattern',
                    type: 'string',
                    description: 'File pattern to limit search (optional)',
                    required: false
                }
            ],
            safe: true
        });

        this.registerTool({
            name: 'get_active_document',
            description: 'Get content from the currently active document (selection-first)',
            parameters: [],
            safe: true
        });

        // Sensitive tools (require approval)
        this.registerTool({
            name: 'create_file',
            description: 'Create a new file with content',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path for the new file',
                    required: true
                },
                {
                    name: 'content',
                    type: 'string',
                    description: 'Initial content for the file',
                    required: false,
                    default: ''
                }
            ],
            safe: false
        });

        this.registerTool({
            name: 'replace_selection',
            description: 'Replace the current editor selection with new content',
            parameters: [
                {
                    name: 'content',
                    type: 'string',
                    description: 'Content to insert into the current selection',
                    required: true
                }
            ],
            safe: false
        });

        this.registerTool({
            name: 'replace_active_document',
            description: 'Replace the full content of the active document',
            parameters: [
                {
                    name: 'content',
                    type: 'string',
                    description: 'New full document content',
                    required: true
                }
            ],
            safe: false
        });

        this.registerTool({
            name: 'update_file',
            description: 'Update the contents of an existing file',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file to update',
                    required: true
                },
                {
                    name: 'content',
                    type: 'string',
                    description: 'New content for the file',
                    required: true
                }
            ],
            safe: false
        });

        this.registerTool({
            name: 'append_to_file',
            description: 'Append content to an existing file',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file',
                    required: true
                },
                {
                    name: 'content',
                    type: 'string',
                    description: 'Content to append',
                    required: true
                }
            ],
            safe: false
        });

        this.registerTool({
            name: 'rename_file',
            description: 'Rename or move a file',
            parameters: [
                {
                    name: 'old_path',
                    type: 'string',
                    description: 'Current path of the file',
                    required: true
                },
                {
                    name: 'new_path',
                    type: 'string',
                    description: 'New path for the file',
                    required: true
                }
            ],
            safe: false
        });

        this.registerTool({
            name: 'delete_file',
            description: 'Delete a file from the vault',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path to the file to delete',
                    required: true
                }
            ],
            safe: false
        });

        this.registerTool({
            name: 'create_folder',
            description: 'Create a new folder',
            parameters: [
                {
                    name: 'path',
                    type: 'string',
                    description: 'Path for the new folder',
                    required: true
                }
            ],
            safe: false
        });

        this.registerTool({
            name: 'get_vault_stats',
            description: 'Get statistics about the vault',
            parameters: [],
            safe: true
        });
    }

    private registerTool(tool: VaultTool): void {
        this.tools.set(tool.name, tool);
    }

    /**
     * Get all available tools
     */
    getAvailableTools(): VaultTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get a specific tool by name
     */
    getTool(name: string): VaultTool | undefined {
        return this.tools.get(name);
    }

    /**
     * Execute a vault tool
     */
    async executeTool(name: string, parameters: Record<string, unknown>): Promise<VaultToolResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return {
                success: false,
                error: `Tool '${name}' not found`
            };
        }

        try {
            // Validate parameters
            const validationError = this.validateParameters(tool, parameters);
            if (validationError) {
                return {
                    success: false,
                    error: validationError
                };
            }

            // Execute the tool
            switch (name) {
                case 'read_file':
                    return await this.readFile(this.getRequiredStringParam(parameters, 'path'));
                case 'search_files': {
                    const pattern = this.getRequiredStringParam(parameters, 'pattern');
                    const limit = this.getNumberParam(parameters, 'limit');
                    return await this.searchFiles(pattern, limit ?? 20);
                }
                case 'list_files':
                    return await this.listFiles(this.getStringParam(parameters, 'path') ?? '');
                case 'get_file_metadata':
                    return await this.getFileMetadata(this.getRequiredStringParam(parameters, 'path'));
                case 'search_content': {
                    const query = this.getRequiredStringParam(parameters, 'query');
                    const filePattern = this.getStringParam(parameters, 'file_pattern');
                    return await this.searchContent(query, filePattern);
                }
                case 'get_active_document':
                    return await this.getActiveDocument();
                case 'create_file':
                    return await this.createFile(
                        this.getRequiredStringParam(parameters, 'path'),
                        this.getStringParam(parameters, 'content') ?? ''
                    );
                case 'update_file':
                    return await this.updateFile(
                        this.getRequiredStringParam(parameters, 'path'),
                        this.getRequiredStringParam(parameters, 'content')
                    );
                case 'append_to_file':
                    return await this.appendToFile(
                        this.getRequiredStringParam(parameters, 'path'),
                        this.getRequiredStringParam(parameters, 'content')
                    );
                case 'replace_selection':
                    return await this.replaceSelection(this.getRequiredStringParam(parameters, 'content'));
                case 'replace_active_document':
                    return await this.replaceActiveDocument(this.getRequiredStringParam(parameters, 'content'));
                case 'rename_file':
                    return await this.renameFile(
                        this.getRequiredStringParam(parameters, 'old_path'),
                        this.getRequiredStringParam(parameters, 'new_path')
                    );
                case 'delete_file':
                    return await this.deleteFile(this.getRequiredStringParam(parameters, 'path'));
                case 'create_folder':
                    return await this.createFolder(this.getRequiredStringParam(parameters, 'path'));
                case 'get_vault_stats':
                    return await this.getVaultStats();
                default:
                    return {
                        success: false,
                        error: `Tool '${name}' not implemented`
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private validateParameters(tool: VaultTool, parameters: Record<string, unknown>): string | null {
        for (const param of tool.parameters) {
            if (param.required && !(param.name in parameters)) {
                return `Missing required parameter: ${param.name}`;
            }

            if (param.name in parameters) {
                const value = parameters[param.name];
                const expectedType = param.type;
                const actualType = typeof value;

                if (expectedType === 'number' && actualType !== 'number') {
                    return `Parameter '${param.name}' must be a number`;
                }
                if (expectedType === 'boolean' && actualType !== 'boolean') {
                    return `Parameter '${param.name}' must be a boolean`;
                }
                if (expectedType === 'string' && actualType !== 'string') {
                    return `Parameter '${param.name}' must be a string`;
                }
            }
        }

        return null;
    }

    private getStringParam(parameters: Record<string, unknown>, name: string): string | undefined {
        const value = parameters[name];
        return typeof value === 'string' ? value : undefined;
    }

    private getNumberParam(parameters: Record<string, unknown>, name: string): number | undefined {
        const value = parameters[name];
        return typeof value === 'number' ? value : undefined;
    }

    private getRequiredStringParam(parameters: Record<string, unknown>, name: string): string {
        const value = this.getStringParam(parameters, name);
        if (value === undefined) {
            throw new Error(`Missing or invalid parameter: ${name}`);
        }
        return value;
    }

    // Tool implementations

    private async readFile(path: string): Promise<VaultToolResult> {
        try {
            const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `Path is not a file: ${path}`
                };
            }

            const content = await this.app.vault.read(file);
            return {
                success: true,
                data: {
                    path: file.path,
                    content: content,
                    size: file.stat.size,
                    modified: file.stat.mtime
                },
                message: `Read file: ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async searchFiles(pattern: string, limit: number = 20): Promise<VaultToolResult> {
        try {
            const files = this.app.vault.getFiles();
            const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');

            const matches = files
                .filter(file => regex.test(file.name) || regex.test(file.path))
                .slice(0, limit)
                .map(file => ({
                    path: file.path,
                    name: file.name,
                    size: file.stat.size,
                    modified: file.stat.mtime
                }));

            return {
                success: true,
                data: {
                    matches: matches,
                    total: matches.length,
                    pattern: pattern
                },
                message: `Found ${matches.length} files matching pattern: ${pattern}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Search failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async listFiles(path: string = ''): Promise<VaultToolResult> {
        try {
            const normalizedPath = normalizePath(path);
            let targetFolder: TFolder;

            if (normalizedPath === '' || normalizedPath === '/') {
                targetFolder = this.app.vault.getRoot();
            } else {
                const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
                if (!folder) {
                    return {
                        success: false,
                        error: `Folder not found: ${path}`
                    };
                }
                if (!(folder instanceof TFolder)) {
                    return {
                        success: false,
                        error: `Path is not a folder: ${path}`
                    };
                }
                targetFolder = folder;
            }

            const files = targetFolder.children.map(child => ({
                name: child.name,
                path: child.path,
                type: child instanceof TFile ? 'file' : 'folder',
                size: child instanceof TFile ? child.stat.size : undefined,
                modified: child instanceof TFile ? child.stat.mtime : undefined
            }));

            return {
                success: true,
                data: {
                    path: targetFolder.path,
                    files: files,
                    count: files.length
                },
                message: `Listed ${files.length} items in: ${targetFolder.path || 'vault root'}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to list files: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async getFileMetadata(path: string): Promise<VaultToolResult> {
        try {
            const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            let metadata: Partial<FileMetadata> = {
                name: file.name,
                path: file.path,
                type: file instanceof TFile ? 'file' : 'folder'
            };

            if (file instanceof TFile) {
                metadata = {
                    ...metadata,
                    size: file.stat.size,
                    created: file.stat.ctime,
                    modified: file.stat.mtime,
                    extension: file.extension
                };

                // Get frontmatter if it's a markdown file
                if (file.extension === 'md') {
                    const fileCache = this.app.metadataCache.getFileCache(file);
                    if (fileCache?.frontmatter) {
                        metadata.frontmatter = fileCache.frontmatter;
                    }
                    if (fileCache?.tags) {
                        metadata.tags = fileCache.tags.map(tag => tag.tag);
                    }
                    if (fileCache?.links) {
                        metadata.outlinks = fileCache.links.map(link => link.link);
                    }
                    if (fileCache?.headings) {
                        metadata.headings = fileCache.headings.map(h => ({
                            heading: h.heading,
                            level: h.level
                        }));
                    }
                }
            }

            return {
                success: true,
                data: metadata,
                message: `Retrieved metadata for: ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to get metadata: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async searchContent(query: string, filePattern?: string): Promise<VaultToolResult> {
        try {
            const files = this.app.vault.getMarkdownFiles();
            const results: Array<{ file: string; matches: Array<{ line: number; content: string; context: string }> }> = [];

            let filesToSearch = files;
            if (filePattern) {
                const regex = new RegExp(filePattern.replace(/\*/g, '.*'), 'i');
                filesToSearch = files.filter(file => regex.test(file.name) || regex.test(file.path));
            }

            for (const file of filesToSearch.slice(0, 50)) { // Limit to 50 files for performance
                try {
                    const content = await this.app.vault.read(file);
                    const lines = content.split('\n');
                    const matches: Array<{ line: number; content: string; context: string }> = [];

                    lines.forEach((line, lineNum) => {
                        if (line.toLowerCase().includes(query.toLowerCase())) {
                            matches.push({
                                line: lineNum + 1,
                                content: line.trim(),
                                context: lines.slice(Math.max(0, lineNum - 1), lineNum + 2).join('\n')
                            });
                        }
                    });

                    if (matches.length > 0) {
                        results.push({
                            file: file.path,
                            matches: matches.slice(0, 5) // Limit matches per file
                        });
                    }
                } catch (error) {
                    // Skip files that can't be read
                    continue;
                }
            }

            const totalMatches: number = results.reduce((sum, r) => sum + r.matches.length, 0);

            return {
                success: true,
                data: {
                    query: query,
                    results: results,
                    totalFiles: results.length,
                    totalMatches: totalMatches
                },
                message: `Found ${results.length} files with content matching: ${query}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Content search failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async getActiveDocument(): Promise<VaultToolResult> {
        try {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                return {
                    success: false,
                    error: 'No active document found'
                };
            }

            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            const editor = view?.editor;
            const selectionText = editor?.getSelection() || '';
            const hasSelection = selectionText.trim().length > 0;

            let selectionRange: Record<string, number> | undefined;
            if (editor && hasSelection) {
                const selectionStart = editor.getCursor('from');
                const selectionEnd = editor.getCursor('to');
                const cursor = editor.getCursor();
                selectionRange = {
                    start: editor.posToOffset(selectionStart),
                    end: editor.posToOffset(selectionEnd),
                    line: cursor.line,
                    ch: cursor.ch
                };
            }

            const content = await this.app.vault.read(activeFile);

            return {
                success: true,
                data: {
                    path: activeFile.path,
                    content: hasSelection ? selectionText : content,
                    contentType: hasSelection ? 'selection' : 'full',
                    selection: hasSelection ? selectionText : undefined,
                    selectionRange: selectionRange
                },
                message: `Read active document: ${activeFile.path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to get active document: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async createFile(path: string, content: string = ''): Promise<VaultToolResult> {
        try {
            const normalizedPath = normalizePath(path);

            // Check if file already exists
            const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);
            if (existingFile) {
                return {
                    success: false,
                    error: `File already exists: ${path}`
                };
            }

            const file = await this.app.vault.create(normalizedPath, content);

            return {
                success: true,
                data: {
                    path: file.path,
                    size: file.stat.size
                },
                message: `Created file: ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to create file: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async updateFile(path: string, content: string): Promise<VaultToolResult> {
        try {
            const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `Path is not a file: ${path}`
                };
            }

            await this.app.vault.modify(file, content);

            return {
                success: true,
                data: {
                    path: file.path,
                    size: file.stat.size
                },
                message: `Updated file: ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to update file: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async appendToFile(path: string, content: string): Promise<VaultToolResult> {
        try {
            const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `Path is not a file: ${path}`
                };
            }

            const existingContent = await this.app.vault.read(file);
            const newContent = existingContent + content;
            await this.app.vault.modify(file, newContent);

            return {
                success: true,
                data: {
                    path: file.path,
                    size: file.stat.size,
                    appended: content.length
                },
                message: `Appended to file: ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to append to file: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async replaceSelection(content: string): Promise<VaultToolResult> {
        try {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            const editor = view?.editor;
            if (!editor) {
                return {
                    success: false,
                    error: 'No active editor found'
                };
            }

            const selectionText = editor.getSelection();
            if (!selectionText || selectionText.trim().length === 0) {
                return {
                    success: false,
                    error: 'No active selection found'
                };
            }

            editor.replaceSelection(content);

            return {
                success: true,
                data: {
                    selectionLength: selectionText.length,
                    insertedLength: content.length
                },
                message: 'Replaced current selection'
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to replace selection: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async replaceActiveDocument(content: string): Promise<VaultToolResult> {
        try {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                return {
                    success: false,
                    error: 'No active document found'
                };
            }

            await this.app.vault.modify(activeFile, content);

            return {
                success: true,
                data: {
                    path: activeFile.path,
                    size: content.length
                },
                message: `Replaced active document: ${activeFile.path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to replace active document: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async renameFile(oldPath: string, newPath: string): Promise<VaultToolResult> {
        try {
            const file = this.app.vault.getAbstractFileByPath(normalizePath(oldPath));
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${oldPath}`
                };
            }

            const normalizedNewPath = normalizePath(newPath);

            // Check if target already exists
            const existingFile = this.app.vault.getAbstractFileByPath(normalizedNewPath);
            if (existingFile) {
                return {
                    success: false,
                    error: `Target already exists: ${newPath}`
                };
            }

            await this.app.vault.rename(file, normalizedNewPath);

            return {
                success: true,
                data: {
                    oldPath: oldPath,
                    newPath: normalizedNewPath
                },
                message: `Renamed: ${oldPath} → ${newPath}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to rename file: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async deleteFile(path: string): Promise<VaultToolResult> {
        try {
            const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            await this.app.fileManager.trashFile(file);

            return {
                success: true,
                data: {
                    path: path,
                    type: file instanceof TFile ? 'file' : 'folder'
                },
                message: `Deleted: ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async createFolder(path: string): Promise<VaultToolResult> {
        try {
            const normalizedPath = normalizePath(path);

            // Check if folder already exists
            const existingFolder = this.app.vault.getAbstractFileByPath(normalizedPath);
            if (existingFolder) {
                return {
                    success: false,
                    error: `Folder already exists: ${path}`
                };
            }

            const folder = await this.app.vault.createFolder(normalizedPath);

            return {
                success: true,
                data: {
                    path: folder.path
                },
                message: `Created folder: ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to create folder: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async getVaultStats(): Promise<VaultToolResult> {
        try {
            const allFiles = this.app.vault.getAllLoadedFiles();
            const markdownFiles = this.app.vault.getMarkdownFiles();
            const folders = allFiles.filter(f => f instanceof TFolder);

            let totalSize = 0;
            for (const file of allFiles) {
                if (file instanceof TFile) {
                    totalSize += file.stat.size;
                }
            }

            const stats = {
                totalFiles: allFiles.filter(f => f instanceof TFile).length,
                markdownFiles: markdownFiles.length,
                folders: folders.length,
                totalSize: totalSize,
                vaultName: this.app.vault.getName() || 'Vault'
            };

            return {
                success: true,
                data: stats,
                message: `Vault contains ${stats.totalFiles} files in ${stats.folders} folders`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to get vault stats: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
