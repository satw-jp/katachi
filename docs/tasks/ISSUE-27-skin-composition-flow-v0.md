# Issue #27 — SKIN Composition Flow v0

## Definition of Done

- Implement only the Issue #27 composition lane in an isolated worktree based on Fix 1 commit `1b33b256b2fa82e517bfeb8f251c72f900171f4f`.
- Load and verify the locked MOCOMOCO host, motif, and frame inputs; keep existing SKIN, Research v0, and `.skinproj` behavior unchanged.
- Support deterministic flower placement, shared-branch generation, and self-contained `.skincomp` save/restore with validation and failure-preserving restore.
- Pass scoped automated checks and T1–T7 evidence, including real browser hit testing and fresh-context restore.
- Preserve screenshots, saved package, result manifest, task status, and Study observation; stop at `SKIN COMPOSITION FLOW V0 SOL EVIDENCE REVIEW`.

## Frozen boundaries

No changes or actions for R4/LOEWE, Astra worktrees, F2 source, Additional 10/7, Runner, Support, machine/profile, slicing, printer send, physical printing, deploy, main merge, or force push. No shared kernel or legacy UI rewrite. A task-branch normal push is permitted by Issue #27.

## Implementation identity

- Implementation base: `1b33b256b2fa82e517bfeb8f251c72f900171f4f` (Issue #26 Fix 1).
- New branch: `agent/skin-mocomoco-composition-v0`.
- Policy/current checkpoint named by Issue #27: `ecd0e7ae852fb5db565332af1225de78543fa453`.
- Fetched `origin/main` at task start: `8aae683e2216c5a5604641db05cdbd16b635f2d7`; linked task documents match this newer checkpoint. The absent `docs/status/SKIN_AUTHORING_CURRENT.md` remains absent as instructed.
- AB reuse reference: `87d5225a18dc7a1b8895cc44351db4c000be6261`; local Git fetch lacked credentials, so the three permitted neutral importer files were retrieved read-only from GitHub and migrated. Exact blob identities and the two strip-only compatibility edits are recorded in `docs/evidence/skin-mocomoco-composition-v0/SOURCE-PROVENANCE.md`.

## Resume log

### 2026-09-23 — setup

- Confirmed the new branch/worktree is clean at the requested implementation base. The prior Fix 1 worktree and dirty candidate worktree remain untouched.
- Retrieved all three locked Drive inputs through the authenticated browser and verified exact byte sizes and SHA-256:
  - `mocomoco_221104.stl`: 13,318,784 bytes; `c848ea33eebf4b65ad4386fede4c82a7f1185e921098a5c018135cda1fad6c4e`; binary STL reports 266,374 triangles.
  - `motif_63_D_BACKARC.npz`: 617,600 bytes; `ddb793d271fda8bd649676381b2deed48580f6192d84169a5032f99a81ca8c8f`; NPY headers report 32,574 vertices and 65,144 faces.
  - `patch_identity.json`: 38,916 bytes; `73d046104e38bc95c53805607a9b3ed04ad8634db97cfb049456377647ca4884`; representative motif 63 and the locked frame origin are present.
- Signed connector download URLs were not usable from the shell; browser download succeeded. The downloaded originals are read-only and unmodified.
- This is the initial setup checkpoint. Implementation and browser work are recorded below.

## Implementation checkpoints

- **Host:** loaded the locked 13,318,784-byte STL and verified SHA-256 plus 266,374 triangles in the app.
- **Flowers:** loaded locked NPZ/frame; browser displayed 32,574 vertices / 65,144 faces; generated 64 and 32 actual surface placements with fixed seed. Re-running placement cleared prior branches.
- **Branches:** 64 flowers produced 128 nodes / 127 edges; 32 produced 64 / 63. A diameter-only regeneration changed Ø3→Ø4 while Host, flowers and topology remained; returning to Ø3 restored the final recipe.
- **Save/reopen:** downloaded and copied the self-contained 20,274,549-byte `.skincomp` into `docs/evidence/skin-mocomoco-composition-v0/`. SHA-256 `e6f80c0dfb6265cbf7ae06c4cd73d224187585e0e7cf7758f145a2249584472f`. New tab restore revalidated package hash and showed 266,374 Host triangles, 64 flowers, 128 nodes, 127 edges, Host hidden. A wrong-schema upload was rejected while those counts remained unchanged. A large-base64 restore stack overflow was fixed; direct package restore now passes.
- **Real-browser images:** Host-only, flower-only, Host-visible branch, Host-hidden branch and fresh-restore full-page screenshots were captured from the app and displayed inline in the task. They were not persisted as repository PNGs: the browser security policy rejected the `data:` URL transfer route; no alternate browser route was attempted after that denial.
- **Regression:** `npm run test:skin-composition` passed 8/8; `npm run test:skin-authoring` passed 5/5; `npx tsc -p tsconfig.test.json --noEmit` passed; `npm run build` passed; default `/skin-rebuild.html` opened the original SKIN page and showed its `Research v0` control. The ordinary page displayed `Compute ○ offline` / `Failed to fetch`; the composition browser tab had zero console errors.
- **Current status:** software flow and save/restore are implemented and browser-verified. Four required screenshots were returned inline, but not persisted as repository PNG artifacts; see `RESULT.json` and the evidence README. No screenshot/export feature was added. Local dev server remains running on port 5187 (PID 48036, task worktree cwd). Stop after final metadata, diff, and branch checks at `SKIN COMPOSITION FLOW V0 SOL EVIDENCE REVIEW`.
- **Delivery:** implementation commit `e91468cc2d0a8e25aa14422a2ad8b35a98e695b7`; evidence commit `115293f2bf77a70ab39a2f1dda8a1fc59e028c30`. The single ordinary push attempt failed with `SEC_E_NO_CREDENTIALS`; read-only GitHub search confirmed the branch is not on origin. No retry via an alternate ref API was made. Final task-report commit records this failure.
