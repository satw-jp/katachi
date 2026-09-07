# C — Runtime Status + Progressive FIELD v0

Date: 2026-09-07
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: ACTIVE

## Why this supersedes the earlier visibility-only task

The author re-tested the accepted J-side runtime and observed that FIELD eventually becomes visible, but only after an unacceptably long wait. A task that merely fixes `current + blank viewport` is therefore insufficient.

The product requirement is now interaction-first progressive presentation:

**immediate proxy -> coarse FIELD -> progressively clearer FIELD**

The author must be able to keep navigating while refinement happens. A final-quality FIELD draw that blocks the UI for seconds is not an acceptable automatic endpoint.

This task supersedes `docs/tasks/C_RUNTIME_STATUS_FIELD_VISIBILITY_V0.md`.

## Start point / authority

Start from the accepted C authority:

- accepted branch/checkpoint: `agent/skin-field-vnext-interaction-v0` / `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- canonical C workspace: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- user-managed shared samples authority: `J:\dev\samples`
- live compute/helper runtime: `J:\dev\katachi-compute-helper-tray`
- existing compute endpoint/connection is already PASS; do not rewrite it

Preferred implementation branch:

`agent/skin-runtime-status-progressive-field-v0`

Use J-side work only. If creating a new worktree, create it under `J:\dev\worktrees` from exactly `dad764ce...`.

## A. Tiny compute/helper status

Add a deliberately small runtime-only status indicator in existing SKIN chrome.

Examples only:

- `Compute ● CUDA`
- `Compute ● CPU`
- `Compute ○ offline`
- `Compute … checking`

Requirements:

- reuse the existing C/helper capability probe and verified endpoint/configuration;
- no new endpoint and no connection rewrite;
- initial probe plus modest refresh only; no aggressive polling;
- compact primary UI, optional tooltip for backend/endpoint detail;
- status must never enter FKEI, authoring state, Production state, or exports;
- truthful unknown/offline states; no false PASS.

## B. Progressive FIELD presentation — interaction first

### User-visible contract

Selecting FIELD with valid authoring geometry must not produce a long blank/frozen wait.

The intended sequence is:

1. **Immediate** — show the existing beads/current lightweight proxy on the next render opportunity.
2. **Coarse FIELD** — replace/overlay the proxy with a low-cost FIELD result as soon as available.
3. **Refine** — while the author is idle, progressively increase FIELD image quality.
4. **Interaction** — any rotate/pan/zoom immediately returns to the lightweight proxy and cancels/supersedes pending refinement.
5. **Resume** — after interaction ends, restart from a responsive coarse FIELD result and refine again.

This is presentation-only. Backend preference remains unchanged.

### Preserve FIELD meaning

All progressive FIELD passes must use the same authoritative current FIELD source and the same full primitive set.

Do not change:

- FIELD SDF math;
- sequential smooth-min order;
- primitive grouping/filter semantics;
- `fieldPrimitiveStore` semantics;
- payload packing semantics;
- authoring/Production geometry.

Do not decimate or silently subset primitives merely to obtain a faster image.

A coarse pass may reduce **screen/image sampling quality** but not field/source semantics.

### Preferred rendering strategy

Prefer a FIELD-only progressive framebuffer/render-target quality ladder rather than changing geometry semantics.

A suitable design is:

- keep CSS/display size stable;
- render FIELD initially to a substantially lower internal resolution;
- upscale that result for immediate visual feedback;
- schedule higher internal-resolution passes after idle;
- reuse the existing FIELD payload/textures across refinement tiers; do not rebuild primitive payload per tier;
- keep non-FIELD layers at their normal resolution;
- restore normal renderer state when leaving FIELD.

Exact scale values are implementation details and may be tuned on the current dense sample. A multi-tier ladder such as coarse -> medium -> fine is expected; do not hard-code quality labels to a single machine assumption if a cleaner adaptive policy is available.

### Responsiveness boundary

Do **not** automatically launch a known multi-second full-resolution FIELD pass merely because the author stopped moving.

Automatic refinement must preserve usability. If a higher-quality monolithic pass is still too expensive:

- keep the best responsive preview visible;
- mark it truthfully as preview/refining if useful;
- use chunked/tiled/incremental refinement or an equivalent non-blocking method if implemented within this bounded renderer scope;
- otherwise STOP refinement at the responsive tier and report the remaining full-quality cost to C SOL.

Do not expand into a new FIELD acceleration algorithm in this task.

### Invalidation / stale-result rules

Pending refinement must be invalidated when any of the following changes:

- camera pose;
- top-level View Layer;
- FIELD backend selection;
- FIELD source / host / patch authoring input;
- viewport size/layout;
- clipping state that changes the FIELD image.

A stale refinement pass must never overwrite a newer camera/source state.

Leaving FIELD must immediately hide FIELD presentation and restore the accepted BEADS/MESH/etc visibility behavior from `dad764ce...`.

## C. FIELD availability / empty-state truthfulness

The current UI can mark FIELD `current` from host existence alone. That is not sufficient.

Required:

- known valid FIELD source + selected FIELD -> visible proxy immediately, then progressive FIELD;
- unavailable backend / no host / empty source / capability failure -> small explicit reason, not unexplained blank viewport;
- do not fabricate geometry or substitute an unrelated Production mesh;
- Legacy and vNext keep their existing semantic roles.

## D. Browser gate — use the dense real state

Use the J runtime and the same/current dense sample that reproduced the long wait. Record the sample/state and primitive count.

Verify:

1. helper OFF -> tiny status truthfully shows offline/unavailable;
2. helper ON -> tiny status reports healthy backend/CUDA using the existing connection;
3. FIELD selection with known geometry gives immediate visible proxy instead of blank waiting;
4. a coarse FIELD result appears before full/final quality and is recognizably the current shape;
5. quality visibly improves while idle without requiring another click;
6. camera rotate/pan/zoom remains responsive and immediately uses the lightweight proxy;
7. interaction invalidates stale pending refinement;
8. after interaction, progressive FIELD restarts at the final camera pose;
9. FIELD(vNext) -> BEADS -> FIELD preserves vNext preference and no stale fullscreen result remains;
10. Legacy FIELD retains its semantics and participates in truthful progressive/empty-state presentation as appropriate;
11. MESH / GRAPH / DIAGNOSTICS switching does not regress;
12. no compute/rebuild/export callback is triggered solely by status/view/refinement;
13. no new console exception attributable to this task;
14. no repeated refinement resource leak/duplicate render-target accumulation is observed.

### Performance evidence

Do not claim PASS merely because FIELD eventually appears.

Record at least:

- time to immediate proxy;
- time to first coarse FIELD result;
- time/quality sequence of subsequent refinement tiers;
- observed behavior when the author interrupts refinement with camera movement;
- whether any automatic refinement tier still causes a visibly multi-second UI stall.

No universal FPS target is required, but an automatic tier that visibly freezes author interaction for seconds is a FAIL for this task.

## E. Tests

Add focused tests for:

- compute status presentation states;
- progressive FIELD quality-state transitions;
- interaction start -> proxy;
- interaction end -> coarse/refine restart;
- stale refinement generation/token rejection;
- leaving FIELD cancels/hides FIELD refinement;
- backend preference persists;
- empty/unavailable reason policy;
- renderer quality state restores when switching to BEADS/MESH.

Run at minimum:

- existing FIELD focused tests;
- new focused tests;
- `npm run test:skin-rebuild` where available;
- typecheck;
- build;
- `git diff --check`;
- current Production parity sufficient to prove locked BODY / Graph / Support / 3MF remain exact.

Locked identities remain:

- Permanent BODY: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`
- Permanent Graph: `5cb659849d694beaae6443a4828031b5b6471b836bbe5e78aede5aece1c34435`
- Removable Support: `ef1d3eaec4146e171316a81e441797526fef6c8921d88a7689b68ac9c5892121`
- supportSource: `current-stage8:sparseResult.graph`
- Production 3MF SHA-256: `bbc0af54bb6f038e61f211666a7a4378785cf2b6b106f9771acbbe5c96587e1c`

Any Production identity change is HARD FAIL / STOP.

## Protected scope

Do not change:

- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support algorithm/parameters/source;
- source-to-mm / Output Scale;
- FKEI semantics;
- Production Export semantics;
- FIELD SDF math / primitive semantics;
- compute endpoint/connection configuration;
- External STL Host;
- Usagi;
- single-attachment durability implementation;
- new research algorithms.

If usable progressive behavior requires changing FIELD mathematical semantics or inventing a new acceleration architecture, STOP and return to C SOL.

## Done when

Ready for C SOL review when:

- tiny compute status is truthful and unobtrusive;
- FIELD gives immediate lightweight visual feedback;
- coarse FIELD appears first and then visibly refines;
- camera interaction remains responsive and invalidates stale refinement;
- no automatic refinement pass causes the observed multi-second unusable stall;
- FIELD source/empty-state labels are truthful;
- accepted `dad764ce...` layer/backend interaction behavior remains intact;
- browser gate is recorded on the dense real sample;
- tests/build/diff checks pass;
- Production parity remains exact;
- branch is pushed and compact C SOL handoff is returned.
