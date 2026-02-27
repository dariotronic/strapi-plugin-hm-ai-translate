import type { Core } from '@strapi/strapi';
import { SchemaTraverser, Segment } from './schema-traverser';
import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { logWithPrefix } from '../utils/correlation';
import type { ProviderOptions } from './providers/types';

// Campi interni di Strapi da ignorare durante la traversata del documento sorgente.
// Stessi valori usati da @strapi/i18n nel servizio ai-localizations.
const UNSUPPORTED_ATTRIBUTE_TYPES = ['media', 'relation', 'boolean', 'enumeration'];

/**
 * Converte un testo (es. titolo tradotto) in uno slug URL-safe:
 * minuscolo, senza accenti, spazi → trattini, solo lettere/cifre/trattini.
 * Allineato al comportamento tipico degli UID in Strapi.
 */
function slugify(text: string): string {
    if (!text || typeof text !== 'string') return '';
    return text
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Restituisce l'oggetto "parent" in `data` per il path dato (es. "seo.metaSocial.0" → data.seo.metaSocial[0]).
 * Usato per leggere il valore di targetField dallo stesso contenitore del campo UID.
 */
function getParentObject(data: any, pathRaw: string): any {
    if (!pathRaw || !data) return data;
    const parts = pathRaw.split('.');
    if (parts.length <= 1) return data;
    const parentPath = parts.slice(0, -1);
    let cur: any = data;
    for (const p of parentPath) {
        cur = cur?.[p];
    }
    return cur;
}

/**
 * Restituisce il valore in `obj` al path dato (es. ['seo','metaTitle'] → obj.seo.metaTitle).
 */
function getValueAtPath(obj: any, pathParts: (string | number)[]): any {
    let cur: any = obj;
    for (const p of pathParts) {
        cur = cur?.[p];
    }
    return cur;
}

/**
 * Imposta il valore in `obj` al path dato, creando oggetti/array intermedi se servono.
 */
function setValueAtPath(obj: any, pathParts: (string | number)[], value: any): void {
    let cur = obj;
    for (let i = 0; i < pathParts.length - 1; i++) {
        const key = pathParts[i];
        const nextKey = pathParts[i + 1];
        if (cur[key] === undefined) {
            cur[key] = typeof nextKey === 'number' ? [] : {};
        }
        cur = cur[key];
    }
    if (pathParts.length > 0) {
        cur[pathParts[pathParts.length - 1]] = value;
    }
}

/**
 * Copia nel payload merged i valori dei campi UID presenti nel documento esistente (target).
 * Serve quando si aggiorna una localizzazione già esistente: gli slug possono venire da import
 * con redirect/SEO; non vanno sovrascritti. Se il campo UID nel documento esistente ha valore,
 * si mantiene quello; altrimenti resta quello generato da targetField (se presente).
 */
function preserveExistingUidValues(
    mergedData: any,
    existingDoc: any,
    schema: any,
    getModel: (uid: string) => any,
    pathPrefix: (string | number)[] = []
): void {
    if (!existingDoc || !schema?.attributes) return;
    const attrs = schema.attributes as Record<string, { type?: string; component?: string; components?: string[] }>;
    for (const key of Object.keys(attrs)) {
        const attribute = attrs[key];
        const pathParts = [...pathPrefix, key];
        const existingVal = getValueAtPath(existingDoc, pathParts);

        if (attribute.type === 'uid') {
            if (typeof existingVal === 'string' && existingVal.trim()) {
                setValueAtPath(mergedData, pathParts, existingVal.trim());
            }
            continue;
        }
        if (attribute.type === 'component' && attribute.component) {
            const compSchema = getModel(attribute.component);
            const nested = getValueAtPath(existingDoc, pathParts);
            if (nested && compSchema) {
                preserveExistingUidValues(
                    mergedData,
                    existingDoc,
                    compSchema,
                    getModel,
                    pathParts
                );
            }
        }
        if (attribute.type === 'dynamiczone' && Array.isArray(attribute.components)) {
            const arr = getValueAtPath(existingDoc, pathParts);
            if (Array.isArray(arr)) {
                arr.forEach((item: any, i: number) => {
                    const compUid = item?.__component;
                    if (compUid) {
                        const compSchema = getModel(compUid);
                        if (compSchema) {
                            preserveExistingUidValues(
                                mergedData,
                                existingDoc,
                                compSchema,
                                getModel,
                                [...pathParts, i]
                            );
                        }
                    }
                });
            }
        }
    }
}

/**
 * Tronca il testo al limite maxLength rispettando le parole.
 * Usa `…` (ellipsis unicode, 1 carattere) per segnalare il troncamento.
 * Se il testo è già dentro il limite restituisce il testo invariato.
 */
function truncateToMaxLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    const ellipsis = '…'; // 1 carattere unicode, più compatto di '...'
    const limit = maxLength - 1; // spazio per l'ellipsis
    const shortened = text.substring(0, limit);
    // Tronca all'ultimo spazio se è almeno al 60% del limite (evita tagli troppo drastici)
    const lastSpace = shortened.lastIndexOf(' ');
    if (lastSpace > limit * 0.6) {
        return shortened.substring(0, lastSpace).trimEnd() + ellipsis;
    }
    return shortened.trimEnd() + ellipsis;
}
const IGNORED_FIELDS = ['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale', 'updatedBy', 'createdBy', 'localizations'];

