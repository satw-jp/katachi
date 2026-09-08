# SKIN_R Current Status

Last verified: 2026-09-08

## Authority
- repo: `satw-jp/katachi`
- lane: SKIN_R / Research-only Astra Reader
- canonical clone: `J:\dev\katachi`
- worktree: `J:\dev\worktrees\skin-r-astra-reader-v0`
- implementation branch: `agent/skin-r-astra-reader-v0`
- accepted technical checkpoint: `81a5325c39ec27af9bb11bc91d120513f9729990`
- original implementation checkpoint: `4dafd6b9421492a1dc939b67835c94209a2d5fc4`
- Fix 1 merge checkpoint: `de99aad746123d21ad21a375607db4eac4ac1c92`
- shared samples authority: `J:\dev\samples`
- `C:\dev\samples` is not authority

## Current phase
**Astra Research Reader v0 technical implementation is PASS / CLOSED at `81a5325c39ec27af9bb11bc91d120513f9729990`.**

**Author visual/use-value review is still pending.**

The Reader is now technically ready for the intended next gate: use the completed B_OPEN physical work together with the Reader and confirm that the Author can identify a real branch / junction / motif / attachment and receive a trustworthy provenance-qualified explanation.

Do not expand into authoring or generator work from this technical PASS.

## Fix 1 review judgment
`PASS — Fix 1 CLOSED / Author Review pending.`

Reviewed remote branch / head:
- branch: `agent/skin-r-astra-reader-v0`
- HEAD: `81a5325c39ec27af9bb11bc91d120513f9729990`
- working tree: worker-reported clean
- remote push: worker-reported confirmed

Fix 1 closed the four SOL blockers:

1. **Main synchronization**
   - the branch normally merged main checkpoint `886ec500c27552c30fbb027fdeb5cdb3a6cca571`;
   - the reviewed implementation commit remains in history;
   - no reset / rebase / force-push history rewrite was used.

2. **Provenance semantics**
   - OPEN core stage classification: `DERIVED`;
   - participating-only cross-link stage classification: `DERIVED`;
   - junction positions and connected-member lists: `DERIVED`;
   - source parent / attachment target fields remain `RECORDED` when explicitly present;
   - D1 stage classification is `DERIVED`, while recorded D1 purpose remains `RECORDED`;
   - D2 role/stage classification is `DERIVED` and unrecorded reasons remain `NOT RECORDED`;
   - unsupported historical explanations are no longer promoted to `RECORDED`.

3. **Import boundary**
   - source-shaped runtime dumps were removed;
   - runtime imports a normalized `reader-snapshot.json` only;
   - deterministic extraction is recorded in `tools/extract_astra_reader_snapshot.py`;
   - original Astra packages remain external Research authority;
   - package/input/snapshot hashes are retained in the source manifest and Fix 1 evidence.

4. **Browser 3D gate**
   - narrow layout keeps a non-zero canvas by overlaying the bounded panel;
   - worker technical Browser evidence reports B_OPEN and B_PARTICIPATING rendering, same-camera candidate switching, participating cross-links, Transparent motifs, and real member-selection metadata.

## Technical evidence boundary
Direct SOL source/diff review confirms:
- current v0/Fix1 diff remains isolated to the Astra Reader route/assets/docs, extraction tool, and one Vite multi-page entry;
- no Production / C / FKEI / existing Viewer / Export / 3MF semantic files changed;
- normalized adapter architecture is present;
- focused provenance regression assertions are present.

Worker-reported execution evidence:
- snapshot test: PASS
- study tests: 19 PASS
- typecheck: PASS
- production build: PASS
- technical Browser gate: PASS
- working tree: clean

GitHub has no attached CI status checks for this checkpoint, so command execution remains worker-reported evidence.

## Source / provenance evidence
Fix 1 evidence records:
- DUAL package SHA-256: `223B4FD486A57EA2FED6E481271DB2CE8A176EC5E3BD40D2AC2321E52801E58D`
- FOUR package SHA-256: `8FDDBE037ABBBDE2D1CB26EFE9933F078F77F01BAD2BC26DA7426A1562A046A8`
- external `B_host.npz` SHA-256: `83B8FA53BCB26676B7DB3D5E452B1E524FEEA45BB99D04DDE39E30DA640B8233`
- normalized snapshot SHA-256: `D0DA5109E36146DEBD959F26385DE72F6D129EB7F9CDF132D7F4D712AFF61744`

