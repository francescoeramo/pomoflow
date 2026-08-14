import { NextRequest } from "next/server";
import { clearOAuthCookies, isSameOriginRequest, noStoreJson } from "../_lib";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  const response = noStoreJson({ disconnected: true });
  clearOAuthCookies(response);
  return response;
}
