# HANA / SKIN / ART / ASTRA / FAB Relationship v1

Date: 2026-09-05

This document supersedes `hana-skin-art-fab-relationship-v0.md` for the current
Usagi / Motif Aggregate production direction while preserving v0 as historical
context.

## 1. Responsibility split

```text
HANA
= how form is drawn
= gesture / stroke / authored motion

SKIN
= how authored form is represented, diagnosed and made physically viable
= Reference Host / Motif / structure / print diagnostics / Removable Support

ART
= how the work is understood, visually articulated and judged

ASTRA
= how a selected Motif Aggregate may become one Permanent Artwork
  without erasing silhouette, openings or interior visibility

FAB
= how material is deliberately deposited after ordinary fabrication is stable
```

These are collaborating systems, not one merged data model.

---

## 2. Current Usagi production loop

```text
rabbit.stl
↓
SKIN Reference Host / Shape Intent
↓
SKIN V6 Motif placement
↓
Host OFF Author Gate
↓
ART / author judgment of silhouette, holes, motif field and bodily character
↓
ASTRA permanent-artwork proposal
↓
author selects / rejects / edits the proposal
↓
SKIN translates and diagnoses accepted Permanent Artwork
↓
SKIN adds residual Removable Support
↓
conventional print
↓
FAB only after stable baseline exists
```

Astra enters after the Motif Aggregate is visible enough to judge. External Host
work must not invent Astra's future structure in advance.

---

## 3. Reference Host is not Permanent Artwork

For imported shape intent such as Usagi:

```text
Reference Host
- source identity
- units / coordinate interpretation
- instance transform
- surface query
- optional signed-volume query
- diagnostic reference
- printable = false
```

`Host OFF` means the reference solid is hidden / excluded from printable BODY.
It does not remove the Host's query role.

Reference Host ownership stays in SKIN project semantics; it is not absorbed
into Astra's generated structure.

---

## 4. HANA → SKIN

HANA remains the independent 3D Drawing Instrument:

```text
Raw Gesture
↓
Control Stroke
↓
Smooth Centerline
↓
Material Representation
↓
Field / SDF
↓
Surface Mesh
```

The preferred relationship is shared HANA core + adapter, not copied drawing
logic. HANA may later provide portable Motif definitions or structural control
strokes to SKIN while retaining gesture authority.

---

## 5. SKIN's responsibility

SKIN owns the current project facts needed to author and fabricate the work:

- Reference Host / Base intent
- Motif placement
- Surface / Artwork structure
- accepted Permanent Connections / Web / Internal
- diagnostics
- Removable Support
- print/export evidence

Key distinction:

```text
Permanent structure = artwork
Removable support   = fabrication aid
```

SKIN should not use temporary support as an opaque authoring force that reshapes
the artwork.

---

## 6. ART's responsibility

ART remains an active conceptual partner rather than a render mode.

Relevant principles continue to include:

- HAND REMAINS
- SUPPORT BECOMES FORM
- MUTUAL SUPPORT
- PERMANENT / CHANGING
- motif remains visible
- delicate rather than uniformly heavy structure
- irregularity comes from authored or physical cause, not arbitrary randomness
- holes, interior visibility and light/shadow are positive form

For Usagi, the Author Gate specifically asks whether a Motif field can preserve
the rabbit's bodily presence after the solid Host is removed from view.

---

## 7. Astra's responsibility

Astra is neither the slicer nor the Removable Support generator.

Astra receives a selected artistic state such as:

```text
Reference Host
+ authored Motif Aggregate
+ artistic constraints
```

and proposes how the floating Motifs may become one **Permanent Artwork**.

Astra may reason about:

- Motif-to-Motif permanent connections
- junctions
- Permanent Web
- only necessary Permanent Internal members
- early entry into mutually supporting permanent networks
- preserving silhouette
- preserving holes
- preserving sightlines into the interior

Astra should not solve ordinary layer-by-layer print support in this step.

If the accepted artwork is structurally disconnected, that is an Astra/author
artwork problem. If the accepted connected artwork merely needs temporary help
during deposition, that is a SKIN fabrication problem.

---

## 8. Astra canonical artifact vs FKEI

Do not make FKEI Astra's only canonical representation merely because SKIN can
read it.

That would risk limiting Astra to what current SKIN/FKEI can already express.

Preferred direction:

```text
Astra Artwork Artifact
= semantic canonical artifact

contains concepts such as:
- Reference Host identity/reference
- Motif identities and placements
- Permanent Connections
- Permanent Web
- junctions
- optional Permanent Internal
- intent / constraints
- provenance
- derived preview/print mesh

        ↓ SKIN adapter

SKIN-compatible FKEI
= derived compatibility output
```

The adapter must report unsupported or lossy semantics rather than silently
flattening them.

A plain unioned STL is also insufficient as the only canonical output because it
loses which geometry is Motif, connection, web, junction or Host-derived intent.

---

## 9. Data ownership

```text
HANA owns
- Raw Gesture
- Control Stroke
- drawing history

SKIN owns
- Reference Host interpretation/instance
- authored Motif placement
- accepted project structure
- diagnostics / support / print evidence

ART owns
- conceptual studies
- visual-language principles
- author-facing evaluation criteria

ASTRA owns
- its semantic artwork proposal/artifact
- generation/proposal provenance
- structural alternatives until accepted into SKIN project state

FAB owns
- fabrication variation intent
- toolpath/G-code intervention
- physical deposition evidence
```

Sharing data does not transfer authorship or source-of-truth responsibility
silently.

---

## 10. Promotion / translation rule

Astra proposal is not automatically production geometry.

```text
Astra proposal
↓
author review
↓
accepted semantic structure
↓
SKIN adapter / translation
↓
SKIN diagnostics
↓
print candidate
```

Similarly, ART principles do not mutate production geometry opaquely and FAB
does not repair invalid artwork structure.

---

## 11. Current boundary rules

1. Do not duplicate HANA drawing logic inside SKIN.
2. Do not make ART an opaque production runtime dependency.
3. Do not make FKEI Astra's canonical ceiling.
4. Do not reduce Astra output to anonymous mesh if semantic structure can be retained.
5. Do not ask Astra to invent Removable Support during permanent-artwork integration.
6. Do not use SKIN Removable Support to hide a disconnected/invalid Permanent Artwork.
7. Do not use FAB to compensate for missing artwork structure.
8. Keep Reference Host query capability independent from whether Host geometry is visible/printable.
9. Keep original imported sources immutable; repair is explicit and derived.
10. Prefer explicit adapters/contracts over hidden cross-system coupling.

---

## Guiding principle

```text
HANA preserves the hand.
SKIN preserves and tests the authored/project facts.
ART decides what matters visually and conceptually.
Astra proposes how the selected form becomes one permanent artwork.
SKIN separates that permanent artwork from temporary fabrication aid.
FAB changes material deposition only after the ordinary print is understood.
```
