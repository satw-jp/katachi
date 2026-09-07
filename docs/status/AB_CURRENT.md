# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- canonical workspace: `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`
- accepted branch / HEAD: `agent/skin-a2-sparse-support-performance-v1` / `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- J worktree cutover: PASS
- C-side `C:\dev\katachi`: rollback/evidence only; do not use for future AB work
- canonical user-managed samples: `J:\dev\samples`
- `C:\dev\samples`: non-authoritative
- do not commit / rename / reorganize / delete user-managed samples
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`

## Current phase
Performance v1 and J workspace migration are CLOSED / PASS.

Candidate Artifact Retention / Checkpoint v0 has now passed its real-browser canonical A2 end-to-end gate locally, but the implementation remains uncommitted. The next gate is commit / normal push / exact GitHub diff review.

Performance v2, G/H/J, and new Support architecture remain NOT active.

## Candidate Artifact Retention / Checkpoint v0 — LOCAL PASS CANDIDATE / awaiting commit + push
Task:
`docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`

Authorized local implementation base:
`a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

Reported implementation:
- explicit user-authorized output-directory persistence;
- validated 3MF write -> close -> reopen;
- persisted exact byte-length and SHA-256 verification against generated archive identity;
- `.evidence.json` sidecar write and reread;
- mismatch fails closed before sidecar/release;
- release hard-gated on durable verification;
- no Support / Rabbit / Candidate / FKEI / export semantic change.

Reported local changed files:
- `src/studies/skin/candidateArtifactRetention.ts`
- `src/studies/skin/candidateArtifactRetention.test.ts`
- `src/studies/skin/astraCandidatePrintLaneLab.ts`
- `package.json`
- `tsconfig.test.json`
- `src/studies/skin/README.md`
- `src/studies/skin/manifest.json`

Local verification before browser gate:
- focused tests: PASS
- both TypeScript checks: PASS
- production build: PASS
- `git diff --check`: PASS

### Browser output-directory authorization — PASS
Author-selected directory:
`J:\My Drive\codex\2026-09-05\files-pasted-by-the-user-katachi\browser-retention-gate-20260907`

`J:\dev\samples` was not used.

### Bounded fixture — EXPECTED FAIL-CLOSED
The bounded fixture correctly failed Candidate A identity before export:
- actual fixture SHA-256: `e740ca47f0ab8beba3613acd82b9b15f4022f29afe57db65ac8fb8c63521f658`
- required canonical A2 SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`

This is expected fail-closed evidence, not a retention defect.

### Canonical A2 end-to-end retention gate — PASS
Reported actual gate:
- A2 Full Support: `4,561 / 4,561`
- accepted BODY / Rabbit collision: `0 / 0`
- 3MF validator: PASS
- Signed Volume: AVAILABLE
- Rabbit repair fingerprint: exact canonical match
- output file: `ASTRA_A_candidate-print-lane.3mf`
- persisted byte length: `75,491,874`
- persisted SHA-256: `DE304365A3247487F7EC18DB1536D2234E9980A57576D6ACFFB0AA3C00460874`
- generated vs persisted byte length: exact match
- generated vs persisted SHA-256: exact match
- `.evidence.json` persisted and reread: PASS
- durable verification: PASS
- `RELEASE_CANDIDATE`: PASS after durable verification
- source SHA / geometry / diagnostics / Support / export fingerprints: exact parity with current authority
- G/H/J: NOT RUN
- Performance v2: NOT STARTED
- additional code changes during final gate: NONE

The retained archive bytes/SHA differ from an earlier A2 archive. This does not fail Retention v0: this gate requires identity between the current generated validated archive and its persisted copy, not byte-for-byte identity across distinct export runs. Semantic/export identity is carried by the preserved source/fingerprint/Support evidence.

Chrome page counter reported `errors 1 / warnings 0`; the single error is attributed to the earlier intentional bounded-fixture SHA mismatch, not to the canonical A2 run. No rerun is required solely to reset that accumulated counter.

### Next gate
1. commit only the current Retention v0 implementation on `agent/skin-a2-sparse-support-performance-v1`;
2. normal push only; no force / rebase / merge;
3. return commit SHA / remote HEAD / exact changed files;
4. SOL reviews exact GitHub diff against `a3c3dbdb...`;
5. no additional A2 Full Support rerun unless exact review finds a concrete defect.

Do not start Performance v2, G/H/J, or new Support architecture before Retention v0 is formally ACCEPTED / CLOSED.

## Performance v1 — PASS / CLOSED
Accepted commit:
`a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

Accepted execution-only optimization:
- exact Rabbit capped unsigned-distance query `min(exactDistance, cap)`;
- Rabbit signed SDF remains sign authority;
- fail-closed one-Lipschitz forbidden certification preserved;
- P0 copyable/localStorage COMPLETE evidence retention preserved.

Full A2:
- v0: `2,232,690.1 ms` (~37m13s)
- accepted v1: `528,025.4 ms` (~8m48s)
- v0 -> v1 improvement: `76.35%`

Canonical facts remain:
- targets: `4,561 / 4,561`
- route candidates / audits: `102,193 / 90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`
- geometry / diagnostics / Support / export fingerprints: exact parity
- bounded semantic digest: exact parity

## Physical A2 gate — author/manual
Current print classification:
`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`.

This is physical-feasibility evidence, not proof that authored SKIN Support alone is sufficient.

If slicer-generated Support is later used for A/G/H/J comparison, freeze the same slicer policy/profile across all candidates.

## Future Support architecture hypothesis — HOLD / not active
`Outside-only body-anchored removable Support` remains research/design input only.

Shared note:
`docs/notes/AB_A2_PHYSICAL_PREVIEW_AUTHOR_OBSERVATION_2026-09-06.md`

Astra performance handoff is preserved for future research:
`docs/notes/AB_A2_PERFORMANCE_ASTRA_HANDOFF_2026-09-07.md`

## G/H/J status
HOLD.

Artifact-retention closure does not itself authorize G/H/J. The author must explicitly resume the equal-condition comparison lane afterward.

## HOLD / DO NOT CHANGE
- G/H/J execution until author explicitly resumes
- Performance v2 until separately scoped
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
- no deploy from this gate
- do not resume AB implementation from C-side workspace
- do not use `C:\dev\samples` as current input authority
- do not modify/delete C-side untracked `docs/infrastructure/` as part of AB work

## Evidence boundary
### PASS / PROVEN
- A2 software geometry / diagnostics / Support / export / validation chain under locked semantics
- Performance v1 exact parity at `528,025.4 ms`
- J workspace cutover
- samples authority cutover
- Retention v0 local tests/build/diff-check
- browser directory authorization
- bounded fixture expected fail-closed identity gate
- canonical A2 durable 3MF persistence / reopen / byte / SHA / sidecar / pre-release gate

### LOCAL PASS / NOT YET GITHUB-REVIEWED
- Retention v0 implementation code itself

### AUTHOR / PHYSICAL NOT YET PROVEN
- A2 physical print completion
- authored SKIN Support alone as sufficient support
- full physical profile frozen for A/G/H/J

### HOLD
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
- Performance v2
