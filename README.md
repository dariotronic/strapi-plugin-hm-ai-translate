# HM AI Strapi Translate Plugin

Una potente soluzione di traduzione per Strapi v5 che sfrutta l'Intelligenza Artificiale (OpenAI e Gemini) per tradurre in automatico i contenuti.
Il plugin aggiunge pulsanti comodi direttamente nella Content Manager Edit View per tradurre contenuti dalla lingua di default alle altre lingue in modo guidato e sicuro rispettando gli schemi, senza sovrascrivere file media o variare campi relazionali.

**Versione corrente:** `0.2.1`

## Requisiti e Compatibilità
- **Strapi**: `>=5.0.0` (testato su range 5.x)
- **Node**: `>=22.0.0`
- **TypeScript**: Supportato nativamente
- **Gestore pacchetti**: npm o yarn

## 🚀 Installazione

**Nome del plugin (npm / Strapi):** `strapi-plugin-hm-ai-translate` — ID interno Strapi: `hm-ai-strapi-translate`.

### Da npm (consigliato)

```bash
npm install strapi-plugin-hm-ai-translate
```

### Sviluppo locale (link da cartella)

Per contribuire o testare in locale puoi usare una dipendenza `file:`:

```bash
# Nel package.json del progetto: "strapi-plugin-hm-ai-translate": "file:./strapi-plugin-hm-ai-translate"
npm install
```

**Sviluppo locale:** se usi un link da cartella (`"strapi-plugin-hm-ai-translate": "file:strapi-plugin-hm-ai-translate"` nel `package.json` del progetto), la cartella del plugin deve chiamarsi esattamente `strapi-plugin-hm-ai-translate`.

### Abilitazione Plugin
Nel file `config/plugins.ts` (o `config/plugins.js` se non usi TypeScript), aggiungi la configurazione per abilitare il plugin. Se il file non esiste, crealo.

**Esempio in JavaScript (`config/plugins.js`):**
```js
module.exports = () => ({
  'hm-ai-strapi-translate': {
    enabled: true,
  }
});
```

**Esempio in TypeScript (`config/plugins.ts`):**
```ts
export default () => ({
  'hm-ai-strapi-translate': {
    enabled: true,
  }
});
```

Quindi **ricompila** il panel di amministrazione e avvia Strapi:
```bash
npm run build
npm run develop
```

## 🛠️ Configurazione (Environment Variables)

Puoi configurare il comportamento del plugin definendo le seguenti variabili nel tuo file `.env`:

| Variabile | Descrizione | Default | Esempio |
|---|---|---|---|
| `HM_AI_TRANSLATE_LLM_PROVIDER` | Provider LLM da usare (`openai` o `gemini`) | `openai` | `gemini` |
| `HM_AI_TRANSLATE_LLM_API_KEY` | (Obbligatorio) La tua API key | | `sk-xxxx` |
| `HM_AI_TRANSLATE_LLM_BASE_URL` | Base url personalizzata per OpenAI compatible APIs | | `https://api.groq.com/openai/v1` |
| `HM_AI_TRANSLATE_LLM_MODEL` | Modello LLM da utilizzare | `gpt-4o` (OpenAI)<br>`gemini-2.5-flash` (Gemini) | |
| `HM_AI_TRANSLATE_DEFAULT_LOCALE` | Locale di default da cui tradurre (fallback se l'i18n plugin non identifica il default) | | `it` |
| `HM_AI_TRANSLATE_DEBUG` | Abilita logging esteso server-side (tempi e count). Non espone testi. | `false` | `true` |
| `HM_AI_TRANSLATE_DRY_RUN` | Se `true`, esegue il fetch e il mapping ma non crea/fa update su database (simulazione) | `false` | `true` |
| `HM_AI_TRANSLATE_MAX_RETRIES` | Max tentativi in caso di 429 status (rate limit) | `3` | `5` |
| `HM_AI_TRANSLATE_TIMEOUT_MS` | Timeout per richiesta al LLM (in millisecondi) | `30000` | `60000` |
| `HM_AI_TRANSLATE_MAX_CHARS_PER_REQUEST` | Chunking logico: max caratteri per segment batch prima di splittare richieste multiple | `10000` | `10000` |

## 🛡️ Sicurezza e RBAC (Role-Based Access Control)

Il plugin protegge le API di traduzione ed integra il sistema nativo dei permessi RBAC (Role-Based Access Control) di Strapi. In particolare, prima di poter cliccare sui traduttori:

1. Vai nella dashboard Strapi in **Settings** > **Roles**.
2. Scegli il ruolo (es: _Editor_ o _Author_).
3. Vai nella sezione dei permessi **Plugins** e scorri fino a `hm-ai-strapi-translate`.
4. Spunta il box **Translate** per abilitare l'esecuzione per quel ruolo.

> **Nota**: I Super Admin hanno bypass di default e potranno sempre visualizzare l'azione se sulla locale base.

## 📝 Uso nell'interfaccia Content Manager

1. Apri una Collection Type con internazionalizzazione (i18n) abilitata.
2. Assicurati di essere in visualizzazione (Edit View) sulla **Lingua di Default** (es. `it`).
3. Sulla sidebar di destra, nella zona _Panel_ (vicino ai bottoni Publish/Save), troverai la sezione **AI Translation**.
4. Vedrai _N-1_ tasti per la traduzione (ad es. "Translate to EN", "Translate to FR").
5. Clicca. Il caricamento indicherà l'esecuzione in background e notificherà con una Toast al completamento con successo o in caso d'errore.

### Regole Rigide di Traduzione Schema-Driven (Features)
- **Campi Testuali Tradotti**: `string`, `text`, `richtext`, blocchi testuali derivati dai formati JSON structure o v5 Blocks. 
- **Media, File ed Enumerators Invariati**: Non vengono passati all'AI i riferimenti di immagini, evitando rotture nei referenziamenti UUID/URL.
- **Relazioni intatte**: I campi `relation` non vengono trasfertiti all'LLM.
- **Componenti Complesse e Zone Dinamiche**: Il parser esplorativo processa ricorsivamente nested Components e array di dynamic zones preservando l'esatta struttura dell'Oggetto.

## 🗺️ Future implementazioni

Le seguenti funzionalità sono previste ma **non ancora presenti** nella versione attuale:

- **Pagina del plugin in Strapi**: pagina dedicata nella sidebar dell'admin (es. voce "HM traduttore AI") per configurare opzioni avanzate (system prompt, temperatura LLM) senza usare solo le variabili d'ambiente.
- **Traduci tutte le localizzazioni**: pulsante unico per avviare la traduzione verso **tutte** le lingue target in un'unica azione, con feedback di avanzamento e notifiche al termine.

## 🐛 Troubleshooting

Se ricevi un errore dall'interfaccia comparirà un alert rosso contenente un **Correlation ID** (es `CorrID:a1b2c3d4`).
1. Trova quel Correlation ID nei log del container di Strapi.
2. Verifica l'errore reale, generalmente associato ad un Timeout o Rate Limit provider.
3. Se necessario, valuta di alzare le var d'ambiente come `HM_AI_TRANSLATE_MAX_RETRIES`.
4. Nel caso la risposta del completatore LLM fosse invalidata dall'AI potresti notare un errore di parsing JSON, riprova.

