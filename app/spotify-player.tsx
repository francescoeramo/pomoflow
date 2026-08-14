"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

type SpotifyResource = {
  type: "track" | "album" | "playlist" | "artist";
  id: string;
  uri: string;
};

type SpotifyToken = {
  accessToken: string;
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
const PLAYER_READY_TIMEOUT_MS = 15_000;
const SPOTIFY_RESOLVER_URL = "https://apresolve.spotify.com/?type=dealer&type=spclient";

async function verifySpotifyPlaybackEnvironment() {
  if (typeof navigator.requestMediaKeySystemAccess !== "function") {
    throw new Error("This browser does not expose protected playback. Use a Spotify-supported browser and reload the page.");
  }

  try {
    await fetch(SPOTIFY_RESOLVER_URL, {
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error("Spotify is being blocked by a privacy or ad-blocking extension. Allow Spotify for this site and try again.");
  }
}

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

function formatPlaybackTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function SpotifyPlayer() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState<SpotifyToken | null>(null);
  const [spotifyInput, setSpotifyInput] = useState(DEFAULT_SPOTIFY);
  const [resource, setResource] = useState<SpotifyResource>(() => parseSpotifyResource(DEFAULT_SPOTIFY)!);
  const [deviceId, setDeviceId] = useState("");
  const [playerState, setPlayerState] = useState<SpotifyPlaybackState | null>(null);
  const [status, setStatus] = useState("Connect Spotify to play complete tracks.");
  const [error, setError] = useState("");
  const [sdkRequested, setSdkRequested] = useState(false);
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const tokenRef = useRef<SpotifyToken | null>(null);
  const tokenRequestRef = useRef<Promise<string> | null>(null);

  const persistToken = useCallback((next: SpotifyToken | null) => {
    tokenRef.current = next;
    setToken(next);
  }, []);

  const requestAccessToken = useCallback(async () => {
    const response = await fetch("/api/spotify/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pomoflow-Request": "1" },
      body: "{}",
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as { accessToken?: string; expiresAt?: number; error?: string } | null;
    if (!response.ok || !body?.accessToken || !body.expiresAt) {
      persistToken(null);
      throw new Error(body?.error || "Spotify is not connected.");
    }
    persistToken({ accessToken: body.accessToken, expiresAt: body.expiresAt });
    return body.accessToken;
  }, [persistToken]);

  const refreshAccessToken = useCallback(async () => {
    const current = tokenRef.current;
    if (current?.expiresAt && current.expiresAt > Date.now() + 60_000) return current.accessToken;
    if (tokenRequestRef.current) return tokenRequestRef.current;
    const pending = requestAccessToken().finally(() => { tokenRequestRef.current = null; });
    tokenRequestRef.current = pending;
    return pending;
  }, [requestAccessToken]);

  useEffect(() => {
    let active = true;
    async function configure() {
      try {
        const response = await fetch("/api/spotify/config", { cache: "no-store" });
        const data = await response.json() as { configured: boolean };
        if (!active) return;
        setConfigured(data.configured);

        const savedLink = readLocal(LINK_KEY);
        if (savedLink) {
          const parsed = parseSpotifyResource(savedLink);
          if (parsed) {
            setSpotifyInput(savedLink);
            setResource(parsed);
          }
        }

        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const returnedState = params.get("state");
        const authError = params.get("error");
        if (code || authError) {
          window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
          const callbackResponse = await fetch("/api/spotify/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Pomoflow-Request": "1" },
            body: JSON.stringify({ code, error: authError, state: returnedState }),
            cache: "no-store",
          });
          const callbackBody = await callbackResponse.json().catch(() => null) as { error?: string } | null;
          if (!callbackResponse.ok) throw new Error(callbackBody?.error || "Spotify login failed.");
          await verifySpotifyPlaybackEnvironment();
          await requestAccessToken();
          if (active) setStatus("Spotify connected. Preparing the player…");
        } else {
          await verifySpotifyPlaybackEnvironment();
          const accessToken = await requestAccessToken().catch(() => null);
          if (accessToken && active) setStatus("Spotify connected. Preparing the player…");
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Spotify configuration is temporarily unavailable.");
        }
      }
    }
    void configure();
    return () => { active = false; };
  }, [requestAccessToken]);

  const connected = Boolean(token);

  useEffect(() => {
    if (!connected || playerRef.current) return;
    let readyTimeout: number | undefined;

    const initialize = () => {
      if (!window.Spotify || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Pomoflow Web Player",
        getOAuthToken: (callback) => {
          void refreshAccessToken().then(callback).catch(() => {
            persistToken(null);
            void fetch("/api/spotify/logout", { method: "POST", headers: { "X-Pomoflow-Request": "1" } });
            setError("Spotify session expired. Please connect again.");
          });
        },
        volume: 0.5,
        enableMediaSession: true,
      });

      player.addListener("ready", (({ device_id }: { device_id: string }) => {
        if (readyTimeout) window.clearTimeout(readyTimeout);
        setDeviceId(device_id);
        setError("");
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
      player.addListener("autoplay_failed", (() => setError("Your browser blocked autoplay. Press Play again to start listening.")) as (payload: never) => void);
      playerRef.current = player;
      readyTimeout = window.setTimeout(() => {
        if (playerRef.current !== player) return;
        setStatus("Spotify could not finish connecting.");
        setError("The Spotify player did not become ready. Check privacy extensions and try reconnecting.");
      }, PLAYER_READY_TIMEOUT_MS);
      void player.connect().then((success) => {
        if (!success && playerRef.current === player) {
          if (readyTimeout) window.clearTimeout(readyTimeout);
          setStatus("Spotify could not connect.");
          setError("Spotify refused the player connection. Disconnect and try again.");
        }
      }).catch(() => {
        if (readyTimeout) window.clearTimeout(readyTimeout);
        if (playerRef.current === player) {
          setStatus("Spotify could not connect.");
          setError("The Spotify player connection failed. Disconnect and try again.");
        }
      });
    };

    if (window.Spotify) initialize();
    else {
      window.onSpotifyWebPlaybackSDKReady = initialize;
      queueMicrotask(() => setSdkRequested(true));
    }

    return () => {
      if (readyTimeout) window.clearTimeout(readyTimeout);
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [connected, persistToken, refreshAccessToken]);

  async function logout() {
    playerRef.current?.disconnect();
    playerRef.current = null;
    setDeviceId("");
    setPlayerState(null);
    persistToken(null);
    await fetch("/api/spotify/logout", { method: "POST", headers: { "X-Pomoflow-Request": "1" }, cache: "no-store" }).catch(() => null);
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
      {sdkRequested ? (
        <Script
          id="spotify-web-playback-sdk"
          src="https://sdk.scdn.co/spotify-player.js"
          strategy="afterInteractive"
          onLoad={() => window.onSpotifyWebPlaybackSDKReady?.()}
          onError={() => {
            setStatus("Spotify could not connect.");
            setError("The Spotify player could not be loaded. Check your connection or privacy extensions.");
          }}
        />
      ) : null}
      <div className="spotify-heading">
        <div className="spotify-icon" aria-hidden="true"><i /><i /><i /></div>
        <div className="spotify-heading-copy"><p className="panel-kicker">Your soundtrack</p><h2 id="spotify-title">Spotify Premium</h2></div>
        {token ? <button className="spotify-logout" type="button" onClick={() => void logout()}>Disconnect</button> : null}
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
              configured ? <a className="spotify-login" href="/api/spotify/login">Connect Spotify</a> : (
                <button className="spotify-login" type="button" disabled>{configured === null ? "Checking Spotify…" : "Spotify setup required"}</button>
              )
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
