# C — FIELD vNext Interaction Correctness v0

Date: 2026-09-06
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: ACTIVE

## Purpose

Correct the runtime behavior of the already-restored FIELD vNext display path without changing Production or FIELD semantics.

Author observation on the accepted UI IA branch:

- FIELD vNext renders successfully with the current dense state (~6200 primitives observed);
- initial vNext rendering is slow;
- viewport rotate / camera interaction can stall;
- switching to BEADS can leave the vNext fullscreen result visible instead of returning cleanly to beads.

This is a display/interactivity correctness task, not a geometry, Production, Support, Export, or FIELD-semantic redesign task.

## Start point

Create a new task branch from exactly:

`c64cf091b1c66294ca885759e5a5a9069eb398af`

Preferred branch:

`agent/skin-field-vnext-interaction-v0`

Do not merge/rebase main merely to obtain docs.

## 2026-09-07 execution boundary

For today's C work, this is the **only** authorized implementation task.

Before starting:

- if an existing clean/safe J: worktree for this exact task/base is available, prefer that worktree;
- verify its branch, HEAD/base, and clean working tree before modifying anything;
- do not reuse an ambiguous/stale J: directory merely because it exists;
- if no safe J: worktree is available, report the environment state before creating or switching worktrees rather than guessing.

After this task is reviewed and PASS / CLOSED:

- **STOP C work for the day**;
- do not automatically start `docs/tasks/C_SINGLE_ATTACHMENT_DURABILITY_AUDIT_V0.md`;
- the durability audit remains queued for a later explicit C SOL start.

## Confirmed code boundary

Current renderer behavior has multiple visibility authorities:

- `setFieldPreviewBackend()` directly sets `raymarchQuad.visible` / `vNextQuad.visible`;
- `updateVNextPayload()` also directly forces vNext visible;
- top-level `setViewLayer()` separately calls `applyLayerVisibility()`.

This allows the vNext fullscreen quad to remain visible after changing to another top-level view such as BEADS.

Current FIELD vNext fragment shader intentionally scans the full primitive set for each field query to preserve proven sequential semantic order. With thousands of primitives this exact preview is expensive during continuous camera interaction.

## A. Single visibility authority

Refactor display-only visibility so one renderer authority decides whether Legacy FIELD, vNext FIELD, beads, mesh, graph, diagnostics, and print-preview objects are visible.

Required top-level behavior:

- FIELD + Legacy backend -> Legacy raymarch visible; vNext quad hidden.
- FIELD + vNext backend -> vNext quad visible; Legacy raymarch hidden.
- BEADS -> both FIELD fullscreen quads hidden; bead presentation visible.
- MESH / GRAPH / DIAGNOSTICS / PRINT PREVIEW -> FIELD fullscreen quads must not remain accidentally visible unless an already-existing documented presentation explicitly requires them.

Do not let `setFieldPreviewBackend()` or payload refresh bypass the top-level visibility authority.

Backend selection is session-only preference and must survive leaving FIELD:

- choose vNext;
- switch to BEADS;
- switch back to FIELD;
- FIELD should return to vNext if vNext remains available.

Changing top-level View Layer must not mutate authoring state, regenerate geometry, reset Production stages, or change export state.

## B. Lightweight interaction proxy for vNext

Do not attempt a new accelerated FIELD algorithm in this task.

When all are true:

- active top-level layer is FIELD;
- requested/active backend is vNext;
- the author is actively rotating / panning / zooming the camera;

use a temporary lightweight interaction presentation so camera motion remains responsive.

Preferred implementation:

- reuse an already-current bead representation as the interaction proxy when safe;
- keep the user's requested FIELD backend as `vnext`;
- hide the expensive vNext fullscreen quad only for the interaction interval;
- do not permanently fall back to Legacy;
- on interaction end, restore the exact vNext preview for the final camera pose.

The interaction proxy is presentation-only. It must not:

- write session backend preference to `legacy`;
- change FIELD primitive ordering/grouping;
- change authoring / BODY / Support / Export data;
- trigger geometry workers on every pointer move;
- rebuild Production state.

