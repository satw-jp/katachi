# SKIN Creation UI v0

## Question

Can the Author generate, compare and save verified mini MOCOMOCO + D6 compositions without AI intervention during ordinary use?

## Setup

Open `skin-rebuild.html?mode=creation` with the task-local generation service running. The legacy default and `mode=composition` routes are preserved. Source assets are prebound by the backend. Set flower multiplier and branch diameter, then generate. Candidate cards select a right-hand comparison; both views use one orbit camera. Undo/Redo moves the complete generated result, not just draft controls. Select a design separately from print approval. Save `.skincreation`, start a new project, and reopen the file to continue or regenerate.

## Observation

2026-09-30: Frontend implementation uses real API results only, local-origin D6 transforms (wxyz converted to Three xyzw), full-count instanced flowers and actual backend branch triangle meshes. On-demand rendering avoids an idle continuous GPU workload. Only the visible pair is retained in the GPU cache. Draft changes do not relabel generated geometry. Failed open retains the current project and view; final acceptance and browser observations belong to the task evidence.

## Limitations

Generation speed depends on the local service. Full meshes can make camera interaction costly; there is no hidden placement downsampling. Custom Host/flower import is unsupported. Support is NOT_GENERATED and Print GO is false. No manufacturing export controls. Build SHA is supplied by Vite; an uncommitted worktree is not asserted to be identical to that commit. No deployment is authorized by this task.

## Related

`docs/tasks/SKIN_CREATION_UI_V0.md`; existing `composition` UI and `rebuild` history patterns.

## Next

2026-09-30: Four actual conditions passed in isolated Chrome: 2303 flowers / 2885 members and 4283 flowers / 4107 members, each at 2.2 and 2.4 mm. Comparison, Undo/Redo, saving an unapplied redo tail, fresh reopen, failed-restore preservation and full regenerated hashes for both flower multipliers passed. Final delivered archive (114117140 bytes) was itself reopened. See `docs/evidence/skin-creation-ui-v0/REPORT.md`. Stop for Author operation review; no physical safety or print approval.
