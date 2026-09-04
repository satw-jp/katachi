# HANA / SKIN / ART / FAB Relationship v0

Date: 2026-09-04

## Purpose

This document records the intended relationship among HANA, SKIN, ART, and FAB.

The goal is not to collapse them into one application or one data model. Each system should keep a clear responsibility and authoritative data, while exchanging portable data and design principles where useful.

This is a conceptual / architectural direction only. It does not authorize a runtime rewrite, schema migration, or production Graph migration by itself.

Related plans:

- `docs/plans/skin-golden-rebuild-roadmap-v1.md`
- `docs/plans/skin-authoring-restoration-v0.md`
- `docs/plans/skin-to-fab-roadmap-v0.md`

---

## 1. Overall relationship

```text
                         ART
              Concept / Visual Language
                  ↕               ↕
                  ↕               ↕
        HANA  ←────────────→  SKIN
   Draw / Gesture             Form / Structure
        │                         │
        │    Authoring Data       │
        └──────────→──────────────┘
                                  ↓
                                 FAB
                         Material Deposition
```

Short interpretation:

```text
HANA = how the form is drawn
SKIN = how the form stands
ART  = how the work is understood and visually articulated
FAB  = how the material is laid down
```

The arrows are intentionally not all one-way. HANA, SKIN, and ART should be able to influence one another without becoming the same subsystem.

---

## 2. HANA — drawing and gesture

HANA remains an independent **3D Drawing Instrument**.

Its core data hierarchy remains:

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

The important authored information includes actual hand behavior such as:

- speed
- tremor
- pauses
- hesitation
- direction change
- unevenness

The objective is not to erase these properties through smoothing or to replace them with synthetic random “naturalness”.

HANA is not flower-specific. It should remain capable of producing strokes, motifs, flower-like forms, graph-like structures, and other author-driven forms.

---

## 3. HANA ↔ SKIN

A primary use of HANA inside the SKIN ecosystem is expected to be drawing SKIN motifs and related authored geometry.

The preferred direction is **shared HANA core + adapter**, not a copied second implementation.

```text
HANA Core
├─ HANA Standalone UI
└─ SKIN HANA Adapter / Embedded Mode
```

### Near-term / Golden LUNA

Do not destabilize Golden LUNA to embed HANA deeply.

If the current artwork needs a hand-drawn motif, start with a loose boundary:

```text
HANA
↓
portable motif / stroke export
↓
SKIN import
↓
Surface Pattern / Motif Definition
```

Golden should consume the result without changing its production architecture unless the artwork genuinely requires it.

### Future / Rebuild LUNA

A deeper integration belongs to Rebuild LUNA:

```text
SKIN
[Draw Motif]
↓
HANA Drawing Core
↓
Raw Gesture
↓
Control Stroke
↓
Portable Motif Definition
↓
SKIN Surface Pattern
```

The same principle may later support graph authoring or structural control curves.

The intention is that improvements to HANA drawing behavior can benefit SKIN without creating a divergent “SKIN-only HANA” codebase.

---

## 4. SKIN — form, structure, and physical viability

SKIN is responsible for making authored forms physically viable without erasing their irregularity.

Current and future SKIN responsibilities include:

- Base / authored form
- Surface Pattern / Motif
- Field
- Surface / Artwork Graph
- Internal Graph
- Permanent Reinforcement
- DryWeb / Spider Network
- Mesh
- Diagnostics
- Removable Print Support
- Print Preview
- Artifact Export

The key distinction remains:

```text
Permanent structure = artwork
Removable support   = fabrication aid
```

The current development split remains:

```text
Golden LUNA
= production authoring + print path for the current artwork

Golden Rebuild LUNA
= next-generation Artifact / Graph / Network architecture
```

Golden should finish the current artwork and physical Print Gate.
Rebuild should evolve the future Graph / Network system through OBSERVE → SHADOW → COMPARE → EXPERIMENTAL → PROMOTE.

---

## 5. ART — concept and visual language

ART is not merely a renderer mode or promotional graphics layer.

It is the place where the work’s visual language, conceptual emphasis, temporal behavior, and presentation principles are studied.

Current useful directions include ideas such as:

- HAND REMAINS
- SUPPORT BECOMES FORM
- MUTUAL SUPPORT
- PERMANENT / CHANGING

Useful visual / conceptual principles include:

- keep traces of the hand
- do not erase the motif
- show the internal structure where meaningful
- keep lines delicate rather than uniformly heavy
- allow density to breathe
- let light and shadow create temporal change
- do not add arbitrary randomness as a substitute for authored irregularity
- treat support and structure as potentially meaningful form rather than something to hide automatically

These principles can feed back into HANA and SKIN design decisions.

ART should therefore be treated as an active conceptual partner, not a downstream screenshot generator.

---

## 6. HANA / SKIN → ART

ART may use actual authoring, structural, and fabrication evidence as source material for visual studies.

Potential HANA inputs:

- gesture speed
- stroke hesitation
- pressure or input intensity where available
- direction change
- tremor
- stroke history

Potential SKIN inputs:

