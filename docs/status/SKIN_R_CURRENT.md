# SKIN_R Current Status

Last verified: 2026-09-09

## Authority
- repo: `satw-jp/katachi`
- lane: SKIN_R / Research-only Astra Reader
- canonical clone: `J:\dev\katachi`
- worktree: `J:\dev\worktrees\skin-r-astra-reader-v0`
- implementation branch: `agent/skin-r-astra-reader-v0`
- accepted technical checkpoint before connectivity/readability iterations: `81a5325c39ec27af9bb11bc91d120513f9729990`
- original implementation checkpoint: `4dafd6b9421492a1dc939b67835c94209a2d5fc4`
- Fix 1 merge checkpoint: `de99aad746123d21ad21a375607db4eac4ac1c92`
- shared samples authority: `J:\dev\samples`
- `C:\dev\samples` is not authority

## Current phase
**Astra Research Reader v0 remains technically viable, but Author use-value review is still FIX REQUIRED for default network readability.**

The earlier connectivity-highlight direction improved local understanding after interaction, but the Author now reports:
- selected/connected context is useful but visually too heavy / dark;
- the network should already read as connected before touching anything;
- current unselected paths still appear floating / interrupted;
- INTERNAL JUNCTIONS markers are too large and should visually match branch thickness rather than read as separate spheres.

This remains a bounded Research Viewer-readability issue. It does **not** authorize Authoring, generator changes, geometry changes, or Production translation.

## Active task
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX3_DEFAULT_CONTINUITY.md`

Current Author observation authority:
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_DEFAULT_CONTINUITY_2026-09-09.md`

