# SKIN_R — Astra Research Reader v0 Fix 2 / Connectivity Highlight

Date: 2026-09-09
Owner: Research SOL
Implementation worker: SKIN_R_LUNA
Status: READY TO START

## Goal

Fix the Author-review blocker in Astra Research Reader v0:

> The Author can distinguish layers and switch B_OPEN / B_PARTICIPATING, but the internal route reads as visually interrupted, so it is still difficult to understand which branch connects to which branch.

This task is **Reader visualization only**. It must improve connectivity / selection readability without editing Research geometry or inventing historical causality.

Author observation authority:

- `docs/observations/AUTHOR_OBSERVATION_SKIN_R_READER_CONNECTIVITY_2026-09-09.md`

Accepted technical baseline:

- branch: `agent/skin-r-astra-reader-v0`
- accepted checkpoint: `81a5325c39ec27af9bb11bc91d120513f9729990`

## Startup / synchronization

Use the existing worktree:

`J:\dev\worktrees\skin-r-astra-reader-v0`

and the existing branch:

`agent/skin-r-astra-reader-v0`

Before implementation:

1. read latest `docs/TEAM_PROTOCOL_CORE.md` and `docs/status/SKIN_R_CURRENT.md`;
2. fetch `origin`;
3. normally merge latest `origin/main` into the existing branch;
4. do not reset, rebase, force-push, or rewrite accepted checkpoint history;
5. if merge conflicts affect Reader code / task authority and cannot be resolved without interpretation, STOP and report;
6. report pre-change branch / HEAD / main merge SHA / working-tree state.

## Author evidence to preserve

Current Author Review says:

- physical-object ↔ route understanding: NOT YET SUFFICIENT;
- layer distinction: PASS;
- branch selection exists but needs strong visual emphasis;
- concrete branch-level feedback is blocked until connectivity is easier to read;
- B_OPEN / B_PARTICIPATING switching: PASS.

Do not reopen already-passed layer/candidate behavior unless required by the bounded fix.

## Fix 2 required behavior

### A. Selected-member emphasis

When a member is selected:

- render a clearly visible thicker / stronger overlay for the selected member;
- the highlight must remain readable while orbiting the camera;
- do not modify the stored/member radius or Research snapshot geometry;
- do not rely on WebGL `LineBasicMaterial.linewidth` if it is not portable/reliable; use a bounded overlay representation that is visually robust in the target browser.

The overlay may use tube/capsule/cylinder-like display geometry, but it is Viewer-only and must not become geometry authority.

### B. Junction emphasis

For a selected internal member with recorded ancestry / Reader-derived junction mapping:

- visibly mark the member's connected junction(s);
- make the selected member ↔ junction relationship easy to perceive;
- provenance remains `DERIVED` where the Reader reconstructed junction identity/position.

For attachment members, preserve the recorded `parent_member_id` and recorded target surface component relationship.

### C. Local connectivity context

Provide enough context to follow where the selected branch joins the network.

At minimum, highlight:

- selected member;
- its connected junction(s), where available;
- directly adjacent members that share those junction(s), as a **Reader-derived adjacency context**;
- for a surface attachment, its recorded parent member and target relationship where available.

Do **not** claim that all adjacent branches are parent/child or that there is one unique causal route.

The old Integrated graph contains branching/cycles; adjacency is not the same thing as historical generation ancestry.

If the UI names this context, use neutral wording such as:

- `CONNECTED CONTEXT`
- `ADJACENT MEMBERS`
- `RECORDED PARENT`

Do not label a derived network walk as `generation path` unless an explicit historical path exists in source data.

### D. Global structure readability

Improve the default Permanent-structure drawing enough that branch continuity is easier to see before selection.

The Author's complaint is that the whole route visually appears interrupted.

Bounded options include:

- a slightly more volumetric/tube-like display for Permanent structure;
- endpoint/junction markers;
- better depth/readability treatment.

Do not redesign the whole Viewer. Keep the eight existing layer semantics and same-camera comparison.

### E. Selection state

Candidate switching must continue to clear stale selection.

Layer toggles / motif modes must continue to work.

If selection becomes hidden because its layer is turned off, fail safely: do not show a misleading highlight detached from the visible layer.

## Provenance rule — unchanged

Fix 2 must not weaken the accepted provenance boundary:

- `RECORDED` = explicitly in Astra source;
- `DERIVED` = reproducible Reader calculation/classification;
- `NOT RECORDED` = absent.

Specific requirements:

- shared-junction adjacency computed by Reader = `DERIVED`;
- recorded attachment parent = `RECORDED`;
- recorded surface-component target = `RECORDED`;
- do not invent why an internal branch was historically added;
- do not infer a unique causal chain from graph connectivity alone.

## Explicitly out of scope

Do not implement:

- actual branch radius editing;
- branch add/delete;
- junction movement;
- attachment editing;
- annotations/save/export;
- Astra generator changes;
- D0/D1/D2 geometry changes;
- Mocomoco or Torus;
- C / AB / SKIN Production changes;
- FKEI Viewer changes;
- G-code / printing.

This fix is not the first Authoring task.

## Tests / evidence

Add focused regression coverage for at least:

- selected member resolves its expected derived connected junctions;
- directly adjacent members are derived from shared junction identity rather than guessed spatial proximity;
- a known attachment exposes its recorded parent separately from derived adjacency;
- B_PARTICIPATING cross-link context does not get mislabeled as a causal parent/child chain;
- candidate switching clears selection/context;
- existing source-driven counts / provenance tests continue to pass.

Run:

- Reader snapshot/focused tests;
- existing study tests;
- typecheck;
- production build.

Browser evidence must show from one camera/view:

1. B_OPEN with one real internal member selected;
2. selected member visibly thicker/stronger;
3. connected junction(s) and local adjacent context visible;
4. an attachment selection showing recorded parent separately from derived adjacency/context;
5. B_PARTICIPATING candidate switch with cross-link layer still understandable;
6. motif Transparent mode still usable.

## Protected diff

Production / C / FKEI / existing Viewer / Export / 3MF semantic files must remain unchanged.

Do not broaden into shared renderer refactoring merely to implement this highlight.

## Done / STOP

Fix 2 is ready for SOL/Author review when the bounded code/tests/evidence above are pushed on the same branch.

Return:

- branch / new HEAD;
- merged main checkpoint;
- exact changed files;
- test/build result;
- Browser evidence summary;
- how selected/adjacent/recorded-parent states are visually distinguished;
- protected diff result;
- working-tree state.

Then STOP.

Do not proceed to Authoring automatically.
