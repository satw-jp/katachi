# C — View Representation Continuity v0 Fix 3 — FIELD Offscreen Viewport Framing

Date: 2026-09-08
Owner: C SOL
Implementation owner: C LUNA / bounded diagnostic worker
Status: ACTIVE

## Trigger / author evidence

Fix 2 candidate `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2` passed worker browser QA but failed the author visual gate.

Author evidence on the actual J-side app:
- settled FIELD framing is correct;
- starting view rotate still produces a dramatically enlarged / cropped coarse FIELD frame;
- continuing/releasing interaction returns toward the expected framing;
- therefore Fix 2 did not close FIELD interaction framing.

MESH normal/Ghost correction from Fix 2 is not reopened by this task unless a concrete MESH regression is observed.

## Authority / start point

Continue from:
- branch: `agent/skin-view-representation-continuity-v0`
- checkpoint: `8884f12a8c9cedde205d8eed8a86c67fa4bdbfd2`
- execution: J-side only

No merge/rebase/unrelated cleanup.

## Diagnostic hypothesis

The screenshot resembles a partial offscreen target being enlarged to the full viewport more than a small aspect-ratio error.

The interactive FIELD path currently:
1. receives viewport rects in CSS/layout pixels;
2. creates a low-resolution `WebGLRenderTarget`;
3. switches renderer target;
4. explicitly sets viewport to `target.width / target.height`;
5. renders FIELD into the target;
6. switches back to the default framebuffer;
7. sets viewport/scissor to the author viewport;
8. upscales the target texture.

Fix 2 added renderer DPR to target sizing, but the author failure remains. The next diagnosis must determine whether the actual GL viewport/scissor after `setRenderTarget()` is being scaled again or otherwise differs from the intended render-target dimensions.

Do not assume this hypothesis is correct until measured.

## A. Mandatory A/B isolation

Use the same current C-compatible sample, same FIELD backend, same camera pose, and same coarse march-step quality.

Compare:

### A1 — current offscreen interactive FIELD
- low-resolution WebGLRenderTarget + upscale path.

### A2 — diagnostic direct coarse FIELD
- temporarily bypass only the offscreen target/upscale presentation;
- render the same FIELD shader/material/payload directly into the normal viewport at coarse march steps;
- do not change camera semantics, FIELD payload, SDF math, primitive ordering, or progression policy.

Record whether the rotate-start framing jump occurs in A1 and A2.

Decision:
- A1 FAIL / A2 PASS -> defect is in offscreen target / viewport / upscale coordinate handling;
- A1 FAIL / A2 FAIL -> inspect first-interaction camera/projection timing instead;
- both PASS in worker route but author evidence still fails -> reproduce on the actual browser/device scale/DPR conditions before modifying code.

Temporary diagnostic bypass must not remain as an accidental semantic change.

## B. Offscreen coordinate evidence

If A1 isolates the defect, capture for the first interaction frame:
- `window.devicePixelRatio`;
- `renderer.getPixelRatio()`;
- canvas CSS width/height;
- renderer drawing-buffer width/height;
- selected viewport rect in CSS/layout coordinates;
- requested FIELD target width/height;
- actual `WebGLRenderTarget.width/height`;
- actual GL `VIEWPORT` (`gl.getParameter(gl.VIEWPORT)`) after `setRenderTarget(target)` and after any explicit `setViewport(...)`;
- actual GL `SCISSOR_BOX` when relevant;
- viewport after returning to the default framebuffer;
- camera projection matrix before settled render and on first interaction render.

The key question is whether a render-target viewport is accidentally DPR-scaled twice or otherwise covers only a subregion of the target.

## C. Allowed bounded fix

Only after naming the failed boundary, fix the FIELD interaction presentation path.

Allowed examples:
- remove or correct redundant viewport/scissor setting while a render target is active;
- use render-target pixel coordinates explicitly and default-framebuffer CSS coordinates explicitly;
- restore viewport/scissor state correctly after offscreen rendering;
- correct first-interaction camera/projection synchronization if A/B proves that is the actual failure.

Prefer the smallest correction that keeps:
- low-resolution FIELD during interaction;
- full viewport framing identical to settled FIELD;
- existing coarse/refine progression;
- vNext/legacy backend semantics unchanged.

Do not solve this by changing model scale, camera zoom, object bounds, Output Scale, or FIELD geometry.

## D. Protected scope

Do not change:
- FIELD SDF math / smooth-min ordering / primitive grouping / payload semantics;
- Production BODY / Permanent Graph / Local Relay / Graph Repair;
- Removable Support / supportSource;
- FKEI / Export / 3MF;
- Stage 6 authority;
- compute endpoint/configuration;
- MESH authoring-preview architecture;
- internal-structure visibility redesign;
- durability / Usagi / Outside->Outside / External STL Host.

## E. Browser gate

On the author route and actual browser scaling/DPR conditions verify:
1. settled FIELD -> first rotate movement: coarse image may pixelate but framing is unchanged;
2. no magnification, crop, stretch, quadrant enlargement, or position jump;
3. continuous rotate/pan/zoom tracks the camera;
4. release resumes idle refinement at exactly the final pose;
5. repeat at least 5 interaction starts;
6. repeat in 4-view if practical;
7. FIELD -> BEADS -> FIELD remains correct;
8. MESH normal/explicit Ghost Fix 2 behavior remains intact;
9. no new console exception;
10. Production/Support/Export callbacks are not triggered by camera interaction.

Run focused tests, typecheck, build, and `git diff --check` where applicable. Record unrelated baseline drift separately.

## Done when

Return to C SOL only when:
- the failing boundary is named with A/B + coordinate evidence;
- the fix is minimal;
- actual-browser FIELD interaction no longer changes framing;
- branch is pushed;
- worker STOPs without starting another C task.
