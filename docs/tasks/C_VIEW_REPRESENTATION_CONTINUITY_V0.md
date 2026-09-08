# C — View Representation Continuity v0

Date: 2026-09-08
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: QUEUED / DESIGN ONLY

## Trigger

Author observation after the current viewport/FIELD work:

- BEADS and FIELD are visible as distinct author-facing representations;
- the previously familiar intermediate surface representation no longer reads as part of the primary display flow;
- current code still contains the progressive preview-mesh path (`startPreviewMeshBuild()` + `chooseProgressivePreviewResolutions()`), but the top-level View Layer IA now treats MESH as one flat layer among GRAPH / DIAGNOSTICS / PRINT PREVIEW;
- current MESH availability also mixes later-stage/display mesh sources (for example current Stage 6 / opening-map candidates), so MESH no longer clearly means “the current authoring form rendered as a lightweight surface preview.”

This task restores the representation continuum without changing geometry semantics.

## Product model

The primary author-facing representation continuum is:

`BEADS  ->  MESH  ->  FIELD`

These three answer the same question — “what does the current authored form look like?” — at increasing visual continuity / computation cost.

### BEADS

Purpose:
- fastest representation;
- exposes placement / primitive structure;
- should remain immediately interactive;
- no surface reconstruction required.

Semantic role:
- current Host / Patch authoring state presentation;
- not a degraded FIELD result and not a fallback label for MESH.

### MESH

Purpose:
- the missing middle representation;
- continuous surface reading with much lower interaction cost than FIELD;
- should be suitable for ordinary rotate / pan / zoom and form inspection.

Semantic role:
- **authoring preview mesh**, generated from the same current authoring Host / Patch state that feeds FIELD;
- display-only / session-only;
- not Production Stage 6 authority;
- not Opening Map mesh authority;
- not Export / 3MF authority.

Implementation direction:
- reuse the existing preview-mesh worker path and `chooseProgressivePreviewResolutions()`;
- selecting MESH with no current preview should start the existing progressive preview build;
- first usable coarse mesh should appear as soon as possible;
- then refine to the configured final preview resolution;
- camera movement must never rebuild the mesh;
- Host / Patch authoring changes invalidate the current preview generation;
- a generation-current cached preview can be reused immediately on re-entry;
- stale preview geometry must never be silently labeled current.

### FIELD

Purpose:
- semantic FIELD / SDF surface view;
- highest visual fidelity of the three primary representations;
- keep the accepted progressive FIELD interaction behavior.

Semantic role:
- same authoritative current FIELD source / primitive semantics as already locked;
- no change to FIELD math, ordering, payload semantics, or backend preference.

## UI information architecture

The current flat list should be visually split into two groups.

### FORM / REPRESENTATION

Primary, always-visible row:

`BEADS   MESH   FIELD`

Order is locked to represent increasing continuity/cost.

Recommended compact cues:
- BEADS — `Fast`
- MESH — `Surface`
- FIELD — `Exact` or `Field`

Do not overload the labels with implementation terms. The important thing is that the author sees MESH as the middle state, not as a later fabrication stage.

Each representation may show a tiny state glyph:
- `●` current
- `△` building/stale
- `○` unavailable

MESH unavailable is not a dead-end. If a preview can be built from current authoring state, selecting MESH should initiate the preview build rather than requiring the author to discover a separate hidden route.

### INSPECT / OUTPUT

Separate secondary group:

`GRAPH   DIAGNOSTICS   PRINT PREVIEW`

These are not quality levels of the same form and must not visually compete with BEADS / MESH / FIELD as peers.

## MESH source policy

Do not keep using a generic “best available mesh” as the conceptual definition of the primary MESH representation.

Primary MESH must prefer a dedicated current authoring preview identity:

1. current `previewMeshCache` matching current authoring generation/fingerprint;
2. if absent, start current preview build;
3. coarse result becomes visible first;
4. final preview replaces coarse when ready.

