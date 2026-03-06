/**
 * Label utility – reads UI language from env var SET_LABEL_LANG.
 *
 * In the Vite-based Strapi admin, prefix it as VITE_SET_LABEL_LANG in .env.
 * Falls back to 'en' when the variable is missing or the language is unsupported.
 *
 * Usage:
 *   customLabel('AI Translation')
 *   customLabel('Translated to {locale} successfully!', { locale: 'it' })
 */

const SUPPORTED_LANGS = ['en', 'it'] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

const dictionary: Record<string, Record<Lang, string>> = {
  'AI Translation': {
    en: 'AI Translation',
    it: 'Traduzione AI',
  },
  'Translate to {locale}': {
    en: 'Translate to {locale}',
    it: 'Traduci in {locale}',
  },
  'Translated to {locale} successfully!': {
    en: 'Translated to {locale} successfully!',
    it: 'Traduzione in {locale} completata con successo!',
  },
  'Translation failed. Correlation ID: {id}': {
    en: 'Translation failed. Correlation ID: {id}',
    it: 'Traduzione fallita. ID correlazione: {id}',
  },
  'How it works': {
    en: 'How it works',
    it: 'Come funziona',
  },
  'how-it-works-body': {
    en: 'Select a target language to automatically translate the content from the default locale using AI.\n\nThe translation may take a few seconds depending on the size of the content. Once completed, the translated content will replace any existing content in the selected locale.\n\nImportant: the panel is only visible when editing content in the default locale.',
    it: 'Seleziona una lingua di destinazione per tradurre automaticamente il contenuto dalla lingua predefinita tramite AI.\n\nLa traduzione può richiedere alcuni secondi in base alla dimensione del contenuto. Una volta completata, il contenuto tradotto sostituirà quello esistente nella lingua selezionata.\n\nSe la versione del file non esiste nella lingua che si vuole tradurre, questa verrà generata da zero.\n\nImportante: questo pannello è visibile solo quando si modifica il contenuto nella lingua predefinita del sistema.',
  },
  'Translation info': {
    en: 'Translation info',
    it: 'Info traduzione',
  },
  'Close': {
    en: 'Close',
    it: 'Chiudi',
  },
  'Find out more': {
    en: 'Find out more',
    it: 'Scopri come funziona'
  }
};

// Maps locale codes to human-readable names per UI language.
// Add new locales here as needed.
const localeNames: Record<string, Record<Lang, string>> = {
  en: { en: 'English', it: 'inglese' },
  it: { en: 'Italian', it: 'italiano' },
  fr: { en: 'French', it: 'francese' },
  es: { en: 'Spanish', it: 'spagnolo' },
  de: { en: 'German', it: 'tedesco' },
  pt: { en: 'Portuguese', it: 'portoghese' },
  nl: { en: 'Dutch', it: 'olandese' },
  ru: { en: 'Russian', it: 'russo' },
  zh: { en: 'Chinese', it: 'cinese' },
  ja: { en: 'Japanese', it: 'giapponese' },
  ar: { en: 'Arabic', it: 'arabo' },
};

/**
 * Returns the human-readable name of a locale code (e.g. 'en' -> 'inglese')
 * in the current UI language. Falls back to the raw code if unknown.
 */
export function getLocaleName(code: string): string {
  const lang = getLang();
  return localeNames[code]?.[lang] ?? localeNames[code]?.['en'] ?? code;
}

function getLang(): Lang {
  let raw: string | undefined;
  try {
    // Strapi v5 admin uses envPrefix 'STRAPI_ADMIN_' by default.
    // Also try VITE_ and unprefixed variants for flexibility.
    // @ts-ignore – keys may not exist at type level
    const env = typeof import.meta !== 'undefined' ? import.meta.env : {};
    raw =
      env?.STRAPI_ADMIN_SET_LABEL_LANG ||
      env?.VITE_SET_LABEL_LANG ||
      env?.SET_LABEL_LANG;
  } catch {
    // import.meta not available
  }
  if (!raw) {
    try {
      // Fallback: process.env may be replaced at build time
      raw = process.env.STRAPI_ADMIN_SET_LABEL_LANG || process.env.SET_LABEL_LANG;
    } catch {
      // process not available
    }
  }
  raw = raw || 'en';
  // Debug: remove this log once you confirm the env var is picked up
  // @ts-ignore
  console.log('[customLabel] detected lang:', raw, '| import.meta.env:', typeof import.meta !== 'undefined' ? import.meta.env : 'N/A');
  return (SUPPORTED_LANGS as readonly string[]).includes(raw) ? (raw as Lang) : 'en';
}

export function customLabel(key: string, vars?: Record<string, string>): string {
  const lang = getLang();
  let result = dictionary[key]?.[lang] ?? dictionary[key]?.['en'] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(`{${k}}`, v);
    }
  }
  return result;
}
