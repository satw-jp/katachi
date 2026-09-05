# SKIN External STL Host Phase 5 — Usagi Repair + V6 Adapter

Date: 2026-09-05
Source checkpoint: `b16136a50505f0a0eab769f6900a42ce2cd86dab`
Policy: `stl-host-boundary-fill-v0`

## Author-approved source and interpretation

- Original source: `C:\dev\samples\rabbit_230223.stl`
- SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- Source length: `10,215,684` bytes
- Interpretation: `1 mm/source unit`, `+Y`, right-handed
- Instance transform: identity rotation/translation, uniform scale `20` (2000%)
- Original bytes remain retained and immutable. The original Host remains Surface AVAILABLE and Signed Volume UNAVAILABLE (`OPEN_BOUNDARY`).

## Derived repair

Only approved boundary loops `0..6` were materialized. The repair removes the seven topology-degenerate triangles identified by the existing welded diagnostics and adds three deterministic local fan triangles per approved loop. No smoothing, broad remesh, global topology rewrite, or silhouette operation is used.

The repaired Host measured:

- triangles `204,326`; valid `204,326`; degenerate `0`
- boundary edges `0`; boundary loops `0`
- non-manifold edges `0`; orientation inconsistency edges `0`
- connected components `1`
- self-intersection: `NOT_PROVEN`
- Signed Volume: `AVAILABLE`
- inserted local fan triangles: `21`
- derived fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`

The Signed Volume query is fail-closed and follows the existing convention: outside positive, surface zero, inside negative. `insideOutside` is the sign classifier and `closestSurface` supplies the magnitude.

## Existing V6 adapter

`externalStlHostV6Adapter.ts` wraps the existing `generateShapePoints("flower", …)` path. It does not create an STL-specific Flower generator. It exposes Host facts needed by V6: transformed `closestSurface`, geometric placement normals, tangents, Signed Volume classification, deterministic triangle-area-weighted sampling, and clearance-aware candidate selection.

Authored motifs retain their placement facts and host transform at authoring time, are deterministic for the same source/transform/seed/count, and remain `printable=false`. The adapter uses `GEOMETRIC` placement normals for v0.

## Browser gate

Windows Chrome loaded the exact local source, applied the approved repair, displayed the repaired Host, and generated both 32 and 128 motifs. With Host ON, orange motifs were visible on the rabbit. After a real coordinate toggle to Host OFF, the page reported:

```text
Host visibility: OFF
motif positions unchanged: PASS
host group only: PASS
motifs: 128
```

The browser gate reported zero console errors and zero console warnings. This is a finite geometry/UI capability gate, not a slicer, strength, or physical-print claim.

## Verification

- focused repair tests pass, including actual rabbit identity/topology/capability checks
- focused V6 adapter tests pass for deterministic sampling, geometric-normal parity, clearance, and motif replay
- `npx tsc -p tsconfig.test.json --pretty false` passes
- `npx tsc -p tsconfig.json --noEmit --incremental false --pretty false` passes
- `npm run build` passes
- no deploy, FKEI/save/reopen, Astra, Permanent Connection, Web/Internal, Support/FAB, G-code, or final BODY work was performed
