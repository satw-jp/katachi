# Issue #26 — SKIN Authoring Research project v0 Fix 1

Date: 2026-09-22

## Scope

This Fix 1 closes only the save/restore boundary for the existing SKIN Authoring v0 research project. It does not add editing or output features and does not touch Support, Runner, LOEWE/R4 source, STL/3MF/G-code generation, slicing, printer send, or printing.

Implementation base: C accepted commit `59ebb3cfb781442a1583509d5e8b5ea40120ff94`.
Reported implementation HEAD before Fix 1: `20fed1a68c94047b50f02b8f430b955af89cc940`.

## Version check

The requested SOL `researchProject.ts` SHA-256 was `f4d81c8404ddb2b96426b423e45c58cb8cded9b6be6cec5aa3f0c8909371539e`. The only local copy found in the implementation worktree at the reported HEAD was `36480194420aefb508b717985b992ff0d5c3e5140358ef76f49d53efd807733`; no second copy or matching SOL hash was found in the available worktree roots.

Because the versions differed, the reported reproduction cases were checked before patching. The old local version accepted negative diameter, radius/diameter mismatch, diameter-only tip/taper changes, and compact-fixture coordinate/ID mutations. The requested Fix 1 was therefore not duplicated.

## Boundary changes

- Validate both `before` and `after` diameter states as finite and positive, with `diameter = 2 * radius`, `tipDiameter = diameter`, and `localTaperLength = 0`.
- Reapply every saved history entry during restore, including entries after `historyCursor`, so an un-applied redo tail is validated and continuity is checked against the preceding state.
- Reject duplicate edit IDs.
- Validate compact fixture identity against the known F2 fixture, including member IDs, kind/reference fields, coordinates, radii/diameters, top-level data, and original raw member data. F2 source identity and compact snapshot identity remain separate.
- Keep restore atomic from the caller's point of view: parsing and validation complete before the current open project can be replaced.

## Acceptance evidence

- `researchProject.test.ts`: 5/5 pass, including malformed negative/mismatched states, redo-tail validation, coordinate/unknown-ID/radius compact mutations, and failed-restore state preservation.
- TypeScript no-emit check: pass.
- Production build: pass.
- Browser: actual F2 4,351/4,351 load; C0002 3.0 → 2.8; Undo → 3.0; Redo → 2.8; `.skinproj` save and fresh reopen → 2.8. An invalid `.skinproj` restore was rejected while the current F2 project and C0002=2.8 remained visible.

The remaining browser console observation is the pre-existing Three.js shader warning `use of potentially uninitialized variable (f_map)`; no Authoring operation error was observed.

## Review boundary

This document records implementation evidence only. It is not slicer, printer, physical strength, or print-success evidence. Stop at `SKIN AUTHORING V0 AUTHOR USE-VALUE REVIEW`.