Previous connectivity task / observation remain retained history:
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX2_CONNECTIVITY_HIGHLIGHT.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_CONNECTIVITY_2026-09-09.md`

SKIN_R_LUNA may implement Fix 3 on the existing branch after normally synchronizing latest main. STOP after Fix 3 for SOL / Author review.

## Accepted Fix 1 technical baseline — protected
The following remain accepted and must not regress:
- normalized `reader-snapshot.json` runtime boundary;
- deterministic extraction via `tools/extract_astra_reader_snapshot.py`;
- original Astra packages remain external Research authority;
- `RECORDED / DERIVED / NOT RECORDED` semantics;
- narrow Browser layout keeps non-zero canvas;
- candidate switch clears stale selection;
- B_OPEN / B_PARTICIPATING same-camera switching;
- eight Reader layer classes;
- motif Visible / Transparent / Hidden;
- Production / C / FKEI / existing Viewer / Export / 3MF semantic diff = 0.

Source/provenance identities from Fix 1 remain:
- DUAL package SHA-256: `223B4FD486A57EA2FED6E481271DB2CE8A176EC5E3BD40D2AC2321E52801E58D`
- FOUR package SHA-256: `8FDDBE037ABBBDE2D1CB26EFE9933F078F77F01BAD2BC26DA7426A1562A046A8`
- external `B_host.npz` SHA-256: `83B8FA53BCB26676B7DB3D5E452B1E524FEEA45BB99D04DDE39E30DA640B8233`
- normalized snapshot SHA-256: `D0DA5109E36146DEBD959F26385DE72F6D129EB7F9CDF132D7F4D712AFF61744`

Source-driven count checks remain:
- B_OPEN: 262 members / 167 attachments / 96 source junction identities;
- B_PARTICIPATING: 325 members / 212 attachments / 96 source junction identities;
- participating-only cross-link delta: 18.

## Author review sequence — retained

### Review 1
- layer distinction: PASS;
- B_OPEN / B_PARTICIPATING switching: PASS;
- physical-object ↔ branch-network route understanding: insufficient;
- branch-level concrete feedback blocked by route readability.

### Review 2 / current correction
After local connectivity highlighting became easier to understand:
- selection/context itself is now understandable but too visually strong;
- default/unselected connectivity remains insufficient;
- branches still read as floating/interrupted;
- INTERNAL JUNCTIONS markers are oversized relative to branch structure;
- the Author wants node/junction diameter visually comparable to the connected branch diameter;
- clicking should clarify local context, not be required to create the first readable version of the network.

## Interpretation of OPEN CORE / INTERNAL JUNCTIONS

`OPEN CORE` is retained as a Research classification:
- the sparse internal backbone selected from the earlier graph;
- 95 connected core edges spanning the 96 source-node identities before surface attachments are added;
- intended to preserve a minimally connected internal structure while protecting openness / Void / depth;
- not a claim that OPEN is superior to PARTICIPATING.

`INTERNAL JUNCTIONS` are graph/node aids used to understand branch connectivity:
- they are not separate artwork spheres;
- displayed node positions may be Reader-derived;
- normal node size should visually blend into the connected branch network rather than dominate it.

## Fix 3 required direction
The next bounded correction must prioritize **default continuity**.

Required direction is fully specified in the active task. In summary:
- without selection, the Permanent network must read as connected rather than floating independent paths;
- continuity must be based on shared graph/node identity, not arbitrary nearest-neighbor guesses;
- Viewer-only tube/capsule/end-cap/node-connector treatment is allowed without changing source geometry;
- INTERNAL JUNCTIONS normal display diameter should be comparable to connected branch diameter;
- branches must still read as connected when node markers are hidden;
- selected-member emphasis must be lighter than the previous pass while still obvious;
- adjacent/connected context remains subordinate to selection;
- RECORDED parent/target remains distinct from DERIVED adjacency;
- no unique historical generation route may be invented from graph connectivity.

## Relationship to future Authoring
The roadmap remains:

`physical observation + readable SKIN_R -> geometry identity / intent -> only then scope the minimum Authoring operations actually needed`

Potential future operations remain DEFERRED:
- branch add/delete;
- local radius edit;
- junction movement;
- attachment edit;
- intent annotation.

Fix 3 is **not** an Authoring task.

## Physical Research state relevant to SKIN_R
Continue the current four-candidate physical evaluation in parallel with Reader improvement.

Current direction remains:
- distinguish print-time failure from Support-removal breakage;
- preserve broad sparse branch character;
- allow only bounded hidden-area local thickening when physically justified;
- use Reader to map physical observations back to geometry identity;
- do not require all four candidates to be perfect before closing the current generation-quality phase.

Mocomoco and Torus remain future shape candidates under separate Author direction; neither is activated by Fix 3.

## Protected / do not change
- no Astra generator reimplementation
- no branch generation/editing
- no actual radius editing
- no attachment editing
- no junction movement
- no Save/Export
- no Production translation
- no G-code or print operation
- no C Production modification
- no FKEI schema modification
- no existing FKEI Analysis Viewer modification
- no Mocomoco / Torus implementation

## Next gate — after Fix 3
Use B_OPEN with no initial selection and ask:

> Without touching anything, can the Author follow enough of the internal network to understand which branches connect, and then use selection only to clarify a local region?

Then check:
- default branch continuity is legible through multiple shared nodes;
- INTERNAL JUNCTIONS are not visually oversized;
- hiding INTERNAL JUNCTIONS does not make branches appear detached;
- selected member remains obvious but not excessively heavy;
- adjacent-member context is understandable and subordinate;
- recorded parent remains distinguishable from derived adjacency;
- motifs can still be Transparent/Hidden;
- B_OPEN / B_PARTICIPATING same-camera comparison still works.

Only after this gate should detailed branch-level spatial feedback be requested again.

## Required pointers
- `docs/tasks/SKIN_R_ASTRA_READER_V0.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX1.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX2_CONNECTIVITY_HIGHLIGHT.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX3_DEFAULT_CONTINUITY.md`
- `docs/evidence/SKIN_R_ASTRA_READER_V0_FIX1.md` on accepted branch checkpoint
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_CONNECTIVITY_2026-09-09.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_DEFAULT_CONTINUITY_2026-09-09.md`
- `docs/notes/ASTRA_SKIN_RESEARCH_ROADMAP_EVALUATION_2026-09-08.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_RESEARCH_ROADMAP_2026-09-08.md`
- `docs/notes/SKIN_FUWAFUWA_NEXT_SHAPE_CANDIDATES_2026-09-08.md`
