# C — View Representation Continuity v0 Fix 2 — FIELD interaction scale + MESH normal style

Date: 2026-09-08
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: ACTIVE

## Trigger / author evidence

After View Representation Continuity v0 was accepted at `77f121cda5d60a2e443a994c00a05c7630417c15`, author use exposed two presentation defects:

1. FIELD interaction: when view-rotate begins, the temporary coarse FIELD presentation can appear magnified / cropped / over-upscaled. Continuing the rotation returns the presentation to the expected framing. This is a presentation bug; the author does not accept a transient framing jump as the intended coarse FIELD behavior.
2. MESH normal style: selecting primary MESH while the UI says normal/solid can present a translucent Ghost-like surface. Toggling Ghost and then normal restores the expected opaque MESH.

Related observation: MESH currently shows the internal structure while BEADS/FIELD do not. The broader structure-visibility model may change later and is NOT the scope of this fix.

## Authority / start point

Continue from:
- branch: `agent/skin-view-representation-continuity-v0`
- checkpoint: `77f121cda5d60a2e443a994c00a05c7630417c15`
- J-side only

No merge/rebase/unrelated cleanup.

## A. FIELD interaction framing diagnostic + bounded fix

Do not guess the cause. Reproduce the author symptom in the current browser route and distinguish:

- viewport rect in CSS pixels;
- renderer pixel ratio / drawing-buffer size;
- interactive render-target width/height;
- viewport/scissor dimensions before render-target render;
- viewport/scissor dimensions after returning to the canvas;
- active camera projection / inverse projection before first interaction frame and after the first actual camera mutation;
- whether the first coarse frame is rendered from stale viewport/camera state or from a target/canvas coordinate mismatch.

Current implementation uses `FIELD_INTERACTION_RENDER_SCALE = 0.25` and a reusable `WebGLRenderTarget`. Preserve the same FIELD shader/material/payload semantics.

The fix must ensure:
- entering FIELD interaction never changes apparent framing/zoom/crop by itself;
- coarse FIELD may be visibly lower resolution, but must cover the exact same viewport framing as settled FIELD;
- first interaction frame and subsequent rotation frames use the same viewport extent;
- 1-view and 4-view modes remain correct;
- devicePixelRatio > 1 is covered if relevant to the root cause;
- releasing interaction still resumes accepted idle refinement.

Do not solve this by disabling the coarse FIELD presentation or raising it to full resolution.

## B. MESH normal/ghost synchronization

The current legacy helper `keepInternalGraphVisibleInMesh()` calls `observationModeKeepingInternalGraphVisible(...)`, which promotes `viewMode === "mesh" && observationMode === "normal" && internalEdgeCount > 0` to `ghostSkin` so an internal graph stays visible through the surface.

That behavior belonged to the earlier inspection-oriented mesh role. It now conflicts with the accepted primary representation model:

`BEADS · Fast -> MESH · Surface -> FIELD · Exact`

Primary MESH in normal/solid display must therefore remain opaque. Selecting MESH must not silently change normal/solid into an implicit Ghost presentation.

Bounded direction:
- stop automatic `normal -> ghostSkin` promotion for the primary authoring MESH path;
- preserve explicit user-selected Ghost behavior;
- preserve explicit internal-only / graph inspection facilities where already available;
- do not redesign the future internal-structure visibility model in this fix;
- do not delete Internal Graph data or alter its geometry.

The author specifically said the broader structure presentation can be revised later. Record that as DEFERRED rather than widening this task.

## C. Protected scope

Do not change:
- FIELD SDF math / smooth-min order / primitive semantics / payload semantics;
- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support / `supportSource`;
- Stage 6 geometry authority;
- FKEI / Export / 3MF semantics;
- Output Scale;
- compute endpoint/configuration;
- External STL Host;
- Usagi / durability / Outside->Outside Support;
- internal-structure generation algorithm.

## D. Browser gate

Use the same current C-compatible sample and browser route.

Verify:
1. settled FIELD -> begin rotate: first coarse frame preserves exact framing (no magnified/cropped jump);
2. continued FIELD rotate remains coarse but correctly framed;
3. release resumes refinement at final pose;
4. FIELD pan/zoom also do not introduce framing jumps;
5. repeat in 1-view and 4-view where practical;
6. normal/solid -> MESH: MESH appears opaque immediately once available;
7. MESH does not silently switch to Ghost because an internal graph exists;
8. explicit Ghost -> normal still works;
9. BEADS / MESH / FIELD switching remains stable;
10. internal graph data remains untouched; broader structure-visibility redesign is deferred;
11. no new console exception;
12. focused tests / typecheck / build / `git diff --check` PASS;
13. Production / Support / FIELD semantic / Export / Stage 6 authority unchanged.

## Done when

- coarse FIELD interaction changes resolution only, never framing;
- primary MESH normal display is truthfully opaque;
- no implicit Ghost mode is introduced merely to expose internal structure;
- broader internal-structure display policy remains deferred;
- commit/push and STOP for C SOL review.
