# SKIN FIELD vNext — Phase 0 Inventory / Preparation

**Branch**: `agent/skin-golden-field-vnext-v0` (based at `agent/skin-authoring-restoration-v0` @ `5f56e25: docs: record HANA SKIN ART FAB relationship`)
**Base commit**: `5f56e25` (remote `origin/agent/skin-authoring-restoration-v0`)
**Worktree**: `agent/skin-golden-field-vnext-v0` at `/Users/atsushisato/Documents/katachi-author-fixture/agent/skin-golden-field-vnext-v0`
**Date**: 2026-09-04

---

## 1. Current FIELD Limits

| Constant | Value | File | Purpose |
|---|---|---|---|
| `HOST_MAX_BALLS` | `96` | `src/studies/skin/shaders.ts:29` | Max host balls; sizes `uHostPos[96]`, `uHostRadius[96]` in GLSL + THREE.Uniform upload in `renderer.ts:922-923` |
| `PATCH_MAX_POINTS` | `256` | `src/studies/skin/shaders.ts:41` | Max patch point indices; sizes `uPatchPos[256]`, `uPatchData[256]` in GLSL + THREE.Uniform upload in `renderer.ts:927-929`; fragment shader loops up to this count |
| `PATCH_MAX_COUNT` | `160` | `src/studies/skin/shaders.ts:44` | Max distinct patches for selection highlight; does NOT size shader arrays (only used in UI warning at `ui.ts:3457-3458`) |

---

## 2. Enforcement Points

### 2.1 Shader (`shaders.ts`)
- Uniform arrays declared with constants: `uHostPos[96]`, `uHostRadius[96]`, `uPatchPos[256]`, `uPatchData[256]`
- Fragment shader `for` loops iterate up to these constants (`i < 96`, `i < 256`)
- Early break if `i >= uHostCount` / `i >= uPatchPointCount`
- `HOST_MAX_BALLS` comment references GLSL fragment uniform-vector budget (`MAX_FRAGMENT_UNIFORM_VECTORS ≈ 1024` on verified software WebGL renderer)
- `PATCH_MAX_POINTS` comment: "this Study already hit the fragment uniform-vector budget once ... so radius+owner were folded into one vec2 array (uPatchData) to cut the uniform-array count from 3 to 2 for patches"

