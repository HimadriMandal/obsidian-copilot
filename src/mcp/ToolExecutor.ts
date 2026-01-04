import { App, Notice } from 'obsidian';
import { VaultToolProvider, VaultTool, VaultToolResult } from './VaultToolProvider';
import CopilotPlugin from '../main';

export interface ToolExecutionContext {
    userId?: string;
    sessionId?: string;
    conversationId?: string;
    messageId?: string;
}

export interface ToolCall {
    name: string;
    parameters: Record<string, any>;
    context?: ToolExecutionContext;
}

export interface ToolExecutionResult extends VaultToolResult {
    toolName: string;
    executionTime: number;
}

interface ToolExecutionLogEntry {
    timestamp: number;
    toolName: string;
    status: 'success' | 'failed' | 'error';
    error?: string;
}

export class ToolExecutor {
    private app: App;
    private plugin: CopilotPlugin;
    private vaultToolProvider: VaultToolProvider;
    private executionLog: ToolExecutionLogEntry[] = [];

    constructor(app: App, plugin: CopilotPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.vaultToolProvider = new VaultToolProvider(app, plugin);
    }

    async initialize(): Promise<void> {
        // No initialization work required currently.
    }

    /**
     * Execute a single tool call
     */
    async executeTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
        const startTime = Date.now();

        try {
            // Get the tool definition
            const tool = this.vaultToolProvider.getTool(toolCall.name);
            if (!tool) {
                return {
                    toolName: toolCall.name,
                    success: false,
                    error: `Unknown tool: ${toolCall.name}`,
                    executionTime: Date.now() - startTime
                };
            }

            const result = await this.executeToolDirectly(tool, toolCall.parameters);

            return {
                toolName: toolCall.name,
                ...result,
                executionTime: Date.now() - startTime
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.recordExecution(toolCall.name, 'error', errorMessage);
            return {
                toolName: toolCall.name,
                success: false,
                error: `Tool execution failed: ${errorMessage}`,
                executionTime: Date.now() - startTime
            };
        }
    }

    private async executeToolDirectly(tool: VaultTool, parameters: Record<string, any>): Promise<VaultToolResult> {
        const result = await this.vaultToolProvider.executeTool(tool.name, parameters);
        this.recordExecution(tool.name, result.success ? 'success' : 'failed', result.error);
        return result;
    }

    /**
     * Execute multiple tool calls in sequence
     */
    async executeMultipleTools(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]> {
        const results: ToolExecutionResult[] = [];

        for (const toolCall of toolCalls) {
            const result = await this.executeTool(toolCall);
            results.push(result);
        }

        return results;
    }

