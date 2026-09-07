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
- retained A2 physical artifact SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`

## Current phase
Performance v1 and J workspace migration are CLOSED / PASS.

Two AB activities remain independent:

1. **Author/manual physical gate:** A2 physical feasibility print using the retained A2 artifact plus Bambu Studio automatic Tree Support at `45 deg`.
2. **Implementation gate:** Candidate Artifact Retention / Checkpoint v0 before any G/H/J execution.

Performance v2, G/H/J, and new Support architecture are NOT active.

## Active implementation instruction — USER ACTION BLOCKED
Owner: Team AB / SKIN SOL -> LUNA

Task:
`docs/tasks/AB_CANDIDATE_ARTIFACT_RETENTION_CHECKPOINT_V0.md`

Authorized base/workspace:
- `J:\dev\worktrees\skin-a2-sparse-support-performance-v1`
- branch `agent/skin-a2-sparse-support-performance-v1`
- accepted base `a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

LUNA has implemented the bounded Retention v0 path locally and intentionally stopped before commit.

Reported local implementation / verification:
- explicit-authorized-directory 3MF persistence path implemented;
- close -> reopen -> exact byte length / SHA verification implemented;
- `.evidence.json` sidecar persistence / reread implemented;
- mismatch fails closed before sidecar/release;
- focused tests PASS;
- both TypeScript checks PASS;
- production build PASS;
- `git diff --check` PASS;
- page console errors / warnings: `0 / 0`;
- no A2 Full Support rerun;
- G/H/J, Performance v2, new Support architecture, FKEI change, merge, deploy: NOT RUN.

Changed local files reported:
- `src/studies/skin/candidateArtifactRetention.ts`
- `src/studies/skin/candidateArtifactRetention.test.ts`
- `src/studies/skin/astraCandidatePrintLaneLab.ts`
- `package.json`
- `tsconfig.test.json`
- `src/studies/skin/README.md`
- `src/studies/skin/manifest.json`

### Browser Persistence Gate — BLOCKED / awaiting author gesture
The implementation gate is not yet complete because the required Chrome/Windows directory authorization has not occurred.

Observed:
- `showDirectoryPicker` was unavailable from the worker/control context used by LUNA;
- the OS folder-selection dialog could not be completed on the user's behalf;
- no output directory was authorized;
- the requested temporary directory remains empty;
- `J:\dev\samples` was not used;
- real-browser 3MF write/reopen/byte/SHA verification: UNVERIFIED;
- real-browser `.evidence.json` persistence/reread: UNVERIFIED;
- real-browser fail-closed pre-release behavior: UNVERIFIED.

Required one-time author action:
- in the Windows Chrome large-candidate lab, invoke the output-directory selection UI using an explicit user gesture;
- select:
  `J:\My Drive\codex\2026-09-05\files-pasted-by-the-user-katachi\browser-retention-gate-20260907`
- do not select `J:\dev\samples`.

After the author selects the directory, LUNA should continue the same Browser Persistence Gate using the current uncommitted implementation. Do not broaden scope.

Required gate after selection:
1. persist bounded test 3MF bytes to the authorized directory;
2. close the writable handle;
3. reacquire/reopen the persisted file;
4. verify exact byte length and SHA-256;
5. persist and reread `.evidence.json`;
6. verify mismatch/error path remains fail-closed before `RELEASE_CANDIDATE`;
7. if all PASS, return SOL handoff for commit/push authorization.

Do not run A2 Full Sparse Support merely to satisfy this browser plumbing gate. If the bounded fixture cannot prove the integrated pre-release path, stop and report why before any A2 rerun.

Do not commit/push the current local implementation until the real-browser persistence gate is PASS, unless SOL explicitly changes this gate.

## Performance v1 — PASS / CLOSED
Accepted commit:
`a3c3dbdb76dc609cabded13e21ad9fbbd2c0bd29`

Accepted execution-only optimization:
- exact Rabbit capped unsigned-distance query `min(exactDistance, cap)`;
- Rabbit signed SDF remains sign authority;
- fail-closed one-Lipschitz forbidden certification preserved;
- P0 copyable/localStorage COMPLETE evidence retention preserved.

Full A2:
- pre-performance: ~`43m36s`
- v0: `2,232,690.1 ms` (~37m13s)
- accepted v1: `528,025.4 ms` (~8m48s)
- v0 -> v1 improvement: `76.35%`
- Rabbit audit: `40,846.3 ms`
- capped Rabbit unsigned: `8,492.8 ms / 17,736,590 calls`
- cap returns: `17,612,211`

Exact A2 semantic facts retained:
- targets: `4,561 / 4,561`
- route candidates / audits: `102,193 / 90,921`
- accepted / unsupported: `654 / 3,907`
- vertical / offset-bend: `466 / 188`
- BODY / Rabbit rejects: `3,257 / 1,502`
- graph nodes / edges: `2,150 / 1,496`
- accepted BODY / Rabbit collision: `0 / 0`
- geometry / diagnostics / Support / export fingerprints: exact parity
- bounded semantic digest: exact parity
- Signed Volume: AVAILABLE
- validator / release / placement parity: PASS

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

Artifact-retention closure does not itself authorize G/H/J. The author must explicitly resume the equal-condition comparison lane after this infrastructure gate is accepted.

## HOLD / DO NOT CHANGE
- G/H/J execution until author explicitly resumes
- Performance v2 until separately scoped
- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only removable Support baseline
- Support settings: overhang `45 deg`, shaft `1.6 mm`, neck `0.6 mm`, removal gap `0.35 mm`, Rabbit clearance `0 mm`
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
- Performance v1 at `a3c3dbdb...` with full exact parity at `528,025.4 ms`
- P0 COMPLETE evidence-retention capability
- J workspace cutover at exact accepted checkpoint
- samples authority cutover to `J:\dev\samples`
- Retention v0 focused tests / TypeScript / build / diff-check for the current local implementation

### ACTIVE / USER ACTION BLOCKED
- Chrome/Windows browser persistence gate for Candidate Artifact Retention / Checkpoint v0

### AUTHOR / PHYSICAL NOT YET PROVEN
- A2 physical print completion
- authored SKIN Support alone as sufficient support
- full physical profile frozen for A/G/H/J

### HOLD
- body-anchored removable Support hypothesis
- G/H/J execution / physical comparison / winner
- Performance v2
