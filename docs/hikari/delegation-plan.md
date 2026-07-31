# hikari — model and subagent delegation plan

Status: active
UpdatedAt: 2026-08-01

## Goal

Keep the primary thread focused on the author's experience, optical meaning, and integration decisions. Delegate bounded implementation, investigation, testing, and records in a few coherent batches rather than many tiny requests.

Subagents add their own model and tool usage. Parallelism is valuable only when packages are independent or when it keeps noisy investigation out of the design thread.

## Routing rule

- **Primary agent:** ambiguous product decisions, optical semantics, integration review, visual acceptance, Blender/physical-work interpretation, release decision.
- **Terra:** production implementation that needs judgment across several files, especially medium boundaries, CPU reference behavior, shaders, WebGPU, and compatibility.
- **Luna:** narrow, explicit, repeatable, or high-volume work—case I/O, fixtures, mechanical tests, migration helpers, documentation, comparison records, and build/smoke checklists.
- **Fallback:** when Luna is not exposed to the current subagent runtime, use Terra with low reasoning and keep the same bounded task contract.

Do not use a subagent when the coordination cost is greater than the task, when two agents would edit the same optical contract, or when the result is primarily an author judgment.

## Work packages

| ID | Package | Default owner | Depends on | Main output | Completion gate |
|---|---|---|---|---|---|
| A | Freeze the representative experience | Primary | none | one colored-host/clear-inclusion case; three exploration prompts; material presets; accepted approximations | author can state what is interesting to look for |
| B | Save/reopen an interesting view | Luna | A record fields | case schema and validation; shape recipe; camera/light/receiver/material/settings/version/backend; import/export UI; observation template | same state reopens without localStorage; existing recipe flow survives |
| C | Define `OpticalScene` and migration | Primary design, Terra implementation | A | `OpticalMaterial`, `ShapeSource`, `Transform`, `Medium`, `OpticalScene`; old-settings migration; invalid-containment diagnostics | API reviewed; fixtures cover inside/outside/boundary cases |
| D | Pure optical geometry and transport | Terra, with Luna test expansion | C | transformed SDF query; ordered boundaries; RGB Beer–Lambert; Fresnel/TIR; medium path diagnostics | numeric air→host→inclusion→host→air tests pass |
| E | CPU reference tracer | Terra | D | one host + one inclusion; shared camera and shadow throughput; focused light remains separate | equal IOR suppresses refractive boundary; absorption void remains visible; invalid scenes fail honestly |
| F | Natural-view body renderer | Terra | C–E | host/inclusion view, RGB absorption, transform updates, debug boundary view | viewpoint and small changes are legible in the body and receiver |
| G | Exploration controls and migration UI | Luna if contract is frozen; otherwise Terra | C, F | outer-colored/inner-clear presets; transform controls; saved-view action; old localStorage migration | three exploration prompts can be completed without Analysis |
| H | Transparent-shadow parity | Terra | E, F | same medium transition semantics for finite-source shadow and camera transport | disabling caustics leaves colored transparent shadow intact |
| I | WebGPU scene-buffer migration | Terra | E, H | host/inclusion buffers, WGSL transitions, CPU/GPU comparison, safe fallback | fixed cases agree within recorded tolerances; CPU fallback remains usable |
| J | Blender case bundles M0–M6 | Luna | B and stable E/F | case folders, hashes, naming, checklists, comparison notes, selected images | no required Blender input is missing |
| K | Build, browser smoke, release note | Luna for execution; Primary for release | F–J as applicable | build log; real-click checklist; GPU/safe results; release record | Primary reviews visuals and approves deployment |
| L | Reference-corpus intake | Luna | Primary selects inputs and writes preference notes | manifest entries, hashes, metadata extraction, thumbnails, missing-field report | originals remain untouched; rights and unknown fields are explicit |
| M | Whole-object placement study | Primary design; Terra core; Luna UI/tests after contract freeze | transparent-material quality gate | world pose, ground reference, height/orientation UI, persistence/export, visual tests | grounded and free studies preserve host/inclusion optics and update receiver effects |

## Conflict-minimizing sequence

```text
Primary: A → approve C
             ├─ Luna: B ───────────────────────────┐
             └─ Terra: C → D → E → F → H → I ────┼─ Primary review/release
                                      └─ Luna: G/J/K
```

- B can begin beside C but must not invent the final `OpticalScene` fields.
- D and E stay with one owner because medium-transition meaning must not split.
- F and G may proceed in parallel only after C is frozen and their file ownership is separate.
- H follows the CPU reference. I follows H; WebGPU is never the first implementation of a new optical rule.
- J starts after the case schema and visible host/inclusion behavior are stable.
- L may begin immediately, but Luna organizes and checks the material; the author and Primary decide why a work matters and what it means for hikari.
- M begins only after the transparent-material quality gate. Reserve `objectPose` in C, but do not spend implementation time on placement controls before then.

## File ownership for the first milestone

- New core contracts/tests: `opticalScene.ts`, `opticalGeometry.ts`, `opticalTransport.ts` and matching tests.
- CPU reference: `optics.ts`.
- Body view and transparent shadow: `renderer.ts`, `shaders.ts`.
- GPU: `opticsGpu.ts`.
- Interaction: `hikari.ts`, `ui.ts`, `main.ts`.
- Records: `docs/hikari/**` and a new case I/O module.

`ui.ts`, `main.ts`, `renderer.ts`, and `shaders.ts` each have one owner at a time. The current Katachi worktree contains unrelated changes, so implementation packages use dedicated worktrees and integrate through reviewed commits.

## Reusable Luna batch prompt

```text
Work only on package <ID> from docs/hikari/delegation-plan.md.
The optical meanings and public types are fixed by <commit/document>.
Do not invent material physics, change OpticalScene, edit opticsGpu.ts, or broaden scope.
Implement the complete bounded package, add deterministic tests or a real-click checklist,
run the relevant build/tests, and return a concise summary with files, results, and unresolved facts.
Preserve unrelated working-tree changes and commit only package-owned files.
```

## Primary review questions

1. Is moving around the form enjoyable before opening Analysis?
2. Can one small change be attributed visually to viewpoint, shape, host color, or inclusion relation?
3. Are physical approximations stated honestly?
4. Can an interesting state move to Blender or a resin test without reconstruction?
5. Did delegation reduce context noise without creating overlapping implementations?
6. Has placement work remained behind the optical quality gate while its coordinate contract stays future-safe?
