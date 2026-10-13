# MINIL authored Support completion — execution record

Authority: Author task `MINIL_AUTHORED_SUPPORT_ADAPTER_COMPLETION`, supplied 2026-10-13.
This supersedes the source-review-only role in Issue #64 for this bounded task.

## Definition of Done

1. Bind PR #65 HEAD `6ea813b3535392f19d52e61bf62b0b35b5cc0fb6` and fixed B115 inputs without modifying originals.
2. Define source-bound H01–H05 candidate recipe, frame, ownership and removal assumptions.
3. Execute actual MINIL-derived Support generation across all height regions, with explicit unhandled IDs.
4. Save actual Support meshes, contact/removal evidence and review figures; verify readback.
5. Preserve the existing 44 tests, add required failure/fixture tests, and stop at candidate review READY or evidence-based implementation HOLD.

## Protected state

Flower 2303 / original Permanent 2885 / provisional branches 115 remain fixed.
MINI_A PR #63, common generator modules, golden, original Sol checkout and cycle2 are unchanged.
New geometry is removable Support only. Existing artwork scale = 1.
Settings context: A1 mini / 0.4 mm / PLA / 0.10 mm / raft 2 / SuperTack 45 C; unsliced.
No main merge, slice, manufacturing STL/3MF/G-code, Send or Print. `print_go=false`.

## H01–H05 implementation

- H01: successful MINI_A final geometry dimensions initialize the candidate recipe (source length × 11/15). Tool probe stays unscaled. Collision volume tolerance uses the cubic scale.
- H02: flat feet start on CAD Z=0. Machine placement and physical raft top remain null until later common-assembly slicing.
- H03: actual MINIL sections, BODY-only rooted grid, demands and source-ID load mapping drive direct/temporary/exterior supports and rising braces. No old generated Support is input. BODY projection replaces the legacy host SDF for exterior search; protected void corridor certification is not claimed.
- H04: exact historical SP002/R36A000858 carve comparisons preserve the original one-piece union; SP004 complementary split halves also match. Split meshes are comparison evidence only.
- H05: cut planes, source probe directions and fragment options are modelled against BODY and remaining Support. Fragments remain unless their tested escape is clear. Real tools and physical removal remain unverified.

## Review discipline

Self-check cycle 1 found incomplete removal bounds and own-Support probe exclusion. Both were corrected before completion. Partial first-run meshes are retained as an interrupted non-candidate; the same recipe and hashed MINIL-derived sections are reused for the repaired run.
This is not independent review. Final counts, STOP, evidence identity and unresolved findings are appended after execution.

Local evidence: `outputs/MINIL_AUTHORED_SUPPORT_COMPLETION_20261013` in the execution workspace.
