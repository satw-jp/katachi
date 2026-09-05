# SKIN External STL Host Contract v0

This document defines the Phase 1 runtime boundary for an external triangle
mesh used as SKIN Host / Shape Intent. The mesh is a pose, silhouette, and
surface-placement reference; it is not a final BODY and does not create an
SDF, Boolean shell, internal structure, Support, or FAB output.

## Authoritative and derived data

`ImportedHostSource` retains the exact original STL bytes, their SHA-256,
byte length, filename metadata, STL format classification, explicit source
interpretation, and import-policy version. The hash identifies only the
original bytes; filename and unit interpretation do not change it.

`ImportedHostInstance` refers to a source and carries its project placement:
translation, rotation, and uniform scale. Source interpretation correction and
instance pose are separate transforms. Imported geometry, geometric normals,
bounds, BVH nodes, and query caches are derived and can be recreated.

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

`raycast(ray)` is an auxiliary compatible query for picking, directional
probing, and diagnostics. `contains()` and signed distance are intentionally
not required. Deterministic triangle-area sampling is a later adapter concern.

The Phase 1 implementation uses a small Host-local deterministic triangle BVH
with closest-point traversal. The existing Support Paint BVH was inspected but
not modified because it is a worker-owned, FrontSide raycast index with a
different lifecycle and clipping contract.

## Motif rule

Host pose may change before authored Motifs exist. Once Motifs have been
authored, changing the Host instance must not silently move or reproject those
Motifs. A future explicit operation may move Host and Motifs together.

## Future persistence direction

The reviewed long-term direction is to embed the exact original STL bytes in a
future project persistence version, together with hash, byte length, filename
metadata, interpretation, coordinate interpretation, and import policy. FKEI
is deliberately unchanged in this phase.

## Explicit non-goals

No V6 authoring integration, Usagi import, FKEI change, Save/Open behavior,
STL-to-SDF conversion, Boolean operation, BODY generation, internal structure,
Support, FAB, G-code, FIELD vNext, or deployment is part of this phase.
