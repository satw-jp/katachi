# C — Runtime Status + FIELD Visibility Correctness v0

Date: 2026-09-07
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: ACTIVE

## Purpose

Correct two author-visible runtime problems observed on the accepted J-side C runtime without changing Production, Support, Export, or FIELD semantics:

1. SKIN does not visibly tell the author whether katachi compute/helper is connected.
2. The FIELD layer can report `current` while the viewport shows only the grid / no visible shape.

This is a runtime presentation/correctness task. It is not a geometry or algorithm redesign task.

## Start point / workspace

Start from the accepted C authority:

- branch/checkpoint: `agent/skin-field-vnext-interaction-v0` / `dad764ce7e410b0c1751a5d8ed52c2dcd13ba453`
- canonical C workspace root: `J:\dev\worktrees\skin-field-vnext-interaction-v0`
- shared samples authority: `J:\dev\samples`
- live compute/helper runtime: `J:\dev\katachi-compute-helper-tray`

Preferred implementation branch:

`agent/skin-runtime-status-field-visibility-v0`

Use J-side work only. Do not resume from retained C-side worktrees. If creating a new task worktree, create it under `J:\dev\worktrees` from exactly `dad764ce...`.

## A. Tiny compute/helper connection indicator

Add a deliberately small, non-intrusive runtime indicator to the SKIN shell, preferably in the existing top/status chrome where it does not compete with author controls.

Required information:

- connected/healthy: e.g. `Compute ● CUDA` or similarly compact wording;
- helper reachable but CUDA unavailable: truthful compact state;
- helper unreachable: e.g. `Compute ○ offline`;
- checking/unknown: neutral state, not a false PASS.

Requirements:

- reuse the existing C compute/helper capability/connection probe and the already-working endpoint/configuration;
- do not introduce a second endpoint or rewrite the verified connection settings;
- do not expose long diagnostic text in the primary UI;
- optional title/tooltip may contain endpoint/backend detail;
- connection status is runtime-only and must not enter FKEI, authoring state, Production state, or exports;
- avoid aggressive polling. Initial probe plus a modest existing/reused refresh policy is sufficient. Do not create a high-frequency background loop.

Current verified runtime facts that must remain valid:

- helper runtime: `J:\dev\katachi-compute-helper-tray`
- existing capability endpoint is healthy at `127.0.0.1:47658/v1/capabilities`
- CUDA is available in the current healthy state
- current C client probe reports `available:true`

## B. FIELD visible-content correctness

Author observation on the current J runtime:

- FIELD layer can be selected and shown as `current`;
- the viewport may show only the grid / no visible FIELD shape;
- starting the correct compute/helper does not change this behavior.

Do not assume compute/helper is the cause. Diagnose the renderer/state boundary directly.

The existing top-level availability label is not sufficient evidence: current code can mark FIELD `current` from host availability alone. The browser gate must prove visible content.

Required behavior:

1. If the current authoring FIELD source is available and FIELD is selected, the expected host/patch FIELD is visibly rendered in the viewport.
2. Legacy and vNext must both preserve their existing semantic meaning.
3. If FIELD cannot be rendered for a truthful reason (no host, unavailable backend, capability failure, empty current source), show a small explicit empty/unavailable explanation instead of a misleading `current` + blank viewport combination.
4. Do not fabricate geometry or silently substitute an unrelated Production mesh just to make the viewport non-empty.
5. Do not change `fieldVNextGpuShader.ts` semantic field math, primitive ordering/grouping, payload semantics, or Production geometry.
6. Preserve the accepted FIELD interaction behavior at `dad764ce...`: leaving FIELD hides fullscreen FIELD presentations; vNext interaction uses beads proxy; exact vNext returns after interaction.

If the blank FIELD is caused by an unintended mismatch between the current UI/source state and the renderer input, fix only that display/source wiring. If fixing it would require redefining what the authoritative FIELD geometry is, STOP and return to C SOL instead of expanding scope.

## C. Browser gate

Use the J-side runtime and a state with known visible authoring geometry (completed/current sample as appropriate).

Verify:

1. Compute/helper OFF -> tiny indicator truthfully shows offline/unavailable.
2. Compute/helper ON and healthy -> indicator changes to connected/healthy and reflects CUDA when reported by the existing probe.
3. No endpoint/config rewrite was required.
4. BEADS shows the expected current shape.
5. FIELD Legacy shows visible current FIELD geometry, or a truthful explicit unavailable/empty reason; never `current` + unexplained blank viewport.
6. FIELD vNext shows visible current FIELD geometry, or a truthful explicit unavailable reason.
7. FIELD(vNext) camera interaction still uses the accepted bead proxy and restores exact vNext on interaction end.
8. FIELD(vNext) -> BEADS -> FIELD preserves vNext preference and does not leave stale fullscreen output.
9. MESH / GRAPH / DIAGNOSTICS switching does not regress.
10. No compute/rebuild/export callback is triggered solely by status display or view switching.
11. No new console exception attributable to this task.

Record the exact state/sample used for the FIELD visual gate and whether Legacy and vNext each visibly rendered geometry.

## Tests

Add focused tests for the new runtime status presentation and any FIELD availability/empty-state policy extracted for testing.

Run at minimum:

- existing FIELD focused tests;
- new focused tests;
- `npm run test:skin-rebuild` where available on the accepted C branch;
- typecheck;
- build;
- `git diff --check`;
- current Production parity check sufficient to prove locked BODY / Graph / Support / 3MF remain exact.

Locked identities must remain unchanged:

- Permanent BODY: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`
- Permanent Graph: `5cb659849d694beaae6443a4828031b5b6471b836bbe5e78aede5aece1c34435`
- Removable Support: `ef1d3eaec4146e171316a81e441797526fef6c8921d88a7689b68ac9c5892121`
- supportSource: `current-stage8:sparseResult.graph`
- Production 3MF SHA-256: `bbc0af54bb6f038e61f211666a7a4378785cf2b6b106f9771acbbe5c96587e1c`

Any Production identity change is HARD FAIL / STOP.

## Protected scope

Do not change:

- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support algorithm, parameters, or `supportSource`;
- source-to-mm / Output Scale;
- FKEI semantics;
- Production Export semantics;
- FIELD semantic shader/math or primitive semantics;
- compute/helper endpoint/connection configuration unless C SOL explicitly reopens runtime configuration scope;
- External STL Host;
- Usagi;
- single-attachment durability algorithm/reinforcement;
- new research algorithms.

## Done when

Ready for C SOL review when:

- the tiny compute/helper status is truthful and unobtrusive;
- healthy J helper is visibly reported as connected;
- FIELD no longer produces an unexplained `current` + blank viewport state on the verified current sample;
- Legacy/vNext visible-content behavior is browser-verified;
- accepted vNext interaction behavior remains intact;
- tests/build/diff checks pass;
- Production parity remains exact;
- branch is pushed and a compact C SOL handoff is returned.
