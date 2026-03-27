import type { Core } from '@strapi/strapi';

/**
 * Normalizza un path di segmento (es. ["gallery", 0, "caption"]) rimuovendo
 * gli indici numerici e unendo con "." → "gallery.caption".
 */
function normalizePath(path: (string | number)[]): string {
    return path.filter((p) => typeof p === 'string').join('.');
}

export default ({ strapi }: { strapi: Core.Strapi }) => {
    // Cache lazy: collectionName → uid  e  uid → Set<fieldPath>
    let resolvedMap: Map<string, Set<string>> | null = null;

    function resolve(): Map<string, Set<string>> {
        if (resolvedMap) return resolvedMap;

        const blacklistConfig: Record<string, { kind?: string; fields: string[] }> =
            strapi.plugin('hm-ai-strapi-translate').config('blacklist') || {};

        // Costruisce collectionName → uid
        const collectionNameToUid = new Map<string, string>();
        for (const [uid, ct] of Object.entries(strapi.contentTypes)) {
            if ((ct as any).collectionName) {
                collectionNameToUid.set((ct as any).collectionName, uid);
            }
        }

        resolvedMap = new Map<string, Set<string>>();

        for (const [collectionName, entry] of Object.entries(blacklistConfig)) {
            const uid = collectionNameToUid.get(collectionName);
            if (!uid) {
                strapi.log.warn(
                    `[hm-ai-translate] blacklist: collectionName "${collectionName}" not found in content types, skipping.`
                );
                continue;
            }
            resolvedMap.set(uid, new Set(entry.fields));
        }

        return resolvedMap;
    }

    return {
        /**
         * Verifica se un campo è in blacklist per il content type dato.
         * @param uid   - UID del content type (es. "api::strutture.struttura")
         * @param fieldPath - Path del campo come array (es. ["titolo"] o ["seo", 0, "metaTitle"])
         */
        isBlacklisted(uid: string, fieldPath: (string | number)[]): boolean {
            const map = resolve();
            const fields = map.get(uid);
            if (!fields) return false;
            return fields.has(normalizePath(fieldPath));
        },

        /**
         * Restituisce il Set dei field path blacklistati per un dato uid.
         * Utile per mergeUnsupportedFields dove si lavora con path.raw (stringa).
         */
        getBlacklistedFields(uid: string): Set<string> {
            const map = resolve();
            return map.get(uid) || new Set();
        },

        /**
         * Normalizza un path raw di traverseEntity (es. "seo.metaSocial.0.title")
         * rimuovendo i segmenti numerici → "seo.metaSocial.title".
         */
        normalizeRawPath(rawPath: string): string {
            return rawPath
                .split('.')
                .filter((p) => !/^\d+$/.test(p))
                .join('.');
        },
    };
};
