# Pomoflow

Pomoflow è un timer Pomodoro responsive con durate configurabili, numero di sessioni per ciclo personalizzabile e riproduzione Spotify completa tramite il Web Playback SDK ufficiale. Le preferenze e la sessione OAuth restano nel browser dell'utente.

## Funzioni principali

- modalità focus, pausa breve e pausa lunga;
- durate da 1 a 180 minuti;
- ciclo configurabile da 1 a 12 sessioni focus;
- timer accurato anche quando la scheda del browser viene rallentata;
- login Spotify con Authorization Code + PKCE, senza client secret nel browser;
- riproduzione completa di playlist, album, artisti e brani tramite Spotify Connect;
- controlli play/pausa, precedente e successivo con copertina e brano corrente;
- preferenze salvate localmente nel browser;
- interfaccia responsive e utilizzabile da tastiera.

## Requisiti

- Node.js 22.13 o successivo;
- npm 10 o successivo;
- un'app creata nel [Spotify Developer Dashboard](https://developer.spotify.com/dashboard);
- Spotify Premium per ogni utente che usa la riproduzione completa.

Nell'app Spotify abilita il Web Playback SDK e registra esattamente gli URL di callback usati, inclusa la `/` finale. Per lo sviluppo locale usa `http://127.0.0.1:3000/` (Spotify non accetta `localhost` come redirect HTTP). Per le pubblicazioni correnti usa:

- `https://pomoflow-focus-timer.francescoeramo4.chatgpt.site/`
- `https://pomoflow-eta.vercel.app/`

Copia `.env.example` in `.env.local` e inserisci soltanto il Client ID pubblico:

```bash
SPOTIFY_CLIENT_ID=il_client_id_della_tua_app
```

Non serve e non deve essere salvato alcun Client Secret.

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
- `app/spotify-player.tsx`: OAuth PKCE, Web Playback SDK e controlli Spotify;
- `app/api/spotify/config/route.ts`: espone al client il solo Client ID pubblico;
- `app/globals.css`: layout responsive e stile;
- `app/layout.tsx`: metadati e social preview;
- `worker/index.ts`: ingresso Cloudflare/Sites e intestazioni di sicurezza;
- `next.config.ts`: configurazione equivalente per Next.js/Vercel;
- `tests/rendered-html.test.mjs`: test del risultato compilato.

## Privacy e sicurezza

Pomoflow non invia al proprio backend le durate, il link Spotify o i token dell'utente. Questi dati vengono conservati solo in `localStorage`; le richieste di autorizzazione, token e riproduzione vanno direttamente ai domini ufficiali Spotify. URL con protocolli o host diversi da `open.spotify.com` vengono rifiutati. Le risposte applicano policy contro framing, MIME sniffing e accesso non necessario a fotocamera, microfono, posizione, pagamenti e USB.

## Deploy su Vercel

Dopo aver installato e autenticato la CLI Vercel:

```bash
vercel link
vercel --prod
```

Configura `SPOTIFY_CLIENT_ID` negli ambienti Production e Preview di Vercel prima del deploy. Su Sites configura la stessa variabile d'ambiente dal pannello del progetto.
