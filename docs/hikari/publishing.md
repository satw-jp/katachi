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
   - the top-bar button reports `GPU · WebGPU` or `SAFE · CPU`, and one tap switches each direction without losing stored settings;
   - the same-count comparison leaves the displayed receiver/status unchanged and reports every gate; safe mode reports comparison unavailable without disturbing its CPU preview;
   - two saved views can be recalled and written as one `.hkr`, and a legacy single case remains accepted;
   - Image produces a non-empty PNG at the current renderer pixel resolution without application chrome;
   - no browser errors are emitted.
4. Confirm GitHub contains the exact commit.
5. From a clean worktree at that commit, run `wrangler deploy --config wrangler.jsonc`.
6. Open production and confirm the visible version, `HIKARI` control, Optics view, and browser error log.
7. Record the deployment URL, Cloudflare version ID, Git commit, and validation result in the release note.

## Rollback

Redeploy the last known-good committed revision. Do not repair production by building an unknown dirty tree.

## Release record — 2026-08-01 — v0.25.2

- Git commit deployed: `4ffdb80` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `9d2c07e7-2ec9-4e8a-8393-fea02d03b59f`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Body-view correction: entry and exit refraction use unperturbed geometric normals; cosmetic variation remains on reflection, Fresnel appearance, spectrum/stress, edge, and highlight only
- Unresolved view behavior: known front reflection is retained with bounded, host-attenuated ambient instead of discarding the non-Fresnel component as opaque black. This is view-only and does not create receiver energy
- Receiver isolation: CPU/WebGPU deposits, support, losses, and energy-ledger behavior are unchanged from v0.25.1
- Browser verification: the same fixed camera showed no large black body islands in local WebGPU and `SAFE · CPU`; cache-busted production v0.25.2 reported `GPU · WebGPU`, rendered the corrected body, and emitted no warnings or errors
- Verification: `npm run test:hikari` passed 35/35 tests, including two shader contracts; `VITE_GIT_COMMIT=4ffdb80 npm run build` passed
- Known remaining work: replace the bounded unresolved-view ambient with complete recursive inner reflection/refraction, and add a fixed-camera image regression rather than relying only on shader source contracts plus browser visual QA

## Release record — 2026-08-01 — v0.25.1

- Git commit deployed: `9308213` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `cc2b980b-d5e5-4aff-915d-d35201bd04a3`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Windows SAFE correction: the receiver reconstruction radius follows emitted sample spacing—3 texels at 16,384 samples, 8 at 2,048, and 12 at 1,024—while edge-normalized blur preserves integrated flux
- Backend control: the top bar reports `GPU · WebGPU`, `SAFE · CPU`, `CPU · FALLBACK`, or backend error; one tap changes mode
- Switch handoff: current recipe/history, Hikari settings, camera, observation, document metadata, and saved views survive GPU/SAFE reload through a validated one-use local handoff
- Reconstructed-field parity: Tokyo 17:00 at the same 2,048 rays passed all current gates—maximum RGB flux error `0.46%`, centroid `0.27` texel, 95% envelope `0` texel, support IoU `100%`, deposit L1 `0.87%`, and negligible coverage L1. Raw-hit/fixed-kernel auxiliary parity remains open because radius-8 reconstruction can hide sub-kernel boundary differences
- Production normal check: cache-busted v0.25.1 reported `GPU · WebGPU`
- Production safe check: one tap changed to `SAFE · CPU` and preserved a named current document, observation text, and one saved view
- Verification: `npm run test:hikari` passed 33/33 deterministic tests; `VITE_GIT_COMMIT=9308213 npm run build` passed; local and production mode switching passed with real pointer interaction
- Known remaining work: run raw-hit or fixed-radius parity across the frozen morning/noon/evening and material case family; validate the adaptive kernel against actual affected-hit density rather than emitted sample count alone

## Release record — 2026-08-01 — v0.24.0

