# SKIN_R — Astra Research Reader v0 Fix 3 / Default Continuity

Date: 2026-09-09
Owner: Research SOL
Implementation worker: SKIN_R_LUNA
Status: READY TO START

## Goal

Make the Astra Research Reader's Permanent network understandable **before selection**.

The previous connectivity-highlight pass improved local context after clicking, but the Author still sees the unselected structure as visually interrupted / floating. Selection highlighting is also now too heavy.

Author observation authority:
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_DEFAULT_CONTINUITY_2026-09-09.md`

Continue on the existing SKIN_R branch/worktree. This remains a Viewer-only readability fix.

## Startup

Use:
- repo: `satw-jp/katachi`
- branch: `agent/skin-r-astra-reader-v0`
- worktree: `J:\dev\worktrees\skin-r-astra-reader-v0`

Before implementation:
1. read latest `docs/TEAM_PROTOCOL_CORE.md` and `docs/status/SKIN_R_CURRENT.md`;
2. fetch `origin`;
3. normally merge latest `origin/main` into the existing branch;
4. do not reset / rebase / force-push / rewrite accepted history;
5. report pre-change HEAD, merged-main checkpoint, and clean/dirty state.

## Required behavior

### A. Default Permanent-network continuity

Without hover or selection, OPEN CORE / CROSS-LINKS / SURFACE ATTACHMENTS must read as connected spatial structure rather than independent floating paths.

Use source/derived graph identity, not nearest-neighbor guessing, to determine visual continuity.

Allowed Viewer-only techniques include:
- tube/capsule-like rendering instead of visually discontinuous thin line segments;
- bounded end caps / node connectors at shared graph nodes;
- depth/readability treatment that makes branches remain visually continuous while orbiting.

Do not mutate source geometry, stored radii, normalized snapshot authority, or fabrication geometry.

If a display-only connector is added between branch endpoints and a derived shared node, it must be explicitly Viewer-only and must be based on the same graph/node identity used by the Reader. Do not bridge unrelated spatially close members.

### B. Internal junction/node size

INTERNAL JUNCTIONS are graph/node aids, not artwork spheres.

Normal node-marker diameter should be visually comparable to the connected branch diameter.

Requirements:
- remove oversized junction balls;
- normal junction marker should blend into the branch network;
- selection may change brightness / halo / outline, but should not substantially inflate node diameter;
- branches must still read as connected when the `INTERNAL JUNCTIONS` layer is hidden.

### C. Lighter selection/context emphasis

Selection/context remains useful but is too strong.

Correct it so that:
- selected member is still unmistakable;
- selected overlay is not excessively dark, thick, or dominant;
- connected/adjacent context is visually subordinate to the selected member;
- the rest of the network remains readable rather than collapsing into background noise;
- selection emphasis remains readable while orbiting.

Do not change actual member radius.

### D. Selection supplements default readability

Clicking a member should reveal additional local context, not create the first readable version of connectivity.

Keep the distinction:
- selected member;
- DERIVED adjacent members/shared-node context;
- RECORDED attachment parent/target when present.

Do not infer or label a unique generation path where only graph adjacency exists.

### E. Existing behavior must remain

Preserve:
- B_OPEN / B_PARTICIPATING same-camera switching;
- candidate switching clears stale selection;
- 8 layer semantics;
- motif Visible / Transparent / Hidden;
- RECORDED / DERIVED / NOT RECORDED semantics;
- normalized Reader snapshot boundary;
- source-driven counts;
- narrow-layout non-zero canvas.

## Terminology / interpretation

Do not change data semantics.

For implementation understanding:
- `OPEN CORE` = sparse internal backbone: 95-edge connected core over the 96 source-node identities before surface attachments;
- `INTERNAL JUNCTIONS` = Reader graph/node identities used to understand branch connectivity; their displayed positions may be DERIVED.

A minor explanatory label such as `OPEN CORE · internal backbone` or `INTERNAL JUNCTIONS · nodes` is allowed only if it does not broaden UI work. It is not required for acceptance.

## Out of scope

Do not implement:
- actual radius editing;
- branch add/delete;
- junction movement;
- attachment editing;
- intent annotation/save/export;
- Astra generator changes;
- D0/D1/D2 geometry changes;
- C / AB / SKIN Production changes;
- FKEI Viewer changes;
- G-code / print operations;
- Mocomoco / Torus.

## Tests / evidence

Add/update focused coverage so that Viewer continuity is based on graph identity rather than arbitrary spatial proximity.

At minimum verify:
- shared-node members resolve to the same display-node identity;
- unrelated close members are not connected merely by distance;
- junction/node marker sizing derives from bounded Viewer display logic and does not change source member radius;
- selection/context data remains separate from recorded parent metadata;
- candidate switch still clears selection/context;
- existing provenance/count tests continue to pass.

Run:
- focused Reader tests;
- study tests;
- typecheck;
- production build.

Browser evidence must show, from one ordinary view:
1. B_OPEN **with no selection**, where the internal Permanent network can be followed through multiple shared nodes;
2. INTERNAL JUNCTIONS on, with node size visually comparable to branches;
3. INTERNAL JUNCTIONS off, with branch continuity still legible;
4. one selected member with lighter emphasis than the previous pass;
5. adjacent/connected context visible but subordinate;
6. motif Transparent mode;
7. B_PARTICIPATING switch at the same camera with cross-links still understandable.

## Acceptance question

> Without touching anything, can the Author follow enough of the internal network to understand which branches connect, and then use selection only to clarify a local region?

## Protected diff

Production / C / FKEI / existing Viewer / Export / 3MF semantic files must remain unchanged.

Do not broaden into shared-renderer refactoring unless strictly necessary; prefer bounded code inside the Research Reader.

## STOP

Commit and normal-push the bounded Fix 3 on the same branch, then return:
- new HEAD;
- merged main checkpoint;
- exact changed files;
- test/build results;
- Browser evidence summary;
- description of default continuity rendering;
- node sizing rule;
- selected/context visual distinction;
- protected diff result;
- working-tree state.

Then STOP. Do not proceed into Authoring.