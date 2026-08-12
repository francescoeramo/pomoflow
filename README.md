# Pomoflow

Pomoflow è un timer Pomodoro responsive con durate configurabili, numero di sessioni per ciclo personalizzabile e player Spotify incorporato. Le preferenze restano nel browser dell'utente: non servono account, database o variabili d'ambiente.

## Funzioni principali

- modalità focus, pausa breve e pausa lunga;
- durate da 1 a 180 minuti;
- ciclo configurabile da 1 a 12 sessioni focus;
- timer accurato anche quando la scheda del browser viene rallentata;
- link pubblici Spotify per playlist, album, brani, artisti, podcast ed episodi;
- preferenze salvate localmente nel browser;
- interfaccia responsive e utilizzabile da tastiera.

## Requisiti

- Node.js 22.13 o successivo;
- npm 10 o successivo.

Non sono richiesti database, account esterni, file `.env` o credenziali Spotify.

## Avvio completo in locale

Clona la repository, entra nella cartella e installa esattamente le dipendenze del lockfile:

```bash
git clone https://github.com/francescoeramo/pomoflow.git
cd pomoflow
npm ci
```

Avvia l'ambiente di sviluppo:

```bash
npm run dev
```

Apri l'indirizzo mostrato nel terminale, normalmente `http://localhost:3000`.

Per provare localmente la build di produzione:

```bash
npm run build
npm start
```

## Controlli di qualità

```bash
npm run lint
npm test
```

`npm test` crea una build completa e verifica il rendering server, i contenuti principali e le intestazioni di sicurezza.

## Struttura essenziale

- `app/page.tsx`: timer, ciclo delle sessioni, preferenze locali e player Spotify;
- `app/globals.css`: layout responsive e stile;
- `app/layout.tsx`: metadati e social preview;
- `worker/index.ts`: ingresso Cloudflare/Sites e intestazioni di sicurezza;
- `next.config.ts`: configurazione equivalente per Next.js/Vercel;
- `tests/rendered-html.test.mjs`: test del risultato compilato.

## Privacy e sicurezza

Pomoflow non invia a un backend le durate o il link Spotify scelto. I dati vengono conservati solo in `localStorage`. Il player è l'embed ufficiale di `open.spotify.com`; URL con protocolli o host diversi vengono rifiutati. Le risposte applicano policy contro framing, MIME sniffing e accesso non necessario a fotocamera, microfono, posizione, pagamenti e USB.

## Deploy su Vercel

Dopo aver installato e autenticato la CLI Vercel:

```bash
vercel link
vercel --prod
```

Il progetto non richiede variabili d'ambiente anche in produzione.
