"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpotifyResource = {
  type: "track" | "album" | "playlist" | "artist";
  id: string;
  uri: string;
};

type SpotifyToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type SpotifyTrack = {
  name: string;
  artists: Array<{ name: string }>;
  album: { images: Array<{ url: string }> };
};

type SpotifyPlaybackState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: SpotifyTrack };
};

type SpotifyPlayerInstance = {
  addListener(event: string, callback: (payload: never) => void): boolean;
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  togglePlay(): Promise<void>;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume: number;
        enableMediaSession: boolean;
      }) => SpotifyPlayerInstance;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const DEFAULT_SPOTIFY = "https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS";
const LINK_KEY = "pomoflow-spotify";
const TOKEN_KEY = "pomoflow-spotify-token";
const VERIFIER_KEY = "pomoflow-spotify-code-verifier";
const STATE_KEY = "pomoflow-spotify-oauth-state";
const REDIRECT_KEY = "pomoflow-spotify-redirect-uri";
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
];

function saveLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The current session can still work when persistent storage is unavailable.
  }
}

function readLocal(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeLocal(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

function parseSpotifyResource(value: string): SpotifyResource | null {
  const trimmed = value.trim();
  const uriMatch = trimmed.match(/^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)$/);
  if (uriMatch) {
    const type = uriMatch[1] as SpotifyResource["type"];
    return { type, id: uriMatch[2], uri: `spotify:${type}:${uriMatch[2]}` };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const typeIndex = parts.findIndex((part) => ["track", "album", "playlist", "artist"].includes(part));
    const type = parts[typeIndex] as SpotifyResource["type"] | undefined;
    const id = parts[typeIndex + 1];
    if (!type || !id || !/^[A-Za-z0-9]+$/.test(id)) return null;
    return { type, id, uri: `spotify:${type}:${id}` };
  } catch {
    return null;
  }
}

function randomString(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[byte % 66]).join("");
}