/**
 * Deep merge dove i valori di `target` hanno priorità su `source`.
 * Gli array vengono fusi per indice per allineare repeatable components / dynamic zone.
 * Replica di deepMerge da @strapi/i18n/server/services/ai-localizations.ts.
 */
function deepMerge(source: any, target: any): any {
    const result = { ...source };
    for (const key of Object.keys(target)) {
        const sourceVal = source[key];
        const targetVal = target[key];
        if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
            result[key] = targetVal.map((item: any, i: number) => {
                if (item && typeof item === 'object' && sourceVal[i] && typeof sourceVal[i] === 'object') {
                    return deepMerge(sourceVal[i], item);
                }
                return item;
            });
        } else if (targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal) &&
            sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
            result[key] = deepMerge(sourceVal, targetVal);
        } else {
            result[key] = targetVal;
        }
    }
    return result;
}

/**
 * Estrae dal documento sorgente (con deep populate) i campi non traducibili
 * (media, boolean, enumeration, relazioni) e li fonde con i campi di testo tradotti.
 *
 * RELAZIONI VERSO CT LOCALIZZATI:
 * Strapi v5 cerca la versione nella locale target quando risolve i documentId via
 * transformData(). Se quella versione non esiste lancia ValidationError. Per gestire
 * correttamente sia il caso "esiste" (es. categoria_esplora in tedesco) che "non esiste"
 * (es. categoria_cosa_fare non ancora tradotta), si fa un pre-check via DB:
 * si includono solo gli item che hanno effettivamente una versione nella locale target.
 *
 * MEDIA: vengono copiati come oggetti completi. transformData() non processa i campi
 * media (processa solo i `relation`), quindi l'oggetto passa all'entity validator
 * che accetta la presenza di `id` nel payload.
 *
 * @param targetData    - Dati con solo i campi di testo tradotti
 * @param sourceDoc     - Documento sorgente con deep populate
 * @param schema        - Schema del content type (strapi.getModel(uid))
 * @param getModel      - Funzione per risolvere gli schema dei componenti annidati
 * @param strapiInstance - Istanza di Strapi per le query DB (opzionale)
 * @param targetLocale  - Locale target della traduzione (opzionale)
 */
