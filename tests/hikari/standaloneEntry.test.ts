import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string): string => readFileSync(
  new URL(`../../${relative}`, import.meta.url),
  "utf8",
);

test("standalone Hikari owns a separate root, build output, port, and Cloudflare service", () => {
  const html = read("hikari/index.html");
  const vite = read("vite.hikari.config.ts");
  const wrangler = read("wrangler.hikari.jsonc");
  const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

  assert.match(html, /data-hikari-app="standalone"/);
  assert.match(html, /src="\.\/main\.ts"/);
  assert.match(read("hikari/main.ts"), /import "\.\.\/src\/studies\/cloud-sculpt\/main\.ts"/);
  assert.match(vite, /root: "hikari"/);
  assert.match(vite, /port: 5176/);
  assert.match(vite, /outDir: "\.\.\/dist-hikari"/);
  assert.match(wrangler, /"name": "hikari"/);
  assert.match(wrangler, /"directory": "\.\/dist-hikari"/);
  assert.equal(packageJson.scripts["build:hikari"], "tsc -b && vite build --config vite.hikari.config.ts");
  assert.equal(packageJson.scripts["deploy:hikari"], "npm run build:hikari && wrangler deploy --config wrangler.hikari.jsonc");
});

test("standalone root enters Hikari with Optical Imprint without changing the Katachi entry", () => {
  const main = read("src/studies/cloud-sculpt/main.ts");
  const katachiEntry = read("index.html");
  assert.match(main, /dataset\.hikariApp === "standalone"/);
  assert.match(main, /standaloneHikariApp\s*\|\| isOpticalImprintQueryEnabled/);
  assert.doesNotMatch(katachiEntry, /data-hikari-app="standalone"/);
});
