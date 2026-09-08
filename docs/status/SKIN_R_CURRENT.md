# SKIN_R Current Status

Last verified: 2026-09-08

## Authority
- repo: `satw-jp/katachi`
- lane: SKIN_R / Research-only Astra Reader
- canonical clone: `J:\dev\katachi`
- worktree: `J:\dev\worktrees\skin-r-astra-reader-v0`
- implementation branch: `agent/skin-r-astra-reader-v0`
- reviewed implementation checkpoint: `4dafd6b9421492a1dc939b67835c94209a2d5fc4`
- implementation base: `999b4eeb8e96c75dfe07cb9533a579399cb7e9f5`
- shared samples authority: `J:\dev\samples`
- `C:\dev\samples` is not authority

## Current phase
**Astra Research Reader v0 is FIX REQUIRED after first SOL review.**

The bounded read-only architecture is directionally accepted: B_OPEN / B_PARTICIPATING loading, 8 layer classes, motif visibility modes, same-camera candidate switching, junction/member selection, source hash/provenance manifest, isolated Research route, and protected Production diff were all present in the reviewed checkpoint.

Do not expand into authoring or generator work.

## Active task
Primary task:
- `docs/tasks/SKIN_R_ASTRA_READER_V0.md`

SOL fix task:
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX1.md`

Worker must complete Fix 1 on the same branch and STOP for another SOL / Author review.

## First SOL review checkpoint
Reviewed:
- branch: `agent/skin-r-astra-reader-v0`
- commit: `4dafd6b9421492a1dc939b67835c94209a2d5fc4`
- commit message: `feat(research): add Astra reader v0`

Source/diff review:
- checkpoint is exactly 1 commit ahead of base `999b4eeb...`;
- current main had advanced after that base; at review the branch was diverged, 1 ahead / 6 behind current main;
- changed scope is isolated to the Astra Reader route/assets/docs plus one Vite multi-page entry;
- no Production / C / FKEI / existing Viewer / Export / 3MF file changes were found in the implementation diff;
- GitHub has no attached commit status checks; test/build results are worker-reported evidence.

Worker-reported checks:
- Snapshot test PASS
- Study tests 19 PASS
- Typecheck PASS
- Build PASS
- `dist/astra-reader.html` PASS
- working tree clean

## What is already useful
The implementation already establishes the intended Reader concept:

1. `HOST`
2. `INTERNAL JUNCTIONS / CANDIDATES`
3. `OPEN CORE`
4. `CROSS-LINKS`
5. `SURFACE ATTACHMENTS`
6. `SURFACE MOTIFS`
7. `FABRICATION D1`
8. `REMOVABLE SUPPORT`

`SURFACE MOTIFS` supports Visible / Transparent / Hidden.

The normalized adapter concept exists as `AstraResearchSnapshot`, and the source manifest records package and asset SHA-256 values.

Known count checks are source-driven in the implementation:
- B_OPEN: 262 members / 167 attachments / 96 source junction identities;
- B_PARTICIPATING: 325 members / 212 attachments / 96 source junction identities;
- participating-only cross-link delta: 18.

These counts are not yet the reason for acceptance; provenance correctness remains the key gate.

## Fix 1 blockers

### 1. Branch/main synchronization
The branch was created from `999b4eeb...`, while main later gained the SKIN_R CURRENT/task authority and other unrelated documentation. At first review it was 6 commits behind main.

Fix 1 must merge current `origin/main` normally into the branch. Do not reset, rebase, force-push, or rewrite the reviewed implementation commit. Preserve the full main task as authority if task-file conflict occurs.

### 2. Provenance labels are not yet trustworthy enough
Mandatory semantics remain:
- `RECORDED` = explicitly present in authoritative Astra source;
- `DERIVED` = reproducibly calculated/interpreted by the Reader;
- `NOT RECORDED` = absent from source.

Known code-review issues in `snapshot.ts`:
- `baseMember().addedStage` synthesizes labels such as `OPEN core / inherited botanical core` and `surface growth` but marks them `RECORDED`;
- participating-only cross-links can therefore be mislabeled as recorded `surface growth`;
- junction `connectedMembers` is constructed by filtering recorded ancestry, so the list itself is Reader-derived unless an explicit source list is used;
- D2 `supportMember().addedReason` hard-codes `external fabrication support` and marks it `RECORDED` although the adapter does not read an exact source reason/purpose field for that value;
- all other synthesized role/stage labels must be audited similarly.

The Reader must prefer `DERIVED` or `NOT RECORDED` over a convincing historical story.

### 3. Import boundary is too source-dump-heavy
The primary task says large Research packages stay in Drive/external authority and should not be duplicated into GitHub.

The reviewed branch currently commits large source-shaped runtime JSONs, including approximately:
- `B_host.json` 3.43 MB
- `B_surface_components.json` 2.22 MB
- `B_OPEN_geometry.json` 1.93 MB
- `B_PARTICIPATING_geometry.json` 2.02 MB
- plus full D1/D2/attachment source dumps

Fix 1 must replace this with a minimal deterministic Reader asset/snapshot containing only fields needed by v0 rendering/selection, while retaining original package/input hashes and an extraction/adapter path. Artwork geometry values must not be regenerated or visually simplified just to shrink the data.

### 4. Browser 3D evidence remains unverified
The first in-app browser smoke used a 315 px viewport. The fixed 360 px side panel reduced the canvas to zero width, so same-camera 3D comparison could not be honestly marked PROVEN.

Fix 1 may make only the bounded layout correction needed to keep a non-zero 3D canvas at narrow width, then capture technical Browser evidence. No broad UI redesign.

Final visual/value judgment remains Author Gate.

## Physical Research state relevant to SKIN_R
B_OPEN has progressed through physical printing and careful Support removal. Successfully printed regions largely remained together after removal according to Author observation.

Current fabrication direction remains:
- local hidden-area branch thickening may be used where needed for durability;
- broad branch thickening remains disallowed;
- distinguish print-time lower-region failure from Support-removal breakage;
- observe the current USAGI lower-region correction first;
- if useful, translate the principle to B_PARTICIPATING rather than copying coordinates;
- evaluate all four physical candidates and then close this generation-quality study as one bounded phase.

## Relationship to future authoring
The Reader still comes before branch editing.

`Astra data -> readable SKIN_R -> physical observation -> only then scope the authoring operations actually needed`

Branch add/delete, local radius edits, junction movement, and attachment editing remain DEFERRED.

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

Production / C / FKEI / existing Viewer / Export / 3MF semantic diff must remain zero.

## Next gate
1. SKIN_R_LUNA reads `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX1.md`.
2. Merge current `origin/main` into the existing branch without history rewriting.
3. Correct provenance semantics and add focused regression coverage.
4. Restore the minimal Reader import boundary.
5. Complete technical Browser 3D evidence.
6. Push normally and return new HEAD / tests / asset hashes / protected diff / working-tree state.
7. STOP for Research SOL / Author review.

The acceptance question remains:

> Can the author select one real B_OPEN branch and get an accurate, provenance-qualified explanation of what it is without the Reader inventing missing history?
