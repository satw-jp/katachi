# SKIN REBUILD dependency audit — 2026-08-30

## Scope and evidence

- Repository: `agent/skin-rebuild` at `2691c15e47c873e64f26f9496e94ef8ba0531d8c`.
- Command: `npm audit --json` with the existing `package-lock.json`; no fix command was run.
- Result: 8 vulnerable packages (`high: 7`, `moderate: 1`, `critical: 0`).
- `package-lock.json` SHA-256 before and after the audit:
  `480eaaf478a5c9b64bec88bfd259ee525500d02c9af9d320ffc743c3d7ba8489`.
- Production is a Cloudflare Workers Static Assets deployment of `dist/`.
  The eight packages below are all in the development dependency tree and are
  not shipped as JavaScript used by `/skin-rebuild.html` in the browser.

The reachability decision distinguishes the public static application from
local tooling. A package being absent from production does not make a
network-exposed local development server safe.

## Decision summary

| package (installed) | severity | dependency path | public SKIN runtime | decision |
| --- | --- | --- | --- | --- |
| `vite@5.4.21` | high | direct dev dependency | unreachable | 後回し — isolate and test a Vite 6+ upgrade; do not expose the current dev server to untrusted networks |
| `esbuild@0.21.5` | moderate | `vite -> esbuild` | unreachable | 実質影響なし — the vulnerable standalone esbuild server is not used; resolve through Vite |
| `postcss@8.5.16` | high | `vite -> postcss` | unreachable | 実質影響なし — only trusted repository CSS is processed |
| `nanoid@3.3.15` | high | `vite -> postcss -> nanoid` | unreachable | 実質影響なし — PostCSS calls `nanoid(6)`, not the vulnerable zero/negative inputs |
| `wrangler@4.111.0` | high | direct dev dependency | unreachable | 後回し — upgrade the deploy toolchain as one tested unit, not individual transitives |
| `miniflare@4.20260710.0` | high | `wrangler -> miniflare` | unreachable | 実質影響なし for the static app; resolve through Wrangler before untrusted local Worker testing |
| `sharp@0.34.5` | high | `wrangler -> miniflare -> sharp` | unreachable | 実質影響なし for SKIN; no untrusted image decode is in its path |
| `undici@7.28.0` | high | `wrangler -> miniflare -> undici` | unreachable | 実質影響なし for the static app; resolve through Wrangler |

No package is classified `今すぐ修正` for the deployed SKIN REBUILD runtime.
The two parent toolchains remain scheduled maintenance because their local
attack surfaces and upgrade risks differ from the static production app.

## Package findings

### `vite@5.4.21`

- **Severity / relationship:** high; direct `devDependency`.
- **Used by:** `npm run dev`, `npm run preview`, and the production build. It
  transforms the SKIN TypeScript/CSS and bundles Workers but is absent after
  the generated assets are uploaded.
- **Advisories:** optimized-dependency sourcemap path traversal
  ([GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9));
  Windows UNC `launch-editor` NTLMv2 disclosure
  ([GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3));
  Windows alternate-path `server.fs.deny` bypass
  ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff));
  plus the transitive esbuild advisory below.
- **Reachability:** not reachable from Cloudflare static assets. The default
  config binds Vite to localhost, but `Katachi を別のPCから見る.command`
  intentionally starts Vite with `--host`; that LAN mode can expose the Vite
  server and should not be used on an untrusted network. The Cloudflare URL is
  the safe cross-device route while this version is frozen.
- **Fixed version:** the advisory ranges are clear at `vite >= 6.4.3`.
  `npm audit` proposes `8.2.2` with a semver-major change, but that is not the
  minimum fix.
- **Breaking risk:** medium/high. Vite 5 to 6 is a major change; Vite 8 also
  exceeds the declared peer range of `@vitejs/plugin-basic-ssl@1.2.0`
  (`vite <= 6`). Multi-page inputs, `base: "./"`, module Worker chunks,
  generated filenames and HTTPS/LAN behavior require regression checks.
- **Decision:** **後回し**, with the operational condition that the current
  Vite server stays localhost-only or on a trusted LAN. Perform a separate
  dependency-only Vite 6.4.3+ trial after preserving the geometry fixtures.

### `esbuild@0.21.5`

- **Severity / relationship:** moderate; transitive through Vite. The
  `esbuild@0.28.1` copies nested under `tsx` and Wrangler are outside the
  vulnerable range.
- **Used by:** Vite's source transform/optimization path during development
  and build.
- **Advisory:** cross-origin reads from the esbuild development server
  ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)).
- **Reachability:** not in production. Katachi does not invoke the standalone
  `esbuild --serve` API; Vite owns the development HTTP server. Therefore the
  advisory's vulnerable server is not an actual SKIN execution path.
- **Fixed version:** `esbuild >= 0.25.0`; Vite 6.4.3 declares
  `esbuild ^0.25.0`.
- **Breaking risk:** high if forced with an override because Vite owns this
  transitive contract; low when received from a tested Vite upgrade.
- **Decision:** **実質影響なし** now; never pin this transitive independently.

### `postcss@8.5.16`

- **Severity / relationship:** high; transitive through Vite.
- **Used by:** Vite's CSS build pipeline for repository-controlled CSS.
- **Advisories:** previous sourcemap auto-loading path traversal
  ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849))
  and its incomplete fix when `from` is unset
  ([GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)).
