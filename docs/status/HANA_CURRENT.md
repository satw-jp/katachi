# HANA Current Status

Last verified: 2026-09-06

## Current authority
- repo: `satw-jp/katachi`
- branch: `agent/hana-viewport-context-topbar-v0`
- HEAD: `e2456befce1467c9892f0fc772096368dedce151`
- working tree: clean at reported checkpoint
- remote branch: not yet pushed at reported checkpoint

## Current phase
Existing WIRE-oriented UI cleanup is at the iPad / EasyCanvas Hardware Gate. Software / desktop gates are already passing. Research-derived growth / field ideas remain HOLD until the current UI phase closes.

## PASS / CLOSED
- HANA tests: 181/181 PASS
- Remote tests: 5/5 PASS
- TypeScript / test TypeScript / build / diff check PASS
- browser HTTP / console gate PASS
- desktop Top Pane / mouse context menu / menu close / state retention / gizmo / auto-rotate / Projection Redraw checks PASS

## Current blocker
- iPad / EasyCanvas Hardware Gate not yet closed.

## Next gate
1. Touch long press / drag isolation / Apple Pencil isolation.
2. Projection Redraw Front → Right → Top, Cancel, Undo/Redo, Save/Load.
3. Real-device redraw latency and Control/Gizmo regression.
4. If PASS: record hardware evidence, commit / push, close `viewport-context-topbar-v0`, STOP.
5. Only after that: separate `Section Redraw Interaction Study v0`.

## HOLD / DO NOT CHANGE
- no Projection Redraw rewrite
- no LOCAL performance project in this phase
- no compute architecture redesign
- no growth / branching / tropism features
- no multi-section / advanced Volume solver
- no HANA/SKIN production integration expansion

## Relevant artifacts
- HANA definition: Apple Pencil authoring instrument for Wire (Curve/Gesture) and future Volume (Field/Boundary), preserving Gesture / Authoring Intent for SKIN.
- Section Redraw v0 gate remains: whether drawing a section feels like directly touching the 3D volume.

## Evidence boundary
### Proven / supported
- desktop/software UI phase is near completion.
- REMOTE/AUTO compute avoids the observed LOCAL derived Surface rebuild latency bottleneck.

### Not yet proven
- current iPad / EasyCanvas hardware behavior
- Section Redraw interaction quality
- future Volume authoring architecture
