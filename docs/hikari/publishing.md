# hikari — web publishing

Status: active
UpdatedAt: 2026-08-01

## Current surface

Hikari is currently published as the `HIKARI` workspace on the Cloud Sculpt root page, not as a separate route.

- Production: <https://katachi.a-8c3.workers.dev/>
- Build output: `dist/`
- Cloudflare Worker: `katachi`
- Configuration: `wrangler.jsonc`

The production page must be built and deployed from a committed revision. Do not deploy directly from a dirty working tree, because the Katachi repository can contain several unrelated studies in progress.

## Release procedure

1. Confirm the intended commit and working-tree scope.
2. Run `npm run build` at that commit.
3. Verify the root page locally with real clicks:
   - `HIKARI` opens;
   - `optics` opens;
   - normal mode reports WebGPU where available;
   - `?safe=1` reports CPU preview;
   - no browser errors are emitted.
4. Confirm GitHub contains the exact commit.
5. From a clean worktree at that commit, run `wrangler deploy --config wrangler.jsonc`.
6. Open production and confirm the visible version, `HIKARI` control, Optics view, and browser error log.
7. Record the deployment URL, Cloudflare version ID, Git commit, and validation result in the release note.

## Rollback

Redeploy the last known-good committed revision. Do not repair production by building an unknown dirty tree.

## Release record — 2026-08-01 — v0.19.0

- Git commit deployed: `dc263a93d474e5e3a8f29a9ed13f65f92a256d3b`
- Cloudflare Version ID: `49267b1a-2b88-4d23-a808-9fa24bdf2a2f`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Deployed observation: v0.19.0, Tokyo date/time controls, colored host plus one clear inclusion, CPU/WebGPU inclusion focused light, reproducible case save/open
- Normal production check: Apple metal-3 WebGPU, 16,384 rays, 4,497 shape hits, Tokyo 2026-08-01 17:00 JST (azimuth 279°, altitude 20°), no production browser errors
- Forced compatibility check: `?safe=1`, CPU preview, 56 rays, same Tokyo time and inclusion controls, no production browser errors
- Cache check: a cache-busted navigation and a `Cache-Control: no-cache` fetch both served `assets/main-PXj42ohC.js`; an already-open browser tab initially reused the previous document until a fresh URL was requested.

## Release record — 2026-08-01

- Git commit deployed: `fe85e7f1de545c0dbadd5c525042febc64f4afe1`
- Cloudflare Version ID: `9170f015-5a76-4412-9382-1b0865b7b188`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Previous observation: v0.2.0, updated 2026-07-17, no `HIKARI` control
- Deployed observation: v0.17.0, updated 2026-07-30, `HIKARI` → `optics` operational
- Normal production check: WebGPU, 16,384 rays, 4,107 shape hits, no browser warnings or errors
- Forced compatibility check: `?safe=1`, CPU preview, 56 rays, no browser warnings or errors

The release was built from a detached clean worktree at the pushed commit. Uncommitted Katachi studies and unrelated working-tree changes were not included.
