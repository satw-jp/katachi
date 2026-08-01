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

## Usage-minimizing execution protocol

When the author can select Luna directly in Codex, prefer a top-level Luna task for a frozen, narrow package instead of asking a more expensive primary thread to spawn Luna. A spawned workflow repeats parent orchestration and child model work; direct Luna avoids that layer while keeping the design documents and Git commit as shared context.

Use this sequence:

1. Primary freezes one contract, acceptance test, owned-file list, and explicit exclusions in Git.
2. The author starts one direct Luna task in a dedicated worktree for one coherent outcome—not one task per tiny function.
3. Luna reads only the named design section and owned files, implements, tests, commits, and returns a short result. It does not re-read the full project history or reinterpret optical meaning.
4. Write-heavy packages run sequentially. Parallel Luna tasks are reserved for read-only inventory, independent fixtures, comparison records, or tests on non-overlapping files.
5. If a task exposes an ambiguous optical rule or crosses CPU/shader/WebGPU semantics, Luna stops with a minimal reproduction instead of iterating speculatively. Terra resolves that bounded integration; Primary resolves only the product or physics decision.
6. Primary reviews milestone evidence once, not every mechanical commit. Failed acceptance returns to the smallest responsible package.

Default effort is `low` for formatting, manifests, schemas from a fixed contract, migrations, and deterministic fixtures; use `medium` for focused code with several edge cases. Do not raise Luna effort to compensate for an unfrozen task—freeze or escalate the task instead.

Keep recurring context small: a nested `AGENTS.md` for `docs/hikari` or the future hikari implementation subtree, one package prompt, relevant files only, minimal MCP servers, and compact test output. Stable repeated prefixes improve cached-input use, while a new chat per coherent outcome avoids carrying old logs indefinitely.

## Work packages

