export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    baseDelayMs: number = 1000
): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error: any) {
            attempt++;
            if (attempt >= maxRetries) {
                throw error;
            }

            // Check if it's a rate limit (429) or transient server error (5xx)
            const status = error.status || error.response?.status;
            if (status && status !== 429 && (status < 500 || status >= 600)) {
                // Not a retriable error
                throw error;
            }

            // Exponential backoff with jitter
            const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000, 10000);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw new Error('Unreachable');
}
