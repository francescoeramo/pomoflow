import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() ?? "";

  return NextResponse.json(
    { configured: Boolean(clientId), clientId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
