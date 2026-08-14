import { NextRequest } from "next/server";
import { getRequestOrigin, getSpotifyClientId, noStoreJson } from "../_lib";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return noStoreJson({ configured: Boolean(getSpotifyClientId() && getRequestOrigin(request)) });
}
