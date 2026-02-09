import { CopilotConfig } from '../settings';
import { ErrorHandler, RateLimiter, APIError, HttpAPIError } from '../utils/ErrorHandler';
import { requestUrl } from 'obsidian';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp?: number;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface LLMToolParameterSchema {
    type: string;
    description: string;
    default?: unknown;
}

export interface LLMToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, LLMToolParameterSchema>;
            required: string[];
        };
    };
}

export interface LLMRequest {
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    tools?: LLMToolDefinition[];
    tool_choice?: 'auto' | 'none' | { type: 'function', function: { name: string } };
}

export interface LLMResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model?: string;
    tool_calls?: ToolCall[];
    finish_reason?: string;
}

export interface StreamChunk {
    content: string;
    isComplete: boolean;
}

export class LLMService {
    private config: CopilotConfig;
    private rateLimiter: RateLimiter;
    private abortController?: AbortController;

    constructor(config: CopilotConfig) {
        this.config = config;
        this.rateLimiter = new RateLimiter();
    }

    updateConfig(config: CopilotConfig): void {
        this.config = config;
    }

	async testConnection(): Promise<boolean> {
		try {
			await this.makeRequest({
				messages: [{ role: 'user', content: 'Hello' }],
				maxTokens: 5
			});
			return true;
		} catch (error) {
			console.error('Connection test failed:', error);
			return false;
		}
	}

    async generateText(prompt: string, systemPrompt?: string): Promise<string> {
        const messages: ChatMessage[] = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        messages.push({ role: 'user', content: prompt });

        const response = await this.makeRequest({ messages });
        return response.content;
    }

    async chat(messages: ChatMessage[]): Promise<LLMResponse> {
        return await this.makeRequest({ messages });
    }

    async streamChat(
        messages: ChatMessage[],
        onChunk: (chunk: StreamChunk) => void
    ): Promise<void> {
        if (!this.config.enableStreaming) {
            // Fall back to non-streaming
            const response = await this.chat(messages);
            onChunk({ content: response.content, isComplete: true });
            return;
        }

        await this.makeStreamRequest({ messages, stream: true }, onChunk);
    }

    /**
     * Chat with function calling support
     */
    async chatWithTools(
        messages: ChatMessage[],
        tools: LLMToolDefinition[],
        tool_choice: 'auto' | 'none' | { type: 'function', function: { name: string } } = 'auto'
    ): Promise<LLMResponse> {
        return await this.makeRequest({
            messages,
            tools,
            tool_choice
        });
    }

    /**
     * Stream chat with function calling support
     */
    async streamChatWithTools(
        messages: ChatMessage[],
        tools: LLMToolDefinition[],
        onChunk: (chunk: StreamChunk) => void,
        tool_choice: 'auto' | 'none' | { type: 'function', function: { name: string } } = 'auto'
    ): Promise<void> {
        if (!this.config.enableStreaming) {
            // Fall back to non-streaming
            const response = await this.chatWithTools(messages, tools, tool_choice);
            onChunk({ content: response.content || '', isComplete: true });
            return;
        }

        await this.makeStreamRequest({
            messages,
            tools,
            tool_choice,
            stream: true
        }, onChunk);
    }