async function mergeUnsupportedFields(
    targetData: any,
    sourceDoc: any,
    schema: any,
    getModel: any,
    strapiInstance?: any,
    targetLocale?: string
): Promise<any> {
    if (!sourceDoc) return targetData;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { traverseEntity } = require('@strapi/utils');

    // Tiene traccia dei path di campi relation/media da preservare per non rimuovere
    // i loro campi interni durante la ricorsione di traverseEntity (es. id, url).
    const preservedPaths = new Set<string>();

    const unsupportedFieldsOnly = await traverseEntity(
        async ({ key, attribute, path, value }: any, { remove, set }: any) => {
            // Se siamo dentro un sottoalbero relation/media già marcato come preservato,
            // preserviamo tutto (inclusi id, url, e qualsiasi campo interno).
            const isInsidePreservedSubtree = path.raw &&
                Array.from(preservedPaths).some((pp: any) => path.raw.startsWith(`${pp}.`));
            if (isInsidePreservedSubtree) {
                preservedPaths.add(path.raw);
                return;
            }

            if (IGNORED_FIELDS.includes(key)) { remove(key); return; }
            if (!attribute) return; // es. __component nelle dynamic zone: preserva

            if (attribute.type === 'relation') {
                const targetModel = attribute.target ? getModel(attribute.target) : null;
                const isLocalizedTarget = targetModel?.pluginOptions?.i18n?.localized === true;

                if (isLocalizedTarget && strapiInstance && targetLocale && attribute.target) {
                    // Pre-check via DB: quali item hanno una versione nella locale target?
                    // Strapi v5 cercherà esattamente questi documentId + locale target.
                    // Item senza versione nella locale target vengono omessi (invece di causare
                    // ValidationError "Document not found in locale X").
                    const items: any[] = Array.isArray(value) ? value : (value ? [value] : []);
                    const docIds = items.map((item: any) => item?.documentId).filter(Boolean);

                    if (docIds.length > 0) {
                        const existing = await strapiInstance.db.query(attribute.target).findMany({
                            where: { documentId: { $in: docIds }, locale: targetLocale },
                            select: ['documentId'],
                        });
                        const existingDocIds = new Set(existing.map((e: any) => e.documentId));
                        const filtered = items.filter((item: any) => item?.documentId && existingDocIds.has(item.documentId));

                        if (filtered.length > 0) {
                            const newVal = Array.isArray(value) ? filtered : filtered[0];
                            set(key, newVal);
                            preservedPaths.add(path.raw);
                        } else {
                            remove(key); // Nessuna versione trovata nella locale target
                        }
                    } else {
                        remove(key); // Nessun documentId da verificare
                    }
                } else if (isLocalizedTarget) {
                    // Nessun accesso a DB disponibile: rimuovi per sicurezza
                    remove(key);
                } else {
                    // CT non-localizzato: la relazione è la stessa per tutte le locale
                    preservedPaths.add(path.raw);
                }
                return;
            }

            if (attribute.type === 'media') {
                // Media non ha vincoli di locale: si copia il riferimento al file.
                preservedPaths.add(path.raw);
                return;
            }

            // UID (es. slug): lo schema può definire targetField (es. "titolo") da cui generare lo slug.
            // Se c'è targetField, generiamo lo slug dal valore tradotto di quel campo; altrimenti copia dal sorgente.
            if (attribute.type === 'uid') {
                const targetField = (attribute as any).targetField;
                if (targetField && targetData) {
                    const parent = getParentObject(targetData, path.raw);
                    const sourceText = parent && parent[targetField];
                    if (typeof sourceText === 'string' && sourceText.trim()) {
                        const slug = slugify(sourceText);
                        if (slug) set(key, slug);
                        else return; // slugify vuoto: mantieni valore sorgente
                    }
                }
                return; // nessun targetField o valore mancante: preserva dal sorgente
            }

            if (UNSUPPORTED_ATTRIBUTE_TYPES.includes(attribute.type)) return; // preserva (boolean, enumeration)
            if (attribute.type === 'component' || attribute.type === 'dynamiczone') return; // traverseEntity ricorsa al loro interno
            remove(key); // rimuove i campi traducibili (string, text, richtext, ecc.)
        },
        { schema, getModel },
        sourceDoc
    );

    // Deep merge: testo tradotto ha priorità sui campi non supportati del sorgente
    return deepMerge(unsupportedFieldsOnly, targetData);
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
    async translateDocument(uid: string, documentId: string, sourceLocale: string, targetLocale: string, correlationId: string) {
        const startTime = Date.now();
        const config = strapi.plugin('hm-ai-strapi-translate').config;

        // 1. Fetch Source Document con deep populate
        //
        // Usiamo il populate-builder del content-manager — lo stesso servizio che usa Strapi
        // internamente per il content-manager e per le AI localizations (@strapi/i18n) —
        // per ottenere un populate completo di tutti i campi annidati: media dentro i componenti
        // SEO, relazioni a qualsiasi profondità, dynamic zone con i loro componenti, ecc.
        //
        // populate: '*' popola solo il primo livello; populateDeep(Infinity) entra in tutti
        // i componenti e le zone dinamiche ricorsivamente, che è quello che serve per poter
        // poi copiare correttamente il documento sorgente nella nuova localizzazione.
        const populateBuilderService = (strapi as any).plugin('content-manager').service('populate-builder');
        const deepPopulate = await populateBuilderService(uid).populateDeep(Infinity).build();

        const sourceDoc = await strapi.documents(uid as any).findOne({
            documentId,
            locale: sourceLocale,
            populate: deepPopulate,
        });

        if (!sourceDoc) {
            throw new Error(`Source document not found: ${documentId} (${sourceLocale})`);
        }

        // 2. Check if Target Locale Exists
        // findOne restituisce null (senza lanciare) se la locale non esiste.
        let targetDocExists = false;
        let existingTargetDoc: any = null;
        try {
            existingTargetDoc = await strapi.documents(uid as any).findOne({
                documentId,
                locale: targetLocale,
            });
            if (existingTargetDoc) {
                targetDocExists = true;
            }
        } catch (_e) {
            // Locale non presente: targetDocExists rimane false
        }

        // 3. Extract Segments
        const traverser = new SchemaTraverser(strapi);
        const segments = traverser.extract(uid, sourceDoc);

        const meta = { correlationId, uid, documentId, sourceLocale, targetLocale, segmentsCount: segments.length };

        if (config("debug")) {
            logWithPrefix(strapi, meta, 'info', `Extracted ${segments.length} segments.`);
        }

        // 4. Translate Segments
        let translatedSegments: Segment[] = [];
        if (segments.length > 0) {
            if (config("dryRun")) {
                logWithPrefix(strapi, meta, 'info', 'DRY RUN: Skipping LLM provider call.');
                translatedSegments = segments.map(s => ({ ...s, text: `[TR:${targetLocale}] ${s.text}` }));
            } else {
                const providerName = config('provider') || 'openai';
                const providerOptions: ProviderOptions = {
                    apiKey: config('apiKey') as string,
                    baseUrl: config('baseUrl') as string | undefined,
                    model: config('model') as string | undefined,
                    maxRetries: config('maxRetries') as number | undefined,
                    timeoutMs: config('timeoutMs') as number | undefined,
                    maxCharsPerRequest: config('maxCharsPerRequest') as number | undefined,
                    debug: config('debug') as boolean | undefined,
                };

                const provider = providerName === 'gemini' ? new GeminiProvider() : new OpenAIProvider();
                translatedSegments = await provider.translate(segments, sourceLocale, targetLocale, providerOptions, correlationId);
            }

            // Tronca i segmenti che superano il maxLength definito nello schema.
            // Il testo tradotto può essere più lungo dell'originale (es. tedesco vs italiano):
            // se il campo ha un vincolo maxLength, Strapi lancerà ValidationError al salvataggio.
            translatedSegments = translatedSegments.map(seg => {
                if (seg.meta.maxLength && seg.text.length > seg.meta.maxLength) {
                    return { ...seg, text: truncateToMaxLength(seg.text, seg.meta.maxLength) };
                }
                return seg;
            });
        }

        // 5. Save back to DB
        if (config("dryRun")) {
            logWithPrefix(strapi, { ...meta, durationMs: Date.now() - startTime }, 'info', 'DRY RUN: Translation successful, skipped DB write.');
            return { ok: true, created: !targetDocExists, updated: targetDocExists, stats: { segments: segments.length, durationMs: Date.now() - startTime } };
        }

        if (!targetDocExists) {
            // === CASO: locale target non esiste ancora → CREA la localizzazione ===
            //
            // Usiamo lo stesso meccanismo usato da Strapi per popolare una nuova localizzazione
            // dal content-manager: mergeUnsupportedFields() del plugin @strapi/i18n.
            //
            // Il problema da risolvere: quando si crea una nuova locale via update() (che in
            // Strapi v5 è un upsert), il Document Service esegue transformData() che tenta di
            // risolvere i documentId delle relazioni nella locale target. Se quelle relazioni
            // non esistono ancora nella locale target → errore "Document with id X, locale Y not found".
            //
            // La soluzione di Strapi: includere nel payload le relazioni come oggetti completi
            // con il loro campo `locale` (es. `locale: 'it'`). In questo modo, la funzione
            // getRelationTargetLocale() in data-ids.ts usa `relation.locale` (invece di
            // fallback alla locale target) per determinare in quale locale cercare la relazione
            // → trova la categoria italiana → nessun errore.
            //
            // mergeUnsupportedFields() fa esattamente questo: estrae dal documento sorgente
            // (fetchato con deep populate) i campi che il traduttore LLM non gestisce
            // (media, relazioni, boolean, enumeration) e li fonde con i campi di testo tradotti,
            // preservando tutto l'albero degli oggetti annidati (es. media dentro il componente SEO).

            // Ottieni solo i campi di testo tradotti (senza il documento sorgente come base)
            const translatedTextOnly = traverser.apply(uid, {}, translatedSegments);
            const { id: _id, documentId: _did, locale: _loc, createdAt: _ca, updatedAt: _ua, publishedAt: _pa, ...cleanTranslatedText } = translatedTextOnly as any;

            // Replica di mergeUnsupportedFields del plugin @strapi/i18n (ai-localizations.ts).
            // Non si può importare direttamente il file interno perché @strapi/i18n restringe
            // i subpath accessibili tramite il campo "exports" del suo package.json.
            // Si usa invece @strapi/utils.traverseEntity che è l'unica dipendenza necessaria.
            const schema = (strapi as any).getModel(uid);
            const getModel = (strapi as any).getModel.bind(strapi);

            // Fonde: testo tradotto (priorità alta) + campi non supportati dal sorgente (media, relazioni, ecc.)
            // Passa strapi e targetLocale per il pre-check delle relazioni localizzate via DB.
            const mergedData = await mergeUnsupportedFields(cleanTranslatedText, sourceDoc, schema, getModel as any, strapi, targetLocale);

            // update() in Strapi v5 è un UPSERT per le localizzazioni:
            // se la locale non esiste ma il documento esiste → la CREA copiando i campi
            // non-localizzati tramite copyNonLocalizedFields() + salva i dati forniti.
            await strapi.documents(uid as any).update({
                documentId,
                locale: targetLocale,
                data: mergedData,
            });

            logWithPrefix(strapi, { ...meta, durationMs: Date.now() - startTime, phase: 'create' }, 'info', 'Created translated document.');
            return { ok: true, created: true, updated: false, stats: { segments: segments.length, durationMs: Date.now() - startTime } };

        } else {
            // === CASO: locale target esiste già → merge come in creazione, ma UID invariati ===
            //
            // Stesso merge di create: testo tradotto + campi non testuali dal sorgente (media,
            // relazioni con check locale target, boolean, enumeration, uid da targetField).
            // Poi si sovrascrivono i campi UID con i valori già presenti nel documento target,
            // così slug/redirect esistenti (es. da import sito vecchio) non vengono toccati.
            const translatedTextOnly = traverser.apply(uid, {}, translatedSegments);
            const { id: _id, documentId: _did, locale: _loc, createdAt: _ca, updatedAt: _ua, publishedAt: _pa, ...cleanTranslatedText } = translatedTextOnly as any;

            const schema = (strapi as any).getModel(uid);
            const getModel = (strapi as any).getModel.bind(strapi);

            const mergedData = await mergeUnsupportedFields(cleanTranslatedText, sourceDoc, schema, getModel as any, strapi, targetLocale);

            // Se il documento target ha già un valore per un campo UID (es. slug), lo si mantiene.
            preserveExistingUidValues(mergedData, existingTargetDoc, schema, getModel as any);

            await strapi.documents(uid as any).update({
                documentId,
                locale: targetLocale,
                data: mergedData,
            });

            logWithPrefix(strapi, { ...meta, durationMs: Date.now() - startTime, phase: 'update' }, 'info', 'Updated translated document.');
            return { ok: true, created: false, updated: true, stats: { segments: segments.length, durationMs: Date.now() - startTime } };
        }
    }
});
