# Pomoflow

Pomoflow è un timer Pomodoro responsive con durate configurabili, numero di sessioni per ciclo personalizzabile e un player Spotify Embed ufficiale. Le preferenze non sensibili restano nel browser; autenticazione e riproduzione sono isolate nel dominio Spotify e Pomoflow non riceve token OAuth.

## Funzioni principali

- modalità focus, pausa breve e pausa lunga;
- durate da 1 a 180 minuti;
- ciclo configurabile da 1 a 12 sessioni focus;
- timer accurato anche quando la scheda del browser viene rallentata;
- login e sessione gestiti direttamente da Spotify nel player incorporato;
- riproduzione di playlist, album, artisti e brani tramite l'Embed ufficiale;
- nessun endpoint OAuth, client ID o token Spotify gestito da Pomoflow;
- preferenze salvate localmente nel browser;
- interfaccia responsive e utilizzabile da tastiera.

## Requisiti

- Node.js 22.13 o successivo;
- npm 10 o successivo;
- un browser supportato con contenuti protetti abilitati;
- un account Spotify idoneo alla riproduzione completa.

Non è necessario creare un'app nel Spotify Developer Dashboard e non servono variabili d'ambiente Spotify. Per ascoltare brani completi, accedi a Spotify esclusivamente dall'interfaccia controllata da Spotify nel player incorporato.

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

Apri `http://127.0.0.1:3000` oppure l'indirizzo mostrato nel terminale usando l'host `127.0.0.1`.

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

- `app/page.tsx`: timer, ciclo delle sessioni e preferenze locali;
- `app/spotify-player.tsx`: valida i link e incorpora il player ufficiale isolato di Spotify;
- `app/globals.css`: layout responsive e stile;
- `app/layout.tsx`: metadati e social preview;
- `worker/index.ts`: ingresso Cloudflare/Sites e intestazioni di sicurezza;
- `next.config.ts`: configurazione equivalente per Next.js/Vercel;
- `tests/rendered-html.test.mjs`: test del risultato compilato.

## Privacy e sicurezza

Pomoflow non gestisce credenziali, cookie di sessione o token Spotify. Il login avviene nell'iframe cross-origin servito da `open.spotify.com`, quindi la sessione resta sotto il controllo di Spotify. Il link selezionato resta in `localStorage`; URL con protocolli o host diversi da `open.spotify.com` vengono rifiutati e i parametri ricevuti vengono eliminati prima di creare l'URL Embed. L'iframe non riceve il referrer della pagina. La CSP consente soltanto il frame Spotify e vieta all'app connessioni dirette verso API, WebSocket e SDK Spotify.

## Deploy su Vercel

Dopo aver installato e autenticato la CLI Vercel:

```bash
vercel link
vercel --prod
```

Non sono necessarie variabili d'ambiente Spotify su Vercel o Sites.
