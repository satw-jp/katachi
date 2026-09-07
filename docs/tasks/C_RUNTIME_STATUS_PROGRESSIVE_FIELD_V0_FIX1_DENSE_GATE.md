# C — Runtime Status + Progressive FIELD v0 Fix 1 · Dense Real-State Gate

Date: 2026-09-07
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: ACTIVE

## Why Fix 1 is required

C SOL reviewed `agent/skin-runtime-status-progressive-field-v0` at:

`a1596883e9772da144f54ec29aa8dd0339e4bbf5`

The implementation structure is acceptable enough to keep:

- tiny compute/helper runtime status exists and healthy J helper was shown as `Compute ● CUDA`;
- FIELD progression exists as proxy -> coarse -> medium -> fine;
- camera interaction invalidates/restarts progression;
- backend preference remains session-only;
- Production BODY / Graph / Support / FKEI / export paths were not changed.

However the required dense browser gate is missing. The implementation was browser-checked at only 152 primitives, while the motivating author failure occurred on a much denser current state. The branch README also records that large ~10,450 primitive performance was not re-proven.

The current renderer schedules `medium` automatically after 220 ms and `fine` after 620 ms. This is only acceptable if the dense real state remains usable. The task contract explicitly forbids an automatic refinement tier that freezes author interaction for seconds.

Therefore this Fix 1 is evidence-first. Do not redesign FIELD unless the dense gate proves the current progression is still unusable.

## Start point / workspace

Continue from exactly:

- branch: `agent/skin-runtime-status-progressive-field-v0`
- checkpoint: `a1596883e9772da144f54ec29aa8dd0339e4bbf5`
- J-side worktree only
- shared samples authority: `J:\dev\samples`
- live helper: `J:\dev\katachi-compute-helper-tray`

Do not merge/rebase main merely to obtain this task document.

## A. Dense real-state browser gate — mandatory first

Use the same/current dense authoring state that reproduces or approximates the author's long FIELD wait. Prefer the actual current completed sample/input rather than a synthetic small fixture.

Record:

- exact sample/input identity/path without modifying the user-managed sample;
- primitive count;
- FIELD backend used;
- time to immediate proxy;
- time to first recognizable coarse FIELD;
- time/sequence to medium and fine;
- whether medium or fine visibly blocks camera/UI interaction for seconds;
- camera interaction during refinement and whether stale progression is cancelled;
- post-interaction restart behavior.

The gate must be run at a meaningfully dense count representative of the author's problem. A ~152 primitive sample is not sufficient for closure.

## B. Decision after dense gate

### If current `a1596883...` behavior is responsive

Do not change renderer code merely for cleanup. Record evidence and return to C SOL.

### If any automatic FIELD tier causes a visibly multi-second stall

Fix only the progressive presentation policy needed to preserve usability.

Required contract:

- immediate lightweight proxy remains available;
- refinement may advance only while it remains responsive;
- do not automatically force a known expensive `fine` pass after a fixed timer;
- if higher quality is too expensive, keep the best responsive tier visible and truthfully label it preview/refining/quality state;
- camera movement must immediately regain responsive proxy behavior;
- after interaction, restart progression without forcing a known blocking tier.

A small adaptive policy is allowed within renderer/presentation scope. For example, prior coarse/medium render cost may be used to decide whether a higher tier should auto-run. Do not invent a new FIELD acceleration architecture.

Do not solve this by:

- decimating/subsetting primitives;
- changing SDF math;
- changing smooth-min order;
- changing FIELD source semantics;
- changing Production geometry;
- moving compute endpoint/configuration.

If responsive dense behavior cannot be achieved without a new acceleration architecture, STOP and report to C SOL.

## C. Presentation-quality boundary

The current `uMarchSteps` quality control may remain only if the dense visual gate shows that coarse/medium are recognizable presentations of the same current FIELD and fine remains the accepted 160-step endpoint.

Do not claim geometric/semantic parity from a coarse image. Coarse/medium are preview tiers only.

If the reduced march-step tiers create misleading missing large regions rather than a recognizable coarse image on the dense state, STOP and report that this quality ladder is not an acceptable preview strategy before expanding implementation.

## D. Compute status evidence

Complete the missing runtime-state evidence:

1. helper healthy -> compact connected/CUDA state;
2. helper unavailable/off -> compact offline/unavailable state;
3. restore helper -> connected state returns;
4. no endpoint/config rewrite;
5. no high-frequency polling added.

Do not alter helper configuration for this evidence except starting/stopping the already-authoritative J helper as needed.

## E. Regression gates

Preserve all accepted behavior:

- FIELD(vNext) -> BEADS -> FIELD retains vNext preference;
- camera interaction -> proxy; interaction end -> progressive restart;
- leaving FIELD hides FIELD fullscreen output;
- Legacy FIELD remains truthful;
- MESH / GRAPH / DIAGNOSTICS do not regress;
- no new console error attributable to this task;
- no repeated timer/resource accumulation.

Run at minimum:

- FIELD focused tests;
- progressive FIELD focused tests;
- runtime status focused tests;
- `npm run test:skin-rebuild`;
- typecheck;
- build;
- `git diff --check`;
- current Production parity sufficient to prove locked BODY / Graph / Support / 3MF identities remain exact.

Locked identities remain:

- Permanent BODY: `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`
- Permanent Graph: `5cb659849d694beaae6443a4828031b5b6471b836bbe5e78aede5aece1c34435`
- Removable Support: `ef1d3eaec4146e171316a81e441797526fef6c8921d88a7689b68ac9c5892121`
- supportSource: `current-stage8:sparseResult.graph`
- Production 3MF SHA-256: `bbc0af54bb6f038e61f211666a7a4378785cf2b6b106f9771acbbe5c96587e1c`

Any Production identity difference is HARD FAIL / STOP.

## Protected scope

Do not touch:

- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support algorithm/parameters/source;
- source-to-mm / Output Scale;
- FKEI semantics;
- Production Export semantics;
- FIELD SDF/source/primitive semantics;
- compute endpoint/connection configuration;
- External STL Host;
- Usagi;
- durability implementation;
- Outside->Outside Support;
- new research algorithms.

## Done when

Ready for C SOL review only when:

- dense real-state timing/behavior evidence is recorded;
- no automatic progressive tier causes a multi-second unusable stall, OR a bounded adaptive stop/refine correction fixes it;
- coarse/medium are visually recognizable previews rather than misleading missing geometry;
- helper healthy/offline/restore states are browser-verified;
- existing interaction/view switching remains correct;
- tests/build/diff checks pass;
- Production parity remains exact;
- branch is pushed and compact handoff is returned.

Do not continue into durability, Usagi, Support, or any other C task after this gate.