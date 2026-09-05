# SKIN Golden / Rebuild Roadmap v2

Date: 2026-09-05

## Purpose

This document supersedes `skin-golden-rebuild-roadmap-v1.md` as the **current
execution roadmap** while preserving v1 as historical context.

The major changes since v1 are:

- Physical Print #1 and Print #2 now provide real structural evidence.
- FIELD vNext has crossed the old 256-preview limit, proven Legacy semantic
  parity, and been integrated as a controlled Golden preview backend.
- The current creative priority is no longer generic Bouquet completion alone;
  it is the **Usagi External Reference Host → V6 Motif Aggregate** path.
- The imported rabbit is a Reference Host / Shape Intent, not final printed
  BODY.
- External Host must eventually provide optional signed-volume/field capability
  for SKIN queries, while failing closed on invalid/open geometry.
- Permanent Artwork integration for the Usagi Motif Aggregate should be reviewed
  with Astra only after the author can inspect `Host OFF` with V6 motifs.
- Removable Support remains downstream of artwork structure.

Primary related documents:

- `docs/plans/skin-external-stl-host-contract-v0.md`
- `docs/plans/skin-external-stl-host-phase2-usagi-observation.md`
- `docs/plans/hana-skin-art-fab-relationship-v0.md`
- `docs/plans/skin-to-fab-roadmap-v0.md`
- `docs/plans/skin-authoring-restoration-v0.md`

---

## 1. Current system split

SKIN continues to use two coordinated tracks:

```text
Golden
= current artwork-making + diagnostics + print pipeline
= allowed to make the current physical work

Rebuild
= future Artifact / Graph / Network architecture
= OBSERVE / SHADOW / COMPARE before production authority
```

A third distinction is now necessary:

```text
Reference Host
= imported shape intent / query domain
= may be hidden and non-printable

Permanent Artwork
= Motifs / Permanent Connections / Web / Internal
= remains in the finished object

Removable Support
= temporary fabrication aid
= removed after printing
```

Do not collapse these three layers.

---

## 2. Current production objective — Usagi Motif Aggregate

The first active External Host artwork candidate is:

```text
rabbit_230223.stl
SHA-256:
c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8
```

The rabbit is not automatically the final BODY.

It is:

```text
Host / Shape Intent
Authoring Reference
Diagnostic Reference Volume
```

The intended artistic sequence is:

```text
rabbit Reference Host
↓
existing V6 Flower / Motif placement
↓
Motif Aggregate follows the rabbit's bodily character
↓
Host OFF
↓
judge silhouette / holes / interior visibility / bodily presence
↓
Astra studies permanent artwork integration
↓
author chooses a structural proposal
↓
SKIN translates / validates Permanent Artwork
↓
SKIN adds only residual Removable Support
↓
print candidate
```

The target is not a rabbit solid decorated with flowers. The stronger target is
that the rabbit remains legible after the reference solid is visually/printably
removed because the Motif field itself carries its bodily character.

---

## 3. Usagi Reference Host contract

### 3.1 Source and instance stay separate

Authority:

```text
Original STL bytes
+ source identity / hash
+ unit / coordinate interpretation
+ Host Instance transform
```

Derived:

```text
parsed triangles
normals
bounds
BVH
welded diagnostics
closest-point cache
optional repaired Host mesh
optional signed-field acceleration/cache
```

No bounding-box auto-normalization is allowed.

### 3.2 Rabbit reference scale

The author's current Bambu Studio reference use is:

```text
uniform 2000% = 20.0x
```

This is a **Host Instance scale**.

It must not be baked into:

- source bytes
- source hash
- raw source bounds
- unit interpretation

Surface query, field query, Motif placement and diagnostics must all use the
same effective instance transform.

### 3.3 Host OFF

`Host OFF` means:

```text
rabbit solid not visible / not included in final printable BODY
```

It does **not** mean:

```text
rabbit reference source/query capability deleted
```

A hidden Host may remain available for placement, side classification,
containment, diagnosis and support reasoning.

---

## 4. External Host phase order

Current execution order:

```text
Phase 0  External Host repo inventory                 DONE
Phase 1  Source / Host / Transform runtime contract   DONE
Phase 2  STL import + real Usagi characterization     DONE
Phase 3  Surface Query                                DONE in runtime core
Phase 4  Host Field / Signed Volume capability        NEXT
Phase 5  Existing V6 Motif Placement Adapter
Phase 6  Persistence / Save-Reopen
Phase 7  Usagi Browser / Author Gate
         Host ON → V6 → Host OFF
         STOP for Astra structural review
```

Do not jump from Phase 3 directly into Permanent Web/Internal design.

---

## 5. Real Usagi evidence

Phase 2 real-file evidence:

