# hikari — web publishing

Status: active
UpdatedAt: 2026-08-02

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
   - Natural view enables RENDER, 16/64/256 spp complete or STOP retains the latest sample, and camera/material/receiver/resize changes return to Realtime;
   - automatic orbit starts/stops, changes direction/lap duration, disables RENDER while moving, and restores it after stopping;
   - the analytic inclusion exposes a transmitted-color picker whose change survives reload and receiver recomputation;
   - `BODY · WebGL2` reports the actual capped HDR target resolution separately from the receiver backend;
   - Image produces a non-empty PNG at the current renderer pixel resolution without application chrome;
   - no browser errors are emitted.
4. Confirm GitHub contains the exact commit.
5. From a clean worktree at that commit, run `wrangler deploy --config wrangler.jsonc`.
6. Open production and confirm the visible version, `HIKARI` control, Optics view, and browser error log.
7. Record the deployment URL, Cloudflare version ID, Git commit, and validation result in the release note.

## Rollback

Redeploy the last known-good committed revision. Do not repair production by building an unknown dirty tree.

## Release record — 2026-08-02 — v0.31.2

- Git commit deployed: `47bd5bc` (`VITE_GIT_COMMIT=47bd5bc` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `b18dfa8c-bb25-4edb-887f-fc857aaf704e`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Corrected the first Bridge output against `Ref/study_01_light_size05.blend`: all 139,600 imported host polygons now use smooth shading and the host receives Ref's Catmull-Clark Subdivision settings (viewport 1, render 2), eliminating the authored flat-triangle surface error.
- Generated inclusions are now SPHERE-display Empty objects. Their Object coordinates drive Ref's linear 0.92145-to-1.0 density ramp in the host Volume Absorption, so equal-IOR low-absorption regions remain within one continuous surface instead of becoming separate sphere/metaball refractive bodies.
- Rebuilt and reinstalled `Hikari Blender Bridge.app` with the corrected importer. A corrected author file was generated at `Downloads/hikari-2026-08-01-ref-match.blend` and reopened successfully in Blender 5.2.0 LTS.
- Verification: all 72 Hikari tests, production build, Python compilation, Swift build/signature/self-test, Blender save/reopen, and the new Blender-side Ref contract verifier passed. The verifier reported 139,600/139,600 smooth host polygons, Subdivision 1/2, one Empty inclusion, and a linked host density mask. Production reported `v0.31.2`, `GPU · WebGPU`, and retained both Blender actions.

## Release record — 2026-08-02 — v0.31.1

- Git commit deployed: `e859b51` (`VITE_GIT_COMMIT=e859b51` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `6ff25e42-76b3-47c8-a59b-67b5ebc7a6a9`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Clarified the authored division of work: Hikari is the quick instrument for sensing atmosphere, while detailed forming and final expression belong to Blender. The handoff is a reproducible starting state rather than pixel parity or finished craft.
- Added `Blenderで開く（Mac）` after the existing five-file export and installed the local `Hikari Blender Bridge.app`. The companion receives only a sanitized case name, asks the author to grant the export folder through a native picker, stages only the declared sidecar and meshes, generates a non-overwriting `.blend`, and opens Blender without a Terminal command.
- End-to-end validation generated `hikari-2026-08-01.blend` from the author's Downloads bundle. Blender 5.2.0 LTS read six objects, `Hikari Camera`, Cycles, and case ID `hikari-2026-08-01`. The installed companion self-test found both Blender and its bundled importer.
- Verification: all 72 Hikari tests, production build, Swift build, ad-hoc signature verification, `git diff --check`, actual `.blend` generation/reopen, and production browser validation passed. Production reported `v0.31.1`, `GPU · WebGPU`, and exposed both `Blender用一式を書き出す` and the initially disabled `Blenderで開く（Mac）` action.

## Release record — 2026-08-02 — v0.31.0

- Git commit deployed: `3b1b0a3`
- Cloudflare Version ID: `b73a5478-9857-4c0b-844f-61d364f64252`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Added an optional local image/video visualizer under `環境と床`. With no media selected, the existing procedural environment is unchanged. `背景だけ` keeps the media screen-fixed beneath the transparent body and its existing receiver shadow/light composition. `形にも映す` also maps the same media into body reflection and refraction.
- Media bytes remain in the local browser session and are not embedded in `.hkr`. Static images can enter Progressive Render; a playing video stays in Realtime Observation so temporal accumulation does not average different frames.
- Verification: all 70 Hikari tests, production build, `git diff --check`, local WebGPU and SAFE rendering, Ref image and 3840-by-2160 MP4 playback, reflection/refraction mode switching, and restoration of the procedural default passed. Production reported `v0.31.0`, `GPU · WebGPU`, exposed `背景だけ / 形にも映す`, and emitted no browser warnings or errors.

## Release record — 2026-08-02 — v0.30.1

- Git commit deployed: `f1b2809` (`VITE_GIT_COMMIT=f1b2809` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `579c8126-731a-4749-b114-7b4b05f8c2c7`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Added deterministic 1–16 body inclusion volume packing with mixed round, soft-cluster, and stretched forms; varied millimetre sizes; scattered, clustered, or layered placement; author seed; minimum host wall; and minimum inclusion gap.
- The generated inclusion array is shared by BODY display, `.hkr`, OpticalScene validation, Blender sidecar, and Blender metaball reconstruction. Legacy single analytic inclusion mode remains available.
- Corrected packed equal-IOR receiver transport: the outer refraction still decides the floor arrival point, while merged inclusion-ball intersection intervals replace host absorption with inclusion absorption along the actual finite inside path. Light transmitted through low-absorption inclusions therefore reaches the ground without inventing energy or double-counting overlapping cluster balls.
- The rejected v0.29.3 shadow-darkening and detached receiver plate remain documented as negative evidence. v0.29.4 Stroke preserves delivered RGB and leaves the Composite shadow unchanged; the author has paused further Stroke work.
- Verification: all 69 Hikari tests, production build, Python syntax check, `git diff --check`, local WebGPU/SAFE rendering, and production WebGPU rendering passed. Production reported `v0.30.1`, exposed `ひとつ / パッキング`, referenced `assets/main-I08RwAQw.js`, and that asset contains `f1b2809`, `パッキング`, and `内包透過光`.

## Release record — 2026-08-01 — v0.29.2

- Git commit deployed: `0539f86`; exported comparison case records implementation commit `b8f7b50`.
- Cloudflare Version ID: `49022fdd-11b4-4930-be9d-90447646209f`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Replaced the rejected v0.29.1 broad-sun hypothesis with the active Blender setup: gray World plus one finite rectangular Emission plane. Area and Point lamp objects in the source `.blend` are render-disabled.
- Corrected BODY display color management by applying Three's linear-to-output transform at Realtime canvas presentation and Progressive presentation while preserving linear HDR accumulation.
- Equal-IOR inclusion BODY paths now collapse the inner optical boundary and integrate the Blender-style smooth absorption-density void. No constant inclusion glow or emission was added.
- Added saved `backlightEnabled`, intensity, width, height, and distance controls under `背面発光面（Blender比較）`. This emitter affects BODY environment lookup only; receiver, floor shadow, and focused-light transport are explicitly unchanged. The author's physical west-sun-through-window study remains a separate room/opening milestone.
- Revised `docs/hikari/cases/hikari-blender-backlight-study.hkr` to IOR 1.45, roughness 0.05, zero inclusion absorption, calibrated host absorption/color, no direct sun, and a finite backlight. Local and production WebGPU showed a bright absorption pocket against the darker purple host; Realtime and 64-spp Progressive matched without double encoding.
- Verification: `npm run test:hikari` passed 63/63 tests, production build and `git diff --check` passed, local and production browser warnings/errors were empty, and production reported `v0.29.2`.

## Release record — 2026-08-01 — v0.29.1

- Git commit deployed: `93e45f5` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `9f1bafd3-b489-40e4-9d65-ff9f52dd9bb9`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Root-cause evidence: the supplied dense-host case placed the camera centre `1.114°` from a `0.8°` sun centre, outside its `0.4°` radius. Exact camera alignment still moves the centre BODY ray roughly `5–7°` through the irregular outer refraction, so a physical-size sun can remain dark without an exposure or equal-IOR failure.
- Added `太陽をカメラ中心へ合わせる`, preserving target and distance and explicitly warning that body refraction moves the sun image again. This is a reproducible direct-background diagnostic, not a brightness guarantee.
- Added `docs/hikari/cases/hikari-blender-backlight-study.hkr`: the same dense colored host and clear equal-IOR inclusion under a `27.3°` broad source. Real-browser WebGPU verification showed the large bright source and brighter blue/purple clear region; the file is labeled as a Blender area-source comparison, not a physical sun.
- Corrected the remaining realtime BODY outer-TIR fallback so an unresolved bounded bounce uses the first internal-reflection direction rather than sampling the outside environment with the pre-TIR incident direction. Receiver CPU/WebGPU transport is unchanged.
- Recorded later MPM centre-lock, fixed-frame sequence, and MPM-plus-orbit work as deferred authored/offline constraints; no MPM runtime behavior changed in this release.
- Verification: `npm run test:hikari` passed 59/59 tests, production build and `git diff --check` passed, local and production browser warnings/errors were empty. Production reported `v0.29.1` and exposed the new alignment control.

## Release record — 2026-08-01 — v0.29.0

- Git commit deployed: `8446de7` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `6ef5d1d3-3b77-408e-ba54-157f9f4fce1a`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Added the bounded MLS-MPM artwork bridge: start from the live Hikari shape, observe a low-rate BODY-only proxy, stop on a favored instant, and persist it as explicit Cloud history so `.hkr` reopens without rerunning the simulation.
- Receiver transport, Progressive Render, document mutation, Blender export, Katachi switching, and GPU/SAFE switching are protected during active MPM; adoption or import invalidates and restarts receiver transport explicitly.
- Mac high-DPI recording mitigation: automatic orbit and MPM playback cap internal realtime resolution at 1x and restore the normal maximum 2x after motion. A 1x Windows/SAFE viewport is unchanged. The supplied Mac captures delivered 5.23 and 20.08 actual fps, while the author reported smooth Windows GPU playback.
- Local real-browser verification: 12 balls became a moving 61-ball proxy, receiver transport stayed paused, 59 balls were adopted and saved/reopened in a timestamped v0.29.0 `.hkr`; a final regression pass adopted 58 balls, re-enabled compute switching, and resumed receiver status as `ok`. Retina canvas size changed 1880×1344 → 940×672 during orbit → 1880×1344 after stop.
- Production verification: the deployed page reported `v0.29.0` at the production URL and exposed the published MPM/deformation shell. The in-app production tab used the honest `CPU · FALLBACK`; local verification used `GPU · WebGPU`.
- Verification: `npm run test:hikari` passed 57/57 tests, production build passed, and `git diff --check` passed. The existing >500 kB chunk warning remains non-blocking.
- Schedule/design: the August submission schedule keeps the black/white optical artifact gate before the rough artwork take. Offline fixed-FPS PNG sequence rendering and the geometry-derived light-drawing trace remain later slices, not part of this deployment.

## Release record — 2026-08-01 — v0.28.3

- Git commit deployed: `2db2dbf` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `99ca0b8c-8337-4dbd-afd6-16bb603a49b5`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Source unification: Natural and Analysis visible emitter discs now use the same `sunSize` angular diameter as finite-source receiver transport. The previous background used a fixed exponent equivalent to a separate emitter size.
- Fixed author-case comparison: the supplied equal-IOR v0.28.1 `.hkr` at Tokyo 11:50 showed a broad white background emitter and substantially brighter purple/clear-region response at `27.3°`; changing only the diameter to `0.5°` removed the broad emitter and returned the body to a much darker reading.
- Scope control: this release changes emitter diameter only. Direction, authored intensity, material absorption, nested path depth, Progressive accumulation behavior, and receiver energy accounting remain unchanged.
- Local browser verification: the supplied case compiled and rendered under `GPU · WebGPU`; `?safe=1` reported `SAFE · CPU`; neither mode emitted browser warnings or errors.
- Production asset verification: cache-busted production resolved to `assets/main-BKAHg-pa.js` and `assets/shaders-DUlf1jTA.js`, reported `v0.28.3`, and emitted no browser warnings or errors. The immediately preceding cached HTML briefly served v0.28.2 until a fresh query reached the new deployment.
- Verification: `npm run test:hikari` passed 55/55 tests and `VITE_GIT_COMMIT=2db2dbf npm run build` passed.
- Known remaining work: freeze `0.53°` and `27.3°` images from the same saved case, then implement deeper Progressive host/inclusion paths with unresolved/convergence diagnostics; the visible-disc radiance remains an appearance proxy rather than calibrated solar radiance.

## Release record — 2026-08-01 — v0.28.2

- Git commit deployed: `45e9d64` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `e177c3fc-1066-4e17-94f4-08f99b6b56b4`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Document naming: every `.hkr` download now includes its UTC save time down to milliseconds; a current-day default becomes `hikari-2026-08-01T08-22-15-709Z.hkr` rather than relying on browser suffixes such as `(1)`.
- Revision identity: the stable internal `documentId` is unchanged, so time-stamped downloads remain revisions of one editable study rather than new documents.
- Supplied-case diagnosis: recorded the private v0.28.1 author case as equal outer/inclusion IOR `1.246`, zero inclusion absorption, host absorption `27.3`, sun size `27.3°`, environment contrast `0`, and mist `1`; this rules out an accidental IOR mismatch and identifies environment/source cues plus bounded nested BODY paths as the next comparison variables.
- Production asset verification: the served root resolved to `assets/main-DqRx7Smx.js`; the live page reported `v0.28.2` and `GPU · WebGPU`.
- Browser verification: top-bar Save produced `hikari-2026-08-01T08-22-15-709Z.hkr` on production and reported one saved view.
- Verification: `npm run test:hikari` passed 54/54 tests and `VITE_GIT_COMMIT=45e9d64 npm run build` passed.

## Release record — 2026-08-01 — v0.28.1

- Git commit deployed: `def4320` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `82324e85-603f-4ff0-ba0c-f1026103677c`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Inclusion relationship: `屈折率を外側に揃える` copies only the current outer-host IOR; inclusion color, absorption, transform, size, and ON/OFF state remain unchanged. The existing near-colorless same-resin action remains separate.
- Dense material authoring: outer-host and inclusion absorption ranges now extend from `0–2.5` to `0–40`, while their defaults and fine steps remain unchanged. Normalization and `.hkr` loading use the same ceiling.
- Reference basis: private Ref anchors `L1003160`, `L1003171`, and `L1003177` establish the relational target—thick paths near black, thin/backlit paths retaining hue and distortion, and distinct surface reflection. `empty13_comp.png` is recorded as the too-uniformly-bright negative baseline.
- Material semantics: an outer custom color at concentration 40 leaves about 4% of its least-absorbed channel through a two-shape-unit path. The inclusion retains its legacy 25× density scale for saved-scene compatibility; neither value claims physical calibration yet.
- Production asset verification: the served root resolved to `assets/main-C9K65qFW.js` and `assets/main-Ccj2NRbW.css`; the live page reported `v0.28.1` and `GPU · WebGPU`.
- Browser verification: production exposed the new IOR-only action; both absorption sliders reported max 40 with their previous `0.05` outer and `0.01` inclusion steps. Local UI verification also confirmed that pressing the action while the inclusion was OFF left it OFF.
- Verification: `npm run test:hikari` passed 53/53 tests; `VITE_GIT_COMMIT=def4320 npm run build` passed; independent diff review found no release blocker after the IOR-only state and outer/inclusion density documentation corrections.
- Known remaining work: exact Ref parity still depends on physical scale, measured absorption, light/exposure, surface finish, and path-length validation; the expanded authoring range only removes the former control ceiling.

## Release record — 2026-08-01 — v0.28.0

- Git commit deployed: `d3d72d8` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `bba85d70-1cff-41ee-8b86-4cef095daa7f`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Schedule: added the active weekly execution plan and corrected the order to uniform inclusion material → representative receiver parity → deeper Progressive BODY → living-shape bridge; spatial pigment variation no longer precedes the uniform optical gates
- Camera recording: Record now provides automatic orbit Start/Stop, direction, and 10–180 second lap duration while preserving target, horizontal radius, elevation, and lens; manual OrbitControls input stops the orbit
- Progressive contract: starting automatic orbit discards any retained still, RENDER remains disabled while the camera moves, and becomes available again after stopping
- Inclusion material: the analytic inclusion now has its own transmitted-color picker and independent absorption concentration; white preserves every legacy neutral coefficient exactly
- Shared path: the adapter-derived inclusion RGB is consumed by Realtime/Progressive BODY, transparent shadow, CPU/WebGPU receiver transport, `.hkr`, and Blender export; color participates in the receiver scene revision
- Production asset verification: the served root resolved to `assets/main-DcLBg9F5.js` and `assets/main-Ccj2NRbW.css`; the bundle contains app `0.28.0`, commit `d3d72d8`, `inclusionTransmissionColor`, `内包の透過色`, and `自動回転を開始`
- Browser verification: production reported `GPU · WebGPU`, exposed both new controls, disabled RENDER during orbit, restored it after STOP, and emitted no browser warning/error
- Verification: `npm run test:hikari` passed 52/52 tests; `VITE_GIT_COMMIT=d3d72d8 npm run build` passed; independent diff review found no major or medium release blocker
- Known remaining work: representative raw/fixed-radius CPU/WebGPU parity cases, deeper Progressive host/inclusion paths and unresolved metrics, then the living-shape freeze bridge

## Release record — 2026-08-01 — v0.27.0

- Git commit deployed: `2c5c919` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `ca396f9c-876c-438d-b269-a1033785e3d3`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Author control: the outer transparent body now offers `自由色`; its native picker is labelled `透過色`, while the existing Absorption slider remains the independent concentration control
- Material semantics: the selected transmitted sRGB hue is linearized and converted continuously from neutral through pastel to saturated complementary Beer–Lambert RGB absorption, rather than being applied only as surface tint
- Shared path: Realtime and Progressive BODY, transparent shadow, SAFE CPU/WebGPU receiver transport, `.hkr`, and Blender export consume the same OpticalScene coefficients; `uOpticalTint` remains appearance-only edge/haze color
- Revision/migration: material values participate in the receiver scene revision, a color change invalidates Progressive accumulation, custom color round-trips in `.hkr`, and older documents without the field restore the amber default
- Production asset verification: the served root resolved to `assets/main-BNkuQRtv.js` and `assets/main-Ccj2NRbW.css`; the bundle contains app `0.27.0`, commit `2c5c919`, `hostTransmissionColor`, `自由色`, and `透過色`
- Verification: `npm run test:hikari` passed 48/48 tests; `VITE_GIT_COMMIT=2c5c919 npm run build` passed; final review confirmed near-white/pastel continuity and no release blocker
- Known remaining work: give each inclusion its own transmitted color/concentration, then replace the current shader-only color irregularity with a reproducible object-local concentration field

## Release record — 2026-08-01 — v0.26.0

- Git commit deployed: `dc1c1bd` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `9cdaab8b-987a-4b9b-aaed-e3785d42424c`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Dual observation: ordinary orbit/edit work remains Realtime; the author can start a separate 16/64/256-spp Progressive BODY still and stop while retaining the latest completed sample
- Linear accumulation: deterministic sub-pixel jitter and progressive rough-environment samples accumulate as a running mean in half-float linear HDR; exposure tone mapping and monochrome conversion occur once during presentation
- Revision safety: camera, shape, material, daylight, receiver, backend, inclusion receiver trust, and viewport changes discard the accumulation instead of mixing incompatible scene samples
- Memory safety: three HDR targets preserve aspect and cap at 2,560×1,440 equivalent pixels; Calculation Status displays the actual BODY WebGL2 target resolution
- PNG/document contract: Image captures the retained Progressive result and includes its spp in the filename; `.hkr` preserves author inputs but does not serialize pixels, progress, elapsed time, or GPU resources
- Local browser verification: GPU WebGPU completed 64 spp at 1880×1344; SAFE CPU completed 64 spp at 940×672; both rendered without a black body or browser warnings/errors
- Production verification: cache-busted v0.26.0 reported `GPU · WebGPU`, completed 64 spp at 1880×1344 in 1.6 seconds, and exported `hikari-optics-progressive-64spp-...png` at 1880×1344 with no warnings/errors
- Verification: `npm run test:hikari` passed 42/42 deterministic tests; `VITE_GIT_COMMIT=dc1c1bd npm run build` passed; final diff review found no release blocker
- Known remaining work: custom host/inclusion absorption color and concentration, deeper host/inclusion Progressive paths, unresolved/convergence metrics, receiver progressive accumulation, and denoising remain later slices

## Release record — 2026-08-01 — v0.25.3

- Git commit deployed: `7dffa97` (`VITE_GIT_COMMIT` embedded in exported Hikari/Blender cases)
- Cloudflare Version ID: `094ca0e2-cefa-4fe5-9d99-c32bbfcf00d3`
- Production URL: <https://katachi.a-8c3.workers.dev/>
- Body-view correction: removed v0.25.2's bounded host-tinted ambient, which eliminated black but appeared as broad flat brown material. Failed nested paths keep the already solved outer-host view; outer TIR receives one bounded internal bounce before the documented realtime continuity approximation
- Appearance/transport split: geometric normals still decide medium entry, exit, and TIR. Cosmetic normal variation affects the transmitted environment lookup as well as reflection and surface appearance, restoring the earlier soft distortion without deciding whether a physical path exists
- Receiver isolation: CPU/WebGPU receiver deposits, adaptive reconstruction, shadow support, loss buckets, and energy ledger are unchanged from v0.25.1
- Rendering decision: the implementation plan now separates immediate Realtime Observation from a future author-triggered Progressive Render that accumulates more samples and path depth only after the scene stops changing
- Browser verification: local WebGPU and `SAFE · CPU` compiled and rendered v0.25.3; cache-busted production reported `GPU · WebGPU`, displayed the revised body, and retained the continuous receiver shadow
- Verification: `npm run test:hikari` passed 36/36 tests; `VITE_GIT_COMMIT=7dffa97 npm run build` passed
- Known remaining work: add the Progressive Render path, expose its unresolved-path/convergence metrics, and freeze a fixed-camera image regression for the author's approved view

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
