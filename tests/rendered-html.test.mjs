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
  assert.match(html, /title="Spotify player"/);
  assert.match(html, /open\.spotify\.com\/embed\/playlist/);
  assert.doesNotMatch(html, /Codex is working|Your site is taking shape|vinext-starter/i);
});

test("applies the production security headers", async () => {
  const response = await render();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-src https:\/\/open\.spotify\.com/);
  assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'self' 'unsafe-inline';/);
  assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'self';/);
  assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /accounts\.spotify\.com|api\.spotify\.com|sdk\.scdn\.co|wss:/);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
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
  assert.match(spotifyPlayer, /https:\/\/open\.spotify\.com\/embed/);
  assert.match(spotifyPlayer, /referrerPolicy="no-referrer"/);
  assert.match(spotifyPlayer, /encrypted-media/);
  assert.doesNotMatch(spotifyPlayer, /accessToken|refreshToken|Authorization|spotify-player\.js|\/api\/spotify/);
  assert.doesNotMatch(packageJson, /drizzle|react-loading-skeleton/);
  assert.match(readme, /npm ci/);
  assert.match(readme, /npm run build/);
});
