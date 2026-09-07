# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- canonical workspace: `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`
- branch: `agent/skin-a2-sparse-support-performance-v1`
- accepted performance v1 commit: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- accepted Retention v0 implementation: `d071a583c19fd811a534db1c8cbd039dbfdd99e3`
- accepted Retention v0 docs closure: `2f0eb180fbe1ed0e9034ea2420628f4421f66d95`
- J workspace cutover: PASS
- C-side `C:\dev\katachi`: rollback/evidence only; do not use for future AB work
- canonical user-managed samples: `J:\dev\samples`
- `C:\dev\samples`: non-authoritative
- do not commit / rename / reorganize / delete user-managed samples
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`

## Current phase
The following are CLOSED / PASS:
- Performance v1
- AB workspace migration to J
- Candidate Artifact Retention / Checkpoint v0

No implementation task is currently active.

Performance v2 has **not** started.
G/H/J remain HOLD until the author explicitly resumes the equal-condition comparison lane.
New Support architecture is not active.

The author/manual A2 physical-feasibility gate remains independent.

## Performance v1 — PASS / CLOSED
Accepted commit:
`a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

Full A2 performance:
- v0: `2,232,690.1 ms` (~37m13s)
- accepted v1: `528,025.4 ms` (~8m48s)
- v0 -> v1 improvement: `76.35%`

Accepted execution-only optimization:
- exact Rabbit capped unsigned-distance query `min(exactDistance, cap)`;
- Rabbit signed SDF remains sign authority;
- fail-closed one-Lipschitz forbidden certification preserved;
- P0 COMPLETE evidence-retention capability preserved.

Canonical facts retained:
- targets: `4,561 / 4,561`
- route candidates / audits: `102,193 / 90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`
- geometry / diagnostics / Support / export fingerprints: exact parity
- bounded semantic digest: exact parity

## Candidate Artifact Retention / Checkpoint v0 — PASS / CLOSED
Task:
`docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`

Accepted implementation:
`d071a583c19fd811a534db1c8cbd039dbfdd99e3`

Accepted docs/manifest closure:
`2f0eb180fbe1ed0e9034ea2420628f4421f66d95`

### Accepted behavior
Before `RELEASE_CANDIDATE`:
1. require explicitly authorized output directory;
2. persist deterministic validated 3MF filename;
3. close writable handle;
4. reopen/reacquire persisted file;
5. verify exact byte length / exact bytes / SHA-256 against generated archive;
6. persist `.evidence.json` only after archive verification;
7. reopen/reread sidecar and require exact identity;
8. release only after durable verification PASS.

Mismatch remains fail-closed before sidecar / release.

No new serialized Support checkpoint is required for v0; the durably verified validated 3MF is the equivalent no-recompute recovery path.

### Real Windows Chrome canonical A2 gate — PASS
Author-selected output directory:
`J:\My Drive\codex\2026-09-05\files-pasted-by-the-user-katachi\browser-retention-gate-20260907`

- `J:\dev\samples` was not used
- A2 Full Support: `4,561 / 4,561`
- accepted BODY / Rabbit collision: `0 / 0`
- validator: PASS
- Signed Volume: AVAILABLE
- source / geometry / diagnostics / Support / export fingerprints: exact parity
- output: `ASTRA_A_candidate-print-lane.3mf`
- persisted byte length: `75,491,874`
- persisted SHA-256: `DE304365A3247487F7EC18DB1536D2234E9980A57576D6ACFFB0AA3C00460874`
- generated/persisted byte length: exact match
- generated/persisted SHA-256: exact match
- `.evidence.json`: persisted + reread PASS
- sidecar observed size: `7,971` bytes
- durable verification: PASS
- `RELEASE_CANDIDATE`: PASS after durable verification

The archive byte/SHA differs from an earlier A2 export, which is acceptable: Retention v0 requires identity between the current validated generated archive and its persisted copy; semantic/export identity is separately protected by source/fingerprint/Support evidence.

Docs cleanup commit `2f0eb180...` changed only README/manifest, replaced stale UNVERIFIED metadata with actual Browser A2 PASS evidence, and removed the duplicate manifest Retention revisit. JSON parse / `git diff --check` PASS.

## Physical A2 gate — author/manual
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is physical-feasibility evidence, not proof that authored SKIN Support alone is sufficient.

If slicer-generated Support is later used for A/G/H/J comparison, freeze the same slicer policy/profile across all candidates.

## G/H/J status
HOLD.

Retention closure removes the prior artifact-loss blocker, but does not itself authorize G/H/J. The author must explicitly resume the equal-condition comparison lane.

## Performance v2 status
NOT STARTED.

A future Performance v2 should be separately scoped from the current accepted J authority. It must not be treated as an extension of closed Retention v0.

## Future Support architecture hypothesis — HOLD / not active
`Outside-only body-anchored removable Support` remains research/design input only.

Shared note:
`docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

Astra performance handoff remains preserved:
`docs/notes/AB_A2_PERFORMANCE_ASTRA_HANDOFF_2026-09-07.md`

## HOLD / DO NOT CHANGE
- G/H/J execution until author explicitly resumes
- Performance v2 until separately scoped / authorized
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only removable Support baseline
- locked Support settings
- Rabbit forbidden-volume policy / signed-volume authority
- route generation / ordering / tie-breaking
- sample positions / adaptive recursion / thresholds / fail-closed semantics
- spacing / coverage semantics
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- no internal removable-support rescue
- no body-anchored Support without a separate task
- no multi-core / CUDA / WebGPU / native migration without a separate task
- no winner before physical comparison
- no deploy from these closed gates
- do not resume AB implementation from C-side workspace
- do not use `C:\dev\samples` as current input authority
- do not modify/delete C-side untracked `docs/infrastructure/` as part of AB work

## Evidence boundary
### PASS / PROVEN
- A2 software geometry / diagnostics / Support / export / validation chain under locked semantics
- Performance v1 exact parity at `528,025.4 ms`
- J workspace cutover
- samples authority cutover
- Retention v0 runtime implementation exact review at `d071a583...`
- canonical A2 durable 3MF persistence / reopen / byte / SHA / sidecar / pre-release gate
- Retention docs/manifest closure at `2f0eb180...`

### AUTHOR / PHYSICAL NOT YET PROVEN
- A2 physical print completion
- authored SKIN Support alone as sufficient support
- full physical profile frozen for A/G/H/J

### HOLD
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
- Performance v2