function base64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function sha256(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function formatPlaybackTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function SpotifyPlayer() {
  const [clientId, setClientId] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState<SpotifyToken | null>(null);
  const [spotifyInput, setSpotifyInput] = useState(DEFAULT_SPOTIFY);
  const [resource, setResource] = useState<SpotifyResource>(() => parseSpotifyResource(DEFAULT_SPOTIFY)!);
  const [deviceId, setDeviceId] = useState("");
  const [playerState, setPlayerState] = useState<SpotifyPlaybackState | null>(null);
  const [status, setStatus] = useState("Connect Spotify to play complete tracks.");
  const [error, setError] = useState("");
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const tokenRef = useRef<SpotifyToken | null>(null);
  const clientIdRef = useRef("");

  const persistToken = useCallback((next: SpotifyToken | null) => {
    tokenRef.current = next;
    setToken(next);
    if (next) saveLocal(TOKEN_KEY, JSON.stringify(next));
    else removeLocal(TOKEN_KEY);
  }, []);

  const refreshAccessToken = useCallback(async () => {
    const current = tokenRef.current;
    if (!current) throw new Error("Spotify is not connected.");
    if (current.expiresAt > Date.now() + 60_000) return current.accessToken;

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientIdRef.current,
        grant_type: "refresh_token",
        refresh_token: current.refreshToken,
      }),
    });
    const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !body.access_token) throw new Error(body.error_description || "Spotify session expired.");
    const next = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || current.refreshToken,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    persistToken(next);
    return next.accessToken;
  }, [persistToken]);

  useEffect(() => {
    let active = true;
    async function configure() {
      try {
        const response = await fetch("/api/spotify/config", { cache: "no-store" });
        const data = await response.json() as { configured: boolean; clientId: string };
        if (!active) return;
        setConfigured(data.configured);
        setClientId(data.clientId);
        clientIdRef.current = data.clientId;

        const savedLink = readLocal(LINK_KEY);
        const savedToken = readLocal(TOKEN_KEY);
        if (savedLink) {
          const parsed = parseSpotifyResource(savedLink);
          if (parsed) {
            setSpotifyInput(savedLink);
            setResource(parsed);
          }
        }
        if (savedToken) {
          const parsed = JSON.parse(savedToken) as SpotifyToken;
          if (parsed.accessToken && parsed.refreshToken && parsed.expiresAt) persistToken(parsed);
        }
      } catch {
        if (active) {
          setConfigured(false);
          setError("Spotify configuration is temporarily unavailable.");
        }
      }
    }
    void configure();
    return () => { active = false; };
  }, [persistToken]);

  useEffect(() => {
    if (!clientId) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returnedState = params.get("state");
    const authError = params.get("error");
    if (!code && !authError) return;

    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
    if (authError) {
      queueMicrotask(() => setError(authError === "access_denied" ? "Spotify access was not granted." : "Spotify login failed."));
      return;
    }

    if (!code) return;
    const verifier = readLocal(VERIFIER_KEY);
    const expectedState = readLocal(STATE_KEY);
    const redirectUri = readLocal(REDIRECT_KEY);
    removeLocal(VERIFIER_KEY);
    removeLocal(STATE_KEY);
    removeLocal(REDIRECT_KEY);
    if (!verifier || !redirectUri || !returnedState || returnedState !== expectedState) {
      queueMicrotask(() => setError("Spotify login could not be verified. Please try again."));
      return;
    }
    const authCode = code;

    void (async () => {
      try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            grant_type: "authorization_code",
            code: authCode,
            redirect_uri: redirectUri,
            code_verifier: verifier,
          }),
        });
        const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
        if (!response.ok || !body.access_token || !body.refresh_token) throw new Error(body.error_description || "Spotify login failed.");
        persistToken({ accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
        setError("");
        setStatus("Spotify connected. Preparing the player…");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Spotify login failed.");
      }
    })();
  }, [clientId, persistToken]);

  const connected = Boolean(token);

  useEffect(() => {
    if (!connected || !clientId || playerRef.current) return;

    const initialize = () => {
      if (!window.Spotify || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Pomoflow Web Player",
        getOAuthToken: (callback) => {
          void refreshAccessToken().then(callback).catch(() => {
            persistToken(null);
            setError("Spotify session expired. Please connect again.");
          });
        },
        volume: 0.5,
        enableMediaSession: true,
      });

      player.addListener("ready", (({ device_id }: { device_id: string }) => {
        setDeviceId(device_id);
        setStatus("Ready. Choose a playlist and press Play.");
      }) as (payload: never) => void);
      player.addListener("not_ready", (() => {
        setDeviceId("");
        setStatus("Spotify player is offline. Reconnect to continue.");
      }) as (payload: never) => void);
      player.addListener("player_state_changed", ((next: SpotifyPlaybackState | null) => {
        if (next) setPlayerState(next);
      }) as (payload: never) => void);
      player.addListener("initialization_error", ((payload: { message: string }) => setError(payload.message)) as (payload: never) => void);
      player.addListener("authentication_error", ((payload: { message: string }) => {
        setError(payload.message);
        persistToken(null);
      }) as (payload: never) => void);
      player.addListener("account_error", (() => setError("Full playback requires a Spotify Premium account.")) as (payload: never) => void);
      player.addListener("playback_error", ((payload: { message: string }) => setError(payload.message)) as (payload: never) => void);
      playerRef.current = player;
      void player.connect();
    };

    if (window.Spotify) initialize();
    else {
      window.onSpotifyWebPlaybackSDKReady = initialize;
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://sdk.scdn.co/spotify-player.js"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [clientId, connected, persistToken, refreshAccessToken]);

  async function login() {
    if (!clientId) return;
    const verifier = randomString(64);
    const state = randomString(32);
    const redirectUri = `${window.location.origin}/`;
    const challenge = base64Url(await sha256(verifier));
    saveLocal(VERIFIER_KEY, verifier);
    saveLocal(STATE_KEY, state);
    saveLocal(REDIRECT_KEY, redirectUri);

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
      scope: SCOPES.join(" "),
      show_dialog: "true",
    }).toString();
    window.location.assign(authUrl.toString());
  }

  function logout() {
    playerRef.current?.disconnect();
    playerRef.current = null;
    setDeviceId("");
    setPlayerState(null);
    persistToken(null);
    setStatus("Connect Spotify to play complete tracks.");
  }

  function loadSpotify() {
    const parsed = parseSpotifyResource(spotifyInput);
    if (!parsed) {
      setError("Paste a valid Spotify playlist, album, artist, or track link.");
      return;
    }
    setResource(parsed);
    saveLocal(LINK_KEY, spotifyInput.trim());
    setError("");
    setStatus("Selection loaded. Press Play to start full playback.");
  }

  async function playSelection() {
    if (!deviceId || !playerRef.current) return;
    try {
      setError("");
      await playerRef.current.activateElement();
      const accessToken = await refreshAccessToken();
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(resource.type === "track" ? { uris: [resource.uri] } : { context_uri: resource.uri }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message || "Spotify could not start playback.");
      }
      setStatus("Playing full tracks through Spotify Premium.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Spotify could not start playback.");
    }
  }

  const track = playerState?.track_window.current_track;
  const cover = track?.album.images[0]?.url;

  return (
    <section className="spotify-card" aria-labelledby="spotify-title">
      <div className="spotify-heading">
        <div className="spotify-icon" aria-hidden="true"><i /><i /><i /></div>
        <div className="spotify-heading-copy"><p className="panel-kicker">Your soundtrack</p><h2 id="spotify-title">Spotify Premium</h2></div>
        {token ? <button className="spotify-logout" type="button" onClick={logout}>Disconnect</button> : null}
      </div>

      <div className="spotify-player spotify-sdk-player">
        {track ? (
          <div className="now-playing">
            {/* Spotify artwork is dynamic and already served at the size selected by its API. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover ? <img src={cover} alt="" /> : <div className="album-placeholder" aria-hidden="true">♪</div>}
            <div className="track-copy">
              <p>Now playing</p>
              <strong>{track.name}</strong>
              <span>{track.artists.map((artist) => artist.name).join(", ")}</span>
            </div>
            <div className="playback-progress" aria-label={`${formatPlaybackTime(playerState.position)} of ${formatPlaybackTime(playerState.duration)}`}>
              <span style={{ width: `${playerState.duration ? (playerState.position / playerState.duration) * 100 : 0}%` }} />
            </div>
            <div className="playback-controls">
              <button type="button" onClick={() => void playerRef.current?.previousTrack()} aria-label="Previous track">↶</button>
              <button className="play-toggle" type="button" onClick={() => void playerRef.current?.togglePlay()} aria-label={playerState.paused ? "Play" : "Pause"}>{playerState.paused ? "▶" : "Ⅱ"}</button>
              <button type="button" onClick={() => void playerRef.current?.nextTrack()} aria-label="Next track">↷</button>
            </div>
          </div>
        ) : (
          <div className="spotify-login-state">
            <span aria-hidden="true">♫</span>
            <h3>{token ? (deviceId ? "Your player is ready" : "Connecting to Spotify…") : "Listen to every track"}</h3>
            <p>{status}</p>
            {!token ? (
              <button className="spotify-login" type="button" onClick={() => void login()} disabled={!configured}>
                {configured === null ? "Checking Spotify…" : configured ? "Connect Spotify" : "Spotify setup required"}
              </button>
            ) : deviceId ? (
              <button className="spotify-login" type="button" onClick={() => void playSelection()}>Play full playlist</button>
            ) : null}
          </div>
        )}
      </div>

      <div className="spotify-connect">
        <label htmlFor="spotify-link">Playlist or Spotify link</label>
        <div className="spotify-input-row">
          <input id="spotify-link" type="url" value={spotifyInput} onChange={(event) => setSpotifyInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") loadSpotify(); }} placeholder="https://open.spotify.com/playlist/…" autoComplete="off" maxLength={500} />
          <button type="button" onClick={loadSpotify}>Load</button>
        </div>
        {error ? <p className="spotify-error" role="alert">{error}</p> : <p className="spotify-help">Full playback uses Spotify’s official Web Playback SDK and requires Spotify Premium.</p>}
      </div>
    </section>
  );
}
