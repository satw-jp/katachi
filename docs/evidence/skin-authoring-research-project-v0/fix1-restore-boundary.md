# SKIN Authoring v0 Fix 1 — Restore boundary evidence

Date: 2026-09-22

## Code identity

- Branch: `agent/skin-authoring-research-project-v0`
- Base: `59ebb3cfb781442a1583509d5e8b5ea40120ff94`
- Fix started from report HEAD: `20fed1a68c94047b50f02b8f430b955af89cc940`
- Report-HEAD local `researchProject.ts` SHA-256: `36480194420aefb508b717985b992ff0d5c3e5140358ef76f49d53efd807733`
- Requested SOL SHA-256: `f4d81c8404ddb2b96426b423e45c58cb8cded9b6be6cec5aa3f0c8909371539e`

## Test evidence

| Check | Result |
|---|---|
| Focused research project tests | 5 pass / 0 fail |
| TypeScript no-emit check | pass |
| Production build | pass |
| `git diff --check` | pass |
| Actual F2 direct data path | 4,351 / 4,351 members; C0002 3.0 → 2.8 → Undo 3.0 → Redo 2.8 → fresh restore 2.8 |
| Failed restore protection | invalid `.skinproj` rejected; current F2 source and C0002=2.8 remained unchanged |

## Rejected cases

The focused tests reject `radius=-1 / diameter=-2`, `radius=99 / diameter=2.8`, and diameter-only `tipDiameter`/taper changes. They also reject compact fixture coordinate changes, unknown member IDs, and changed member radii. Restore validates the un-applied redo tail as well as the active history.

## Non-scope

No new editing/output feature, Support, Runner, LOEWE/R4 source, STL/3MF/G-code, slice, printer send, or print action was performed.
