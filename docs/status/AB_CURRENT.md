# Team AB Current Status

Last verified: 2026-09-07

## Current authority
- repo: `satw-jp/katachi`
- canonical workspace: `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`
- branch: `agent/skin-a2-sparse-support-performance-v1`
- accepted performance v1 base: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- Retention v0 reviewed remote checkpoint: `d071a583c19fd811a534db1c8cbd039dbfdd99e3`
- J workspace cutover: PASS
- C-side `C:\dev\katachi`: rollback/evidence only; do not use for future AB work
- canonical user-managed samples: `J:\dev\samples`
- `C:\dev\samples`: non-authoritative
- do not commit / rename / reorganize / delete user-managed samples
- A2 source SHA-256: `2030a945eb44fb3a263c667305f10ce8a773af5d8914cfca82d7c3f68680b04c`
- Rabbit SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Rabbit repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`

## Current phase
Performance v1 and J workspace migration are CLOSED / PASS.

Candidate Artifact Retention / Checkpoint v0 has passed code review and the real-browser canonical A2 end-to-end persistence gate. One tiny documentation/manifest cleanup remains before formal CLOSED/PASS.

Performance v2, G/H/J, and new Support architecture remain NOT active.

## Candidate Artifact Retention / Checkpoint v0 — CODE PASS / DOC CLEANUP REQUIRED
Task:
`docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`

Reviewed remote commit:
`d071a583c19fd811a534db1c8cbd039dbfdd99e3`

Exact lineage:
- base: `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`
- one commit ahead
- seven changed files

### Exact implementation review — PASS
Reviewed behavior:
- Candidate processing requires an explicitly authorized output directory;
- validated 3MF archive is written to deterministic `ASTRA_<candidate>_candidate-print-lane.3mf`;
- writable handle is closed before verification;
- persisted file is reacquired/reopened through the directory handle;
- generated vs persisted byte length, exact bytes and SHA-256 are checked;
- mismatch throws fail-closed before evidence sidecar and before `RELEASE_CANDIDATE`;
- `.evidence.json` is written only after archive verification, then reopened/reread and compared exactly;
- `RELEASE_CANDIDATE` is sent only after durable archive + evidence verification succeeds;
- binary archive bytes are excluded from sidecar evidence;
- no Candidate geometry / Support / Rabbit / FKEI / export semantic changes found.

Focused fixture covers:
- write / close / reopen;
- exact bytes / SHA;
- evidence sidecar identity;
- corrupt persisted archive fail-closed before sidecar.

Reported validation:
- focused tests: PASS
- both TypeScript checks: PASS
- production build: PASS
- `git diff --check`: PASS
- working tree after push: clean

### Real-browser canonical A2 retention gate — PASS
Author-selected output directory:
`J:\My Drive\codex\2026-09-05\files-pasted-by-the-user-katachi\browser-retention-gate-20260907`

- `J:\dev\samples` was not used
- A2 Full Support: `4,561 / 4,561`
- accepted BODY / Rabbit collision: `0 / 0`
- 3MF validator: PASS
- Signed Volume: AVAILABLE
- output file: `ASTRA_A_candidate-print-lane.3mf`
- persisted byte length: `75,491,874`
- generated/persisted byte length: exact match
- persisted SHA-256: `DE304365A3247487F7EC18DB1536D2234E9980A57576D6ACFFB0AA3C00460874`
- generated/persisted SHA-256: exact match
- `.evidence.json` persisted + reread: PASS
- durable verification: PASS
- `RELEASE_CANDIDATE`: PASS after durable verification
- source SHA / geometry / diagnostics / Support / export fingerprints: exact parity with current authority
- G/H/J: NOT RUN
- Performance v2: NOT STARTED

The archive byte/SHA differs from an earlier A2 export. This is not a Retention v0 failure: the retention contract requires exact identity between the current validated generated archive and its persisted copy. Semantic/export identity remains protected by source/fingerprint/Support evidence.

Chrome counter `errors 1 / warnings 0` is attributed to the earlier intentional bounded-fixture A2 SHA mismatch. The canonical A2 run itself did not add an error; no rerun is required solely to reset the accumulated counter.

### Remaining cleanup before formal CLOSED/PASS
The implementation commit contains stale observational metadata created before the real-browser gate completed:
- `src/studies/skin/README.md` still says the Chrome persistence gate is UNVERIFIED / A2 was not rerun;
- `src/studies/skin/manifest.json` contains the same stale statement;
- `src/studies/skin/manifest.json` contains that Retention revisit twice.

This is documentation/manifest consistency only. It does not invalidate the implementation or require another browser/A2 run.

Active instruction to LUNA:
1. do not change runtime implementation;
2. update only the stale Retention v0 observation text in `src/studies/skin/README.md` and `src/studies/skin/manifest.json` to record the actual browser A2 PASS facts above;
3. remove the duplicate manifest Retention revisit so exactly one remains;
4. run `git diff --check` and any cheap manifest/docs validation normally used by this lane;
5. commit and normal-push this docs-only cleanup on the same branch;
6. return commit SHA / remote HEAD / exact changed files.

No A2 rerun is required. No Performance v2 / G/H/J / new Support work may start during this cleanup.

## Performance v1 — PASS / CLOSED
Accepted commit:
`a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

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

Astra performance handoff remains preserved:
`docs/notes/AB_A2_PERFORMANCE_ASTRA_HANDOFF_2026-09-07.md`

## G/H/J status
HOLD.

Retention closure does not itself authorize G/H/J. The author must explicitly resume the equal-condition comparison lane afterward.

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
- Retention v0 runtime implementation exact review at `d071a583...`
- canonical A2 durable 3MF persistence / reopen / byte / SHA / sidecar / pre-release gate

### ACTIVE
- Retention v0 docs/manifest consistency cleanup only

### AUTHOR / PHYSICAL NOT YET PROVEN
- A2 physical print completion
- authored SKIN Support alone as sufficient support
- full physical profile frozen for A/G/H/J

### HOLD
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
- Performance v2
