# SKIN Authoring Restoration Plan v0

Date: 2026-09-03

## Purpose

Preserve the first printable SKIN baseline, then restore the authoring capabilities that were deprioritized or moved out of the main workflow during the print-readiness work.

The goal is not to roll back the print pipeline. The goal is to make SKIN a creation tool again, with the current print/export pipeline remaining intact at the end of the workflow.

## Frozen printable baseline

Baseline commit:

`f542f84d384fcdda30a815ddfb7b8162af1cf4f1`

Treat this commit as the **FIRST PRINTABLE BASELINE**.

Current confirmed print state:

- `supportSource`: `current-stage8:sparseResult.graph`
- `project.printSupport === sparseResult.graph`: PASS
- renderer: `Support · current · Stage 8`
- Stage 8: Critical 166 / Supported 156 / Unsupported 10
- Support graph: nodes 546 / edges 390
- accepted BODY collision: 0
- Inside-derived: 0
- offset-bend visualization: vertical shaft → bend → angled approach → short neck
- no legacy straight Support
- 3MF / STL / report share the same fingerprint
- Print Diagnostics warnings may remain, but Artifact Export is available

Do not rewrite or mutate this baseline.

## Working branch

`agent/skin-authoring-restoration-v0`

Base this branch on:

`f542f84d384fcdda30a815ddfb7b8162af1cf4f1`

## Non-goals / prohibitions

Do not:

- rewrite the printable baseline
- force-push the restoration branch
- regress current Stage 8 support generation
- replace `current-stage8:sparseResult.graph` with legacy support
- reintroduce old straight removable supports
- couple Artifact Export to Print Readiness again
- make Print diagnostics authoritative over artwork authoring data
- merge to `main` during restoration work

## Architectural direction

SKIN should be divided conceptually into two responsibilities:

```text
AUTHORING
  Base Shape
  Surface Pattern
  Network
  Artwork

PRINT
  Preparation
  Support
  Validation
  Export
```

The print pipeline must consume artwork state, not rewrite the authoring source of truth.

Recommended flow:

```text
Base Shape
↓
Surface Pattern
↓
Network
↓
Artwork Complete
↓
Artwork Snapshot
↓
Print Preparation
↓
Support
↓
Validation
↓
Export
```

## R0 — Baseline freeze

Record and protect the current printable state.

Acceptance:

- branch is created from `f542f84...`
- printable baseline remains untouched
- Stage 8 regression values are recorded

## R1 — Authoring inventory

Before changing code, classify every relevant capability into exactly one category:

### A. Still usable

Feature remains functional and reachable.

### B. Present but de-emphasized

Code and callbacks remain, but the capability is hidden, collapsed, labeled Future/Legacy, or no longer in the main workflow.

### C. Actually lost

Capability or behavior was removed or broken and needs restoration.

### D. Intentionally not restored

Legacy/research behavior that should remain out of the production authoring workflow.

Audit at minimum:

- Base Shape editing
- Surface Pattern generation
- manual Pattern add / select / move / delete
- motif and distribution controls
- Artwork Graph
- Dry Web
- Spider / integrated network
- graph edge select / delete
- red-face / region selection
- local reinforcement
- Undo / Redo
- `.fkei` Save / Load
- four-view workflow
- camera controls
- overlays and diagnostics
- legacy JSON transfer UI
- research / frozen shelves

Deliverable:

`docs/plans/skin-authoring-restoration-inventory.md`

Do not perform broad restoration before this inventory is complete.

## R2 — Surface Pattern authoring restoration

Restore Surface Pattern as an active creation workflow.

Priority capabilities:

- generate / regenerate
- manual Pattern add
- Pattern selection
- move / refine
- delete
- motif selection
- distribution controls
- Undo / Redo

Requirements:

- operations update authoring state, not temporary print geometry
- `.fkei` round-trip preserves the authored result
- reopening the project permits the existing print pipeline to run normally

Gate:

```text
Edit
↓
Save .fkei
↓
Reload
↓
Same artwork state
↓
Current Stage 8 pipeline still works
```

## R3 — Network authoring restoration

Promote the current Graph / Dry Web / Spider capabilities from Future-oriented presentation back into production authoring.

Restore or expose:

- Artwork Graph visibility
- Dry Web generation
- Spider Network generation
- node / edge inspection
- edge selection
- edge deletion
- Pattern ↔ network connections
- network regeneration
- local reinforcement
- graph visibility toggles
- Undo / Redo

Critical distinction:

```text
Permanent Network ≠ Removable Print Support
```

The network is artwork geometry.

Stage 8 removable support remains separate and orange/current-stage8-derived.

## R4 — Editing model cleanup

