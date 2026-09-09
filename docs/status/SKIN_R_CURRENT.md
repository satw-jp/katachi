# SKIN_R Current Status

Last verified: 2026-09-09

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
**Astra Research Reader v0 technical implementation remains PASS / CLOSED at `81a5325c39ec27af9bb11bc91d120513f9729990`, but first Author use-value review is PARTIAL PASS / FIX REQUIRED for connectivity readability.**

Author Review found:
- layer distinction: PASS;
- B_OPEN / B_PARTICIPATING switching: PASS;
- physical-object ↔ branch-network route understanding: NOT YET SUFFICIENT;
- selected branch needs stronger/thicker visual emphasis;
- concrete branch-level spatial feedback remains blocked until route / adjacency is easier to follow.

This is a bounded Viewer-readability issue. It does **not** reopen provenance, source authority, Production semantics, generator design, or Authoring.

## Active task
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX2_CONNECTIVITY_HIGHLIGHT.md`

Author observation authority:
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_CONNECTIVITY_2026-09-09.md`

SKIN_R_LUNA may implement Fix 2 on the existing branch after normally synchronizing latest main. STOP after Fix 2 for SOL / Author review.

## Accepted Fix 1 technical baseline
Fix 1 remains accepted and protected:

- normalized `reader-snapshot.json` runtime boundary;
- deterministic extraction via `tools/extract_astra_reader_snapshot.py`;
- original Astra packages remain external Research authority;
- `RECORDED / DERIVED / NOT RECORDED` semantics corrected;
- narrow Browser layout keeps non-zero canvas;
- candidate switch clears stale selection;
- B_OPEN / B_PARTICIPATING same-camera switching works;
- eight Reader layer classes remain available;
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

## First Author review — 2026-09-09

### Physical object / route readability
The Author reports that the overall branch route appears visually interrupted, making it difficult to understand which branch connects to which branch through the network.

This is now the primary Reader blocker.

### Layer distinction
PASS. Existing layer classes can be distinguished sufficiently.

### Selection readability
The Author wants a selected branch/member to become visibly thicker / stronger so it remains easy to track while inspecting the structure.

This means **display emphasis only**. It does not authorize branch-radius editing.

### Concrete feedback
Still difficult because route continuity is not yet readable enough. Do not scope Authoring from this absence of feedback.

### Candidate comparison
B_OPEN / B_PARTICIPATING switching works.

Interpretation retained:
- `B_OPEN` = openness-prioritized sparse structure using the 95-edge OPEN core plus B-track surface attachments;
- `B_PARTICIPATING` = the same OPEN core with participating-only cross-links and greater surface participation / attachments;
- neither is an automatic upgrade over the other.

## Fix 2 required direction
The next correction must prioritize **connectivity readability** rather than adding more metadata.

Required behavior is defined in the active task, including:
- strong selected-member overlay;
- connected-junction emphasis;
- directly adjacent member context derived from shared junction identity;
- recorded attachment parent shown separately from derived adjacency;
- no invented unique causal route through branching/cyclic graph structure;
- bounded improvement to global Permanent-structure readability;
- same candidate/layer/provenance semantics preserved.

Do not use spatial-nearest guessing as a substitute for graph adjacency when recorded/derived junction identity is available.

## Relationship to future Authoring
The roadmap remains:

`physical observation + readable SKIN_R -> geometry identity / intent -> only then scope the minimum Authoring operations actually needed`

Potential future operations remain DEFERRED:
- branch add/delete;
- local radius edit;
- junction movement;
- attachment edit;
- intent annotation.

Fix 2 is **not** an Authoring task.

## Physical Research state relevant to SKIN_R
Continue current four-candidate physical evaluation in parallel with Reader improvement.

Current direction remains:
- distinguish print-time failure from Support-removal breakage;
- preserve broad sparse branch character;
- allow only bounded hidden-area local thickening when physically justified;
- use Reader to map physical observations back to geometry identity;
- do not require all four candidates to be perfect before closing the current generation-quality phase.

Mocomoco and Torus remain future shape candidates under separate Author direction; neither is activated by Fix 2.

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

## Next gate — after Fix 2
Use B_OPEN and ask:

> Select one real member. Can the Author visually keep track of that member, see where it joins the network, and follow enough connected structure to understand what it connects to?

Then check:
- selected member remains obvious while orbiting;
- connected junction(s) are legible;
- adjacent-member context is understandable;
- recorded parent is distinguishable from derived adjacency;
- motifs can still be made Transparent/Hidden as needed;
- B_OPEN / B_PARTICIPATING same-camera comparison still works.

Only after this gate should detailed branch-level spatial feedback be requested again.

## Required pointers
- `docs/tasks/SKIN_R_ASTRA_READER_V0.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX1.md`
- `docs/tasks/SKIN_R_ASTRA_READER_V0_FIX2_CONNECTIVITY_HIGHLIGHT.md`
- `docs/evidence/SKIN_R_ASTRA_READER_V0_FIX1.md` on accepted branch checkpoint
- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_CONNECTIVITY_2026-09-09.md`
- `docs/notes/ASTRA_SKIN_RESEARCH_ROADMAP_EVALUATION_2026-09-08.md`
- `docs/observations/AUTHOR_OBSERVATION_SKIN_RESEARCH_ROADMAP_2026-09-08.md`
- `docs/notes/SKIN_FUWAFUWA_NEXT_SHAPE_CANDIDATES_2026-09-08.md`