    /**
     * Get available tools for LLM function calling
     */
    getToolsForLLM(): any[] {
        const tools = this.vaultToolProvider.getAvailableTools();

        return tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'object',
                    properties: this.convertParametersToJSONSchema(tool.parameters),
                    required: tool.parameters
                        .filter(p => p.required)
                        .map(p => p.name)
                }
            }
        }));
    }

    /**
     * Parse LLM function calls into tool calls
     */
    parseLLMFunctionCalls(functionCalls: Array<{ name: string; arguments: string | Record<string, any> }>): ToolCall[] {
        return functionCalls.map(call => {
            let parameters: Record<string, any>;
            
            if (typeof call.arguments === 'string') {
                try {
                    parameters = JSON.parse(call.arguments) as Record<string, any>;
                } catch (error) {
                    parameters = {};
                }
            } else {
                parameters = call.arguments;
            }
            
            return {
                name: call.name,
                parameters
            };
        });
    }

    /**
     * Format tool execution results for LLM context
     */
    formatResultsForLLM(results: ToolExecutionResult[]): string {
        let output = '';

        for (const result of results) {
            output += `\n## Tool: ${result.toolName}\n`;

            if (result.success) {
                output += `✅ **Success** (${result.executionTime}ms)\n`;
                if (result.message) {
                    output += `${result.message}\n`;
                }
                if (result.data) {
                    output += '**Result:**\n```json\n' + JSON.stringify(result.data, null, 2) + '\n```\n';
                }
            } else {
                output += `❌ **Failed** (${result.executionTime}ms)\n`;
                output += `Error: ${result.error}\n`;

            }
        }

        return output.trim();
    }

    /**
     * Get tool statistics
     */
    getToolStats(): any {
        const tools = this.vaultToolProvider.getAvailableTools();
        const auditLog = this.executionLog;

        const stats = {
            totalTools: tools.length,
            safeTools: tools.filter(t => t.safe).length,
            sensitiveTools: tools.filter(t => !t.safe).length,
            totalExecutions: auditLog.length,
            successfulExecutions: auditLog.filter(entry => entry.status === 'success').length,
            failedExecutions: auditLog.filter(entry => entry.status === 'failed' || entry.status === 'error').length,
            deniedExecutions: 0,
            recentExecutions: auditLog.filter(entry =>
                Date.now() - entry.timestamp < 24 * 60 * 60 * 1000 // last 24 hours
            ).length
        };

        return stats;
    }

    /**
     * Get vault tool provider for direct access
     */
    getVaultToolProvider(): VaultToolProvider {
        return this.vaultToolProvider;
    }

    private convertParametersToJSONSchema(parameters: Array<{ name: string; type: string; description: string; required?: boolean; default?: unknown }>): Record<string, any> {
        const schema: Record<string, any> = {};

        for (const param of parameters) {
            const paramSchema: Record<string, any> = {
                type: param.type,
                description: param.description
            };

            if (param.default !== undefined) {
                paramSchema.default = param.default;
            }

            schema[param.name] = paramSchema;
        }

        return schema;
    }

    /**
     * Test tool execution with a simple safe tool
     */
    async testToolExecution(): Promise<boolean> {
        try {
            const result = await this.executeTool({
                name: 'get_vault_stats',
                parameters: {}
            });

            if (result.success) {
                new Notice('✅ Tool execution system is working correctly');
                return true;
            } else {
                new Notice(`❌ Tool test failed: ${result.error}`);
                return false;
            }
        } catch (error) {
            new Notice(`❌ Tool test error: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Create a demo tool call for testing
     */
    createDemoToolCall(): ToolCall {
        return {
            name: 'get_vault_stats',
            parameters: {},
            context: {
                sessionId: 'demo_session',
                conversationId: 'demo_conversation'
            }
        };
    }

    /**
     * Get help text for available tools
     */
    getToolsHelp(): string {
        const tools = this.vaultToolProvider.getAvailableTools();
        let help = '# Available Vault Tools\n\n';

        const safeTools = tools.filter(t => t.safe);
        const sensitiveTools = tools.filter(t => !t.safe);

        if (safeTools.length > 0) {
            help += '## Safe Tools (Auto-execute)\n\n';
            for (const tool of safeTools) {
                help += `### ${tool.name}\n`;
                help += `${tool.description}\n\n`;
                if (tool.parameters.length > 0) {
                    help += '**Parameters:**\n';
                    for (const param of tool.parameters) {
                        help += `- \`${param.name}\` (${param.type}${param.required ? ', required' : ', optional'}): ${param.description}\n`;
                    }
                    help += '\n';
                }
            }
        }

        if (sensitiveTools.length > 0) {
            help += '## Sensitive Tools (Require Approval)\n\n';
            for (const tool of sensitiveTools) {
                help += `### ${tool.name}\n`;
                help += `${tool.description}\n\n`;
                if (tool.parameters.length > 0) {
                    help += '**Parameters:**\n';
                    for (const param of tool.parameters) {
                        help += `- \`${param.name}\` (${param.type}${param.required ? ', required' : ', optional'}): ${param.description}\n`;
                    }
                    help += '\n';
                }
            }
        }

        help += '\n---\n\n';
        help += '**Note:** Safe tools execute automatically, while sensitive tools require your approval before making changes to the vault.';

        return help;
    }

    private recordExecution(toolName: string, status: 'success' | 'failed' | 'error', error?: string): void {
        const entry: ToolExecutionLogEntry = {
            timestamp: Date.now(),
            toolName,
            status,
            error
        };

        this.executionLog.push(entry);

        if (this.executionLog.length > 1000) {
            this.executionLog = this.executionLog.slice(-1000);
        }
    }
}
