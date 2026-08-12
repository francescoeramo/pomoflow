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
  assert.match(html, /Spotify music player/);
  assert.doesNotMatch(html, /Codex is working|Your site is taking shape|vinext-starter/i);
});

test("applies the production security headers", async () => {
  const response = await render();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
});

test("keeps cycle length configurable and rejects template cruft", async () => {
  const [page, packageJson, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /pomoflow-session-target/);
  assert.match(page, /Sessions per cycle/);
  assert.match(page, /Array\.from\(\{ length: sessionTarget \}/);
  assert.doesNotMatch(packageJson, /drizzle|react-loading-skeleton/);
  assert.match(readme, /npm ci/);
  assert.match(readme, /npm run build/);
});
