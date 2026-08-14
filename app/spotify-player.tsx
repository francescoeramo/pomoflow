"use client";

import { useEffect, useState } from "react";

type SpotifyResource = {
  type: "track" | "album" | "playlist" | "artist";
  id: string;
};

const DEFAULT_SPOTIFY = "https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS";
const LINK_KEY = "pomoflow-spotify";

function saveLocal(value: string) {
  try {
    window.localStorage.setItem(LINK_KEY, value);
  } catch {
    // The player still works when persistent storage is unavailable.
  }
}

function parseSpotifyResource(value: string): SpotifyResource | null {
  const trimmed = value.trim();
  const uriMatch = trimmed.match(/^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)$/);
  if (uriMatch) return { type: uriMatch[1] as SpotifyResource["type"], id: uriMatch[2] };

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const typeIndex = parts.findIndex((part) => ["track", "album", "playlist", "artist"].includes(part));
    const type = parts[typeIndex] as SpotifyResource["type"] | undefined;
    const id = parts[typeIndex + 1];
    if (!type || !id || !/^[A-Za-z0-9]+$/.test(id)) return null;
    return { type, id };
  } catch {
    return null;
  }
}

function embedUrl(resource: SpotifyResource) {
  return `https://open.spotify.com/embed/${resource.type}/${resource.id}?utm_source=generator&theme=0`;
}

export default function SpotifyPlayer() {
  const [spotifyInput, setSpotifyInput] = useState(DEFAULT_SPOTIFY);
  const [resource, setResource] = useState<SpotifyResource>(() => parseSpotifyResource(DEFAULT_SPOTIFY)!);
  const [error, setError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(LINK_KEY);
        const parsed = saved ? parseSpotifyResource(saved) : null;
        if (saved && parsed) {
          setSpotifyInput(saved);
          setResource(parsed);
        }
      } catch {
        // Keep the safe default when persistent storage is unavailable.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function loadSpotify() {
    const parsed = parseSpotifyResource(spotifyInput);
    if (!parsed) {
      setError("Paste a valid Spotify playlist, album, artist, or track link.");
      return;
    }
    setResource(parsed);
    saveLocal(spotifyInput.trim());
    setError("");
  }

  return (
    <section className="spotify-card" aria-labelledby="spotify-title">
      <div className="spotify-heading">
        <div className="spotify-icon" aria-hidden="true"><i /><i /><i /></div>
        <div className="spotify-heading-copy">
          <p className="panel-kicker">Your soundtrack</p>
          <h2 id="spotify-title">Spotify</h2>
        </div>
      </div>

      <div className="spotify-player spotify-embed-player">
        <iframe
          key={`${resource.type}:${resource.id}`}
          title="Spotify player"
          src={embedUrl(resource)}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="eager"
          referrerPolicy="no-referrer"
        />
      </div>

      <div className="spotify-connect">
        <label htmlFor="spotify-link">Playlist or Spotify link</label>
        <div className="spotify-input-row">
          <input
            id="spotify-link"
            type="url"
            value={spotifyInput}
            onChange={(event) => setSpotifyInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") loadSpotify(); }}
            placeholder="https://open.spotify.com/playlist/…"
            autoComplete="off"
            maxLength={500}
          />
          <button type="button" onClick={loadSpotify}>Load</button>
        </div>
        {error ? (
          <p className="spotify-error" role="alert">{error}</p>
        ) : (
          <p className="spotify-help">Login and playback are handled securely by Spotify inside the player. Pomoflow never receives your Spotify tokens.</p>
        )}
      </div>
    </section>
  );
}
