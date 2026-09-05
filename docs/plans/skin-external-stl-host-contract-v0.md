# SKIN External STL Host Contract v0

Date: 2026-09-05

This document defines the current External STL Host boundary for a triangle
mesh used as SKIN **Reference Host / Shape Intent**. The Host is a pose,
silhouette, surface-placement and diagnostic reference. It is not automatically
a final BODY and it must not become printable artwork merely because it is
visible or queryable.

The first real artwork candidate is `rabbit_230223.stl` (Usagi).

## 1. Core role

```text
Reference Host
- source identity
- source interpretation
- instance transform
- surface query
- optional signed-volume query
- diagnostic reference
- printable = false

Permanent Artwork
- Motifs
- Permanent Connections
- Permanent Web
- Permanent Internal

Removable Support
- separate fabrication layer
```

`Host OFF` means that the rabbit solid is hidden and excluded from final
printable BODY output. It does **not** delete the Host reference or disable its
query capability. A hidden Reference Host may still be used for placement,
classification, containment and print diagnostics.

## 2. Authoritative and derived data

`ImportedHostSource` retains the exact original STL bytes, their SHA-256,
byte length, filename metadata, STL format classification, explicit source
interpretation and import-policy version. The hash identifies only the original
bytes; filename, unit interpretation and instance scale do not change it.

`ImportedHostInstance` refers to a source and carries project placement:
translation, rotation and uniform scale. Source interpretation correction and
instance pose are separate transforms.

Authoritative facts are conceptually:

```text
Original STL bytes
+ source identity
+ unit / coordinate interpretation
+ instance transform
```

Derived and rebuildable data includes:

- parsed triangle positions
- geometric normals
- bounds
- BVH nodes
- welded/indexed diagnostic meshes
- topology diagnostics
- closest-point caches
- optional repaired mesh
- optional signed-field acceleration/cache
- GPU resources

Derived geometry must never replace the original source identity.

## 3. Units and transforms

STL does not reliably encode physical units. Runtime Host activation therefore
requires an explicit `mmPerSourceUnit` interpretation. An unresolved unit
interpretation must never silently mean `1 STL unit = 1 mm`.

The source interpretation also records up-axis, handedness and import-policy
version. No bounding-box auto-normalization is allowed.

The current author reference for Usagi is the Bambu Studio use at uniform
`2000% = 20.0x`. This is an **instance scale** and must not be baked into:

- source STL bytes
- source SHA-256
- raw source bounds
- `mmPerSourceUnit`

The same effective Host Instance transform must be shared by all Host-facing
operations:

- visual preview
- `closestSurface`
- `raycast`
- future `insideOutside`
- future `signedDistance`
- future Motif placement
- future diagnostics
- future export-space reference logic

## 4. Surface Host contract

`closestSurface(point)` is the canonical surface projection query. It returns
at least:

- closest position
- geometric triangle normal
- triangle index
- barycentric coordinates
- distance

It works without a watertight-volume assumption.

`raycast(ray)` is an auxiliary query for picking, directional probing and
diagnostics. Raycast does not replace closest-point placement semantics.

The current implementation uses a Host-local deterministic triangle BVH. The
existing Support Paint BVH remains separate because it has a different
worker/front-face lifecycle and clipping contract.

## 5. Signed Volume Host is an optional capability

The metaball Base historically supplied both surface and field/inside queries.
External STL Host must eventually be able to provide equivalent query capability
when the source geometry is trustworthy enough, but signed-volume capability is
**not** mandatory for every imported STL.

Capability model:

```text
Surface Host
AVAILABLE / UNAVAILABLE

Signed Volume Host
AVAILABLE / UNAVAILABLE + reason
```

When Signed Volume Host is available, the convention is:

```text
outside  > 0
surface ~= 0
inside   < 0
```

A future exact mesh-derived implementation should conceptually use:

```text
unsigned distance = closestSurface distance
sign              = validated inside / outside classification
```

A huge voxel SDF must not become authoritative project data merely because a
field query is required.

## 6. Fail-closed volume validation

Signed volume may be enabled only after explicit geometry preflight. Relevant
checks include:

- valid / degenerate triangles
- boundary edges / boundary loops
- manifoldness
- connected components
- orientation consistency
- self-intersection evidence where practical

