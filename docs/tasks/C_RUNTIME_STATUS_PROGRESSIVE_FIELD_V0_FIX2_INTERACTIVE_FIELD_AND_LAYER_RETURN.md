# C — Progressive FIELD v0 Fix 2 · Interactive FIELD + Layer Return

Date: 2026-09-07
Owner: C SOL
Implementation owner: C LUNA / bounded implementation worker
Status: ACTIVE

## Trigger / author evidence

Author visual gate after `1d473146d6c9364f84d2435a64efb4175bc057f1` found:

1. Compute indicator is acceptable.
2. vNext appears sooner, but the author still cannot comfortably rotate/pan/zoom while remaining in FIELD presentation.
3. After FIELD reaches its settled/fine state, interaction still feels blocked/heavy instead of Blender-like rough interactive rendering.
4. After entering FIELD, switching back to BEADS does not reliably restore BEADS presentation.

Therefore Runtime Status + Progressive FIELD v0 remains OPEN.

## Authority / start point

Continue from:

- branch: `agent/skin-runtime-status-progressive-field-v0`
- checkpoint: `1d473146d6c9364f84d2435a64efb4175bc057f1`
- execution: J-side only
- live helper: `J:\dev\katachi-compute-helper-tray`
- samples authority: `J:\dev\samples`

Do not rebase/merge unrelated work.

## A. Interaction contract: FIELD must remain FIELD while moving

The author requirement is Blender-like interaction-first FIELD presentation.

When FIELD vNext is selected and the author rotates/pans/zooms:

- camera movement must remain responsive;
- the visible representation should remain a recognizably FIELD-like surface, even if very coarse;
- do not use BEADS as the normal interaction presentation;
- BEADS may remain an emergency/capability fallback only if an actual FIELD pass cannot be produced at all.

### Required renderer direction

The current progressive implementation mainly reduces raymarch step count. That is insufficient as the primary interaction optimization because fragment count remains tied to viewport resolution and each field sample still scans the authoritative primitive set.

Fix 2 should reduce **FIELD-only internal render resolution / pixel workload** during interaction.

Preferred bounded design:

1. Render vNext FIELD into a FIELD-only offscreen render target / framebuffer at low internal resolution during interaction.
2. Upscale that texture to the normal viewport/CSS size.
3. Use an intentionally aggressive interactive tier; rough/blocky output is acceptable if the current form remains recognizable.
4. On pointer/camera interaction start, switch to the interactive FIELD target before any expensive settled/fine redraw.
5. While interaction is active, do not schedule medium/fine refinement.
6. On interaction end, keep the interactive/coarse FIELD visible and progressively refine internal resolution and/or march quality while idle.
7. Reuse the same current FIELD payload/textures; do not rebuild or subset primitives per tier.
8. Leaving FIELD restores ordinary renderer state immediately.

Exact internal resolution scales are implementation details. Optimize for interaction responsiveness first, not image polish. It is acceptable for interactive FIELD to be visibly coarse.

Do not solve this by decimating/subsetting FIELD primitives or changing SDF meaning.

## B. Settled/fine behavior

A fine FIELD may still appear while idle, but it must not trap the author in a heavy state.

Required:

- pointer/camera interaction from a settled/fine FIELD must immediately invalidate/hide the expensive settled presentation and enter interactive coarse FIELD;
- the first interaction frame must not require completing another expensive fine frame;
- no automatic refinement runs while the camera is actively moving;
- stale fine/medium results must never overwrite the interactive camera state.

If full/fine refinement remains expensive, retain a responsive medium preview rather than forcing fine automatically.

## C. FIELD -> BEADS regression

This is a hard correctness requirement.

When the author selects BEADS after FIELD:

- cancel all FIELD refinement timers/tokens;
- hide legacy FIELD quad, vNext FIELD quad, progressive render target/output and any stale FIELD fullscreen presentation;
- restore current host/patch beads immediately;
- preserve vNext as the FIELD backend preference for the next FIELD entry;
- do not require another click or camera movement to make BEADS appear.

Also verify FIELD -> MESH / GRAPH / DIAGNOSTICS does not retain FIELD fullscreen output.

## D. Compute indicator

Compute indicator passed author visual inspection. Preserve it; do not redesign it in Fix 2.

No endpoint/configuration change.

## E. Browser gate

Use a current C-compatible sample with non-trivial FIELD content, preferably the same `skin-rebuild-pattern5-regression.fkei` gate state when available.

Mandatory checks:

1. `FIELD + vNext` settles to a visible FIELD.
2. From settled/fine state, begin rotate and continue moving for several seconds.
3. During movement, viewport continuously follows the camera and shows a coarse FIELD-like surface; no long freeze waiting for fine.
4. Releasing camera restarts idle refinement at the final camera pose.
5. Re-enter interaction during medium/fine refinement; it immediately returns to interactive FIELD and stale refinement does not overwrite it.
6. `FIELD -> BEADS` immediately shows BEADS and no FIELD fullscreen/texture remains.
7. `BEADS -> FIELD` re-enters FIELD with vNext preference preserved.
8. Repeat FIELD <-> BEADS at least 5 times.
9. MESH / GRAPH / DIAGNOSTICS transitions remain correct.
10. No compute/rebuild/export callback is caused solely by these view interactions.
11. No new console exception attributable to Fix 2.
12. No accumulating render-target/timer/resource leak across repeated entry/exit.

Record qualitative interaction behavior plus timing/frame observations sufficient to show that rotate is usable from the settled FIELD state.

## F. Tests

Add/update focused tests for:

- interactive FIELD quality state entered on camera interaction;
- no medium/fine progression while interaction active;
- stale generation/token rejection;
- leaving FIELD cancels progression and returns BEADS visibility;
- repeated FIELD -> BEADS -> FIELD transition;
- vNext backend preference persistence;
- render-target/quality state restoration when leaving FIELD.

Run:

- focused FIELD/progressive tests;
- typecheck;
- build;
- `git diff --check`;
- `npm run test:skin-rebuild` when environment permits; environment-level `uv_os_get_passwd ENOMEM` may be recorded separately but must not be misreported as code PASS;
- Production parity sufficient to show locked identities remain exact.

## Protected scope

Do not change:

- FIELD SDF math;
- sequential smooth-min order;
- primitive grouping/filter/store/payload semantics;
- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support / `supportSource`;
- Output Scale;
- FKEI semantics;
- Export / 3MF semantics;
- compute endpoint/config;
- External STL Host;
- Usagi;
- durability implementation;
- Outside->Outside Support;
- new research algorithms.

Locked Production identities remain authoritative.

## Done when

Ready for C SOL + author visual review when:

- FIELD can be rotated/panned/zoomed while a very coarse FIELD presentation remains visible;
- interaction from settled/fine FIELD does not visibly freeze;
- idle refinement resumes after interaction;
- FIELD -> BEADS is immediate and reliable;
- repeated layer switching has no stale fullscreen FIELD;
- Compute indicator remains correct;
- tests/build/diff checks pass;
- Production parity remains exact;
- branch is pushed and worker stops for C SOL review.
