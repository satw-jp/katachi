# HIKARI-REFINE-0 Browser Diagnosis Checkpoint

Date: 2026-09-03
Status: WIP diagnostic checkpoint; browser diagnosis is stopped
Branch: `wip/hikari-refine-browser-diagnosis-20260903`
HEAD before checkpoint commit: `944c5a3e0aa4a4e8e55efe5c497c9b4e49ec0f21`
Production baseline: `main @ 7edd92e93139a5b0246334ddf8069726fbf7c113`
PR #12: Draft and unchanged

This document records the temporary browser-diagnosis state at the point it was stopped. It is not an acceptance record for HIKARI-REFINE-0 and does not authorize a repair, merge, or release. The diagnosis is intentionally stopped at D1A1 pending a later, manually controlled investigation.

## Scope and environment

- Windows 11 with a normal Windows Chrome manual gate.
- Chrome reported as `152.0.7977.75`.
- WebGL hardware acceleration was enabled.
- The user reported GPU crash count `0` for the baseline/D diagnostic setup where checked.
- Mac Chrome was reported as `PASS` in the comparison environment.
- Windows Chrome had a GPU-process `HUNG` history and progressed to WebGL Disabled; a complete Chrome restart temporarily restored normal operation, but the diagnostic configurations became unstable again.
- Codex Computer Use/in-app Browser was not used for this checkpoint; it was previously declared unsuitable for this diagnosis.
- The temporary dev origin was `http://127.0.0.1:4175/`.
- A production preview was also started at `http://127.0.0.1:4176/` from the D1A1 build, but no manual preview classification was returned before diagnosis was stopped.
- Mitsuba Bridge remained OFF for the browser diagnosis.
- Port `4174` and unrelated processes/workers were not operated.

## Observed A/B and binary-isolation results

| Case | Temporary condition | Manual result | Additional observation |
|---|---|---|---|
| MAIN baseline | Production `main` baseline | `PASS` | Normal dark canvas; no reported Three.js shader error |
| REPAIR BASE / Control | Current repair state before D isolation | `WHITE → Chrome freeze` | User-confirmed in normal Chrome |
| Test A | `main.ts` temporarily restored to main; minimal compatibility shim used only to keep the diagnostic buildable | `BLACK` | `main.ts alone: NOT CAUSAL` |
| Test B | `ui.ts` and `style.css` temporarily restored to main; minimal no-op adapter used only if needed for build | `BLACK` | UI/style removal did not restore LIVE |
| Test C | `client.ts` temporarily restored to main; diagnostic type assertions used only if needed for build | `BLACK` | Client-only removal did not restore LIVE |
| D0 / Test D | `physicalRefine.ts` removed from the browser module graph; Physical Refine execution disabled | `PASS` | LIVE recovered |
| D1 | Full `physicalRefine.ts` static import restored; controller/startup/wiring/callback execution remained disabled | `STALL+BLACK` | Stall: `YES`; GPU crash count: not confirmed |
| D1A | Minimal `physicalRefine.ts` stub with type-only imports for `field.ts`, `renderer.ts`, and `opticalScene.ts` | `BLACK` | Stall: `YES`; GPU crash count: not confirmed |
| D1A1 | Minimal stub retained only type-only `field.ts` and `renderer.ts` imports | `WHITE / delayed load` | GPU crash count was not reported |

The labels above are user-observed browser outcomes. They are not a substitute for a reproducible automated regression test.

## Interpretation boundary

The D0 → D1 result makes inclusion of the Physical Refine module/import path a causal area of interest. D1A and D1A1 narrow the suspicion to the module graph, import dependency, or top-level evaluation boundary, but do not uniquely identify a root-cause statement. No shader source, renderer shader setup, UI design, bridge implementation, or compatibility workaround was changed as part of this checkpoint.

The evidence does not establish whether the remaining issue is a runtime bug, a browser/GPU interaction, a bundling/module-evaluation issue, or a combination. The root cause is not fully identified. No final repair is claimed, and no browser diagnosis was resumed after D1A1.

Conclusion: Hikari2 must not use a browser or Chromium as its authoritative runtime. The native GPU foundation is a separate design track and does not inherit browser runtime authority from this diagnosis.

## Current diagnostic working state

The following state is intentionally preserved as the handoff point:

- `src/studies/cloud-sculpt/main.ts`: current performance-repair edits remain, with the temporary D1 static module import and Physical Refine execution/wiring disabled.
- `src/studies/cloud-sculpt/physicalRefine.ts`: current D1A1 minimal diagnostic stub remains. It retains only type-only imports from `field.ts` and `renderer.ts`; the full Physical Refine implementation is not restored in this working state.
- `tests/hikari/physicalRefine.test.ts`: current repair tests remain in the WIP checkpoint.
- `src/studies/cloud-sculpt/style.css` and `tools/hikari-mitsuba-bridge/client.ts`: working-tree status was EOL-only; no semantic diagnostic change is recorded for them.
- The prior full working contents used during earlier isolation are preserved outside the repository as diagnostic backup artifacts; they are not silently reapplied here.

The branch was created from the current diagnostic working state. The source changes above are not to be interpreted as a production-ready repair. This record and the preserved diagnostic source state are archived as a WIP commit; the GitHub push status is tracked by the enclosing task.

## Explicitly out of scope

- No source repair or new diagnostic isolation.
- No shader, UI, CSS, bridge, Mitsuba, Light Drawing, OPT-1b, Expressive, `.hkr`, SKIN, manifest, or version change.
- No port-policy or permanent Vite change.
- No commit to `main`, merge, deploy, or PR #12 update.
- No restart of Computer Use or Codex in-app Browser diagnosis.

## Handoff decision

Browser diagnosis is stopped at D1A1. Any future browser investigation must start from this exact checkpoint, use an explicitly controlled normal Windows Chrome procedure, and treat the result as diagnosis—not as permission to modify or merge HIKARI-REFINE-0.