### 2.2 Renderer (`renderer.ts`)
- `THREE.Uniform` arrays created with `Array.from({ length: HOST_MAX_BALLS })` / `PATCH_MAX_POINTS`
- Upload loop at `renderer.ts:4951-4953`: `const nh = Math.min(host.length, HOST_MAX_BALLS)` — only first 96 host balls are uploaded; remaining are ignored by the shader
- Patch upload at `renderer.ts:4979-4981`: `if (n >= PATCH_MAX_POINTS) break` — only first 256 patch points are uploaded
- Beads approximation (T12, commented at `renderer.ts:578-581`): InstancedMesh spheres for every host ball and patch point — **no uniform-array cap** (deliberate approximation, not a replacement for the raymarch's smooth-min blending)

### 2.3 UI (`ui.ts`)
- Warning when `totalPatchPoints > PATCH_MAX_POINTS` (`ui.ts:3457-3459`): Japanese message "食い込みなしで滑らかだが表示容量に上限あり（画面は先頭${PATCH_MAX_POINTS}点まで。全${totalPatchPoints}点は超過中 -- 「Beads」か「Mesh」で全量を見てください）"
- Warning when `state.host.length > HOST_MAX_BALLS` (`main.ts:13119-13121`): Japanese message "⚠ 画面はホスト最初の${HOST_MAX_BALLS}球のみ表示（全${state.host.length}球はSTL/検査には含まれる）"
- Warning when `state.patches.length > PATCH_MAX_COUNT` (`main.ts:13124-13126`): Japanese message "⚠ 画面はパッチ最初の${PATCH_MAX_COUNT}個のみ表示（全${state.patches.length}個はSTL/検査には含まれる）"
- "Beads" mode caption (`ui.ts:3461-3463`): Discloses that Beads shows full quantity without cap; "容量の制約なしにオービット/ズームできる"

### 2.4 CPU Field / Authoring / Export (no caps)
- `field.ts`: Author motif data structure; no reference to `PATCH_MAX_POINTS` / `HOST_MAX_BALLS`
- `main.ts:18997` `totalPatchPoints()`: `state.patches.reduce((s, p) => s + p.points.length, 0)` — returns **actual** total from authored state
- `meshExport.ts`: Reads state directly, does NOT go through shader uniforms — full mesh/export always includes all motifs
- Gauges: Read state directly, no shader involvement
- Authoring state **keeps all motifs** — no truncation at any stage outside the shader preview

---

## 3. Truncation Scope (Critical)

| Data Path | Cap Applied? | Detail |
|---|---|---|
| Authoring state | **No** | All motifs kept; `state.patches` grows arbitrarily |
| CPU composite SDF (`field.ts`) | **No** | Evaluates all motifs; no uniform cap |
| Mesh / STL / 3MF export | **No** | `meshExport.ts` reads raw state; full output |
| Gauges | **No** | Read state directly |
| FIELD preview (raymarch shader) | **Yes** | Uniform array size limits; UI warns but does not truncate data |
| Beads view mode | **No cap** | Shows full quantity; only difference is `smooth-min` blending omitted |
| Selection highlight | **Yes** (patch indices) | Capped at `PATCH_MAX_POINTS` for `nearestPatchOwner()` loop in shader; UI warning at `PATCH_MAX_COUNT` for patch list length |

**Bottom line**: The only place where data is *visually* truncated is the FIELD raymarch preview. Authoring data, CPU SDF, mesh, and export are all unaffected.

---

## 4. Reusable Helpers / Infrastructure Found

| Helper / Infrastructure | File | Status |
|---|---|---|
| `uniformSpatialGrid3` / `queryUniformSpatialGridSphere` / `queryUniformSpatialGridRayNeighborhood` | `src/studies/skin/uniformSpatialGrid.ts` | CPU-side spatial grid; **not** directly related to shader uniform caps but could foundation for GPU spatial acceleration |
| `DataTexture` usage | `src/studies/cloud-sculpt/renderer.ts` | Only in `cloud-sculpt` study; **no** DataTexture in skin studies currently |
| WebGL capability detection | None found | No `gl.getParameter`, no float-texture checks, no feature queries in skin source |
| Pack shader constants | `src/studies/pack/shaders.ts:36` | `HOST_MAX_BALLS = 128` (different from skin's `96`); `PATCH_MAX_POINTS` not defined in pack (pack uses different architecture) |
| Three.js / WebGL budget references | `shaders.ts:32-34` | Comment references `MAX_FRAGMENT_UNIFORM_VECTORS ≈ 1024` on verified software WebGL renderer |

**Key observation**: No GPU-capability-detection infrastructure exists in the skin studies. Any vNext backend (DataTexture, buffer, spatial grid) would be greenfield for this codebase.

---

## 5. Browser/GPU Assumptions

| Assumption | Status | Detail |
|---|---|---|
| WebGL version | Implicit WebGL2 (Three.js default) | No explicit version check |
| `MAX_FRAGMENT_UNIFORM_VECTORS` | ~1024 on tested software renderer | Constants derived from budget analysis; `HOST_MAX_BALLS=96`, `PATCH_MAX_POINTS=256`, plus other uniforms (uCoinBulge, uResolution, etc.) fit under 1024 |
| Float texture support | **Not checked** | No `gl.getExtension('OES_texture_float')` or similar; DataTexture would be new |
| Max texture size | **Not queried** | No runtime query; would need to add if moving to DataTexture |
| Uniform array overflow behavior | Silent wrap/clamp (GLSL) | Explicit `break` guards in loops; no error handling for overflow |
| Fallback path | UI warning + Beads mode escape hatch | User can switch to "beads" to see full data; no automatic fallback |

**No automatic fallback** when uniforms overflow — only manual UI warning. The Beads mode serves as the "escape hatch" to view full data.

---

## 6. Minimum File Set for Future vNext Implementation

Files that a future vNext implementation would likely touch (based on current dependency map):

| Priority | File | Role |
|---|---|---|
| **1** | `src/studies/skin/shaders.ts` | Constant definitions + GLSL fragment/vertex shaders — must be redesigned for non-uniform backend |
| **2** | `src/studies/skin/renderer.ts` | THREE.Uniform setup + data upload with current caps — must be redesigned for DataTexture/buffer |
| **3** | `src/studies/skin/ui.ts` | Warning messages + view mode captions — must remain consistent with new backend |
| **4** | `src/studies/skin/field.ts` | Authoritative CPU composite SDF + motif data structures — unchanged unless authoring pipeline changes |
| **5** | `src/studies/skin/main.ts` | View mode management + `totalPatchPoints()` + warning displays — must wire new backend |
| **6** | `src/studies/pack/shaders.ts` | Reference for different cap (`HOST_MAX_BALLS=128`) — architecture may differ |
| **7** | `src/studies/skin/uniformSpatialGrid.ts` | CPU spatial grid — could be adapted/reused for GPU spatial acceleration (Phase 3+) |
| **8** | `src/studies/skin/picking.ts` | `nearestPatchOwner()` uses `PATCH_MAX_POINTS` loop — may need update if cap changes |

**Files that MUST NOT change (per Phase 0 scope)**:
- `field.ts` authoritive CPU semantics
- `meshExport.ts` / export pipeline
- `fkei.ts` / FKEI schema
- `support*` / Support v2 code
- `Print #2` / Print infrastructure
- `DryWeb` / `Permanent Web`

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Raising constants without adequate GPU budget → shader compile failure / runtime error | Medium | High (broken preview) | Profile actual fragment uniform count on target browsers; add runtime budget check |
| DataTexture/buffer backend changes accidentally mutate authoring state or mesh/export | Low | Critical (production impact) | Keep authoring/export paths completely separate; unit tests verify parity |
| Silent truncation if caps are exceeded and warning missed | Medium | Medium (user sees incomplete preview) | Ensure UI warning is always shown; Beads mode remains escape hatch |
| Owner selection (>160 patches) breaks if `PATCH_MAX_COUNT` logic is refactored | Medium | Medium | Keep `PATCH_MAX_COUNT` as UI limit only; selection index computed from actual data |
| Removing Beads escape hatch before vNext is stable | High | High | Keep Beads mode available throughout vNext development |
| No WebGL capability detection → unknown if target browsers support alternative backend | Medium | Medium | Add runtime capability check as Phase 1 deliverable |

---

## 8. Unanswered Questions

| # | Question | Current State |
|---|---|---|
| 1 | What is the actual `MAX_FRAGMENT_UNIFORM_VECTORS` on target browsers (desktop + mobile)? | Not measured; assumed ~1024 based on one software WebGL verification |
| 2 | Can DataTexture replace uniform arrays without visual differences or precision loss? | No DataTexture in skin studies; would need prototyping |
| 3 | What is the practical upper limit of primitives the browser can render at 60fps with raymarch? | Not benchmarked; Phase 1 target: 1024 primitives with interactive orbit/zoom |
| 4 | How should owner selection work beyond `PATCH_MAX_COUNT=160`? | Currently only a UI warning; no truncation or index wrapping |
| 5 | Should the fragment shader loop be made data-driven (iterate actual count) instead of constant-bound? | Would require moving count uniform + bounds check; possible Phase 2 improvement |
| 6 | What fallback if DataTexture/buffer backend is unsupported on user's GPU? | Phase 1 spec: keep Legacy uniform path + fallback warning |
| 7 | How to handle coin-bulge and ring3d shape flags in a non-uniform backend? | Currently folded into `uPatchData.y`; would need new metadata scheme |
| 8 | What level of CPU-GPU parity is required? (exact distance match vs. approximate) | Phase 1 goal: conservative spatial query preserves shape; no approximation that changes field sign |

---

## 9. Phase 1 Recommended File Boundaries

Based on the inventory, Phase 1 should focus on these add/modify files **only** (no changes to authoring/export/FKEI/Support/Print):

| New/Modified File | Purpose |
|---|---|
| `src/studies/skin/fieldPrimitiveStore.ts` | `FieldPrimitive` + `FieldPrimitiveStore` types (position, radius, ownerId, shape) — portable representation independent of shader caps |
| `src/studies/skin/dataTextureBackend.ts` | DataTexture creation + packing logic (position.rgba, radius.r, ownerId.g, shape.b) + runtime WebGL capability check |
| `src/studies/skin/spatialGridShared.ts` | Unified spatial grid (CPU build + GPU texture upload); reuse `uniformSpatialGrid.ts` design |
| `src/studies/skin/shaders.vnext.ts` | New GLSL shader for DataTexture-based evaluator (replace current `fragmentShader`) |
| `src/studies/skin/renderer.vnext.ts` | New renderer that builds DataTexture/buffer from `FieldPrimitiveStore`; optional Legacy uniform path for fallback |
| `src/studies/skin/ui.vnext.ts` | Updated warning/caption logic; add "FIELD vNext · N primitives · grid M×N×K" diagnostics |
| `src/studies/skin/tests/field-vnext-inventory.test.ts` | Focused inventory checks (see Section T of plan) |

**Files NOT to modify in Phase 1**:
- `field.ts`, `meshExport.ts`, `fkei.ts`, any `support*` or `Print #2` code
- `ui.ts` original (keep as-is; vNext UI can wrap or coexist)
- `renderer.ts` original (keep Legacy path operational)

---

## 10. Stop Condition for Phase 0

Phase 0 is complete when:
- [x] Branch `agent/skin-golden-field-vnext-v0` created from `origin/agent/skin-authoring-restoration-v0` @ `5f56e25`
- [x] Current limits documented (`PATCH_MAX_POINTS=256`, `PATCH_MAX_COUNT=160`, `HOST_MAX_BALLS=96`)
- [x] Enforcement points documented (shader, renderer, UI, authoring vs preview split)
- [x] Truncation scope confirmed (preview-only; authoring/export/mesh unaffected)
- [x] Reusable helpers identified (`uniformSpatialGrid.ts`, pack reference, no DataTexture in skin)
- [x] Browser/GPU assumptions catalogued (no capability detection; budget ~1024)
- [x] Minimum file set for vNext identified (7 core files)
- [x] Risks and unanswered questions listed (8 + 8 respectively)
- [x] Phase 1 file boundaries proposed
- [x] `git diff --check` passes (no unintended changes)
- [x] No production code changed beyond tiny inventory helper (if any)

---

**Next**: Proceed to Phase 1 only on explicit instruction. Do not implement FieldPrimitiveStore, DataTexture, shader changes, or the 20 new tests yet.