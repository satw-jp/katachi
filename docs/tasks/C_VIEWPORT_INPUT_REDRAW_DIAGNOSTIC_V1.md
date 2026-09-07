# C — Viewport Input / Redraw Diagnostic v1

Date: 2026-09-07
Owner: C SOL
Implementation owner: C LUNA / bounded diagnostic worker
Status: ACTIVE

## Trigger / author evidence

After `f4baeca950204e0d80e5a5da01441b17764c489a`, author visual testing still reports:

- BEADS view rotate does not work in actual use;
- zoom remains extremely slow / appears frozen;
- 1 View <-> 4 Views behavior remains abnormal;
- FIELD -> BEADS does not visibly return to BEADS;
- however toggling Display Style to Ghost makes the expected BEADS appear, and toggling back to Solid leaves BEADS visible.

This strongly suggests the remaining defect may be above FIELD rendering itself: input routing, camera mutation, render-frame scheduling, layer/visibility synchronization, or a stale presentation state.

Do not continue FIELD optimization until this baseline is explained.

## Authority / start point

Continue from:

- branch: `agent/skin-runtime-status-progressive-field-v0`
- checkpoint: `f4baeca950204e0d80e5a5da01441b17764c489a`
- execution: J-side only
- live helper: `J:\dev\katachi-compute-helper-tray`
- samples authority: `J:\dev\samples`

No merge/rebase/unrelated cleanup.

## Diagnostic-first rule

Do not modify behavior first. Reproduce the author symptoms and identify which boundary fails.

For each of the following, capture enough temporary instrumentation/evidence to distinguish:

1. input event reaches intended viewport/canvas;
2. camera/control state actually changes;
3. render frame is requested;
4. render frame actually executes;
5. active view-layer / Object3D visibility state is correct;
6. pixels update to match that state.

Temporary diagnostic logging/counters are allowed but must be removed before final commit unless explicitly useful as a bounded debug facility.

## A. BEADS rotate / pan / zoom baseline

Use BEADS with FIELD fully inactive.

For Axome rotate and wheel zoom record:

- `activeViewLayer`;
- selected viewport index + direction;
- `orbitEnabled`;
- Axome-left rotate enabled/disabled state;
- whether Support Paint or another mode owns the pointer;
- pointer/wheel event arrival;
- camera position/up/target/zoom before and after input;
- whether `requestViewportRender()` / render callback is invoked;
- whether `renderFrame()` runs after camera mutation.

Decision boundary:

- event missing -> input/overlay/pointer-routing defect;
- event present but camera unchanged -> camera/control ownership defect;
- camera changes but no render -> render scheduling defect;
- camera changes + render executes but pixels stay stale -> renderer/redraw-state defect.

Do not redefine camera semantics. Restore the intended existing Axome/pan/zoom behavior only after the failing boundary is named.

## B. FIELD -> BEADS stale presentation diagnostic

Reproduce exactly:

1. load a known current C-compatible sample;
2. enter FIELD vNext;
3. switch to BEADS;
4. observe stale/non-BEADS presentation;
5. toggle Ghost, then Solid, and observe BEADS appearing.

Before and after each step record:

- main-level `activeViewLayer` / `viewMode`;
- renderer `getViewLayer()` / `getViewMode()`;
- legacy FIELD quad visibility;
- vNext FIELD quad visibility;
- interactive FIELD presentation visibility/target state;
- host/patch bead mesh presence + visibility;
- pending FIELD progression timers/state;
- whether a lightweight render frame or full `render()` path runs.

The Ghost clue is mandatory evidence. Determine whether Ghost fixes the screen because it:

- forces `render()` / `skinRenderer.update(...)`;
- reapplies material/visibility state;
- changes view mode;
- or merely schedules a frame that the BEADS switch failed to schedule.

Fix only the actual synchronization/redraw defect. Do not use Ghost as a workaround.

## C. 1 View <-> 4 Views diagnostic

Run at least 5 cycles and record:

- `viewportMode`;
- selected viewport;
- viewport rects;
- `controls.enabled` per viewport;
- camera projection/screen bounds;
- whether switch requests and completes a render;
- visible result vs internal state.

If internal rect/control state is correct but screen is stale until another unrelated UI action, classify it as the same redraw invalidation family rather than inventing a separate layout fix.

## D. Allowed bounded fix

A code fix is allowed only after reproduction names the failing boundary, and only within:

- viewport input routing / ownership;
- camera/control enable state;
- render request/frame invalidation;
- view-layer presentation synchronization;
- 1/4-view renderer presentation state.

If the root cause is one shared stale-render/invalidation defect, prefer one shared fix rather than per-feature patches.

## E. Protected scope

Do not change:

- FIELD SDF/math/primitive/payload semantics;
- progressive FIELD quality policy except where needed to stop stale state from leaking outside FIELD;
- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support / supportSource;
- FKEI / Export / 3MF semantics;
- Output Scale;
- compute endpoint/configuration;
- External STL Host;
- Usagi;
- durability / Outside->Outside / new research algorithms.

## F. Browser gate after any fix

On the same author route/sample verify:

1. BEADS Axome rotate visibly follows input;
2. BEADS pan works;
3. BEADS wheel zoom visibly follows input without apparent freeze;
4. 1 -> 4 -> 1 works for at least 5 cycles;
5. FIELD -> BEADS shows BEADS immediately without Ghost/Solid toggling;
6. repeat FIELD <-> BEADS at least 5 times;
7. Ghost/Solid toggling no longer changes whether the correct layer is visible;
8. FIELD Fix 2 remains preserved for later author visual gate;
9. no Production/geometry/export callback is triggered solely by camera/view changes;
10. no new console exception.

Run focused viewport/FIELD tests where environment permits, typecheck, `git diff --check`, and build where filesystem environment permits. Record ENOMEM/EPERM separately as environment failures.

## Done when

Return to C SOL only after:

- the actual failed boundary is named with evidence;
- any fix is minimal and bounded;
- BEADS rotate/zoom + 1/4-view + FIELD->BEADS all pass in one browser session;
- branch is pushed;
- worker stops and does not continue to FIELD optimization or another C task.