| ID | Package | Default owner | Depends on | Main output | Completion gate |
|---|---|---|---|---|---|
| A | Freeze the representative experience | Primary | none | one colored-host/clear-inclusion case; three exploration prompts; material presets; accepted approximations | author can state what is interesting to look for |
| B | Save/reopen an interesting view | Luna | A record fields | case schema and validation; shape recipe; camera/light/receiver/material/settings/version/backend; import/export UI; observation template | same state reopens without localStorage; existing recipe flow survives |
| C | Define `OpticalScene` and migration | Primary design, Terra implementation | A | `OpticalMaterial`, `ShapeSource`, `Transform`, `Medium`, `OpticalScene`; old-settings migration; invalid-containment diagnostics | API reviewed; fixtures cover inside/outside/boundary cases |
| D | Pure optical geometry and transport | Terra, with Luna test expansion | C | transformed SDF query; ordered boundaries; RGB Beer–Lambert; Fresnel/TIR; medium path diagnostics | numeric air→host→inclusion→host→air tests pass |
| E | CPU reference tracer | Terra | D | one host + one inclusion; shared receiver/light samples; HDR transport field and energy ledger | equal IOR suppresses refractive boundary; absorption void remains visible; invalid/TIR paths cannot deposit energy |
| F | Natural-view body renderer | Terra | C–E | host/inclusion view, RGB absorption, transform updates, debug boundary view | viewpoint and small changes are legible in the body and receiver |
| G | Exploration controls and migration UI | Luna if contract is frozen; otherwise Terra | C, F | outer-colored/inner-clear presets; transform controls; saved-view action; old localStorage migration | three exploration prompts can be completed without Analysis |
| H | Receiver transport parity | Terra | E, F | one receiver frame, finite-light sample set, support field, and composition contract for shadow/CPU/WebGPU | disabling focused light leaves the colored shadow intact; author mode has no unsupported bright pixels |
| I | WebGPU scene-buffer migration | Terra | E, H | host/inclusion buffers, WGSL transitions, CPU/GPU comparison, safe fallback | fixed cases agree within recorded tolerances; CPU fallback remains usable |
| J | Blender case bundles M0–M6 | Luna | B and stable E/F | case folders, hashes, naming, checklists, comparison notes, selected images | no required Blender input is missing |
| K | Build, browser smoke, release note | Luna for execution; Primary for release | F–J as applicable | build log; real-click checklist; GPU/safe results; release record | Primary reviews visuals and approves deployment |
| L | Reference-corpus intake | Luna | Primary selects inputs and writes preference notes | manifest entries, hashes, metadata extraction, thumbnails, missing-field report | originals remain untouched; rights and unknown fields are explicit |
| M | Whole-object placement study | Primary design; Terra core; Luna UI/tests after contract freeze | transparent-material quality gate | world pose, ground reference, height/orientation UI, persistence/export, visual tests | grounded and free studies preserve host/inclusion optics and update receiver effects |
| N | Living-shape and freeze workflow | Primary experience; Terra driver/MPM integration; Luna schema/tests/UI after freeze contract | transparent-material quality gate | frozen MPM bridge, shared Sculpt controls, Cloud driver, Sag preview, exact capture | author can pause at a visible moment and reopen the same chosen shape |
| O | Abstract receivers | Primary semantics; Terra optical wiring; Luna family catalog/UI/tests after contract | C–H before optical quality gate | receiver response/irradiance split, abstract parameters/families, saved expanded values | CPU/shader/GPU share receiver endpoints; surface character never invents a caustic |
| P | Physical scale and spatial context | Primary material/context semantics; Terra unit/transport implementation; Luna fixtures/presets/UI after contract | material/receiver contract, then M/N | physical scale, same/matched material modes, object/furniture/spatial/roof contexts | scale changes optical depth honestly and saved cases restore units and compensation mode |
| Q | Printed translucent shade study — deferred | Primary study boundary/material honesty; Terra shell/optical core; Luna case/profile/schema/tests after contract | explicitly deferred by author | design note only until resumed | no current implementation work |
| R | Geometry-derived light drawing | Primary visual acceptance; Terra CPU/geometry/transport and GPU port; Luna deterministic fixtures/comparison records after contract | C–F, H, O, S; before optical quality gate | shared surface trace, fixed HDR receiver field, finite-source blur, progressive stable result | one authored trace moves one real light line; no receiver pattern is invented |
| S | Tokyo daylight and simple rooms | Primary experience/environment semantics; Terra solar/portal/transport integration; Luna deterministic fixtures, UI, and case records after contract | C–H, PhysicalScale; before optical quality gate | Tokyo clock, open air, room dimensions/ceiling height, multi-window geometry and layouts, time playback, body/no-body probes | direct light enters only through recorded openings; count/proportion/spacing remain causal; same instant is reproducible; redistribution is reported without invented energy |

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
- H follows the CPU reference. It begins by removing every hidden receiver-plane definition and invalid TIR deposit, then replaces peak-normalized additive caustics with the shared HDR transport field. I follows H; WebGPU is never the first implementation of a new optical rule.
- J starts after the case schema and visible host/inclusion behavior are stable.
- L may begin immediately, but Luna organizes and checks the material; the author and Primary decide why a work matters and what it means for hikari.
- O and S are part of the transparent-material quality gate, not decoration after it. Receiver families wait for the response contract; room work waits for shared `Light`, `Receiver`, and `PhysicalScale` semantics.
- N begins after that gate. Use the frozen MPM bridge before attempting a live refractive particle surface.
- M follows a chosen `FrozenShape`. Reserve `objectPose` in C, but do not spend implementation time on placement controls before then.
- P reserves `PhysicalScale` during C and material work, but context UI follows placement. Do not treat camera framing as physical scaling.
- Q is deferred and receives no implementation or intake work until the author resumes it.
- R is a core optical requirement. The CPU reference removes decorative deposits and adaptive normalization before the WebGPU port or visual tuning.
- S begins with a pure Tokyo solar fixture, then open air, one rectangular portal, multiple windows on one wall, room dimensions and ceiling height, all four wall faces, time playback, and finally the paired small-unlit-room study. Artificial lighting, measured weather, glazing, and indirect room bounce do not enter this package.

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
