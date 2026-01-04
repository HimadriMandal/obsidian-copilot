import { CopilotConfig } from '../settings';
import { ErrorHandler, RateLimiter, APIError } from '../utils/ErrorHandler';
import { Notice } from 'obsidian';

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

export interface LLMRequest {
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    tools?: any[];
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
            const response = await this.makeRequest({
                messages: [{ role: 'user', content: 'Hello' }],
                maxTokens: 5
			});
			console.log("reresponse - "+ JSON.stringify(response));
            return !!response.content;
        } catch (error) {
            console.log('Connection test failed:', error);
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
        tools: any[],
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
        tools: any[],
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
        await this.rateLimiter.checkRateLimit();

        this.abortController = new AbortController();

        const requestBody: any = {
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
                const httpResponse = await fetch(`${this.config.apiEndpoint}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.apiKey}`
                    },
                    body: JSON.stringify(requestBody),
                    signal: this.abortController!.signal
                });

                if (!httpResponse.ok) {
                    throw await this.handleHTTPError(httpResponse);
                }

                return await httpResponse.json();
            });

            ErrorHandler.validateAPIResponse(response);

            const message = response.choices?.[0]?.message;

            return {
                content: message?.content || '',
                usage: response.usage,
                model: response.model,
                tool_calls: message?.tool_calls,
                finish_reason: response.choices?.[0]?.finish_reason
            };

        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }

            if (error.code) {
                ErrorHandler.handleAPIError(error as APIError);
            } else {
                ErrorHandler.handleNetworkError(error as Error);
            }
            throw error;
        }
    }

    private async makeStreamRequest(
        request: LLMRequest,
        onChunk: (chunk: StreamChunk) => void
    ): Promise<void> {
        await this.rateLimiter.checkRateLimit();

        this.abortController = new AbortController();

        const requestBody: any = {
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
            const response = await fetch(`${this.config.apiEndpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw await this.handleHTTPError(response);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body reader available');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                                onChunk({ content: '', isComplete: true });
                                return;
                            }

                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    onChunk({ content, isComplete: false });
                                }
                            } catch (e) {
                                console.warn('Failed to parse streaming chunk:', e);
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }

            if (error.code) {
                ErrorHandler.handleAPIError(error as APIError);
            } else {
                ErrorHandler.handleNetworkError(error as Error);
            }
            throw error;
        }
    }

    private async handleHTTPError(response: Response): Promise<APIError> {
        let errorData: any;
        try {
            errorData = await response.json();
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

        return {
            code,
            message: errorData.error?.message || errorData.message || `HTTP ${response.status}`,
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
            return JSON.parse(response);
        } catch (error) {
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
