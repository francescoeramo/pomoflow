import { NextRequest } from "next/server";
import {
  clearSpotifySessionCookies,
  exchangeSpotifyToken,
  getSpotifyClientId,
  isSameOriginRequest,
  noStoreJson,
  setSpotifyTokenCookies,
  SPOTIFY_COOKIES,
} from "../_lib";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  const clientId = getSpotifyClientId();
  const accessToken = request.cookies.get(SPOTIFY_COOKIES.access)?.value ?? "";
  const expiresAt = Number(request.cookies.get(SPOTIFY_COOKIES.accessExpires)?.value ?? 0);
  const refreshToken = request.cookies.get(SPOTIFY_COOKIES.refresh)?.value ?? "";

  if (accessToken && expiresAt > Date.now() + 60_000) return noStoreJson({ accessToken, expiresAt });
  if (!clientId || !refreshToken) return noStoreJson({ error: "Spotify is not connected." }, { status: 401 });

  try {
    const token = await exchangeSpotifyToken(new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }));
    const response = noStoreJson({ accessToken: token.access_token, expiresAt: Date.now() + Math.max(60, Math.min(3600, token.expires_in ?? 3600)) * 1000 });
    setSpotifyTokenCookies(response, token, refreshToken);
    return response;
  } catch {
    const response = noStoreJson({ error: "Spotify session expired." }, { status: 401 });
    clearSpotifySessionCookies(response);
    return response;
  }
}
