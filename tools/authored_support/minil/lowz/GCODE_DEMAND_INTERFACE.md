# Saved LIGHT G-code → V2 demand interface

Scope: diagnostic data only. No generator is invoked by the detector. Existing
`construction.contact_parts`, `construction.planar_foot`, donor selection and
brace rules remain unchanged. `COPLANAR_FACE` and CAD UNKNOWN gates remain open.

## Evidence record

`toolpath.analyze` writes `EVENTS.json`. Each event retains the source G-code
SHA-256, machine layer/Z, source line, chronological path UID, ordered motions
(including arc tessellation, raw command, width, height, E and numerical error),
the initial unsupported-footprint decision and four subsequent layer overlaps.
UIDs are local to this parser, not Candidate B UIDs or authored part IDs.
Events mean unsupported chronological path spans, not proven failed flowers or
unique disconnected CAD components. A path can merge into other material later.

The review extent is the union of the **entire ordered swept footprint** of
the event, not its first XY point. It is not an instruction to support every
later span uniformly: consumers must join the per-span diagnostic CSV to isolate
the actual deficient birth regions and preserve any later connections.
Each span includes its line and span index;
the same source command can have multiple analytical spans. Subsequent-layer
overlap is measured against that union. It is not a physical strength test.

## Required conversion gates (all must pass)

1. Bind source G-code and source mesh hashes; retain original component/build
   transforms. Prove machine→CAD XY and Z phase from this saved job. A fitted XY
   match alone does not authorize a CAD Z offset or an authored target ID.
2. Convert the complete swept footprint, including line width and uncertainty,
   and its four-layer continuation into CAD demand regions. Preserve separate
   births; do not collapse them to one contact per flower.
3. Bind each demand region to actual frozen target geometry and surface normal.
   Do not substitute a guessed vertical normal or nearest flower ID.
4. Certify a pre-existing donor, its chronology to the plate, complete proposed
   route, target contacts, non-target clearance, and removal envelope. UNKNOWN
   intersections cause `LOCAL_UNVERIFIED`, never empty-space or support credit.
5. Pass the unchanged V2 dimensional/selection rules. If those primitives cannot
   cover the demand, return `UNHANDLED_BY_EXISTING_RULE`, not a thicker support
   or source-specific exception. Require a separate authorization for geometry.

## Adapter contract

Input: `source event → source hash/line/span/layer/XYZ → full swept footprint →
coverage interval and chronological evidence → four-layer continuation`.

After certification, an adapter can expose the existing generator's demand
fields (`id`, `part`, `mesh_component`, `cad_z_mm`, `section`, `footprint_index`)
plus certified target normal, donor identity, transforms and provenance. These
fields must **not** be fabricated while the mapping is UNBOUND. A machine-space
event is not a valid input to the current CAD-cache-based `reuse.run` entrypoint.

Current export fields deliberately set `flower_id=null`, `support_id=null`,
`cad_transform=UNBOUND`, and
`generation_status=BLOCKED_COORDINATE_AND_ROUTE_CERTIFICATE`.
Schema-representable demand count and generator-authorized count are separate;
the latter is zero in this task. `print_go=false` throughout.

## Structural screening

`STRUCTURE_GRAPH.json` is a coarse raw-deposition connectivity graph, distinct
from conservative healthy-material propagation. Its no-merge height, minimum
bounding-box width, roots and fanout are screening proxies only. They cannot
identify a shaft/neck, prove a direct brace, or establish buckling resistance.
Keep these observations machine-coordinate-only until geometry binding passes.