If existing bead buffers need refreshing, do it only through the already-existing display path and avoid repeated rebuild per camera event.

## C. Preserve FIELD vNext semantics

Do not change in this task:

- `fieldVNextGpuShader.ts` semantic field math;
- sequential smooth-min order;
- primitive grouping/filter semantics;
- `fieldPrimitiveStore` semantics;
- GPU payload packing semantics;
- FIELD vNext display-only / session-only contract.

If acceptable interaction cannot be achieved without changing semantic field evaluation, STOP and return to C SOL instead of expanding scope.

## Browser gate

Verify on the current dense/Completed Sample state or the same state used for the author's observation:

1. Legacy FIELD displays correctly.
2. vNext FIELD displays correctly and reports vNext active.
3. FIELD(vNext) -> BEADS immediately removes the vNext fullscreen image and shows beads.
4. BEADS -> FIELD returns to vNext without requiring another backend click.
5. FIELD(vNext) -> MESH / GRAPH / DIAGNOSTICS / PRINT PREVIEW does not leave a stale vNext fullscreen quad.
6. Repeated FIELD <-> BEADS switching does not accumulate duplicate objects or stale visibility.
7. During vNext camera rotate/pan/zoom, the lightweight proxy is used and camera pose visibly updates continuously rather than waiting on repeated exact vNext renders.
8. On camera interaction end, exact vNext redraw resumes at the final camera pose.
9. Interaction proxy does not change the requested backend away from vNext.
10. No compute/rebuild/export callback is triggered by view/backend/camera interaction alone.
11. No introduced console exception or WebGL resource leak is observed in repeated switching.

Record the observed primitive count and the before/after interaction behavior. No arbitrary FPS target is required; the structural gate is that the expensive vNext quad is not rendered continuously during active interaction and the final exact preview is restored afterward.

## Tests

Add focused renderer/view tests covering at minimum:

- visibility matrix for FIELD Legacy / FIELD vNext / BEADS / MESH;
- vNext backend preference persists across BEADS and back;
- vNext payload refresh cannot force the fullscreen quad visible while another top-level layer is active;
- interaction start activates the lightweight proxy without changing backend preference;
- interaction end restores exact vNext visibility;
- no duplicate visibility authority regression.

Run:

- relevant UI / renderer tests;
- `npm run test:skin-rebuild`;
- typecheck;
- `npm run build`;
- `git diff --check`;
- current Production parity replay sufficient to confirm locked BODY / Graph / Support / 3MF identities remain exact.

Expected locked identities remain:

- Permanent BODY: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`
- Permanent Graph: `5cb659849d694beaae6443a4828031b5b6471b836bbe5e78aede5aece1c34435`
- Removable Support: `ef1d3eaec4146e171316a81e441797526fef6c8921d88a7689b68ac9c5892121`
- supportSource: `current-stage8:sparseResult.graph`
- Production 3MF SHA-256: `bbc0af54bb6f038e61f211666a7a4378785cf2b6b106f9771acbbe5c96587e1c`

Any Production identity difference is HARD FAIL / STOP.

## Protected scope

No changes to:

- Local Relay;
- Graph Repair;
- motif placement/transforms;
- BODY generation / member sizing;
- Removable Support algorithm / parameters / source;
- source-to-mm / Output Scale;
- FKEI schema/semantics;
- Production Export semantics;
- External STL Host;
- Usagi;
- research algorithms;
- FIELD vNext semantic shader/math in this task.

## Done when

Ready for C SOL review when:

- stale vNext visibility across View Layer switching is fixed;
- vNext camera interaction uses a lightweight presentation and restores exact vNext after interaction;
- backend preference remains correct and session-only;
- browser gate passes on a dense current state;
- tests/build/diff checks pass;
- Production parity remains exact;
- branch is pushed and compact C SOL review handoff is returned.

C LUNA does not start the queued durability audit after completion. C SOL reviews this checkpoint first; after PASS / CLOSED, C stops for the day unless the author explicitly reopens another task.