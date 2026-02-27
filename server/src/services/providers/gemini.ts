import type { LLMProvider, ProviderOptions } from './types';
import type { Segment } from '../schema-traverser';
import { withRetry } from '../../utils/retry';

export class GeminiProvider implements LLMProvider {
    async translate(
        segments: Segment[],
        sourceLocale: string,
        targetLocale: string,
        options: ProviderOptions,
        correlationId: string
    ): Promise<Segment[]> {
        if (!options.apiKey) {
            throw new Error(`[CorrID:${correlationId}] Gemini API key is missing.`);
        }

        const modelName = options.model || 'gemini-2.5-flash';
        const apiBase = (options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models/').replace(/\/$/, '');
        // If baseUrl already contains the full endpoint (has :generateContent), use it as-is.
        // Otherwise treat it as the models base and append the model + action.
        const endpointUrl = apiBase.includes(':generateContent')
            ? apiBase
            : `${apiBase}/${modelName}:generateContent`;
        const maxChars = options.maxCharsPerRequest || 10000;

        const translatedSegments: Segment[] = [];
        let currentChunk: Segment[] = [];
        let currentLength = 0;

        for (const seg of segments) {
            if (currentLength + seg.text.length > maxChars && currentChunk.length > 0) {
                const translatedChunk = await this.processChunk(endpointUrl, currentChunk, sourceLocale, targetLocale, options, correlationId);
                translatedSegments.push(...translatedChunk);
                currentChunk = [];
                currentLength = 0;
            }
            currentChunk.push(seg);
            currentLength += seg.text.length;
        }

        if (currentChunk.length > 0) {
            const translatedChunk = await this.processChunk(endpointUrl, currentChunk, sourceLocale, targetLocale, options, correlationId);
            translatedSegments.push(...translatedChunk);
        }

        return translatedSegments;
    }

    private async processChunk(
        url: string,
        chunk: Segment[],
        source: string,
        target: string,
        options: ProviderOptions,
        correlationId: string
    ): Promise<Segment[]> {
        const texts = chunk.map(c => c.text);
        const systemInstruction = `You are a professional translator. Translate the following JSON array of strings from ${source} to ${target}. Keep the exact JSON array structure and order. Preserve any HTML or markdown formatting. Respond ONLY with the JSON array.`;

        const body = {
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            contents: [{
                parts: [{ text: JSON.stringify(texts) }]
            }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
            }
        };

        const operation = async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 30000);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-goog-api-key': options.apiKey,
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const err: any = new Error(`[CorrID:${correlationId}] Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
                    err.status = response.status;
                    throw err;
                }

                const json = await response.json() as any;
                const content = json.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!content) {
                    throw new Error(`[CorrID:${correlationId}] Empty response from Gemini`);
                }

                const translatedTexts: string[] = JSON.parse(content);
                if (translatedTexts.length !== chunk.length) {
                    throw new Error(`[CorrID:${correlationId}] Array length mismatch in Gemini response.`);
                }

                return chunk.map((seg, i) => ({
                    ...seg,
                    text: translatedTexts[i]
                }));
            } finally {
                clearTimeout(timeoutId);
            }
        };

        return withRetry(operation, options.maxRetries || 3);
    }
}