Consolidate authoring operations around a small stable editing vocabulary:

```text
SELECT
MOVE
ADD
DELETE
CONNECT
DISCONNECT
REINFORCE
```

Applicable targets may include:

- Pattern
- Graph Node
- Graph Edge
- Region

Do not simply expose every historic button. Reconnect useful functionality through the smallest coherent editing model possible.

## R5 — Artwork Complete checkpoint

Introduce an explicit authoring checkpoint before print work.

`ARTWORK COMPLETE` should freeze the current authored object state for print consumption.

Artwork snapshot should contain the meaningful authored state, including:

- Base Shape
- Surface Pattern
- Permanent Graph
- Permanent Reinforcement
- Artwork Mesh / required derived representation

Conceptual boundary:

```text
Authoring Document
↓
Artwork Snapshot
↓
Print Pipeline
```

The print pipeline must not silently rewrite the authoritative authoring document.

## R6 — FKEI source-of-truth cleanup

`.fkei` remains the project-level authoring document format.

Persist meaningful artwork state such as:

- Base Shape
- Pattern data
- Permanent Graph
- Permanent Reinforcement
- authoring state needed for round-trip editing
- revisions / provenance where already supported

Treat as derived or transient unless explicitly required:

- selection overlays
- temporary diagnostic overlays
- renderer-only state
- transient support previews

If Stage 8 removable support is persisted, keep it semantically separate from authored permanent structure.

## R7 — Preserve current print pipeline

After authoring restoration, reconnect the existing print path without redesigning it.

Keep the current working chain:

```text
Artwork
↓
Mesh
↓
Interior / Overhang Diagnostics
↓
Stage 8 Sparse Support
↓
Validation
↓
3MF / STL / report
```

Golden requirements:

- `supportSource = current-stage8:sparseResult.graph`
- `project.printSupport === sparseResult.graph`
- accepted BODY collision = 0
- Inside-derived = 0
- offset-bend path remains visible and exported
- 3MF / STL / report fingerprint parity remains intact
- Print Readiness warnings do not disable technically valid Artifact Export

## R8 — UI normalization

Only after functionality is restored, simplify presentation.

Preferred top-level structure:

```text
PROJECT

CREATE
  Base
  Pattern
  Network

REFINE
  Select
  Move
  Connect
  Reinforce

PRINT
  Diagnose
  Support
  Export

VIEW
```

Advanced / research / legacy capabilities should remain available only where they are still useful, preferably collapsed and clearly separated from production authoring.

Do not restore UI clutter merely because old controls once existed.

## R9 — Regression gate

Each milestone should run the relevant existing checks plus new restoration tests.

Minimum gate:

- SKIN tests
- TypeScript
- Vite build
- browser smoke
- `.fkei` save/load round-trip
- Undo / Redo regression
- current Stage 8 support regression
- 3MF export regression
- STL export regression
- artifact fingerprint parity
- `git diff --check`

Final Golden Print regression must compare against the frozen baseline:

```text
Critical 166
Supported 156
Unsupported 10
Support nodes 546
Support edges 390
accepted BODY collision 0
Inside-derived 0
```

A changed value is not automatically forbidden, but it must never drift silently. Any intentional change requires an explicit explanation and updated evidence.

## Execution order

```text
R0  Baseline freeze
↓
R1  Inventory
↓
R2  Surface Pattern authoring
↓
R3  Network authoring
↓
R4  Editing model cleanup
↓
R5  Artwork Complete snapshot
↓
R6  FKEI round-trip / source-of-truth cleanup
↓
R7  Print pipeline regression
↓
R8  UI normalization
↓
R9  Full regression
```

## Implementation rule for LUNA

Do not begin by merging an old SKIN branch wholesale.

The current printable implementation is the new base. Restore authoring behavior by reconnecting retained capabilities and selectively reintroducing truly lost behavior.

For each milestone:

1. inspect the current implementation and relevant history
2. identify the smallest restoration surface
3. implement without weakening the printable baseline
4. add or update regression tests
5. run tests / TypeScript / build / browser smoke where applicable
6. run Stage 8 golden regression when touching shared geometry or state
7. commit and push a clean checkpoint
8. continue unless a hard blocker is found

Hard blockers include:

- current Stage 8 support source becomes stale or legacy
- accepted BODY collisions are introduced
- stale support or mesh results can overwrite current state
- `.fkei` round-trip destroys authored data
- current artifact export parity breaks without an explained replacement
- repository cannot be returned to a clean checkpoint

## Guiding principle

The restoration is successful when SKIN again behaves first as a program for making the artwork, while the now-working print system remains a reliable downstream fabrication layer.
