# C — SKIN Production UI IA v0A

Date: 2026-09-06
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: ACTIVE

## Purpose

Reorganize the verified current C Production capability set into a clearer author-facing shell without changing Production semantics.

This first pass is **structural UI / information architecture only**:

- preserve existing capabilities and callbacks;
- make the author workflow legible;
- separate VIEW / DISPLAY from MAKE / CHECK;
- use progressive disclosure rather than deleting historical/recovery capability.

This is not a new feature, geometry, Host, diagnostics, export, or state-architecture task.

## Current authority

- repo: `satw-jp/katachi`
- Production Algorithm / Support authority: `2b64cebc09f8e11e5d9f78993d82f7239deb6823`
- current Production Capability Baseline: `349e1a854d7e3699ac29afd167fc22e8131406d7`
- Permanent BODY fingerprint: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`
- support source: `current-stage8:sparseResult.graph`
- FIELD vNext: PRESENT / display-only / session-only
- Output Scale semantics: PRESENT / current C mm contract wins
- current Stage8 Artifact Export handler: `exportCurrentSkinRebuildArtifact`
- legacy v088 export: `COMPATIBILITY_ONLY`
- External STL Host + persistence: `MISSING_CURRENT`, separate architecture / HOLD

Start this task from **exactly** `349e1a854d7e3699ac29afd167fc22e8131406d7`.

Do not start from `2b64...` or older C checkpoints.

## Target branch / worktree

Preferred branch:

`agent/skin-production-ui-ia-v0`

Preferred worktree:

`C:\dev\worktrees\skin-c-production-ui-ia-v0`

Create from the current Production Capability Baseline only after verifying the source repo/worktree is clean and HEAD is exactly `349e1a85...`.

If an existing branch/worktree with this name already exists, inspect and report before modifying it. Do not reset or overwrite it automatically.

## Author-facing mental model

Primary workflow:

```text
1 SHAPE
2 COMPOSE
3 STRUCTURE
4 SUPPORT
5 EXPORT
```

Semantic grouping:

```text
ARTWORK = SHAPE + COMPOSE + STRUCTURE
PRINT / FABRICATION = SUPPORT + EXPORT
VALIDATION = contextual CHECKS, not a primary phase
```

Do not create a primary `VALIDATE` phase.

## Core UI rule

```text
LEFT = VIEW / DISPLAY ONLY
RIGHT = MAKE / CHECK
```

Also preserve:

- navigation != compute;
- hide/show != state reset;
- one semantic action = one canonical callback/control;
- no duplicate DOM IDs or hidden duplicate controls;
- UI reorganization must not mutate Production state.

## Read-only mapping first

Before editing, map current controls into:

- VIEW / DISPLAY
- SHAPE
- COMPOSE
- STRUCTURE
- SUPPORT
- EXPORT
- CHECKS
- DETAILS
- HELP
- ADVANCED / LAB / COMPATIBILITY

Also identify before changes:

- unique callbacks/state behavior;
- duplicated controls if any;
- Stage1–8 historical controls;
- Undo / history / selected-state restore;
- existing sample/restore controls;
- existing splitter/resizable infrastructure;
- legacy v088 export trigger;
- FIELD Legacy/vNext selector.

Do not restore missing capabilities during this task.

## Target structural layout

Create a shell with:

- left VIEW pane;
- central viewport;
- narrow FLOW navigator;
- INSPECTOR pane;
- existing status area.

FLOW contains exactly:

```text
SHAPE
COMPOSE
STRUCTURE
SUPPORT
EXPORT
```

FLOW selection only changes visible Inspector content. It must not run compute, rebuild geometry, invalidate stages, reset controls, or become the Production pipeline-state authority.

Reuse existing splitter/resizable infrastructure if safe. If none exists, static/flex widths are acceptable for v0A. Do not create a new persistent layout-state architecture just to make the columns resizable.

## LEFT — VIEW / DISPLAY

Move the current `VIEW LAYERS` capability to the top of the left pane while preserving its semantics.

Preserve existing/current availability states for:

- BEADS
- FIELD
- GRAPH
- MESH
- DIAGNOSTICS
- PRINT PREVIEW

Preserve OVERLAY choices including currently available:

- Inside / Outside
- Print Risk
- Components
- Reinforcement
- Support

Preserve FIELD Legacy/vNext selection. FIELD vNext remains display-only and session-only.

Below VIEW LAYERS retain existing display-related controls such as camera/view/clipping/selection display.

Left-pane actions must not generate, clear geometry, reset the project, invalidate Production, or export.

## SHAPE Inspector

User-facing label: `SHAPE`.

Expose only current verified Host/Base capabilities, including existing Metaball/generated Host controls and existing legitimate current Host/Base parameters/import actions.

Do **not** add or fake `Import STL`. External STL Host remains separate-architecture HOLD.

If S1 Recipe import is a legitimate current authoring action, preserve it unchanged.

## COMPOSE Inspector

User-facing label: `COMPOSE`.

Primary author capability: Motifs / Surface Pattern / population / scatter / placement / edit using existing callbacks.

Preserve existing selection semantics:

- click select;
- Shift add;
- Ctrl remove;
- drag rectangle selection.

Do not delete operation guidance. Long instructions may move under `Help ▸`.

Do not expose plain author-facing `Graph` unless current semantics clearly establish an author Guide Graph. Debug/display graphs belong in VIEW or Advanced/Lab.

## STRUCTURE Inspector

User-facing labels:

```text
STRUCTURE
Permanent Structure
```

Permanent Structure is ARTWORK, never Removable Support.

Current authority remains:

```text
Motif-conditioned Local Relay
+
bounded Graph-only repair
```

Do not add A/B/C method selectors, Co-evolution, D/F1/F2/F3, hybrid methods, or research selectors.

If existing `Build Final Mesh` or equivalent action is required, preserve the same callback and sequence under STRUCTURE. Do not change production callbacks.

## SUPPORT Inspector

User-facing labels:

```text
SUPPORT
Removable Support
```

Keep separate from Permanent Structure.

Current source must remain:

`current-stage8:sparseResult.graph`

Expose only existing current support generation/status and compact existing summaries such as supported/unresolved/collision status where available.

Verbose rejection/debug information belongs in Details/Advanced.

Do not change support algorithm or parameters.

## EXPORT Inspector

User-facing label: `EXPORT`.

The current Production authority is the Stage8 Artifact Export path using `exportCurrentSkinRebuildArtifact`.

Use existing current 3MF/Artwork/Support/Report capabilities. Do not add another exporter.

Legacy v088 is `COMPATIBILITY_ONLY` and must not appear equivalent to current Production Export.

If it can be moved without callback/state rewiring, place it under an Advanced/Compatibility area. Otherwise leave it in place and report the limitation.

Do not retire, delegate, or semantically change the legacy v088 path in this task.

## CHECKS / Details / Help

Validation remains contextual, not a primary workflow phase.

Use only diagnostics already present in current source. Do not implement new diagnostic algorithms.

Main CHECKS should show compact decision-relevant summaries only.

Examples where currently available:

- SHAPE: geometry/field/bounds state;
- COMPOSE: motif count/placement state;
- STRUCTURE: BODY/structure diagnostics;
- SUPPORT: supported/unresolved/collision;
- EXPORT: Artwork/Support/3MF readiness.

`Details ▸` keeps verbose counts, causes, diagnostics, rejection reasons.

`Help ▸` keeps long operation instructions.

Do not delete useful authoring guidance merely to reduce visible UI density.

## Advanced / Lab / Compatibility

Preserve historical/research/recovery capability in a collapsed secondary area where safe, including existing items such as:

- Historical Workflow / Stage1–8;
- Detailed / raw diagnostics;
- Graph debug;
- Dry Web / Spider historical controls;
- Research / Frozen / Legacy;
- Compatibility-only v088 Export.

Do not re-enable superseded algorithms as current Production authority.

Hide/show must not remount/reset project state.

## Topbar / Samples / History boundary

Do not perform a broad topbar redesign in v0A.

Preserve current document actions and Undo behavior.

Do not invent a new Samples system. Named Samples / High Density Flower v6 / Completed Sample are not Legacy, but P0-B retention is not fully verified. Preserve any currently working sample/restore controls and report what exists.

Do not delete unique history/state-jump functionality. If moved, preserve exact callback/state semantics.

## Protected scope — hard prohibitions

No changes to:

- Local Relay;
- Graph Repair;
- motif transforms;
- motif placement algorithm;
- member sizing;
- BODY field/generation;
- source-to-mm / Output Scale contract;
- Removable Support algorithm/parameters/source;
- FIELD vNext semantics;
- FKEI schema/semantics;
- Export semantics;
- state architecture;
- External STL Host;
- Usagi integration;
- Co-evolution;
- D / F1 / F2 / F3;
- Hybrid architecture;
- new diagnostics algorithms.

Do not bulk-delete old UI. Use progressive disclosure.

## Production parity gate

After UI changes, run the same current C fixture and verify exact Production identity.

Expected Permanent BODY fingerprint:

`c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`

Required:

- Host: EXACT
- Motifs: EXACT
- Permanent Graph: EXACT
- Permanent BODY: EXACT
- supportSource: `current-stage8:sparseResult.graph`
- Support: EXACT
- 3MF Artwork BODY: EXACT
- 3MF Support: EXACT
- FIELD vNext: still PASS
- Output Scale semantics: unchanged

Any Production difference is a HARD FAIL / STOP.

## Browser gate

Verify at minimum:

1. VIEW LAYERS is in LEFT.
2. FIELD Legacy/vNext still works.
3. FLOW shows exactly SHAPE / COMPOSE / STRUCTURE / SUPPORT / EXPORT.
4. FLOW navigation alone does not compute/mutate.
5. Active Inspector exposes intended current controls.
6. Permanent Structure and Removable Support remain clearly distinct.
7. Legacy v088 is clearly compatibility/legacy, not current Production.
8. Details/Help/Advanced folding preserves state.
9. Existing long authoring guidance remains reachable.
10. Viewport remains usable at normal desktop size.
11. No accidental duplicate controls/IDs.
12. No introduced UI exception/console error.

## Tests

Run relevant UI/renderer tests plus:

- `npm run test:skin-rebuild`
- typecheck
- `npm run build`
- `git diff --check`
- deterministic Production replay ×2

If locked dependencies are simply absent, `npm ci` is allowed. Do not alter dependency versions merely to make the environment pass.

## Checkpoint / reporting

If implementation, tests, browser gate, and Production parity all PASS:

1. commit on `agent/skin-production-ui-ia-v0`;
2. update `docs/status/C_CURRENT.md` in the task branch if practical;
3. push the working branch;
4. do not merge to main;
5. do not deploy;
6. return only the compact C SOL review handoff required by `docs/TEAM_REPORTING_RULES.md`.

Suggested implementation commit message:

`feat(skin): establish production UI IA v0 shell`

If the task branch predates reporting docs, do not merge/rebase solely to obtain them. Follow `main/docs/TEAM_REPORTING_RULES.md`.

## Done when

This v0A task is ready for C SOL review only when:

- the five-step author-facing shell exists;
- current controls are reorganized without capability deletion;
- VIEW/DISPLAY and MAKE/CHECK are separated as specified;
- Production parity is exact;
- browser gate passes;
- tests/build/diff checks pass;
- checkpoint is pushed;
- the implementation worker returns a compact SOL-review handoff.

C LUNA does not self-approve global closure. C SOL reviews the GitHub checkpoint and decides ACCEPT / REJECT / HOLD / next gate.

## Physical Gate priority

First Physical Print remains independent and higher priority when author evidence arrives. This UI task must not alter Production geometry in response to physical observations.