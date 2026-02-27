import type { Core } from '@strapi/strapi';
import { generateCorrelationId, logWithPrefix } from '../utils/correlation';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
    async translate(ctx: any) {
        const correlationId = generateCorrelationId();
        try {
            const { uid, documentId, sourceLocale, targetLocale } = ctx.request.body;

            if (!uid || !documentId || !sourceLocale || !targetLocale) {
                return ctx.badRequest('Missing required fields: uid, documentId, sourceLocale, targetLocale');
            }

            const result = await strapi
                .plugin('hm-ai-strapi-translate')
                .service('translate')
                .translateDocument(uid, documentId, sourceLocale, targetLocale, correlationId);

            ctx.body = { ...result, correlationId };
        } catch (err: any) {
            logWithPrefix(strapi, { correlationId }, 'error', 'Translation failed', err);

            const status = err.status || 500;
            ctx.status = status;
            ctx.body = {
                ok: false,
                error: {
                    message: err.message || 'Internal Server Error',
                    code: status,
                },
                correlationId
            };
        }
    },
});