- binary STL
- source triangles: `204312`
- valid triangles: `204305`
- degenerate triangles: `7`
- connected components: `1`
- boundary edges: `21`
- non-manifold edges: `0`
- orientation-inconsistency edges: `0`
- topology diagnostic: `OPEN`
- `closestSurface`: 7/7 PASS
- `raycast`: 6/6 PASS
- Windows Chrome console: 0 errors / 0 warnings

Normal evidence was overwhelmingly low-dihedral with a small number of sharp
local transitions; geometric normals remain the truth while a smoother derived
placement normal is deferred until V6 placement evidence requires it.

Current capability interpretation:

```text
Surface Host:       AVAILABLE
Signed Volume Host: UNAVAILABLE
```

Do not guess the sign merely because the mesh is almost closed.

---

## 6. Phase 4 — Host Field / Signed Volume

External STL Host must eventually replace the **query role** that metaball Base
currently supplies where appropriate.

Required capabilities when valid:

- closest surface
- surface normal
- inside / outside
- signed distance
- shared instance transform

Recommended model:

```text
signed distance magnitude = closestSurface distance
sign                      = validated inside/outside classification
```

A giant voxel SDF is not required as authoritative data.

Volume capability must be fail-closed:

```text
invalid/open/unproven volume
→ Surface Host remains usable
→ Signed Volume Host unavailable with explicit reason
```

### Repair rule

AUTO REPAIR is forbidden.

```text
Original Source
↓
explicit author-approved repair
↓
Derived Repaired Host Mesh
↓
validation
↓
optional Signed Volume capability
```

Repair never replaces original source identity.

For Usagi, first characterize the 21 boundary edges/loops and propose repair
only if it is local, deterministic and does not materially alter the visible
shape. Applying that repair requires explicit author approval.

---

## 7. Phase 5 — V6 Motif Placement Adapter

The existing V6 system should be adapted rather than rewritten.

The Host adapter needs to supply the placement facts V6 actually requires:

- candidate domain / surface sampling
- closest surface position
- placement normal
- tangent basis
- local scale / anchor information
- clearance against existing Motifs
- optional side/volume classification when Signed Volume Host is available

Important rules:

- authored Motifs remain authoring data
- Host movement must not silently reproject existing Motifs
- no STL-specific duplicate Flower generator
- Host can be hidden independently of Motif data
- Reference Host remains `printable = false`

The V6 adapter is successful when Motifs can define the rabbit's surface/body
character without requiring the rabbit solid as final geometry.

---

## 8. Phase 6 — Persistence / Save-Reopen

Persistence follows proven runtime behavior; it does not lead it.

The intended future project/FKEI content includes conceptually:

```text
Reference Host
- exact original STL bytes or equivalent immutable managed asset
- source SHA-256
- source interpretation
- instance transform
- rabbit reference uniform scale = 20.0
- repair provenance if used
- capability facts
- printable = false

Permanent Artwork
- authored Motifs
- later Permanent Connections / Web / Internal

Removable Support
- separate fabrication layer
```

Parsed mesh/BVH/cache should be regenerated on reopen.

A new FKEI version must remain explicit and non-destructive; old files must not
be silently rewritten.

---

## 9. Phase 7 — Usagi Author Gate

This is the creative gate before permanent structure is invented.

Required author sequence:

```text
Host ON
↓
V6 Motifs visible
↓
inspect density / orientation / silhouette
↓
Host OFF
↓
inspect whether Motif field alone preserves Usagi
```

Judge:

- bodily character
- silhouette
- cavities / openings
- sightlines into the interior
- motif identity
- sparse/dense transitions
- whether the object reads as a porous volume / volume of air

Do not optimize internal structure first.

STOP here before new permanent connection algorithms.

---

## 10. Astra boundary

Astra enters **after** the Host OFF author gate.

Astra's role:

```text
Usagi Reference Host
+ authored Motif Aggregate
+ artistic constraints
↓
propose how the floating Motifs become one Permanent Artwork
while preserving silhouette, openings and interior visibility
```

Astra should reason about:

- Motif-to-Motif permanent connections
- Permanent Web
- only necessary Permanent Internal members
- early entry into stable mutual-support networks
- preserving holes and sightlines

Astra must not be asked to generate temporary printer support as part of this
artwork integration step.

### Astra artifact rule

Do not make FKEI Astra's canonical source if that constrains Astra to current
SKIN capabilities.

Preferred future direction:

```text
Astra Artwork Artifact   ← semantic canonical artifact
        ↓ adapter
SKIN-compatible FKEI     ← derived compatibility output
        ↓
SKIN diagnostics / support / print
```

The Astra artifact should preserve semantic distinctions such as Host, Motif,
Permanent Connection, Web, junction and internal member rather than returning
only an anonymous triangle mesh.

