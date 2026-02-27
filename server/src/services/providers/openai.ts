import OpenAI from 'openai';
import type { LLMProvider, ProviderOptions } from './types';
import type { Segment } from '../schema-traverser';
import { withRetry } from '../../utils/retry';

export class OpenAIProvider implements LLMProvider {
    async translate(
        segments: Segment[],
        sourceLocale: string,
        targetLocale: string,
        options: ProviderOptions,
        correlationId: string
    ): Promise<Segment[]> {
        if (!options.apiKey) {
            throw new Error(`[CorrID:${correlationId}] OpenAI API key is missing.`);
        }

        const client = new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseUrl || undefined,
            timeout: options.timeoutMs,
        });

        const modelName = options.model || 'gpt-4o';
        const maxChars = options.maxCharsPerRequest || 10000;

        const translatedSegments: Segment[] = [];

        // Chunking logic
        let currentChunk: Segment[] = [];
        let currentLength = 0;

        for (const seg of segments) {
            if (currentLength + seg.text.length > maxChars && currentChunk.length > 0) {
                const translatedChunk = await this.processChunk(client, currentChunk, sourceLocale, targetLocale, modelName, options.maxRetries || 3, correlationId);
                translatedSegments.push(...translatedChunk);
                currentChunk = [];
                currentLength = 0;
            }
            currentChunk.push(seg);
            currentLength += seg.text.length;
        }

        if (currentChunk.length > 0) {
            const translatedChunk = await this.processChunk(client, currentChunk, sourceLocale, targetLocale, modelName, options.maxRetries || 3, correlationId);
            translatedSegments.push(...translatedChunk);
        }

        return translatedSegments;
    }

    private async processChunk(
        client: OpenAI,
        chunk: Segment[],
        source: string,
        target: string,
        model: string,
        maxRetries: number,
        correlationId: string
    ): Promise<Segment[]> {
        const texts = chunk.map(c => c.text);
        const systemPrompt = `You are a professional translator. Translate the following JSON array of strings from ${source} to ${target}.
Keep the exact same JSON array structure and order. Do not translate the JSON keys or structure, only the array values. Preserve any HTML or markdown formatting perfectly. Respond ONLY with valid JSON array of strings.`;

        const operation = async () => {
            const response = await client.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(texts) }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }.type === 'json_object' ? undefined : undefined // fallback if needed, better to just rely on system prompt, or use JSON schema
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error(`[CorrID:${correlationId}] Empty response from OpenAI`);
            }

            // Extract array
            const jsonStart = content.indexOf('[');
            const jsonEnd = content.lastIndexOf(']');
            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error(`[CorrID:${correlationId}] Failed to parse JSON array from OpenAI response: ${content}`);
            }
            const jsonStr = content.substring(jsonStart, jsonEnd + 1);
            const translatedTexts: string[] = JSON.parse(jsonStr);

            if (translatedTexts.length !== chunk.length) {
                throw new Error(`[CorrID:${correlationId}] Array length mismatch in OpenAI response.`);
            }

            return chunk.map((seg, i) => ({
                ...seg,
                text: translatedTexts[i]
            }));
        };

        return withRetry(operation, maxRetries);
    }
}
