import { NextRequest, NextResponse } from "next/server";

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
];

export const SPOTIFY_COOKIES = {
  access: "pomoflow_spotify_access",
  accessExpires: "pomoflow_spotify_access_expires",
  refresh: "pomoflow_spotify_refresh",
  verifier: "pomoflow_spotify_verifier",
  state: "pomoflow_spotify_state",
} as const;

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const NO_STORE_HEADERS = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

type SpotifyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

export function getSpotifyClientId() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() ?? "";
  return /^[a-f0-9]{32}$/i.test(clientId) ? clientId : "";
}

export function getAllowedOrigins() {
  return (process.env.SPOTIFY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin));
}

export function getRequestOrigin(request: NextRequest) {
  const origin = request.nextUrl.origin.replace(/\/$/, "");
  return getAllowedOrigins().includes(origin) ? origin : null;
}

export function isSameOriginRequest(request: NextRequest) {
  const expectedOrigin = getRequestOrigin(request);
  if (!expectedOrigin) return false;
  const suppliedOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (suppliedOrigin !== expectedOrigin) return false;
  if (request.headers.get("x-pomoflow-request") !== "1") return false;
  return !fetchSite || fetchSite === "same-origin";
}

export function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: NO_STORE_HEADERS });
}

export function clearTransientOAuthCookies(response: NextResponse) {
  [SPOTIFY_COOKIES.verifier, SPOTIFY_COOKIES.state].forEach((name) => response.cookies.set(name, "", cookieOptions(0)));
}

export function clearSpotifySessionCookies(response: NextResponse) {
  [SPOTIFY_COOKIES.access, SPOTIFY_COOKIES.accessExpires, SPOTIFY_COOKIES.refresh].forEach((name) => response.cookies.set(name, "", cookieOptions(0)));
}

export function clearOAuthCookies(response: NextResponse) {
  clearTransientOAuthCookies(response);
  clearSpotifySessionCookies(response);
}

export function setTransientOAuthCookies(response: NextResponse, verifier: string, state: string) {
  response.cookies.set(SPOTIFY_COOKIES.verifier, verifier, cookieOptions(600));
  response.cookies.set(SPOTIFY_COOKIES.state, state, cookieOptions(600));
}

export function setSpotifyTokenCookies(response: NextResponse, token: SpotifyTokenResponse, fallbackRefreshToken?: string) {
  if (!token.access_token) throw new Error("Spotify did not return an access token.");
  const expiresIn = Math.max(60, Math.min(3600, token.expires_in ?? 3600));
  const expiresAt = Date.now() + expiresIn * 1000;
  const refreshToken = token.refresh_token || fallbackRefreshToken;
  response.cookies.set(SPOTIFY_COOKIES.access, token.access_token, cookieOptions(expiresIn));
  response.cookies.set(SPOTIFY_COOKIES.accessExpires, String(expiresAt), cookieOptions(expiresIn));
  if (refreshToken) response.cookies.set(SPOTIFY_COOKIES.refresh, refreshToken, cookieOptions());
  return expiresAt;
}

export async function exchangeSpotifyToken(body: URLSearchParams) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const token = await response.json().catch(() => null) as SpotifyTokenResponse | null;
  if (!response.ok || !token?.access_token) throw new Error("Spotify token exchange failed.");
  return token;
}

export function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function createCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let binary = "";
  new Uint8Array(digest).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