The Reader still exposes the eight intended classes:
1. `HOST`
2. `INTERNAL JUNCTIONS / CANDIDATES`
3. `OPEN CORE`
4. `CROSS-LINKS`
5. `SURFACE ATTACHMENTS`
6. `SURFACE MOTIFS`
7. `FABRICATION D1`
8. `REMOVABLE SUPPORT`

`SURFACE MOTIFS` supports Visible / Transparent / Hidden.

Source-driven count checks remain:
- B_OPEN: 262 members / 167 attachments / 96 source junction identities;
- B_PARTICIPATING: 325 members / 212 attachments / 96 source junction identities;
- participating-only cross-link delta: 18.

## Current main relationship
After the worker merged `886ec500...`, main later received two Research-roadmap documentation commits and is currently ahead on that docs-only line.

At SOL review, branch and current main are therefore diverged only because those later roadmap notes were created after the worker's required merge. This does **not** block the bounded technical acceptance because the reviewed Reader implementation diff remains isolated and those later main changes do not alter the Reader task/code authority.

Any future implementation on this branch must first synchronize current main normally again. Do not reset / rebase / force-push the accepted checkpoint.

## Physical Research state relevant to SKIN_R
B_OPEN has progressed through physical printing and careful Support removal. The current roadmap deliberately overlaps physical evaluation with Reader use rather than waiting for all four physical candidates to finish first.

Current direction:
- continue physical evaluation of B_OPEN / B_PARTICIPATING / A_OPEN / A_PARTICIPATING;
- distinguish print-time failure from Support-removal breakage;
- preserve broad sparse branch character;
- allow only bounded hidden-area local thickening when justified;
- use the Reader to map physical observations back to real geometry identity as soon as Author review begins;
- record which editing operations are actually missing rather than pre-building an Authoring suite.

## Relationship to future Authoring
The adopted sequence remains:

`physical observation + readable SKIN_R -> geometry identity / intent -> only then scope the minimum Authoring operations actually needed`

Possible future operations such as branch add/delete, local radius edits, junction movement, attachment editing, or intent annotation remain **DEFERRED** until Reader use demonstrates concrete need.

Mocomoco and Torus remain future shape candidates under their separate Author direction; neither is activated by this Reader PASS.

## Active implementation instruction
**NONE.**

Fix 1 is closed. Do not auto-start Authoring, generator work, Mocomoco, Torus, Production translation, or another Reader expansion.

## Protected / do not change
- no Astra generator reimplementation
- no branch generation/editing
- no radius/attachment editing
- no junction movement
- no Save/Export
- no Production translation
- no G-code or print operation
- no C Production modification
- no FKEI schema modification
- no existing FKEI Analysis Viewer modification

## Next gate — Author Review
Use the accepted Reader with the physical B_OPEN object and answer:

> Can the Author identify a real branch / junction / motif / attachment, map it to a stable Reader identity, and understand its recorded / derived / not-recorded context well enough to return a concrete spatial judgment?

Useful Author-review checks:
- real object region and Reader identity correspond;
- B_OPEN / B_PARTICIPATING same-view comparison is understandable;
- hiding / transparency of motifs exposes the intended attachments / internal structure;
- provenance badges are understandable and trusted;
- one or more real physical observations can be expressed as a specific target + intent without inventing history;
- missing operations are recorded, but not implemented yet.

After Author Review, Research SOL decides whether Reader v0 is fully CLOSED for use and what, if any, minimum Authoring capability should be scoped later.

## Required pointers
- `docs/tasks/SKIN_R_ASTRA_READER_V0.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX1.md`
- branch evidence at accepted checkpoint: `docs/evidence/SKIN_R_ASTRA_READER_V0_FIX1.md`
- `docs/notes/ASTRA_SKIN_RESEARCH_ROADMAP_EVALUATION_2026-09-08.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_RESEARCH_ROADMAP_2026-09-08.md`
- `docs/notes/SKIN_FUWAFUWA_NEXT_SHAPE_CANDIDATES_2026-09-08.md`
