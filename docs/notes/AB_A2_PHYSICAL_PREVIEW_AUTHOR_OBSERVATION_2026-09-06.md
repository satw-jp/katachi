# Team AB — A2 Physical Preview / Author Observation

Date: 2026-09-06
Status: author observation + future Support hypothesis

## Current A2 physical-print condition

The retained A2 artifact is:

- file: `ASTRA_A_candidate-print-lane.3mf`
- archive SHA-256: `C6D46BF59CF06BF14520C91A1327DDC752A864AF78DA05C72AD0D0D7A086E491`

Bambu Studio preview of the exact retained artifact showed many floating islands beyond the authored SKIN sparse removable Support. For the first physical feasibility print, the author selected:

- Bambu supplementary Support: `automatic Tree`
- overhang threshold: `45 deg`
- authored SKIN removable Support remains present and unchanged

Interpretation:

`A2 BODY + authored SKIN removable Support + Bambu automatic Tree Support 45 deg`

This print is physical-feasibility evidence. It is not proof that authored SKIN Support alone is sufficient. If slicer-generated Support is later used for A/G/H/J comparison, the same Bambu Support policy/profile must be frozen across all candidates.

## Author visual observation

At the Bambu Studio preview stage, the author judged the A2 form itself to be very attractive / promising.

This is an artistic observation only. It is not winner selection and does not change the A/G/H/J equal-condition comparison contract.

## Future Support architecture hypothesis

The author observed that current SKIN removable Support appears very easy to remove. This suggests a possible next direction:

`Outside-only body-anchored removable Support`

Instead of requiring every removable Support route to originate from the build plate, permit a lower, already-printable exterior BODY region to serve as the anchor for a higher Outside target.

Potential value:

- reduce long plate-rooted pillars;
- reduce the amount of supplementary slicer-generated Support;
- exploit nearby printable BODY as temporary support infrastructure while keeping Support separate and removable.

This must not become unrestricted BODY-to-BODY bridging. A future bounded design gate should preserve at least:

- both target and anchor are exterior / Outside-reachable;
- anchor is lower in print sequence and already connected to a valid printable load path;
- unsupported islands may not anchor other unsupported islands;
- route is layer-causal / buildable from anchor toward target;
- no traversal through BODY interior;
- non-contact route remains outside BODY and Rabbit forbidden volume;
- contact zones are explicit, bounded and removable;
- accepted BODY collision remains zero outside explicitly permitted contact zones;
- no Inside-derived target or anchor;
- no internal removable-support rescue;
- Candidate BODY geometry remains unchanged;
- Support remains a separate removable artifact.

## Scope boundary

This note is for sharing the author's physical-preview judgment and a future architecture hypothesis across Team AB / Research / other SOL chats.

It does not authorize implementation, does not modify the current A2 artifact, and does not change the current A/G/H/J comparison baseline.