- graph topology
- node / edge density
- junctions
- reinforcement locations
- structural roles
- support-required regions
- unresolved regions
- provenance
- current / stale / partial state

Potential FAB inputs:

- sag
- thickness fluctuation
- deposition rhythm
- material trace
- print success / failure observations

The goal is not decorative data visualization for its own sake.

The stronger direction is:

> express how the work was actually drawn, supported, transformed, and fabricated.

---

## 7. ART → HANA / SKIN

The exchange is bidirectional.

A visual principle discovered in ART may become an authoring or structural research question in HANA / SKIN.

Examples:

```text
ART:
a sparse / dense transition is visually meaningful
↓
SKIN:
test whether graph density can be authored or structurally derived in that way
```

```text
ART:
strokes appearing and remaining one by one preserve the sense of hand
↓
HANA:
retain and expose gesture / stroke history more explicitly
```

The important boundary is that ART does not directly mutate production geometry as an opaque runtime dependency.

ART should communicate **principles, studies, references, and explicit portable data**, after which HANA / SKIN decide how or whether to adopt them.

---

## 8. Graph → Shape and HANA relationship

Future Rebuild LUNA may introduce a dedicated Control / Deformation Graph that can influence Base shape non-destructively.

Do not overload every existing Graph with this responsibility.

Conceptual direction:

```text
Original Base
+
Control / Deformation Graph
↓
Shape Influence
↓
Derived Base
↓
Field
↓
Mesh
```

This is potentially a strong connection point with HANA:

```text
HANA Gesture / Stroke
↓
Control Graph
↓
SKIN Shape Influence
```

Structural Network layers should remain semantically distinct.

Expected default behavior:

- Control / Deformation Graph: may affect shape
- Surface / Artwork Graph: may affect shape only through explicit design
- Internal Graph: optional influence only through an explicit modifier
- Reinforcement Graph: does not normally reshape the authored object
- DryWeb Graph: does not normally reshape the authored object
- Removable Support Graph: must not reshape artwork geometry

---

## 9. FAB — material deposition

FAB is downstream of stable SKIN geometry and conventional print understanding.

Its role is to control material deposition behavior intentionally rather than compensate for invalid artwork structure.

Examples of future controlled channels include:

- feed
- extrusion amount
- local flow
- timing / dwell
- pacing
- sag
- thickness fluctuation

The existing rule remains:

```text
First make it printable.
Then make the artwork support itself.
Then make ordinary printing repeatable.
Then deliberately disturb the material process.
```

FAB evidence can later return to ART and SKIN as physical feedback.

---

## 10. Data ownership / authoritative sources

Do not create one giant authoritative document that owns every system.

Each subsystem keeps responsibility for its own authored facts.

```text
HANA
- Raw Gesture
- Control Stroke
- drawing history

SKIN
- Motif / placement
- Graph / Network
- Permanent structure
- Mesh / derived geometry
- Diagnostics
- Print / Support evidence

ART
- Concept studies
- Visual studies
- presentation / visual-language principles
- references and interpretation

FAB
- fabrication parameters
- toolpath / G-code variation intent
- physical fabrication evidence
```

Data can be shared, but ownership should remain explicit.

A receiving system should consume a portable contract or reference rather than silently taking ownership of another system’s source data.

---

## 11. Integration rules

1. **Do not duplicate HANA.**
   Share core drawing logic and use adapters / embedded modes where needed.

2. **Do not make ART a production runtime dependency.**
   Share principles and portable evidence bidirectionally.

3. **Do not use FAB to solve structural artwork defects.**
   SKIN structure must remain valid without expressive G-code variation.

4. **Do not make Removable Support an authoring force.**
   Temporary support must not reshape artwork geometry.

5. **Do not rewrite Golden LUNA for future integration.**
   Deep HANA integration, editable Graph architecture, and Graph → Shape belong primarily to Rebuild LUNA.

6. **Keep the current physical Print Gate.**
   Future Network architecture must not drive Golden production geometry before parity and physical evidence support adoption.

7. **Prefer explicit adapters and contracts over hidden cross-system coupling.**

---

## 12. Example future production loop

```text
HANA
Draw a flower / stroke
↓
Gesture + Control Stroke retained
↓
SKIN
Convert to Motif Definition
↓
Place on Surface
↓
Build / edit structural Graph
↓
Permanent Reinforcement / DryWeb
↓
Optional Control Graph influences shape
↓
Mesh / Diagnostics
↓
Residual Removable Support
↓
Print Preview / Export
↓
FAB
Controlled material deposition variation
↓
Physical Object
↓
ART
Study gesture / graph / structure / shadow / material trace
↓
Feed useful principles back to HANA / SKIN
```

The long-term environment is therefore not a one-way “model → print” pipeline.

It is a loop:

```text
Draw
↓
Structure
↓
Materialize
↓
Observe
↓
Feed the result back into drawing and structure
```

---

## Guiding principle

HANA, SKIN, ART, and FAB should become a connected creative ecosystem without losing their individual responsibilities.

The desired relationship is:

> share data without erasing ownership, share ideas without forcing runtime coupling, and let physical and visual evidence flow back into the next act of drawing and structure-making.