Unsupported/lossy conversion to current SKIN must be explicit.

---

## 11. SKIN boundary after Astra

When Astra proposes Permanent Artwork:

```text
Artwork-structure problem
→ return to Astra / author structural decision

Layer-by-layer fabrication problem
→ solve in SKIN diagnostics / Removable Support
```

Examples that belong upstream/Astra:

- isolated Motif island
- excessively long Permanent span
- poor entry into stable permanent network
- artwork not actually one connected object

Examples that belong to SKIN fabrication:

- temporary plate reach
- transient overhang support
- removable contact
- slicer/orientation-specific temporary aid

Permanent structure and Removable Support remain semantically separate.

---

## 12. Physical print evidence now changes the old support interpretation

The old Stage 8 metrics remain a historical regression checkpoint, not an
eternal target:

```text
Critical 166
Supported 156
Unsupported 10
Support nodes 546
Support edges 390
accepted BODY collision 0
inside-derived 0
```

Physical Print #1 and #2 showed more important structural evidence:

- upper connected Permanent/Internal network survived relatively well
- failures concentrated more strongly in lower/isolated regions
- long thin independent removable supports were unstable
- short near-horizontal permanent members can succeed when they quickly enter a
  stable network
- early transition to mutual support / first stable junction matters more than
  angle alone or simple thickness

Therefore future diagnostics should prioritize evidence such as:

- unsupported span length
- distance to first stable junction
- branching / mutual support
- neighbor support
- junction spacing
- network-entry timing

Do not invalidate Permanent members by angle alone.

Removable Support experiments such as Shared Trunk / Branched Tree and low
bootstrap bracing remain fabrication research informed by this physical
principle, not a template for Permanent Artwork.

---

## 13. FIELD vNext status

FIELD vNext is **closed for the current creative goal**.

Proven:

- uncapped primitive data path beyond 256
- real GPU DataTexture readback
- Browser Gate through 2048 primitives
- Legacy semantic parity at explicit numerical tolerance
- controlled Golden Legacy/vNext preview integration
- Legacy remains available and the switch is display-only

Deferred:

- full 10,450-primitive Case A performance optimization
- Spatial Grid activation

Do not optimize the 10,450 case preemptively. Revisit performance only when the
actual Usagi/V6 artwork needs it and measured performance is inadequate.

---

## 14. Rebuild remains a separate architecture track

Rebuild still follows:

```text
OBSERVE
↓
SHADOW
↓
COMPARE
↓
physical / author gate
↓
EXPERIMENTAL
↓
PROMOTE
```

Rebuild may continue to develop:

- Artifact contracts
- GraphArtifact / Network contracts
- stable identity
- provenance / lineage
- raw / cleaned / simplified separation
- compatibility adapters
- migration inspector

But do not interrupt the Usagi creative path with broad Rebuild migration.

External Host persistence may inform a future FKEI version, but new FKEI schema
work remains a dedicated explicit phase rather than an excuse to migrate the
whole Rebuild architecture now.

---

## 15. Raw / cleaned / simplified / repaired remain separate facts

The same non-destructive principle now applies to imported Hosts as well as
Networks:

```text
Original source
= immutable authored/imported fact

Parsed / derived
= deterministic rebuildable representation

Repaired
= explicit derived repair with provenance

Simplified / edited
= explicit author decision

Realized mesh
= downstream geometry, not automatically the source of truth
```

Never silently overwrite an earlier semantic layer with a downstream result.

---

## 16. Current immediate actions

### Usagi External Host — primary

```text
1. Phase 4 Signed Volume capability / fail-closed validation
2. characterize Usagi boundary loops
3. ask author before any repaired rabbit becomes active
4. Phase 5 V6 Motif Placement Adapter
5. Phase 6 explicit persistence / Save-Reopen
6. Phase 7 Host ON → V6 → Host OFF Author Gate
7. STOP and consult Astra
```

### SKIN print/fabrication — protected downstream

Keep current diagnostics / export / support behavior stable unless the new
artwork supplies evidence requiring change.

### Rebuild — parallel but non-blocking

Continue only shadow/compatibility work that does not block or mutate the active
Usagi artwork path.

### FAB — later

Do not use FAB/G-code variation to compensate for invalid Host, missing
Permanent Artwork connectivity or unstable conventional printing.

---

## Guiding principle

```text
Reference Host gives the artwork a body to remember.
Motifs make that body visible without requiring a solid shell.
Astra proposes how the Motif body becomes one Permanent Artwork.
SKIN proves that artwork physically and adds only temporary fabrication aid.
Rebuild improves the architecture without blocking the work.
FAB comes after ordinary fabrication is understood.
```
