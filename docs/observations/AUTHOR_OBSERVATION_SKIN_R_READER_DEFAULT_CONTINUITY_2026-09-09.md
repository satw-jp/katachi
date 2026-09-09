# Author Observation — SKIN_R Reader Default Continuity

Date: 2026-09-09
Owner: Author / Research SOL
Status: AUTHOR REVIEW — FIX REQUIRED

## Context

This observation follows the connectivity-highlight pass of Astra Research Reader v0.

The selected-member context is now more understandable, but the default network still does not read as a continuous internal structure without interaction.

## Author review

### 1. Selected highlight

The selected/connected context is useful, but the emphasis is currently too dark / too visually strong.

Desired correction:
- keep selection obvious;
- reduce the contrast / heaviness of selected and connected-context display;
- avoid letting the highlight become the dominant visual object.

### 2. Default connectivity must work without selection

The Author should be able to understand the network before clicking a member.

Current issue:
- routes still appear visually disconnected / floating;
- it is difficult to see which branch joins which branch until interaction adds context.

Desired state:
- the Permanent network reads as one connected spatial structure in the default view;
- branch continuity at shared internal nodes is visually legible;
- clicking should add local emphasis, not create the first understandable version of the network.

### 3. Internal junction / node display

The current INTERNAL JUNCTIONS markers are too large relative to branches.

They are graph/node aids, not separate artwork spheres.

Desired correction:
- normal junction/node display diameter should be visually comparable to the connected branch diameter;
- do not use oversized balls at internal nodes;
- selection may use brightness / halo / bounded emphasis rather than substantially increasing node diameter;
- turning node markers off must not make connected branches look detached.

### 4. OPEN CORE meaning retained

`OPEN CORE` is the sparse internal backbone selected from the earlier internal graph: the 95-edge connected core joining the 96 source-node identities before surface attachments are added.

It exists to preserve a minimally connected internal backbone while protecting openness / Void / depth.

This is a Research classification, not a separate fabrication object and not an automatic claim that OPEN is superior to PARTICIPATING.

## Scope boundary

This observation requests Viewer readability changes only.

It does not authorize:
- branch radius editing;
- branch add/delete;
- junction movement;
- generator changes;
- D0/D1/D2 geometry changes;
- Production changes;
- new shape work.

The next implementation should improve default continuity first, then retain a lighter selection/context treatment on top of that baseline.