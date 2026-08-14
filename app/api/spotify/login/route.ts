import { NextRequest, NextResponse } from "next/server";
import {
  createCodeChallenge,
  getRequestOrigin,
  getSpotifyClientId,
  randomBase64Url,
  setTransientOAuthCookies,
  SPOTIFY_SCOPES,
} from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = getSpotifyClientId();
  const origin = getRequestOrigin(request);
  if (!clientId || !origin) return new NextResponse("Spotify is not configured for this origin.", { status: 503 });

  const verifier = randomBase64Url(64);
  const state = randomBase64Url(32);
  const challenge = await createCodeChallenge(verifier);
  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${origin}/`,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope: SPOTIFY_SCOPES.join(" "),
    show_dialog: "true",
  }).toString();

  const response = NextResponse.redirect(authorizeUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  setTransientOAuthCookies(response, verifier, state);
  return response;
}