- **Reachability:** not in production. SKIN has no server-side or browser-side
  feature that accepts attacker CSS and runs PostCSS. Only checked-in CSS is
  processed during a trusted local build.
- **Fixed version:** `postcss >= 8.5.23`.
- **Breaking risk:** low for the API, but generated CSS/sourcemaps can change
  and require build and browser visual checks.
- **Decision:** **実質影響なし** for SKIN; resolve via the parent Vite update.

### `nanoid@3.3.15`

- **Severity / relationship:** high; `vite -> postcss -> nanoid`.
- **Used by:** PostCSS `Input` creates a diagnostic input ID with
  `nanoid(6)` when no source filename is present.
- **Advisories:** indefinite loop for negative size
  ([GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv))
  and zero size in custom generators
  ([GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)).
- **Reachability:** not in production. The only observed caller uses the fixed
  positive constant `6`; SKIN supplies no size value.
- **Fixed version:** `nanoid >= 3.3.18` clears both advisories.
- **Breaking risk:** low, but an override is unnecessary and could diverge
  from PostCSS's tested dependency set.
- **Decision:** **実質影響なし**; let PostCSS/Vite select the patch.

### `wrangler@4.111.0`

- **Severity / relationship:** high; direct `devDependency`, reported through
  Miniflare's sharp and undici tree.
- **Used by:** Cloudflare authentication, deploy, local Worker emulation and
  preview tooling. It is not uploaded with `dist/`.
- **Reachability:** no public runtime path. `wrangler deploy` contacts the
  trusted Cloudflare API; the reported inherited issues are in the local
  Miniflare runtime rather than the static asset Worker.
- **Fixed version:** the direct Wrangler audit range ends at `4.113.0`, but a
  full-tree target must also patch all Miniflare transitives. Registry data
  verifies `wrangler@4.127.1` uses `miniflare@5.20260828.0-alpha`, which uses
  `sharp@0.35.2` and `undici@7.29.0`.
- **Breaking risk:** medium. It remains Wrangler 4, but static-asset manifest,
  auth, local emulator and deploy output must be validated; its current
  Miniflare dependency is an alpha line.
- **Decision:** **後回し** to a Wrangler-only maintenance task. Do not update
  sharp/undici independently.

### `miniflare@4.20260710.0`

- **Severity / relationship:** high; `wrangler -> miniflare`, inherited from
  sharp and undici.
- **Used by:** Wrangler's local Workers runtime. The production application is
  hosted by Cloudflare and does not run this npm package.
- **Reachability:** only when using Wrangler local development/emulation; not
  through `/skin-rebuild.html` and not during ordinary browser use.
- **Fixed version:** advisory boundary is later than
  `5.20260801.0-alpha`; verified registry target
  `5.20260828.0-alpha` carries patched sharp/undici.
- **Breaking risk:** high if selected directly because this crosses the 4 to
  5 prerelease boundary and Wrangler owns the compatibility contract.
- **Decision:** **実質影響なし** for the static app; resolve only through a
  tested Wrangler upgrade before accepting untrusted local Worker traffic.

### `sharp@0.34.5`

- **Severity / relationship:** high; `wrangler -> miniflare -> sharp`.
- **Used by:** Miniflare facilities. A separate Cloud Sculpt report test also
  imports the installed package to encode trusted generated pixel buffers;
  that test is not SKIN REBUILD and accepts no external image.
- **Advisory:** inherited libvips issues CVE-2026-33327, CVE-2026-33328,
  CVE-2026-35590 and CVE-2026-35591
  ([GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)).
- **Reachability:** no SKIN production path and no SKIN image decode path.
- **Fixed version:** `sharp >= 0.35.0`; the verified Wrangler target carries
  `0.35.2`.
- **Breaking risk:** medium/high if overridden because sharp includes native
  libvips binaries and Miniflare owns the expected version.
- **Decision:** **実質影響なし** for SKIN; resolve through Wrangler.

### `undici@7.28.0`

- **Severity / relationship:** high; `wrangler -> miniflare -> undici`.
- **Used by:** Miniflare's local HTTP/fetch/cache behavior.
- **Advisories:** retry response desynchronization
  ([GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524)),
  private-cache cross-user disclosure/crash
  ([GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272)),
  blob-type CRLF injection
  ([GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5)),
  cache-control whitespace disclosure
  ([GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54))
  and cookie-attribute injection
  ([GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm)).
- **Reachability:** no production browser or Cloudflare Worker bundle path.
  Katachi does not provide a shared multi-user Miniflare cache or accept
  attacker-controlled cookie/cache inputs in normal local operation.
- **Fixed version:** `undici >= 7.29.0`.
- **Breaking risk:** medium if overridden because Miniflare owns its fetch and
  cache semantics; low when received from a tested Wrangler target.
- **Decision:** **実質影響なし** for SKIN; resolve through Wrangler.

## Safe follow-up, outside this task

1. Preserve the `.fkei` baseline and current build artifacts.
2. Trial Vite `6.4.3` or newer in a dependency-only branch; do not jump to
   Vite 8 while the basic-SSL plugin peer range stops at Vite 6.
3. Run `test:skin-rebuild`, production build, public-page QA and baseline
   hash comparison before accepting any Vite lockfile.
4. Trial Wrangler as a separate toolchain change, preferring a version whose
   complete Miniflare tree is audit-clean; verify `whoami`, dry-run and deploy.
5. Do not use `npm audit fix`, transitive overrides or geometry changes as a
   substitute for these scoped upgrades.