    private async makeRequest(request: LLMRequest): Promise<LLMResponse> {
        this.rateLimiter.checkRateLimit();

        this.abortController = new AbortController();

        const requestBody: {
            model: string;
            messages: ChatMessage[];
            temperature: number;
            max_tokens: number;
            stream: boolean;
            tools?: LLMToolDefinition[];
            tool_choice?: LLMRequest['tool_choice'];
        } = {
            model: this.config.model,
            messages: request.messages,
            temperature: request.temperature ?? this.config.temperature,
            max_tokens: request.maxTokens ?? this.config.maxTokens,
            stream: false
        };

        // Add function calling parameters if provided
        if (request.tools && request.tools.length > 0) {
            requestBody.tools = request.tools;
            if (request.tool_choice) {
                requestBody.tool_choice = request.tool_choice;
            }
        }

        try {
            const response = await ErrorHandler.withRetry(async () => {
                const httpResponse = await requestUrl({
                    url: `${this.config.apiEndpoint}/chat/completions`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.apiKey}`
                    },
                    body: JSON.stringify(requestBody),
                    throw: false
                });

                if (httpResponse.status !== 200) {
                    const response = {
                        status: httpResponse.status,
                        statusText: 'Error',
                        json: () => {
                            try {
                                return Promise.resolve(JSON.parse(httpResponse.text) as Record<
                                  string,
                                  unknown
                                >);
                            } catch {
                                return Promise.resolve({});
                            }
                        }
                    } as Response;
                    throw new HttpAPIError(await this.handleHTTPError(response));
                }

                const parsed = JSON.parse(httpResponse.text) as Record<string, unknown>;
                return parsed;
            });

            ErrorHandler.validateAPIResponse(response);

            const choices = (response.choices as unknown[]) || [];
            const message = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;

            return {
                content: (message?.content as string) || '',
                usage: response.usage as { promptTokens: number; completionTokens: number; totalTokens: number; } | undefined,
                model: response.model as string | undefined,
                tool_calls: message?.tool_calls as ToolCall[] | undefined,
                finish_reason: (choices[0] as Record<string, unknown>)?.finish_reason as string | undefined
            };

        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }

            if (error instanceof Object && 'code' in error) {
                ErrorHandler.handleAPIError(error as APIError);
            } else if (error instanceof Error) {
                ErrorHandler.handleNetworkError(error);
            }
            throw error;
        }
    }

    private async makeStreamRequest(
        request: LLMRequest,
        onChunk: (chunk: StreamChunk) => void
    ): Promise<void> {
        this.rateLimiter.checkRateLimit();

        this.abortController = new AbortController();

        const requestBody: {
            model: string;
            messages: ChatMessage[];
            temperature: number;
            max_tokens: number;
            stream: boolean;
            tools?: LLMToolDefinition[];
            tool_choice?: LLMRequest['tool_choice'];
        } = {
            model: this.config.model,
            messages: request.messages,
            temperature: request.temperature ?? this.config.temperature,
            max_tokens: request.maxTokens ?? this.config.maxTokens,
            stream: true
        };

        // Add function calling parameters if provided
        if (request.tools && request.tools.length > 0) {
            requestBody.tools = request.tools;
            if (request.tool_choice) {
                requestBody.tool_choice = request.tool_choice;
            }
        }

        try {
            const response = await requestUrl({
                url: `${this.config.apiEndpoint}/chat/completions`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestBody),
                throw: false
            });

            if (response.status !== 200) {
                const httpResponse = {
                    status: response.status,
                    statusText: 'Error',
                    json: () => {
                        try {
                            return Promise.resolve(JSON.parse(response.text) as Record<string, unknown>);
                        } catch {
                            return Promise.resolve({});
                        }
                    }
                } as Response;
                throw new HttpAPIError(await this.handleHTTPError(httpResponse));
            }

            const text = response.text;
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.trim() === '') continue;
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        onChunk({ content: '', isComplete: true });
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data) as Record<string, unknown>;
                        const choices = parsed.choices as unknown[];
                        const delta = (choices?.[0] as Record<string, unknown>)?.delta as Record<string, unknown> | undefined;
                        const content = delta?.content as string | undefined;
                        if (content) {
                            onChunk({ content, isComplete: false });
                        }
                    } catch (e) {
                        console.warn('Failed to parse streaming chunk:', e);
                    }
                }
            }

        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }

            if (error && typeof error === 'object' && 'code' in error) {
                ErrorHandler.handleAPIError(error as APIError);
            } else if (error instanceof Error) {
                ErrorHandler.handleNetworkError(error);
            }
            throw error;
        }
    }

    private async handleHTTPError(response: Response): Promise<APIError> {
        let errorData: Record<string, unknown> = {};
        try {
            errorData = (await response.json()) as Record<string, unknown>;
        } catch {
            errorData = { message: response.statusText };
        }

        let code: string;
        switch (response.status) {
            case 400:
                code = 'INVALID_REQUEST';
                break;
            case 401:
                code = 'INVALID_API_KEY';
                break;
            case 429:
                code = 'RATE_LIMITED';
                break;
            case 404:
                code = 'MODEL_NOT_FOUND';
                break;
            case 500:
                code = 'SERVER_ERROR';
                break;
            default:
                code = 'HTTP_ERROR';
        }

        const error = errorData.error as Record<string, unknown> | undefined;
        const message = (typeof error?.message === 'string' ? error.message : null) ||
                        (typeof errorData.message === 'string' ? errorData.message : null) ||
                        `HTTP ${response.status}`;

        return {
            code,
            message,
            details: errorData
        };
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    async analyzeDocument(content: string): Promise<{
        summary: string;
        keyPoints: string[];
        tags: string[];
        sentiment: string;
    }> {
        const systemPrompt = `You are a document analyzer. Analyze the provided document and return a JSON response with the following structure:
{
  "summary": "Brief summary of the document",
  "keyPoints": ["key point 1", "key point 2", "..."],
  "tags": ["tag1", "tag2", "..."],
  "sentiment": "positive|neutral|negative"
}`;

        const response = await this.generateText(content, systemPrompt);

        try {
            const parsed = JSON.parse(response) as Record<string, unknown>;
            return {
                summary: typeof parsed.summary === 'string' ? parsed.summary : '',
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints as string[] : [],
                tags: Array.isArray(parsed.tags) ? parsed.tags as string[] : [],
                sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral'
            };
        } catch {
            // Fallback if JSON parsing fails
            return {
                summary: response.substring(0, 200) + '...',
                keyPoints: [],
                tags: [],
                sentiment: 'neutral'
            };
        }
    }

    async improveText(text: string, instruction: string = 'Improve this text'): Promise<string> {
        const prompt = `${instruction}:\n\n${text}`;
        return await this.generateText(prompt);
    }

    async generateStructure(topic: string, structureType: 'outline' | 'headers' | 'list' = 'outline'): Promise<string> {
        const systemPrompt = `You are a content structure generator. Generate a well-organized ${structureType} for the given topic. Use markdown formatting.`;
        const prompt = `Create a ${structureType} for: ${topic}`;
        return await this.generateText(prompt, systemPrompt);
    }
}
