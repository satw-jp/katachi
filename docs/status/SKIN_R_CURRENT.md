# SKIN_R Current Status

Last verified: 2026-09-09

## Authority
- repo: `satw-jp/katachi`
- lane: SKIN_R / Research-only Astra Reader
- canonical clone: `J:\dev\katachi`
- worktree: `J:\dev\worktrees\skin-r-astra-reader-v0`
- implementation branch: `agent/skin-r-astra-reader-v0`
- accepted Fix 3 technical checkpoint: `d5b8a98432d4c7151558ca7e380f56014394b37d`
- Fix 3 merged main checkpoint: `95f110bd1a7b910e20f39c35a89cee349a54d5c5`
- Fix 3 merge commit: `d41e6a6d55c747e14ac3edd3e2abac896fcf7164`
- accepted Fix 1 checkpoint: `81a5325c39ec27af9bb11bc91d120513f9729990`
- shared samples authority: `J:\dev\samples`
- `C:\dev\samples` is not authority

## Current phase
**Astra Research Reader v0 Fix 3 technical implementation is PASS / CLOSED at `d5b8a984...`.**

**Author use-value review is the only active next gate.**

Fix 3 addressed the bounded readability problem identified by the Author:
- default Permanent network continuity is now shown from shared junction identity before selection;
- junction markers are reduced toward branch-scale display size;
- junction markers can be hidden without removing the Viewer-only continuity connectors;
- selected / DERIVED adjacency / RECORDED parent remain visually distinct;
- selection emphasis is lighter than the previous connectivity pass;
- no Research geometry, radius, generator, D0/D1/D2, Production, C, FKEI, Export, or 3MF semantics changed.

Do not start another Reader fix, Authoring task, generator task, Mocomoco, Torus, or Production translation until the Author has reviewed this checkpoint.

## Fix 3 SOL review judgment
`PASS — Fix 3 technical implementation CLOSED / Author Review pending.`

Reviewed remote checkpoint:
- branch: `agent/skin-r-astra-reader-v0`
- HEAD: `d5b8a98432d4c7151558ca7e380f56014394b37d`
- push: normal push / no force, worker-reported confirmed
- working tree: worker-reported clean

Direct source review confirms:
- continuity connectors are derived from each member's recorded junction identity, not spatial-nearest guesses;
- connector and junction geometry are Viewer-only display geometry;
- source member points / radii / derived junction positions are not mutated;
- junction display radius is bounded from connected member display radii;
- default member display and continuity connectors remain present when the explicit junction-marker layer is hidden;
- selected / adjacent / recorded-parent overlays remain separate and lighter than the previous pass;
- shared-junction adjacency remains `DERIVED` and recorded attachment parent remains `RECORDED`;
- no unique causal generation path is inferred from graph adjacency.

Focused regression coverage confirms in source:
- existing source-driven counts / provenance checks remain;
- adjacency is based on shared junction identity;
- near spatial proximity alone does not create adjacency;
- cross-links do not gain a fabricated recorded parent;
- bounded Viewer display radii do not change source member radius.

## Worker-reported execution evidence
- focused snapshot test: PASS
- study tests: PASS
- typecheck: PASS
- production build: PASS
- `git diff --check`: PASS
- Browser gate: PASS
- working tree: clean

Environment note:
- the normal Node study-test path hit `os.userInfo()` `ENOMEM` in the worker environment;
- the same study tests were executed through an equivalent `tsx` wrapper and reported PASS;
- GitHub has no attached CI status checks for this checkpoint, so command execution remains worker-reported evidence rather than independent CI evidence.

## Browser evidence boundary
Worker Browser review reports:
- B_OPEN default/no-selection continuity visible;
- INTERNAL JUNCTIONS ON/OFF preserves connected reading;
- selected E012 remains readable with lighter emphasis;
- Transparent motifs preserve internal readability;
- B_PARTICIPATING and CROSS-LINKS remain understandable;
- candidate switching clears selection and preserves Viewer-only comparison state.

This is technical Browser evidence. Final visual usefulness remains an Author Gate.

## Retained meaning of the main structure layers
`OPEN CORE`:
- Research classification for the sparse internal backbone;
- 95 core edges spanning 96 source-node identities before surface attachments;
- intended to preserve a minimally connected internal structure while protecting openness / Void / depth;
- not a claim that OPEN is superior to PARTICIPATING.

`INTERNAL JUNCTIONS`:
- graph/node aids used to understand connectivity;
- not separate artwork spheres;
- displayed positions may be Reader-derived;
- normal display size should blend into branch structure rather than dominate it.

`B_PARTICIPATING`:
- the same OPEN core plus participating-only cross-links and greater surface participation;
- neither OPEN nor PARTICIPATING is an automatic upgrade over the other.

## Protected Fix 1 / Reader boundaries
Remain accepted:
- normalized `reader-snapshot.json` runtime boundary;
- deterministic extraction via `tools/extract_astra_reader_snapshot.py`;
- external Astra packages remain Research authority;
- `RECORDED / DERIVED / NOT RECORDED` semantics;
- B_OPEN / B_PARTICIPATING same-camera switching;
- eight Reader layer classes;
- motif Visible / Transparent / Hidden;
- candidate switch clears stale selection;
- Production / C / FKEI / existing Viewer / Export / 3MF semantic diff = 0.

Source-driven counts remain:
- B_OPEN: 262 members / 167 attachments / 96 source junction identities;
- B_PARTICIPATING: 325 members / 212 attachments / 96 source junction identities;
- participating-only cross-link delta: 18.

## Active implementation instruction
**NONE.**

SKIN_R_LUNA is STOPPED after Fix 3 technical closure.

Do not implement yet:
- actual branch radius editing;
- branch add/delete;
- junction movement;
- attachment editing;
- annotations / save / export;
- Astra generator changes;
- Mocomoco / Torus;
- Production translation;
- G-code / printing.

## Next gate — Author Review
Use B_OPEN first with **no selection** and answer:

> Without touching anything, can the Author visually follow enough of the internal network to understand which branches connect, and then use selection only to clarify a local region?

Check:
- default branch continuity is legible through multiple shared nodes;
- paths no longer read as floating independent pieces;
- INTERNAL JUNCTIONS are not visually oversized;
- hiding INTERNAL JUNCTIONS does not break the perceived network;
- selection remains obvious but is not too dark / heavy;
- adjacent context is subordinate to the selected member;
- recorded parent remains distinguishable from derived adjacency;
- motifs can still be Transparent / Hidden;
- B_OPEN / B_PARTICIPATING same-camera comparison still works;
- physical-object region can begin to be mapped to stable Reader identities.

Only after this review should detailed branch-level spatial feedback or minimum Authoring scope be reconsidered.

## Required pointers
- `docs/tasks/SKIN_R_ASTRA_READER_V0.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX1.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX2_CONNECTIVITY_HIGHLIGHT.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX3_DEFAULT_CONTINUITY.md`
- branch evidence: `docs/evidence/SKIN_R_ASTRA_READER_V0_FIX3.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_CONNECTIVITY_2026-09-09.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_DEFAULT_CONTINUITY_2026-09-09.md`
- `docs/notes/ASTRA_SKIN_RESEARCH_ROADMAP_EVALUATION_2026-09-08.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_RESEARCH_ROADMAP_2026-09-08.md`
- `docs/notes/SKIN_FUWAFUWA_NEXT_SHAPE_CANDIDATES_2026-09-08.md`
