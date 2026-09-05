# SKIN External STL Host Phase 4 — Signed Volume Capability

Date: 2026-09-05
Branch: `agent/skin-external-stl-host-v0`
Source checkpoint: `6b312c09dc3783085cc6b9fcd5b60aecf69643df`

## Source-control gate

Before implementation, the existing Phase 2 commit was pushed normally. The
local HEAD, local tracking ref, and GitHub branch were all verified as:

`6b312c09dc3783085cc6b9fcd5b60aecf69643df`

## Rabbit reference instance

Source:

`C:\dev\samples\rabbit_230223.stl`

- source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
- byte length: `10215684`
- triangles: `204312`
- source interpretation used for the Bambu reference: `1 mm/source-unit`
- instance transform: identity translation/rotation, `uniformScale = 20.0`
- Bambu reference: uniform `2000%`
- interpreted bounds: `128.945 × 110.716 × 145.674 mm`

The scale remains instance data. It is not baked into source bytes, source
hash, parsed source coordinates, or `mmPerSourceUnit`.

## Capability result

- Surface Host: `AVAILABLE`
- closestSurface: available
- raycast: available
- Signed Volume Host: `UNAVAILABLE`
- reason: `OPEN_BOUNDARY`
- signedDistance / insideOutside: not exposed for rabbit
- self-intersection: `NOT_PROVEN`

The open rabbit is never assigned a guessed inside/outside sign.

## Rabbit volume preflight

- valid triangles: `204305`
- degenerate triangles: `7`
- boundary edges: `21`
- boundary loops: `7`
- non-manifold edges: `0`
- orientation-inconsistency edges: `0`
- connected components: `1`
- topology status: `OPEN`

All seven boundary components are three-edge local planar candidates. Their
approximate diagnostics in the reference instance are:

| loop | edges | perimeter (mm) | center (mm) | span (mm) | fillability | local | silhouette |
|---:|---:|---:|---|---:|---|---|---|
| 0 | 3 | 3.376e-4 | (36.404, 72.141, -39.369) | 1.192e-4 | PLAUSIBLE_LOCAL | YES | NOT_ASSESSED |
| 1 | 3 | 4.398e-4 | (43.686, 68.095, 6.756) | 1.192e-4 | PLAUSIBLE_LOCAL | YES | NOT_ASSESSED |
| 2 | 3 | 1.742e-4 | (51.778, 25.207, 20.512) | 5.722e-5 | PLAUSIBLE_LOCAL | YES | NOT_ASSESSED |
| 3 | 3 | 2.747e-4 | (55.824, 48.674, 20.512) | 8.106e-5 | PLAUSIBLE_LOCAL | YES | NOT_ASSESSED |
| 4 | 3 | 2.520e-4 | (80.101, 30.062, -12.665) | 7.629e-5 | PLAUSIBLE_LOCAL | YES | NOT_ASSESSED |
| 5 | 3 | 7.991e-5 | (72.009, 22.779, -5.382) | 2.027e-5 | PLAUSIBLE_LOCAL | YES | NOT_ASSESSED |
| 6 | 3 | 1.250e-4 | (33.167, 26.016, -23.994) | 4.768e-5 | PLAUSIBLE_LOCAL | YES | NOT_ASSESSED |

Repair proposal: `PROPOSED` for loops `0..6`, using policy
`stl-host-boundary-fill-v0`. The proposal is inactive. No repair was applied,
no repaired mesh was made active, and explicit author approval is required
before any repaired rabbit can provide Signed Volume capability.

## Capability and transform tests

A deterministic closed cube fixture passed:

- closestSurface, inside/outside, signedDistance: PASS
- outside positive, surface zero, inside negative: PASS
- instance `uniformScale = 20.0`: PASS; distances scale consistently
- translation and rotation parity across visual mesh, surface query, and signed query: PASS

An intentionally open fixture passed the fail-closed gate:

- Surface Host: AVAILABLE
- Signed Volume Host: UNAVAILABLE with `OPEN_BOUNDARY`
- no signed-distance or inside/outside object exposed

Original source bytes remain immutable through the derived repair-provenance
path. Repair provenance retains the original source SHA-256 and has a
separate repair policy/version and derived fingerprint field.

## Browser gate and scope

Windows Chrome loaded the actual rabbit file and displayed the reference
instance with `1 mm/source-unit` and `uniformScale = 20`. The lab reported:

- closestSurface: `7/7 PASS`
- raycast: `6/6 PASS`
- console errors/warnings: `0/0`
- Host OFF changed visibility only; capability diagnostics remained present

No V6, FKEI, FIELD, Support, FAB/G-code, BODY generation, persistence, or
automatic repair work was performed.
