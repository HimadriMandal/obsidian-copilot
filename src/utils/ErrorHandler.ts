import { Notice } from 'obsidian';

export interface APIError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

/** Error subclass for API/HTTP errors so thrown values are proper Error instances. */
export class HttpAPIError extends Error implements APIError {
    readonly code: string;
    readonly details?: Record<string, unknown>;
    constructor(apiError: APIError) {
        super(apiError.message);
        this.name = 'HttpAPIError';
        this.code = apiError.code;
        this.details = apiError.details;
    }
}

export class ErrorHandler {
    static handleAPIError(error: APIError, showNotice: boolean = true): string {
        let userMessage: string;

        switch (error.code) {
            case 'INVALID_API_KEY':
                userMessage = 'Invalid API key. Please check your settings.';
                break;
            case 'RATE_LIMITED':
                userMessage = 'Rate limit exceeded. Please wait before trying again.';
                break;
            case 'NETWORK_ERROR':
                userMessage = 'Network error. Please check your connection.';
                break;
            case 'TIMEOUT':
                userMessage = 'Request timed out. Please try again.';
                break;
            case 'INSUFFICIENT_QUOTA':
                userMessage = 'Insufficient API quota. Please check your account.';
                break;
            case 'MODEL_NOT_FOUND':
                userMessage = 'Model not found. Please check your model configuration.';
                break;
            case 'INVALID_ENDPOINT':
                userMessage = 'Invalid API endpoint. Please check your endpoint URL.';
                break;
            default:
                userMessage = error.message || 'An unexpected error occurred.';
        }

        if (showNotice) {
            new Notice(userMessage, 5000);
        }

        // Log detailed error for debugging
        console.error('Copilot Error:', {
            code: error.code,
            message: error.message,
            details: (error.details as Record<string, unknown>) ?? {},
            timestamp: new Date().toISOString()
        });

        return userMessage;
    }

    static handleNetworkError(error: Error, showNotice: boolean = true): string {
        const apiError: APIError = {
            code: 'NETWORK_ERROR',
            message: error.message
        };
        return this.handleAPIError(apiError, showNotice);
    }

    static async withRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        delayMs: number = 1000
    ): Promise<T> {
        let lastError: Error;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;

                if (attempt === maxRetries) {
                    break;
                }

                // Exponential backoff
                const delay = delayMs * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));

                console.warn(`Copilot: Retry attempt ${attempt}/${maxRetries} failed:`, error);
            }
        }

        throw lastError!;
    }

    static validateAPIResponse(response: unknown): boolean {
        if (!response || typeof response !== 'object') {
            throw new Error('Empty response from API');
        }

        if ('error' in response && response.error) {
            const errorDetails = response.error as Record<string, unknown>;
            const error = new Error((errorDetails.message as string) || 'Unknown API error') as Error & {
                code?: string;
                details?: Record<string, unknown>;
            };
            error.code = (errorDetails.code as string) || 'API_ERROR';
            error.details = errorDetails;
            throw error;
        }

        return true;
    }
}

export class RateLimiter {
    private requests: number[] = [];
    private readonly maxRequests: number;
    private readonly timeWindowMs: number;

    constructor(maxRequests: number = 60, timeWindowMs: number = 60000) {
        this.maxRequests = maxRequests;
        this.timeWindowMs = timeWindowMs;
    }

    checkRateLimit(): void {
        const now = Date.now();

        // Remove old requests outside the time window
        this.requests = this.requests.filter(time => now - time < this.timeWindowMs);

        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.timeWindowMs - (now - oldestRequest);

            if (waitTime > 0) {
                throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
            }
        }

        this.requests.push(now);
    }

    reset(): void {
        this.requests = [];
    }
}
