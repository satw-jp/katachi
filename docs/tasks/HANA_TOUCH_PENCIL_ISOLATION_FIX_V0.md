# HANA Touch / Pencil Isolation Fix v0

Date: 2026-09-07
Owner: HANA SOL
Implementation worker: HANA LUNA

## Context

The iPad / EasyCanvas Hardware Gate failed at the first input-isolation check on authority checkpoint:

- branch: `agent/hana-viewport-context-topbar-v0`
- HEAD before fix: `e2456befce1467c9892f0fc772096368dedce151`
- workspace: `J:\dev\worktrees\hana-viewport-context-topbar-v0`

Author hardware evidence:

- Apple Pencil alone draws.
- With a finger already touching the viewport, Apple Pencil does not draw.
- The viewport becomes blue while the finger is down.
- Finger + Pencil simultaneous input therefore fails Pencil isolation.
- Hardware Gate stopped immediately; later gate items remain unverified.

No implementation was performed after the failure report.

## Purpose

Restore the intended input ownership rule:

> Apple Pencil authoring has priority over incidental / concurrent touch state. A touch already held on the viewport must not block, cancel, or redirect a Pencil stroke.

This is a bounded hardware-gate fix, not an interaction redesign.

## Current code boundary to verify

Current input routing contains both touch navigation / long-press state and Pencil stroke start in `src/studies/hana/main.ts`.

A relevant suspected conflict is that single-touch navigation may establish `cameraDrag`, while `startStroke()` refuses to begin while `cameraDrag` is active. Treat this as a hypothesis to verify, not as permission for a broad rewrite.

## Required behavior

1. **Pencil priority**
   - If a finger is already down and Apple Pencil begins authoring in a drawable viewport, Pencil drawing must start normally.
   - Touch-owned transient state that conflicts with Pencil authoring must yield cleanly before Pencil stroke start.

2. **No simultaneous touch mutation during Pencil stroke**
   - A held / moving finger must not move the camera, open the viewport context menu, select/edit geometry, or cancel/redirect the active Pencil stroke.
   - Do not synthesize a camera jump from stale touch deltas when Pencil authoring ends.

3. **Touch behavior remains available when Pencil is not authoring**
   - Finger long press still opens the viewport context menu under the existing contract.
   - Touch movement still cancels a pending long press before normal navigation.
   - Existing touch camera navigation / pinch behavior remains intact.

4. **Pencil remains isolated from context-menu recognition**
   - Pencil must never become a context-menu long-press source.
   - Existing mouse right-click context-menu behavior remains intact.

## Allowed scope

Prefer the smallest change in the existing HANA pointer-routing boundary.

Allowed:

- `src/studies/hana/main.ts`
- `src/studies/hana/viewportContextMenu.ts` only if needed for explicit ownership policy
- relevant HANA unit / integration tests
- one small pure routing helper if it materially improves testability
- task/CURRENT evidence updates required by protocol

## Protected scope

Do **not** change:

- Projection Redraw semantics or implementation
- Section Redraw
- LOCAL performance architecture
- compute architecture
- growth / branching / tropism
- multi-section / Volume solver work
- HANA/SKIN production integration
- authoring document schema / Gesture provenance
- viewport preset set or context-menu information architecture
- long-press timing / movement thresholds unless a demonstrated requirement for this isolation fix makes it unavoidable
- user-managed `J:\dev\samples` contents

Do not use the retained C-side HANA worktree for implementation.

## Implementation constraints

- Work only from `J:\dev\worktrees\hana-viewport-context-topbar-v0`.
- Stay on `agent/hana-viewport-context-topbar-v0` unless HANA SOL explicitly changes authority.
- Preserve existing touch, mouse, Pencil, selection, Gizmo, and Projection Redraw behavior outside the failing ownership case.
- Do not solve this by globally disabling touch while Pencil support exists.
- Prefer explicit ownership / arbitration over timing hacks.
- If runtime behavior contradicts the suspected `cameraDrag` conflict, document the actual cause and keep the fix equally bounded.

## Software evidence required

Add regression coverage for the ownership rule at the most testable boundary. At minimum prove that:

- a pre-existing touch navigation / long-press state cannot block a subsequent Pencil-authoring start;
- Pencil authoring suppresses conflicting touch navigation/context-menu action while the stroke is active;
- touch-only long press and touch navigation remain supported;
- Pencil is still excluded from context-menu long press.

Then run the existing HANA focused test set, TypeScript/build checks required by the lane, and any relevant browser smoke checks.

A changed test count is acceptable; report the exact count.

## Hardware re-gate

After software evidence passes, STOP for author verification. Do not continue to later HANA features.

Author re-check sequence:

1. Finger held still on viewport → begin and continue drawing with Apple Pencil.
2. While Pencil stroke is active, keep / move finger → Pencil stroke continues and camera/menu does not steal ownership.
3. Pencil up; verify no camera jump caused by stale touch state.
4. Finger-only long press → viewport context menu still opens.
5. Finger-only drag → normal touch navigation still works.
6. Long-press-then-drag / movement-before-threshold → no accidental context menu.

If any item fails, report exact reproduction and STOP without scope expansion.

## Done when

Implementation is ready for HANA SOL review when:

- bounded fix is committed on `agent/hana-viewport-context-topbar-v0`;
- branch is pushed;
- focused tests and required build/type/browser evidence pass;
- worker returns a compact HANA SOL review handoff;
- Hardware Gate remains open until the author performs the re-gate above.

This task does **not** close `viewport-context-topbar-v0` by itself. Only author hardware PASS across the complete Hardware Gate can close the phase.