Stage 6 body mesh / Opening Map / diagnostic meshes may remain available to their own downstream views, but they must not silently redefine what the primary author-facing MESH button means.

If a future reuse path proves exact source/fingerprint equivalence, it may reuse bytes/buffers internally, but the UI semantic remains “current authoring preview mesh.”

## Interaction contract

### BEADS -> MESH
- one action;
- if cache current: immediate surface preview;
- if not current: start coarse preview generation;
- no Production / Support / Export work.

### MESH -> FIELD
- one action;
- FIELD uses accepted progressive FIELD presentation;
- MESH worker may be cancelled or allowed to finish only if resource policy remains bounded; stale result must not overwrite active FIELD presentation.

### FIELD -> MESH
- immediately hide FIELD presentation;
- show current cached MESH if available;
- otherwise start/display MESH coarse-preview path;
- never require Ghost/Solid or another unrelated UI toggle.

### MESH -> BEADS
- immediate;
- no rebuild;
- preview worker may be cancelled if it exists only for the departed MESH view.

### Camera interaction
- BEADS and MESH should remain ordinary inexpensive camera views;
- camera-only changes must not trigger preview mesh rebuild, FIELD payload rebuild, Production work, or export work.

## Availability / truthfulness

BEADS:
- available when current host/patch presentation exists.

MESH:
- `current` when preview fingerprint/generation matches authoring state;
- `building`/partial while coarse/final preview is being generated;
- `stale` only if retained for explicit visual comparison; stale must be labeled and must not masquerade as current;
- `unavailable` only when current source cannot produce a preview or worker capability fails.

FIELD:
- preserve existing current/unavailable semantics and progressive status.

Do not use Stage 6 completion as a prerequisite for the authoring MESH representation.

## Existing code to reuse

Prefer reuse rather than new pipeline:
- `startPreviewMeshBuild()`
- `installPreviewMesh(...)`
- `previewMeshCache`
- `previewMeshGeneration`
- `chooseProgressivePreviewResolutions(...)`
- existing preview mesh worker/protocol
- existing View Layer controls and status glyph system

The task should primarily be IA + routing + source-policy cleanup.

## Protected scope

Do not change:
- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support / `supportSource`;
- Output Scale;
- FIELD SDF math / smooth-min order / primitive semantics / payload semantics;
- FKEI / Export / 3MF semantics;
- compute endpoint/configuration;
- Stage 6 geometry authority;
- Opening Map measurement semantics;
- External STL Host;
- Usagi;
- durability algorithm;
- Outside->Outside Support;
- new geometry/research algorithms.

## Browser gate when explicitly started

Use a current C-compatible authored sample.

Verify:
1. primary UI reads left-to-right `BEADS -> MESH -> FIELD`;
2. GRAPH / DIAGNOSTICS / PRINT PREVIEW are visually secondary;
3. BEADS -> MESH produces a recognizable coarse surface without Stage 6 prerequisite;
4. MESH progressively refines to final preview;
5. MESH remains responsive during rotate/pan/zoom;
6. camera movement does not regenerate MESH;
7. FIELD -> MESH immediately removes FIELD pixels and shows/builds the MESH preview;
8. MESH -> BEADS is immediate;
9. BEADS -> FIELD and FIELD -> BEADS accepted behavior remains intact;
10. authoring change invalidates/rebuilds MESH truthfully;
11. no Stage 6 / Production / Support / Export callback is triggered by representation switching alone;
12. no new console exception;
13. current Production parity remains exact.

## Done when

The author can read and use the display system as a clear continuum:

`BEADS (structure / fastest) -> MESH (surface / intermediate) -> FIELD (semantic / highest fidelity)`

without needing to know which downstream diagnostic or fabrication mesh happens to exist.

## Scheduling

This is QUEUED / DESIGN ONLY.

Do not start it automatically. Current author priority remains:
1. finish active Astra work;
2. durability audit when explicitly started;
3. UI work remains observation-driven unless the author explicitly promotes this representation-continuity task.
