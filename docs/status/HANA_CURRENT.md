# HANA Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- branch: `agent/hana-viewport-context-topbar-v0`
- HEAD: `e2456befce1467c9892f0fc772096368dedce151` (pre-fix authority; no implementation commit has been accepted after the hardware FAIL)
- working tree: clean at reported checkpoint before bounded fix starts
- remote branch: preserved / pushed at exact HEAD `e2456befce1467c9892f0fc772096368dedce151`
- parent Projection Redraw checkpoint `99e9b9ad90f478c875a805513d7603f75e8ff0a7` is remotely reachable through the preserved viewport branch
- preferred local workspace: `J:\dev\worktrees\hana-viewport-context-topbar-v0`
- J-side canonical clone: `J:\dev\katachi`
- J cutover status: PASS — J worktree is clean, exact-authority HEAD, and has no C-linked Git metadata
- C-side original remains retained as rollback/evidence storage; do not use it for active HANA implementation

## Current phase
The iPad / EasyCanvas Hardware Gate is **FAILED / OPEN** at input isolation item 1. Apple Pencil works alone, but a finger already held on the viewport prevents Pencil drawing. The phase therefore remains open and a single bounded Touch / Pencil isolation fix is now authorized. Later Hardware Gate items remain unverified and no later HANA feature work may begin.

## Active implementation instruction
- owner: HANA SOL; implementation worker: HANA LUNA
- task: `HANA Touch / Pencil Isolation Fix v0`
- purpose: make Apple Pencil authoring take priority over conflicting concurrent touch navigation / long-press state without disabling or redesigning touch behavior.
- allowed scope: existing HANA pointer-routing boundary, minimal related helper/tests, and task/CURRENT evidence only.
- protected scope: no Projection Redraw rewrite, no Section Redraw, no LOCAL performance project, no compute redesign, no growth/branching/tropism, no multi-section/Volume solver, no HANA/SKIN integration expansion, and no authoring-schema/provenance changes.
- done when: bounded fix is committed/pushed with software evidence, then STOP for author iPad/EasyCanvas re-gate. This implementation task does not itself close the Hardware Gate.
- instruction source: `docs/tasks/HANA_TOUCH_PENCIL_ISOLATION_FIX_V0.md`
- execution workspace: `J:\dev\worktrees\hana-viewport-context-topbar-v0`
- branch: remain on `agent/hana-viewport-context-topbar-v0` unless HANA SOL explicitly changes authority.

## Operating routing
- HANA SOL owns architecture, scope, acceptance, and next gate.
- HANA LUNA executes only the bounded task above and returns evidence; it does not self-approve global closure.
- Author owns the physical iPad / EasyCanvas re-gate.
- Shared routing/reporting authority: `docs/TEAM_PROTOCOL_CORE.md` on `main`.

## PASS / CLOSED
- HANA tests at pre-fix checkpoint: 181/181 PASS
- Remote tests: 5/5 PASS
- TypeScript / test TypeScript / build / diff check PASS at pre-fix checkpoint
- browser HTTP / console gate PASS at pre-fix checkpoint
- desktop Top Pane / mouse context menu / menu close / state retention / gizmo / auto-rotate / Projection Redraw checks PASS
- migration-preservation checkpoint: PASS — current viewport HEAD is remotely reconstructable; parent Projection Redraw checkpoint is also remotely reachable
- HANA J workspace cutover: PASS — `J:\dev\worktrees\hana-viewport-context-topbar-v0` at exact authority HEAD, clean, no C-linked Git metadata
- J-side HANA focused smoke test at pre-fix checkpoint: 181/181 PASS

## Current blocker
- **Apple Pencil isolation FAIL on iPad / EasyCanvas:** Pencil draws when used alone, but does not draw when a finger is already touching the viewport.
- Observed hardware evidence: finger down makes the viewport blue; finger + Pencil simultaneous input blocks drawing.
- Hardware Gate stopped at item 1; items 2+ are not yet evaluated.

## Next gate
1. HANA LUNA implements only `docs/tasks/HANA_TOUCH_PENCIL_ISOLATION_FIX_V0.md` from the J-side workspace.
2. SOL reviews commit / tests / browser evidence.
3. If software ACCEPT: author re-runs the Touch / Pencil isolation hardware sequence defined in the task.
4. If hardware isolation PASS: continue the remaining original Hardware Gate checks — Projection Redraw Front → Right → Top, Cancel, Undo/Redo, Save/Load, real-device redraw latency, Control/Gizmo regression.
5. Only if the complete Hardware Gate passes: record evidence, commit/push final checkpoint, close `viewport-context-topbar-v0`, STOP.
6. Only after that may a separate `Section Redraw Interaction Study v0` be considered.

## HOLD / DO NOT CHANGE
- no Projection Redraw rewrite
- no Section Redraw implementation
- no LOCAL performance project in this phase
- no compute architecture redesign
- no growth / branching / tropism features
- no multi-section / advanced Volume solver
- no HANA/SKIN production integration expansion
- do not delete or clean the retained C-side HANA workspace yet
- do not modify user-managed `J:\dev\samples` contents

## Relevant artifacts
- active task: `docs/tasks/HANA_TOUCH_PENCIL_ISOLATION_FIX_V0.md`
- HANA definition: Apple Pencil authoring instrument for Wire (Curve/Gesture) and future Volume (Field/Boundary), preserving Gesture / Authoring Intent for SKIN.
- Section Redraw v0 gate remains: whether drawing a section feels like directly touching the 3D volume.
- preferred J-side workspace: `J:\dev\worktrees\hana-viewport-context-topbar-v0`
- retained C-side workspace: `C:\dev\worktrees\hana-viewport-context-topbar-v0`

## Evidence boundary
### Proven / supported
- desktop/software UI checkpoint before this fix is passing.
- current committed HANA checkpoint `e2456bef...` is preserved on the remote branch.
- Projection Redraw checkpoint `99e9b9ad...` remains remotely reachable as the parent of the preserved viewport branch.
- J-side HANA worktree is reconstructed from remote authority at exact HEAD, clean, and independent of C-side Git metadata.
- pre-fix HANA focused smoke tests on J passed 181/181.
- iPad / EasyCanvas physical evidence proves the current checkpoint does **not** satisfy simultaneous Touch / Apple Pencil isolation.

### Not yet proven
- the bounded Touch / Pencil isolation fix
- post-fix iPad / EasyCanvas isolation behavior
- remaining Hardware Gate items after isolation
- Section Redraw interaction quality
- future Volume authoring architecture
