# C — SKIN Production UI IA v0A Fix 1

Date: 2026-09-06
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: ACTIVE

## Review source

Rejected checkpoint:

`c5f817664dcc25cc0ced1b404504ed192a015ec0`

Branch:

`agent/skin-production-ui-ia-v0`

The checkpoint is scope-safe and does not show a Production semantics change, but it does not yet satisfy the v0A completion gate.

## Why Fix 1 is required

Two blocking gaps remain.

### 1. FLOW is still primarily a Stage1–8 scroll navigator

The current implementation maps:

- SHAPE -> `skin-stage-1`
- COMPOSE -> `skin-stage-2`, `skin-stage-3`
- STRUCTURE -> `skin-stage-4`, `skin-stage-5`, `skin-stage-6`
- SUPPORT -> `skin-stage-7`, `skin-stage-8`
- EXPORT -> `skin-stage-8`, `skin-print-preparation`

and `setActiveFlow()` opens the first matching historical Stage details element and scrolls to it.

That is not yet the requested primary author-facing five-step Inspector IA.

The accepted v0A shell must make FLOW selection change which phase-specific Inspector content is visible. Historical Stage1–8 may remain reachable under Advanced / Historical Workflow, but must not remain the primary mental model behind the five FLOW buttons.

### 2. Required exact Production parity evidence is not recorded

The checkpoint note states that tests passed and semantics are unchanged, but the required review evidence is incomplete.

Fix 1 must record the exact parity gate, including deterministic replay x2 and the locked Production identities required by the original task.

## Implementation instruction

Continue on the existing branch from checkpoint `c5f817664dcc25cc0ced1b404504ed192a015ec0`.

Do not reset, rebase, merge main, or restart from an older Production checkpoint merely to obtain reporting docs.

### A. Make FLOW control actual Inspector presentation

Keep exactly five FLOW buttons:

`SHAPE / COMPOSE / STRUCTURE / SUPPORT / EXPORT`

Selecting a FLOW phase must:

- only change UI presentation / visible Inspector grouping;
- expose the controls belonging to that phase;
- not run compute;
- not click existing action controls programmatically;
- not rebuild geometry;
- not invalidate Production stages;
- not reset state;
- not become pipeline-state authority.

Do not use opening + `scrollIntoView()` of historical Stage1–8 as the primary FLOW behavior.

Implementation may reparent existing DOM/control sections into phase containers or use a safe presentation wrapper, but:

- keep one canonical control/callback per semantic action;
- no hidden duplicate controls;
- no duplicate DOM IDs;
- hide/show must preserve state;
- do not introduce persistent layout or application state.

### B. Required phase semantics

Primary author-facing Inspector must visibly establish:

- `SHAPE` — current Host/Base controls only; no fake External STL Host;
- `COMPOSE` — motifs / surface pattern / population / placement / edit;
- `STRUCTURE` — `Permanent Structure`; current Local Relay + bounded Graph-only repair authority only;
- `SUPPORT` — `Removable Support`; current Stage8 support semantics only;
- `EXPORT` — current Stage8 Artifact Export authority only.

`Permanent Structure` and `Removable Support` must be visibly distinct concepts in the primary IA.

Do not add research method selectors or new capabilities.

### C. Historical / diagnostic capability

Preserve existing Stage1–8, raw diagnostics, Dry Web / Spider historical controls, research/frozen/legacy controls, and recovery functionality through progressive disclosure where safe.

Historical Stage labels may remain under Advanced / Historical Workflow. They must not compete with the five-step primary FLOW mental model.

Legacy v088 remains `COMPATIBILITY_ONLY` and must not become equivalent to current Export.

### D. Keep already-correct v0A work

Retain unless a regression requires a bounded correction:

- VIEW LAYERS in LEFT;
- LEFT = VIEW / DISPLAY;
- narrow FLOW column;
- FIELD Legacy/vNext availability;
- current legacy v088 compatibility labeling;
- existing callbacks and state semantics.

## Protected scope

No changes to:

- Local Relay;
- Graph Repair;
- motif placement/transforms;
- BODY generation / BODY field;
- member sizing;
- current Stage8 Removable Support algorithm/parameters/source;
- `current-stage8:sparseResult.graph`;
- source-to-mm / Output Scale semantics;
- FIELD vNext display-only / session-only semantics;
- FKEI schema/semantics;
- Export semantics;
- Production state architecture;
- External STL Host;
- Usagi;
- Co-evolution;
- D / F1 / F2 / F3;
- C+D Hybrid;
- new C research or diagnostics algorithms.

Any Production difference is HARD FAIL / STOP.

## Browser gate

Verify at minimum:

1. VIEW LAYERS remains in LEFT.
2. FLOW is exactly SHAPE / COMPOSE / STRUCTURE / SUPPORT / EXPORT.
3. Selecting each FLOW phase changes visible Inspector content rather than merely scrolling to a historical Stage.
4. FLOW selection alone causes no compute/state mutation.
5. SHAPE exposes legitimate current Host/Base controls and no fake STL import.
6. COMPOSE exposes current motif authoring controls.
7. STRUCTURE visibly identifies Permanent Structure.
8. SUPPORT visibly identifies Removable Support.
9. EXPORT exposes current Production export path; legacy v088 remains secondary compatibility.
10. Advanced/Details/Help folding preserves state and historical/recovery capability remains reachable.
11. no duplicate controls/IDs.
12. no introduced console/UI exception.
13. normal desktop viewport remains usable.

## Production parity evidence gate

Run the same locked C Production fixture and record evidence sufficient for C SOL review.

Required exact identities:

- Host: EXACT
- Motifs: EXACT
- Permanent Graph: EXACT
- Permanent BODY fingerprint: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`
- supportSource: `current-stage8:sparseResult.graph`
- Support: EXACT
- 3MF Artwork BODY: EXACT
- 3MF Support: EXACT
- FIELD vNext: PASS / unchanged
- Output Scale semantics: unchanged

Run deterministic Production replay twice and record that the two results are identical.

Record the exact hashes/fingerprints already emitted by the current verification path where available. Do not invent a new geometry/export pipeline merely to produce evidence.

## Tests

Run:

- relevant UI / renderer tests;
- `npm run test:skin-rebuild`;
- typecheck;
- `npm run build`;
- `git diff --check`;
- deterministic Production replay x2.

Add or update focused UI tests so the five-step Inspector behavior is covered, including the requirement that FLOW navigation is presentation-only.

## Checkpoint / reporting

If Fix 1 passes:

1. commit on `agent/skin-production-ui-ia-v0`;
2. update the branch-local `docs/status/C_CURRENT.md` with factual evidence only; do not self-declare global CLOSED;
3. push branch;
4. do not merge;
5. do not deploy;
6. return the compact C SOL review handoff required by `docs/TEAM_REPORTING_RULES.md`.

## Done when

Fix 1 is ready for C SOL review when the five FLOW phases are the actual primary Inspector IA, Production parity evidence is explicit and exact, browser gate/tests pass, and the pushed branch remains Production-semantics-identical to the locked baseline.
