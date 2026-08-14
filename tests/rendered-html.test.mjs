import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Pomoflow product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Pomoflow — Focus, set to music<\/title>/i);
  assert.match(html, /Find your rhythm\./);
  assert.match(html, />25:00</);
  assert.match(html, /Spotify Premium/);
  assert.match(html, /Listen to every track/);
  assert.doesNotMatch(html, /Codex is working|Your site is taking shape|vinext-starter/i);
});

test("applies the production security headers", async () => {
  const response = await render();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-src https:\/\/sdk\.scdn\.co/);
  assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'self' 'unsafe-inline' https:\/\/sdk\.scdn\.co/);
  assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'self'.*api\.spotify\.com/);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
});

test("keeps cycle length configurable and rejects template cruft", async () => {
  const [page, packageJson, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  const spotifyPlayer = await readFile(new URL("../app/spotify-player.tsx", import.meta.url), "utf8");
  assert.match(page, /pomoflow-session-target/);
  assert.match(page, /Sessions per cycle/);
  assert.match(page, /Array\.from\(\{ length: sessionTarget \}/);
  const spotifyApi = await readFile(new URL("../app/api/spotify/_lib.ts", import.meta.url), "utf8");
  assert.match(spotifyApi, /createCodeChallenge/);
  assert.match(spotifyApi, /httpOnly: true/);
  assert.match(spotifyApi, /sameSite: "lax"/);
  assert.doesNotMatch(spotifyPlayer, /pomoflow-spotify-token|refreshToken|code_verifier/);
  assert.match(spotifyPlayer, /https:\/\/sdk\.scdn\.co\/spotify-player\.js/);
  assert.match(spotifyPlayer, /PLAYER_READY_TIMEOUT_MS/);
  assert.match(spotifyPlayer, /if \(!success/);
  assert.match(spotifyPlayer, /requestMediaKeySystemAccess/);
  assert.match(spotifyPlayer, /SW_SECURE_CRYPTO/);
  assert.match(spotifyPlayer, /apresolve\.spotify\.com/);
  assert.match(spotifyPlayer, /verifySpotifyPlaybackEnvironment/);
  assert.match(spotifyApi, /user-modify-playback-state/);
  assert.doesNotMatch(spotifyApi, /user-read-playback-state/);
  assert.doesNotMatch(spotifyApi, /response\.cookies\.set\(SPOTIFY_COOKIES\.access/);
  assert.doesNotMatch(packageJson, /drizzle|react-loading-skeleton/);
  assert.match(readme, /npm ci/);
  assert.match(readme, /npm run build/);
});
