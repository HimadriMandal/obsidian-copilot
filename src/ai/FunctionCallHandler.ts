import { ChatMessage, ToolCall, LLMToolDefinition } from '../services/LLMService';
import { ToolExecutor, ToolCall as VaultToolCall, ToolStats, ToolExecutionResult } from '../mcp/ToolExecutor';
import { Notice } from 'obsidian';
import CopilotPlugin from '../main';

export interface FunctionCallResult {
    success: boolean;
    results: ToolExecutionResult[];
    error?: string;
}

export class FunctionCallHandler {
    private plugin: CopilotPlugin;
    private toolExecutor: ToolExecutor;

    constructor(plugin: CopilotPlugin, toolExecutor: ToolExecutor) {
        this.plugin = plugin;
        this.toolExecutor = toolExecutor;
    }

    /**
     * Process function calls from LLM response
     */
    async processFunctionCalls(toolCalls: ToolCall[]): Promise<FunctionCallResult> {
        if (!toolCalls || toolCalls.length === 0) {
            return {
                success: true,
                results: []
            };
        }

        try {
            const vaultToolCalls: VaultToolCall[] = this.convertLLMToolCalls(toolCalls);
            const results = await this.toolExecutor.executeMultipleTools(vaultToolCalls);

            const hasFailures = results.some(r => !r.success);

            return {
                success: !hasFailures,
                results: results
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`Function call processing failed: ${errorMessage}`);

            return {
                success: false,
                results: [],
                error: errorMessage
            };
        }
    }

    /**
     * Format function call results for LLM context
     */
    formatResultsForLLM(toolCalls: ToolCall[], results: ToolExecutionResult[]): Record<string, unknown>[] {
        const formattedMessages: Record<string, unknown>[] = [];

        for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            const result = results[i];

            if (!toolCall) continue; // Skip if toolCall is undefined

            let content: string;
            if (result && result.success) {
                if (result.data) {
                    content = JSON.stringify({
                        success: true,
                        message: typeof result.message === 'string' ? result.message : 'Operation completed successfully',
                        data: result.data
                    });
                } else {
                    content = JSON.stringify({
                        success: true,
                        message: typeof result.message === 'string' ? result.message : 'Operation completed successfully'
                    });
                }
            } else {
                content = JSON.stringify({
                    success: false,
                    error: typeof result?.error === 'string' ? result.error : 'Function call failed',
                    message: 'Function execution failed'
                });
            }

            formattedMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: content
            });
        }

        return formattedMessages;
    }

    /**
     * Check if the LLM response contains function calls
     */
    hasToolCalls(response: unknown): boolean {
        if (!response || typeof response !== 'object') {
            return false;
        }

        const obj = response as Record<string, unknown>;
        return (
            'tool_calls' in obj &&
            Array.isArray(obj.tool_calls) &&
            obj.tool_calls.length > 0
        );
    }

    /**
     * Get available tools for LLM function calling
     */
    getAvailableToolsForLLM(): LLMToolDefinition[] {
        return this.toolExecutor.getToolsForLLM();
    }

    /**
     * Create a function call message for conversation history
     */
    createFunctionCallMessage(toolCalls: ToolCall[]): ChatMessage {
        return {
            role: 'assistant',
            content: '',
            tool_calls: toolCalls
        };
    }

    /**
     * Validate function call arguments
     */
    private validateFunctionCall(toolCall: ToolCall): boolean {
        try {
            // Check if arguments can be parsed as JSON
            JSON.parse(toolCall.function.arguments);

            // Check if the function name exists in available tools
            const availableTools = this.toolExecutor.getVaultToolProvider().getAvailableTools();
            const toolExists = availableTools.some(tool => tool.name === toolCall.function.name);

            if (!toolExists) {
                console.warn(`Unknown tool called: ${toolCall.function.name}`);
                return false;
            }

            return true;
        } catch (error) {
            console.warn(`Invalid function call arguments: ${toolCall.function.arguments}`, error);
            return false;
        }
    }

    /**
     * Convert LLM tool calls to vault tool calls
     */
    private convertLLMToolCalls(llmToolCalls: ToolCall[]): VaultToolCall[] {
        return llmToolCalls
            .filter(call => this.validateFunctionCall(call))
            .map(call => ({
                name: call.function.name,
                parameters: JSON.parse(call.function.arguments) as Record<string, unknown>,
                context: {
                    sessionId: `session_${Date.now()}`,
                    conversationId: this.plugin.conversationService.getCurrentConversation()?.id
                }
            }));
    }

    /**
     * Check if tools are enabled in settings
     */
    isToolsEnabled(): boolean {
        return this.plugin.settings.enableVaultTools ?? true;
    }

    /**
     * Get tool statistics for user
     */
    getToolStats(): string {
        const stats: ToolStats = this.toolExecutor.getToolStats();
        return `🔧 Vault Tools Status:
• Available: ${stats.totalTools} tools (${stats.safeTools} safe, ${stats.sensitiveTools} sensitive)
• Executions: ${stats.totalExecutions} total, ${stats.successfulExecutions} successful
• Recent activity: ${stats.recentExecutions} in last 24h`;
    }

    /**
     * Test function calling integration
     */
    async testFunctionCalling(): Promise<boolean> {
        try {
            const testToolCall: ToolCall = {
                id: 'test_call',
                type: 'function',
                function: {
                    name: 'get_vault_stats',
                    arguments: '{}'
                }
            };

            const result = await this.processFunctionCalls([testToolCall]);

            if (result.success) {
                new Notice('✅ Function calling integration is working correctly');
                return true;
            } else {
                new Notice(`❌ Function calling test failed: ${result.error}`);
                return false;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`❌ Function calling test error: ${errorMessage}`);
            return false;
        }
    }
}
