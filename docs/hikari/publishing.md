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

## Release record — 2026-08-01 — v0.21.1

- Git commit deployed: `4d70482` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Plan commit: `1c9b506` (shared receiver transport and energy-ledger roadmap, committed before implementation)
- Cloudflare Version ID: `964c9607-b140-477e-9141-6c7442d89b2b`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Deployed correction: Natural/Analysis, CPU, and WebGPU now use `OpticalScene.receiver` instead of mixing the visible `y=-2.35` floor with a shape-derived focused-light plane; unresolved entry/exit TIR cannot deposit receiver energy
- Author-facing rule: the focused-light contribution is temporarily gated by the same finite-source transmission support as the visible shadow, so an independently detached bright patch is not composited
- Normal production check: v0.21.1, Tokyo 17:00, Apple metal-3 WebGPU, 16,384 rays / 4,497 shape hits, Natural active and diagnostic rays off
- Forced compatibility check: v0.21.1, `?safe=1`, CPU preview, 56 rays, Tokyo 17:00
- Known remaining work: replace the peak-normalized 8-bit `CausticField` with a fixed-domain HDR receiver transport field, shared light samples, and an energy ledger before room, living-shape, placement, multi-body, or Ambient Mix implementation

## Release record — 2026-08-01 — v0.21.0

- Git commit deployed: `f078bc1` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `64af92bb-858b-41b4-9f8c-887fe20ea798`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Deployed observation: a non-scrolling application bar now owns contextual Open, Save, Export, workspace switching, and fullscreen; the right dock separates scene Layers from collapsible Properties
- Desktop check: 1280 × 720 gave a 48 px bar, 940 × 672 viewport, and 340 × 672 inspector; real hit testing and clicks moved from Layers to the requested property group
- Narrow check: 640 × 800 gave a 44 px bar, 640 × 436 viewport, and 640 × 320 inspector with no document-level scroll
- Fullscreen check: focus mode hid the application bar and inspector, expanded the renderer, retained a visible exit action, and restored the previous shell dimensions on exit
- Inclusion comparison: `同じ樹脂（色だけ薄い）` changed the retained low-IOR value from 1.1 to the host IOR 1.5 while preserving low inclusion absorption 0.02; this is the intended first comparison against the Ref Blender absorption-void study
- Normal production check: Apple metal-3 WebGPU, 16,384 rays / 4,497 hits, Tokyo 17:00, v0.21.0 shell and same-resin action visible
- Forced compatibility check: `?safe=1`, CPU preview, 56 rays, v0.21.0 shell visible

## Release record — 2026-08-01 — v0.20.0

- Git commit deployed: `ce5c526` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `9b88b109-a80e-43e5-b72f-5ba95a4ea500`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Deployed observation: v0.20.0 adds the Hikari-side Blender bundle panel, format-v2 sidecar, camera aspect, explicit Y-up→Z-up mapping, mesh hashes/roles/spaces, and the Blender bootstrap
- Normal production check: Apple metal-3 WebGPU, 16,384 rays, 4,497 shape hits, Tokyo 17:00, inclusion focused light, Blender panel visible, no production browser errors
- Forced compatibility check: `?safe=1`, CPU preview, 56 rays, Blender panel visible, no production browser errors
- Production export check: five files generated; sidecar reported app v0.20.0, commit `ce5c526`, format v2, the expected axis matrix, and captured camera aspect
- Blender 5.2 end-to-end check from an equivalent browser bundle: OBJ and check STL hashes passed, host reconstructed at 75.505 × 70.477 × 80.000 mm, analytic inclusion at 22.509 mm diameter, receiver at 10,000 mm, camera frame 1470 × 1080, `.blend` saved and reopened successfully

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
