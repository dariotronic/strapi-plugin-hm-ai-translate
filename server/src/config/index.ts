export default {
  default({ env }) {
    return {
      provider: env('HM_AI_TRANSLATE_LLM_PROVIDER', 'openai'),
      apiKey: env('HM_AI_TRANSLATE_LLM_API_KEY', ''),
      baseUrl: env('HM_AI_TRANSLATE_LLM_BASE_URL', ''),
      model: env('HM_AI_TRANSLATE_LLM_MODEL', ''),
      defaultLocale: env('HM_AI_TRANSLATE_DEFAULT_LOCALE', ''),
      debug: env.bool('HM_AI_TRANSLATE_DEBUG', false),
      dryRun: env.bool('HM_AI_TRANSLATE_DRY_RUN', false),
      maxRetries: env.int('HM_AI_TRANSLATE_MAX_RETRIES', 3),
      timeoutMs: env.int('HM_AI_TRANSLATE_TIMEOUT_MS', 30000),
      maxCharsPerRequest: env.int('HM_AI_TRANSLATE_MAX_CHARS_PER_REQUEST', 10000),
    };
  },
  validator() { },
};