Do not infer a trusted inside/outside result from an invalid/open Host.

If volume validity is not established:

```text
Surface Host:       AVAILABLE
Signed Volume Host: UNAVAILABLE
```

and signed queries must fail closed rather than guess.

The real Usagi Phase 2 observation is currently:

- source: `rabbit_230223.stl`
- SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- triangles: `204312`
- degenerate: `7`
- connected components: `1`
- boundary edges: `21`
- non-manifold edges: `0`
- orientation-inconsistency edges: `0`
- topology classification: `OPEN`

Therefore, until an explicit reviewed repair/validation step succeeds:

```text
Usagi Surface Host:       AVAILABLE
Usagi Signed Volume Host: UNAVAILABLE
```

## 7. Repair policy

**AUTO REPAIR IS FORBIDDEN.**

Original source bytes are immutable. If repair is required, the architecture is:

```text
Original Source
↓ parse
Parsed Original Mesh
↓ explicit author-approved repair
Derived Repaired Host Mesh
↓ validation
optional Signed Volume Host
```

A repaired mesh keeps provenance back to the original source hash and records a
separate repair policy/version, parameters and derived fingerprint. It must not
replace the original source identity.

## 8. Normal policy

`geometricNormal` remains geometric truth. A future smoother
`placementNormal` may be added as derived data if real motif placement needs it;
it must not overwrite the geometric normal.

Usagi Phase 2 showed overwhelmingly low adjacent-face dihedral angles with a
small number of sharp local transitions. Final placement-normal policy remains a
later V6/authoring decision rather than an import-time rewrite.

## 9. Motif rule

Host pose may change before authored Motifs exist. Once Motifs have been
authored, changing the Host instance must not silently move or reproject them.
Motifs are authored project data, not a query cache.

A future explicit operation may move Host and attached Motifs together, but
silent attachment is not part of v0.

## 10. Persistence direction

The reviewed persistence direction is to embed the exact original STL bytes in
a deliberate future project/FKEI version together with:

- source SHA-256
- byte length
- display filename metadata
- unit interpretation
- coordinate interpretation
- import-policy version
- Host instance transform, including the Usagi reference scale `20.0`
- surface/signed-volume capability facts and repair provenance where applicable

Parsed mesh, BVH and cached field data remain derived and should be rebuilt on
restore.

Current FKEI remains unchanged until the dedicated persistence phase.

## 11. Updated execution order

```text
Phase 0  repo inventory                               DONE
Phase 1  Source / Host / Transform contract           DONE
Phase 2  STL import + real Usagi validation           DONE
Phase 3  Surface Query                                DONE in runtime core
Phase 4  Host Field / Signed Volume capability        NEXT
Phase 5  Existing V6 Motif Placement Adapter
Phase 6  Persistence / Save-Reopen
Phase 7  Usagi Author Gate: Host ON → V6 → Host OFF
         STOP and consult Astra before inventing new permanent structure
```

Phase numbers describe the current production order even though some Phase 3
surface-query capability was implemented earlier in the runtime core.

## 12. Astra boundary

External Host work must not pre-invent the permanent structure that Astra will
later study.

After the Usagi Host + V6 Motif aggregate is visible with Host OFF:

```text
Usagi Reference Host
+ authored V6 Motifs
↓
Astra proposal
↓ author selection
Permanent Artwork structure
↓
SKIN translation / diagnostics
↓
Removable Support
```

Astra should reason about permanent artwork integration while preserving
silhouette, openings and interior visibility. SKIN remains responsible for
physical diagnostics and removable fabrication support.

FKEI may be a SKIN compatibility output from Astra in the future, but it should
not become Astra's canonical semantic source if doing so would restrict Astra to
the current SKIN schema.

## 13. Explicit non-goals for current External Host work

Until the relevant later phase is explicitly started, do not:

- convert STL to a universal authoritative SDF
- auto-repair source geometry
- make Reference Host printable BODY
- invent Permanent Web/Internal before the Usagi Author Gate
- modify Removable Support to compensate for missing artwork structure
- use FAB/G-code to solve Host or artwork geometry problems
- make derived mesh/BVH data authoritative
