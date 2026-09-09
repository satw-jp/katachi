# Author Observation — SKIN_R Reader Connectivity / Selection Readability

Date: 2026-09-09
Owner: Author / Research SOL
Status: AUTHOR REVIEW — PARTIAL PASS / CONNECTIVITY READABILITY FIX REQUIRED

## Context

This observation records the first Author use-value review of the technically accepted Astra Research Reader v0 checkpoint:

- branch: `agent/skin-r-astra-reader-v0`
- accepted technical checkpoint: `81a5325c39ec27af9bb11bc91d120513f9729990`

The technical Reader implementation remains accepted. This observation is about whether the Author can use the Viewer to map physical observations back to understandable structure identity.

## Author review result

### 1. Physical object ↔ Reader route understanding

**NOT YET SUFFICIENT.**

The Author can see branches and layers, but the overall path reads as visually interrupted. It is difficult to understand which visible branch continues to which other branch through the internal network.

The blocker is not primarily missing metadata. The current visual representation does not make continuity / adjacency legible enough to follow a route through the structure.

This blocks the main Reader use-value question:

> Can a physical branch be followed through the Reader far enough to understand what it connects to?

### 2. Layer distinction

**PASS.**

The Author can distinguish the existing Reader layer classes sufficiently for the present gate.

### 3. Selection readability

**FIX NEEDED.**

When a branch/member is selected, the Author wants the selected branch to become visibly thicker / stronger so it is easy to keep track of while rotating or inspecting the object.

This is a Reader visualization requirement only. It does not authorize geometry radius editing.

### 4. Concrete spatial feedback

**BLOCKED BY ITEM 1.**

The Author cannot yet reliably return detailed branch-level spatial feedback because the route / adjacency is not readable enough.

Do not interpret the absence of detailed feedback as lack of need for Authoring. First make the existing structure readable.

### 5. B_OPEN / B_PARTICIPATING switching

**PASS.**

Candidate switching works.

Interpretation retained for Author review:

- `B_OPEN` = sparse / openness-prioritized Permanent structure: 95-edge OPEN core plus the selected surface attachments for the B track.
- `B_PARTICIPATING` = the same OPEN core with participating-only cross-links restored and more surface participation / attachments.
- They are parallel artwork/structure candidates, not a baseline-versus-upgrade sequence.

The Reader should help compare how added cross-links and surface participation affect depth, openness, continuity, and surface relation from the same camera.

## Required correction direction

The next Reader correction should prioritize **connectivity readability**, not additional metadata or editing tools.

Desired behavior:

1. existing Permanent members read as continuous structure rather than disconnected 1-pixel fragments where possible;
2. selecting a member strongly highlights that member with a visibly thicker overlay;
3. the member's connected junction(s) become obvious;
4. directly connected / adjacent structure can be highlighted without inventing a single causal route where the graph actually branches or cycles;
5. recorded parent / surface target relationships remain distinguishable from Reader-derived adjacency;
6. all provenance semantics remain unchanged.

The Reader must not invent a unique parent/child chain for the internal graph when the historical data only supports graph adjacency.

## Gate after correction

The next Author question is deliberately narrow:

> Select one real B_OPEN member. Can the Author visually keep track of that member, see where it joins the network, and follow enough connected structure to understand what it connects to?

Only after this becomes usable should the Author be asked again for detailed branch-level modification intent.

## Not authorized

This observation does not authorize:

- branch radius editing;
- branch add/delete;
- junction movement;
- generator changes;
- Mocomoco/Torus work;
- Production translation;
- G-code / print changes.
