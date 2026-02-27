import type { Segment } from '../schema-traverser';

export interface ProviderOptions {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    maxRetries?: number;
    timeoutMs?: number;
    maxCharsPerRequest?: number;
    debug?: boolean;
}

export interface LLMProvider {
    translate(
        segments: Segment[],
        sourceLocale: string,
        targetLocale: string,
        options: ProviderOptions,
        correlationId: string
    ): Promise<Segment[]>;
}