- Git commit deployed: `9206be2` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `21de4bff-1111-4b06-be77-b629350bf8e6`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Author diagnostics: `統合 / 影の範囲 / 届いた光 / 届かなかった光` switch without retracing; diagnostic false color is limited to reconstructed shadow support and does not use the author-facing caustic gain or per-frame normalization
- Spatial non-arrival field: material/interface loss, reflection/TIR, receiver/domain escape, and unresolved paths are splatted at each ray's unobstructed baseline; support rejection stays separate
- Runtime accounting: the status panel reports delivered, non-arrival, outside-support, and residual percentages; Tokyo 17:00 closed at displayed residual `0.0%` on both backends
- Transport lifecycle: stale Natural textures and Analysis geometry are suppressed while recomputing; a failed GPU computation explicitly publishes a CPU fallback
- Path correction: outer TIR retains exit-incident energy for reflection instead of applying a fictitious exit transmission; incomplete or TIR inclusion paths no longer fall back to a host-only receiver deposit
- Parity foundation: the pure comparator gates receiver/revision structure, per-channel RGB flux, centroid, 95% envelope, support IoU, and normalized deposit/coverage shape; the automated same-count device runner remains pending
- Production normal check: v0.24.0, Tokyo 17:00, Apple metal-3 WebGPU, 16,384 rays / 3,820 shape hits, four diagnostic controls with real hit targets, and no warnings or errors
- Production safe check: v0.24.0, `?safe=1`, CPU preview, 1,024 transport rays, one inclusion, displayed residual `0.0%`, and no warnings or errors
- Verification: `npm run test:hikari` passed 27/27 deterministic tests; `VITE_GIT_COMMIT=9206be2 npm run build` passed from a clean committed tree
- Known remaining work: connect the same-count CPU/WebGPU device runner, add lifecycle and inclusion-TIR regression tests, and align the view shader's nested-TIR approximation with receiver transport

## Release record — 2026-08-01 — v0.23.0

- Git commit deployed: `04de644` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `3f945525-1bfe-4980-bf3a-822c06bdeb44`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Receiver composition: every affected finite-source ray records the unobstructed baseline and transported RGB deposit; Natural removes that baseline before adding the deposit, replacing the previous independent direct shadow plus additive focused-light overlay
- Shared finite source: CPU and WebGPU consume the same seeded aperture position and angular sun-disk sample prefix, so `sunSize` changes traced directions as well as invalidating the result
- Transport safeguards: support containment is applied to the reconstructed HDR field before display; Natural no longer adds five displaced spectral deposits, recolors or amplifies the transported field, compresses its peaks, or applies a second fragment-shader support mask
- Runtime accounting: material/interface loss, reflection/TIR, receiver escape, out-of-domain flux, support rejection, and unresolved invalid paths are accumulated independently; the ledger residual is no longer filled after tracing
- GPU ABI correction: the result payload is a shared 28-float layout and the consumer uses the same stride/offset contract; a two-record regression test prevents the previous 20-float decode overlap
- Production normal check: v0.23.0, Tokyo 17:00, Apple metal-3 WebGPU, 16,384 rays / 3,820 shape hits, finite sun disk, one inclusion, and no production-origin warnings or errors
- Production safe check: v0.23.0, `?safe=1`, CPU preview, 1,024 transport rays, finite sun disk, one inclusion, and no production-origin warnings or errors
- Verification: `npm run test:hikari` passed 17/17 deterministic tests; `VITE_GIT_COMMIT=04de644 npm run build` passed from a clean committed tree
- Known remaining work: add an author-visible receiver/ledger diagnostic overlay and automate full-field CPU/WebGPU device tolerance gates before treating Phase 3E as complete

## Release record — 2026-08-01 — v0.22.0

- Git commit deployed: `5fa6973` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `7a97ee9a-a612-4b14-bd1e-69adf94c0867`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Deployed transport: fixed 32×32 shape-unit receiver domain at 512² Float32 flux, aperture/sample weighting, edge-energy-normalized reconstruction, normalized five-band RGB flux, Float32 texture upload with shader-side bilinear sampling, and fixed display exposure
- Backend alignment: CPU/WebGPU use the same rectangular aperture extents, host absorption/interface throughput, receiver/light revisions, and per-emitted-sample flux; the CPU safe path computes 256–2,048 transport rays independently from its bounded Analysis geometry
- Local daylight check: Tokyo 2026-08-01 09:00, 12:00, and 17:00 WebGPU Natural views kept focused light within the transparent shadow support with no detached patch; integrated RGB flux was stable and no browser warnings were emitted
- Local 17:00 parity check: WebGPU 16,384 rays versus forced-safe CPU 1,024 rays differed by 0.78% in total RGB flux and 0.18 shape unit in receiver centroid; peak irradiance remained backend-dependent at about 0.43 versus 0.59
- Production check: cache-busted v0.22.0 loaded in normal WebGPU and `?safe=1` CPU modes; both published the expected receiver diagnostics, rendered shadow-contained focused light, and emitted no production-origin browser warnings or errors
- Verification: `npm run test:hikari` passed 9/9 deterministic tests; `VITE_GIT_COMMIT=5fa6973 npm run build` passed
- Known remaining work: the bounded receiver records about 9% escaped-domain flux in the 17:00 reference; Natural still adds focused transport to an independent direct term behind a temporary support gate. Shared finite-light baseline replacement, runtime energy-ledger closure, validation-mode spectral cleanup, and automated full-field CPU/WebGPU tolerance gates remain Phase 3 work

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
