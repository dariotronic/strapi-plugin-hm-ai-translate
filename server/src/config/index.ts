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
      blacklist: {},
    };
  },
  validator(config: any) {
    if (config.blacklist && typeof config.blacklist === 'object') {
      for (const [key, entry] of Object.entries(config.blacklist)) {
        const val = entry as any;
        if (!val || typeof val !== 'object') {
          throw new Error(`blacklist["${key}"] must be an object with { kind, fields }`);
        }
        if (val.kind && !['collectionType', 'singleType'].includes(val.kind)) {
          throw new Error(`blacklist["${key}"].kind must be "collectionType" or "singleType"`);
        }
        if (!Array.isArray(val.fields) || !val.fields.every((f: any) => typeof f === 'string')) {
          throw new Error(`blacklist["${key}"].fields must be an array of strings`);
        }
      }
    }
  },
};
