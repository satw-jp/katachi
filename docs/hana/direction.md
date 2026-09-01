# HANA Study Direction

Status: canonical direction for the independent HANA Study
Updated: 2026-09-01

## Purpose

`hana` is an independent Study for making one flower from an author's Gesture / Stroke. It begins by preserving the author's input, then explores how that input can become an editable structure and, eventually, a computable shape.

`hana-taba` is a later layer that bundles multiple `hana` results and may eventually hand them to SKIN's Web / Support / Print processing. `hana-taba` is not part of the initial `hana` implementation.

The current SKIN work continues along its existing Support → Web path. Starting HANA must not change or delay SKIN REBUILD production geometry, FKEI, Support, Web, CUDA production adoption, or deploy behavior.

## Canonical representation layers

```text
Author input
  Raw Gesture / Stroke
    ↓ derived without replacing the source
Editing and structure
  Editable 3D Stroke / Graph
    ↓
Shape computation
  Field / SDF
    ↓
Final output
  Mesh
```

- Raw Gesture / Stroke is the authoritative author input. Ordered points, pressure, time, stroke order, and input-device identity are retained.
- Editable 3D Stroke / Graph is an editing and structural representation. It is derived from Raw Gesture and does not replace it.
- Field / SDF is the computational representation used to realize shape.
- Mesh is a final output. It is not the source of truth for the author's input.

Derived representations must keep enough provenance to relate edits back to the Raw Gesture. In particular, resampling or 3D editing must not silently discard pressure or time.

## Boundary with SKIN

HANA starts as its own Study. It does not connect to SKIN production geometry, FKEI, Support, Web, Print, CUDA, or deploy in HANA-0 or HANA-1.

HANA may reuse small, leaf-level viewport behavior already proven in SKIN, such as viewport partitioning, orthographic camera conventions, hit testing, and camera controls. It must not require a large SKIN refactor or depend on the full SKIN renderer.

The initial preference is a narrow import or a HANA-local adapter that leaves SKIN behavior unchanged. A component should be promoted to a shared library only after use in HANA demonstrates that the same stable operation is genuinely shared by multiple Studies.

## Study sequence

1. HANA-0 — prove that EasyCanvas + Apple Pencil data reaches a Windows browser as ordered PointerEvent stroke data with pressure.
2. HANA-1 — transform preserved Stroke data into one shared Editable 3D Stroke and a simple Field Stem.
3. Later studies — Flower Head, `hana-taba`, and any handoff to SKIN are separate decisions after HANA-1.
