# SKIN CREATION UI V0

Authority: Author instruction 2026-09-30. Independent branch agent/skin-creation-ui-v0, base b4db32bd7442f2a0edb4df6a9ef2a438d17e2f07. No deployment or main integration.

## Definition of Done

1. Local creation UI: verified mini MOCOMOCO (host scale 11/15) and default D6, actual surface and internal generation through the established #33/#36 algorithms. No AI needed for ordinary use.
2. Browser-generated matrix: flower multiplier 1 and 11/15, branch diameter 2.2 and 2.4 mm. Compare actual results, Undo/Redo, select a design.
3. Diameter changes are noncumulative: regenerate mesh radii from immutable centerlines and baseline radius/tip policy, never repeatedly scale the last mesh. Flower transforms/anchors remain byte-identical for diameter-only changes. Flower changes regenerate dependent branches; Support remains NOT_GENERATED.
4. Complete-result history: recipe, generated geometry and history cursor move together. Draft controls do not relabel old geometry. Failed/stale jobs and failed restore never replace the open valid project. Undo/Redo never pairs a recipe with another result.
5. Portable save and fresh reopen/regeneration: compressed versioned archive includes original Host/D6/source inputs, settings, seed, generator source snapshot/identity, unique generated results, comparison selection and history including redo tail. Relative archive paths, not J-drive dependencies. External Python/runtime requirements explicitly recorded. Saving deduplicates assets/results rather than duplicating arrays per history event. Report measured total/input/result/history bytes; reject archives over 512 MiB compressed or 2 GiB expanded and reject traversal/duplicate entries. Do not silently discard history to meet a limit.
6. Real-browser evidence includes all four conditions, comparison, Undo/Redo, save, fresh reopen and regeneration from a moved archive. Deliver images, portable saved project, exact implementation/evidence binding and usable launcher.

## Bounded implementation

Keep existing SKIN REBUILD and composition v0 behavior. New creation mode reuses its Three.js rendering/layout conventions and explicit project-history pattern. #33 local-origin transforms must not receive the older composition anchor shift. Host size and flower physical scale q*g are separate. Only the verified same-host 106-member core may be reused; regenerate flower-dependent structure. No custom Host/flower claims. Long generation is explicit, with progress and atomic publication; no dummy operation or downsampled placement count.

## Protected / STOP

Do not alter accepted works, other worktrees or running jobs. No Support generation, slicing, STL/3MF/G-code output, printer send, Print GO, R4 originals, force push, main merge or deployment. Selection means artistic choice only. No universal generator/audit infrastructure prerequisite. Stop at SKIN CREATION UI V0 — AUTHOR OPERATION REVIEW READY only after DoD evidence passes; otherwise report incomplete honestly.

## Acceptance 2026-09-30

All six DoD items PASS. Four actual UI-generated conditions, comparison, Undo/Redo, portable save including redo tail, failed restore preservation, fresh reopening and full regeneration for both flower multipliers were exercised. Final delivered archive was itself freshly reopened. See `docs/evidence/skin-creation-ui-v0/REPORT.md` and `final-restore-result.json`. Runtime implementation: 7a9ee03e220976aa3fc473ad51a7bcb15020960b. STOP at AUTHOR OPERATION REVIEW READY; no fabrication authority granted.
