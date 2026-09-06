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

## Active implementation instruction
- owner: HANA SOL; implementation worker: NONE while the Hardware Gate is pending.
- task: `iPad / EasyCanvas Hardware Gate`
- purpose: verify the already-implemented viewport/context/topbar behavior on the actual authoring hardware before any further HANA implementation begins.
- allowed scope: hardware verification and evidence recording only; if a concrete gate failure is found, HANA SOL may define a separate bounded fix.
- protected scope: no Projection Redraw rewrite, no LOCAL performance project, no compute redesign, no growth/branching/tropism expansion, and no Section Redraw implementation before this gate closes.
- done when: touch/Pencil isolation, Projection Redraw Front→Right→Top, Cancel, Undo/Redo, Save/Load, latency, and Control/Gizmo regression are reviewed on iPad/EasyCanvas; PASS then commit/push/close and STOP.
- instruction source: this CURRENT. No hidden LUNA implementation task is active at this checkpoint.

## Operating routing
- HANA SOL owns architecture, scope, next gate, and the bounded instruction for HANA LUNA / implementation worker.
- The author does not need to rewrite or relay SOL implementation instructions.
- Implementation workers execute only the current bounded instruction and return evidence for SOL review; they do not self-approve global closure.
- Shared routing/reporting authority: `docs/TEAM_REPORTING_RULES.md` on `main`.

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
