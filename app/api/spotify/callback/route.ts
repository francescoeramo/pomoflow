import { NextRequest } from "next/server";
import {
  clearOAuthCookies,
  clearTransientOAuthCookies,
  exchangeSpotifyToken,
  getRequestOrigin,
  getSpotifyClientId,
  isSameOriginRequest,
  noStoreJson,
  setSpotifyTokenCookies,
  SPOTIFY_COOKIES,
} from "../_lib";

export const dynamic = "force-dynamic";

type CallbackBody = { code?: unknown; error?: unknown; state?: unknown };

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return noStoreJson({ error: "Request too large." }, { status: 413 });

  const clientId = getSpotifyClientId();
  const origin = getRequestOrigin(request);
  const verifier = request.cookies.get(SPOTIFY_COOKIES.verifier)?.value ?? "";
  const expectedState = request.cookies.get(SPOTIFY_COOKIES.state)?.value ?? "";
  const body = await request.json().catch(() => null) as CallbackBody | null;
  const state = typeof body?.state === "string" && body.state.length <= 256 ? body.state : "";
  const code = typeof body?.code === "string" && body.code.length <= 2048 ? body.code : "";
  const oauthError = typeof body?.error === "string" && body.error.length <= 128 ? body.error : "";

  if (!clientId || !origin || !verifier || !expectedState || !state || state !== expectedState) {
    const response = noStoreJson({ error: "Spotify login could not be verified." }, { status: 400 });
    clearOAuthCookies(response);
    return response;
  }

  if (oauthError) {
    const response = noStoreJson({ error: oauthError === "access_denied" ? "Spotify access was not granted." : "Spotify login failed." }, { status: 400 });
    clearOAuthCookies(response);
    return response;
  }
  if (!code) {
    const response = noStoreJson({ error: "Spotify authorization code is missing." }, { status: 400 });
    clearOAuthCookies(response);
    return response;
  }

  try {
    const token = await exchangeSpotifyToken(new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/`,
      code_verifier: verifier,
    }));
    if (!token.refresh_token) throw new Error("Spotify did not return a refresh token.");
    const response = noStoreJson({ connected: true });
    clearTransientOAuthCookies(response);
    setSpotifyTokenCookies(response, token);
    return response;
  } catch {
    const response = noStoreJson({ error: "Spotify login failed. Please try again." }, { status: 502 });
    clearOAuthCookies(response);
    return response;
  }
}
