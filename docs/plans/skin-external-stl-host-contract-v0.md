# SKIN External STL Host Contract v0

This document defines the runtime boundary for an external triangle mesh used
as a SKIN Reference Host / Shape Intent. The mesh is a pose, silhouette, and
surface-placement reference; it is not a final BODY and does not create an
SDF field, Boolean shell, internal structure, Support, or FAB output.

The Reference Host has `printable = false`. It may remain available for
surface projection, inside/outside classification, signed distance, pattern
side classification, containment diagnostics, and removable-support reasoning
even when it is not visible and is not included in the final BODY.

## Authoritative and derived data

`ImportedHostSource` retains the exact original STL bytes, their SHA-256,
byte length, filename metadata, STL format classification, explicit source
interpretation, and import-policy version. The hash identifies only the
original bytes; filename and unit interpretation do not change it.

`ImportedHostInstance` refers to a source and carries its project placement:
translation, rotation, and uniform scale. Source interpretation correction and
instance pose are separate transforms. Imported geometry, geometric normals,
bounds, BVH nodes, and query caches are derived and can be recreated.

For the rabbit reference, the author's Bambu Studio 2000% use is represented
as `uniformScale = 20.0` on the instance. The value must not be baked into
source bytes, source hash, parsed source coordinates, or `mmPerSourceUnit`.
The same effective instance transform is authoritative for preview,
`closestSurface`, `raycast`, signed distance, inside/outside, and future motif
placement.

## Units and coordinates

Runtime Host activation requires an explicit `mmPerSourceUnit`. An unresolved
interpretation is retained as a non-activatable source state; it never means
"one STL unit equals one millimeter". The interpretation also records source
up-axis, handedness, and import-policy version. The derived parsed frame is
right-handed, Y-up, millimeter space. No bounding-box normalization occurs.

## Query contract

`closestSurface(point)` is the canonical surface query. It returns the closest
position, geometric triangle normal, triangle index, barycentric coordinates,
and distance. It works without a watertight-volume assumption.

`normal(point)` returns the geometric normal from the closest surface hit, or
`null` when the derived mesh has no queryable surface.

`raycast(ray)` is an auxiliary compatible query for picking, directional
probing, and diagnostics. Signed volume is an optional capability. A surface
Host is available whenever a valid derived triangle mesh exists. A Signed
Volume Host is exposed only after volume preflight validates a single,
non-degenerate, consistently oriented, topologically closed component.

The signed-distance convention is outside positive, surface zero within the
query tolerance, and inside negative. Signed distance is the unsigned
`closestSurface` distance combined with the validated inside/outside
classifier. If volume validation fails, the signed-volume capability is
`UNAVAILABLE` with a diagnostic reason and no guessed signed result is
returned. Self-intersection is reported as `NOT_PROVEN` when not checked
exhaustively; topologically closed is not presented as production safe solely
from boundary-edge counts.

The Phase 1 implementation uses a small Host-local deterministic triangle BVH
with closest-point traversal. The existing Support Paint BVH was inspected but
not modified because it is a worker-owned, FrontSide raycast index with a
different lifecycle and clipping contract.

## Motif rule

Host pose may change before authored Motifs exist. Once Motifs have been
authored, changing the Host instance must not silently move or reproject those
Motifs. A future explicit operation may move Host and Motifs together.

## Host visibility and printable-body semantics

Host visibility is presentation state only. Host OFF must not delete or
disable the retained source, surface query, or validated volume query. Host
included in BODY is a separate future manufacturing decision, and the
Reference Host remains `printable = false`.

## Explicit repair derivation

The original source is immutable. Any hole fill or other repair must be an
explicit, author-approved derived path:

```text
Original source bytes
  -> parsed original mesh
  -> explicit repair operation
  -> derived repaired mesh
  -> validation
  -> optional Signed Volume Host
```

Automatic repair is forbidden. Repair provenance must retain the original
source SHA-256 and separately record the repair policy/version, parameters,
and derived mesh fingerprint. A proposed repair is not active until explicit
approval; it must not silently enable Signed Volume Host.

## Future persistence direction

The reviewed long-term direction is to embed the exact original STL bytes in a
future project persistence version, together with hash, byte length, filename
metadata, interpretation, coordinate interpretation, and import policy. FKEI
is deliberately unchanged in this phase.

## Explicit non-goals

No V6 authoring integration, Motif placement, FKEI change, Save/Open behavior,
STL-to-SDF conversion, Boolean operation, BODY generation, internal structure,
Support, FAB, G-code, FIELD vNext, or deployment is part of this phase.
