# C — Viewport Interaction Baseline Diagnostic v0

Date: 2026-09-07
Owner: C SOL
Implementation owner: C LUNA / bounded diagnostic worker
Status: ACTIVE

## Trigger

Author visual review at `3219f093a8c9ed9165b5c66dea0bd2f4e87d8fdf` found that the problem is not FIELD-specific:

- BEADS view cannot be reliably rotated;
- zoom is extremely slow / appears to freeze;
- switching 1 View -> 4 Views has incorrect/unstable behavior;
- therefore Progressive FIELD author visual review is suspended until the viewport navigation baseline itself is proven healthy.

## Authority / start point

Continue from:

- branch: `agent/skin-runtime-status-progressive-field-v0`
- checkpoint: `3219f093a8c9ed9165b5c66dea0bd2f4e87d8fdf`
- execution: J-side only
- samples authority: `J:\dev\samples`
- live compute/helper remains unchanged

Do not merge/rebase unrelated work.

## Goal

Establish and, only if clearly isolated, restore a usable viewport-navigation baseline independent of FIELD rendering.

The baseline must be proven first in BEADS with FIELD fully inactive.

## Diagnostic order — mandatory

### 1. BEADS-only baseline

Use a current C-compatible sample with visible beads.

Before touching FIELD:

- select BEADS;
- confirm legacy FIELD quad, vNext quad, interactive FIELD target/output are not visible/active;
- verify camera input on the selected viewport;
- record which mouse/pointer gesture is intended to rotate, pan, and zoom;
- verify whether pointerdown / pointermove / pointerup reach the camera input path;
- verify `orbitEnabled`, selected viewport index, viewport direction, and any Axome-only gating during the failed gesture.

Do not assume the author used the wrong gesture. The author-facing behavior should be discoverable and usable.

### 2. Input ownership / camera control

Inspect the boundary between:

- `TrackballControls`;
- `configureRhinoCameraInput()`;
- plain-left Axome candidate logic;
- right-drag / shift-drag routing;
- selection/direct-manipulation/support-paint capture handlers;
- `setOrbitEnabled()` callers;
- pointer capture release on pointerup/pointercancel.

Current renderer intentionally nulls Trackball LEFT/RIGHT mouse buttons and relies on custom Rhino-style pointer routing. Verify this architecture is actually producing a usable author interaction rather than leaving the viewport with no effective rotate gesture.

A stale `orbitEnabled=false`, unreleased pointer capture, or competing capture-phase handler must be treated as a viewport-core defect if reproduced.

### 3. Zoom baseline

In BEADS only:

- test wheel/trackpad zoom with no FIELD active;
- measure whether camera zoom/projection updates promptly;
- record whether each zoom event triggers unexpected heavy work, repeated renders, layout commits, or FIELD progression;
- verify zoom does not invoke geometry rebuild, Production, Support, export, or compute work.

If BEADS zoom itself blocks for a visibly long period, isolate the synchronous render/event path before changing FIELD code.

### 4. 1 View <-> 4 Views baseline

In BEADS only:

- switch 1 -> 4 -> 1 repeatedly;
- verify viewport rects, selected viewport, directions, controls.enabled state, camera projections, HUD frames, and splitters;
- verify each visible viewport corresponds to the intended camera and that selecting a viewport enables controls only for that viewport;
- verify no stale FIELD framebuffer/output is involved;
- record whether the first 4-view initialization causes repeated resets/renders or malformed rect/control screen bounds.

### 5. Compare against accepted earlier checkpoint

Where useful, compare the same BEADS navigation behavior at the earlier accepted FIELD interaction checkpoint `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`.

Purpose:

- determine whether the viewport problem predates Progressive FIELD work;
- avoid attributing a pre-existing camera/input defect to Fix 2;
- identify the smallest correct repair boundary.

Do not discard or reset current work. Use a separate temporary worktree/runtime if comparison is needed.

## Allowed fix after diagnosis

Do not modify code until the failing baseline path is reproduced and the cause is named.

After reproduction, a bounded fix is allowed only if it stays inside viewport input/presentation infrastructure, for example:

- camera gesture routing;
- orbit enable/restore correctness;
- pointer capture cleanup;
- selected viewport / controls.enabled synchronization;
- viewport rect/projection/control-screen updates;
- avoiding unnecessary FIELD/render work while BEADS is active;
- 1/4-view initialization/render scheduling correctness.

If the failure requires changing authoring, geometry, Production, or FIELD semantics, STOP and return to C SOL.

## Author-facing interaction contract

The repaired baseline should be simple enough that normal viewport navigation works regardless of View Layer:

- BEADS rotate/pan/zoom must be responsive;
- FIELD may add presentation cost, but must not own basic camera correctness;
- 1 View and 4 Views must both have predictable selected-view behavior;
- leaving FIELD must not leave camera/input state altered.

Do not silently preserve a confusing input scheme merely because it existed historically. If the current custom Rhino gesture mapping is the direct cause of an unusable baseline, report the mapping and propose the smallest author-usable correction to C SOL before broad redesign.

## Browser gate

At minimum verify in BEADS:

1. rotate continuously for several seconds;
2. pan continuously;
3. zoom in/out repeatedly without visible long freezes;
4. 1 -> 4 -> 1 at least 5 cycles;
5. select each 4-view viewport and verify its control state;
6. no stale pointer capture after drag cancel/up;
7. no FIELD render target/fullscreen presentation active while BEADS is selected;
8. no geometry/Production/Support/export/compute callback caused by camera-only interaction;
9. no new console exception.

Only after BEADS baseline passes, re-run the pending FIELD Fix 2 author gate.

## Protected scope

Do not change:

- FIELD SDF math / primitive semantics / payload semantics;
- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support / supportSource;
- Output Scale;
- FKEI / Export / 3MF semantics;
- compute endpoint/configuration;
- External STL Host;
- Usagi;
- durability implementation;
- Outside->Outside Support;
- new research algorithms.

## Done when

Return to C SOL with:

- reproduced root cause(s) or a clear evidence boundary if not reproducible;
- exact intended/observed rotate-pan-zoom gestures;
- BEADS-only timing/interaction evidence;
- 1/4-view evidence;
- any bounded viewport-core fix, if required;
- focused tests/typecheck/build/diff checks where environment permits;
- branch pushed and worker stopped.

Do not close Progressive FIELD v0 or start another C task automatically.
