# SKIN STL → D6 Author v1 — 2026-10-29

Status: software operation checks PASS; publication authorized and verified. READY FOR AUTHOR OPERATION REVIEW. No Author acceptance, internal core/branches/Support completion, fabrication/removal validation, Print GO or Physical PASS is implied.

## Operation and startup

Independent complete checkout: `J:/skin-stl-20261029`. Base `9416ef9b2962e0353708d2733f92fe4dd50a3339`; tree `7905864a625df8c971eccf889a65e603d4222f5c`. All 1039 tracked files present, including Unicode images; no alternates; bundle verify and Git connectivity checks passed. Native Git `J:/Program Files/Git/cmd/git.exe` 2.54.0.windows.1; Windows 10.0.26200; PowerShell 7.6.5.

Branch: `agent/skin-external-stl-d6-author-v1`. Tested implementation HEAD `7a2bbf0e8f4972c5c75db1bf8b1b399a11c65def`; clean at browser acceptance. Later commits contain documentation/evidence/test-runner copies only; final HEAD is in DELIVERY.json. Remote branch created by normal push after explicit Author exception for the inherited 20.3 MB artifact; readback matched 9dba62aa57882cf4559e4ae9e49679a3594213a9. The final documentation HEAD is recorded in the publication receipt. Independent origin is `https://github.com/satw-jp/katachi.git`.

Open http://127.0.0.1:5216/skin-rebuild.html?mode=creation . Fresh-session verification used 5226/5227, primary uses 5216/5217. Services belong to this task. From the independent checkout, when its ports are free:

```powershell
powershell -File tools/skin_creation/launch.ps1 -Python C:/Users/as/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe -Vendor J:/skin-stl-20261029/work/vendor -UiPort 5216 -ApiPort 5217
```

Select external STL, choose a file, explicitly confirm mm, set Host scale/up-axis, D6 physical scale, density coefficient and seed, then generate. Use candidate comparison/adoption and Undo/Redo; save `.skincreation`; open it in a new session to restore. Forced regeneration reruns the generator without layout/result cache. Ordinary operations require no LLM, API key, JSON editing or case-specific code.

## Acceptance

| DoD / check | Result and evidence |
|---|---|
| Exact R1 isolation and source protection | PASS — recovery.json; original P3 source start/end branch `agent/skin-author-workflow-r1-p3-input-v0`, HEAD `4a1ac9abec2ec197d610f24cd3086cbdf4c97e0d`, clean, no upstream. Existing extra worktree retained. |
| External input and explicit transform | PASS — original bytes/hash unchanged; mm confirmation enforced; scale 1.2 and Y→Z exercised; positions and normals reconstructed from actual triangles. |
| D6 real scatter | PASS — shared locked D6; source distribution, sample_candidates, choose_farthest and anchor functions reused. 22/34/39 flowers at the three test recipes. Stable IDs, barycentrics, transforms and anchors retained. |
| Comparison, adoption, Undo/Redo, redo tail | PASS — real coordinate clicks in independent Chrome; same history/cursor/compare/selected/results after moved-folder fresh-service restore. |
| Forced regeneration | PASS — new result ID and fresh worker; semantic hash equals original 34-flower result. Arrays and worker logs retained. |
| Failure protection | PASS — open/non-manifold input, corrupt archive, computed resource overflow, cancellation followed by a new request; unit tests also cover obsolete responses after project switch and actual worker time-limit termination. |
| View invariance | PASS — camera and Host proxy visibility cause zero state/hash/generation-count changes. Shared template and transforms maintained; no D6 simplification. |
| Existing R1 regression | PASS — original 114154791-byte archive, all 6 immutable result identities; normal UI open, Undo/Redo, comparison/adoption preservation, save and reopen. Flowers/branches explicitly hidden during this large legacy display check; real meshes still loaded. No regeneration/slice. |
| Fixed #33/#36/#58/#63 contracts | PASS for scoped regression — fixed surface replay, internal geometry and metadata code unchanged; existing 9 tests retained plus 5 external tests. No other lane HOLD/UNKNOWN promoted. |
| Build | PASS — tsc + vite build. Existing >500kB chunk advisory recorded, no scope expansion. |
| Branch publication | PASS after explicit Author approval on 2026-10-29; normal branch-only push and remote readback verified. Original blocker (resolved): unpublished ancestor `e91468c` contains `docs/evidence/skin-mocomoco-composition-v0/skin-composition-mocomoco-64.skincomp` (20,274,549 bytes), unnecessary for this bounded runtime. User excludes unrelated large artifacts from push. History not rewritten; only the requested branch pushed. |

## Measurements — 8-face fixture only

New mathematical octahedron, CC0-1.0, not derived from any artwork. Original SHA256 `75c431cda17fa8dfe467427a29557eea84101e133a8e2d2bd707dc9039577726`; 987 bytes; 8 triangles; bounds [-10,-10,-10]..[10,10,10] mm; area 692.8203230275509 mm². The on-disk Windows CRLF bytes are authoritative and unchanged; the early pre-write LF hash in recovery-stage console was corrected in fixture-manifest before final acceptance.

Predeclared limits: input 8 MiB/20000 faces, candidates 100000, 300 placements, 60 s worker, 1 GiB worker peak working set, 128 MiB save. Exceeding computed placement/time/RAM limits aborts the request; no coarse fallback or retry. Browser exact simultaneous RAM peak UNKNOWN; observed aggregate at 50ms intervals 643002368 bytes (~613 MiB), sum of individual process peaks 994549760 bytes (not a simultaneous peak).

Peak generation-process working set: 114700288 bytes (~109 MiB). Adapter generation runtime and process startup wall time are distinct and recorded by result ID in measurements.json. UI generate-to-display ~3.93–4.10 s. Initial UI readiness 1.42 s; compare 0.406 s; Undo 0.360 s; Redo 0.311 s; save 1.762 s; fresh restore 1.769 s. Failure-protection assertion durations are not advertised as operation response timings.

Portable project: 11916200 bytes; SHA256 `9477d649eaff16be025b438cd18a45be31fd70e97b8a3b90c375f23e82286bb7`. One shared D6 template: 65,144 triangles; expanded equivalent 1,433,168 / 2,214,896 / 2,540,616 triangles for 22 / 34 / 39 instances. No expanded flower meshes are stored. No inference about thousands-of-flower artwork performance.

Baseline surface hash: `fda384be31dfe927ad063c336ba2e27655f3207d8a7a31c8cecfb65d3b042a79`.
34-flower/forced regeneration surface hash: `a7c024f051f675e560c6e2554149d9eb0f77a859198efea9031a4c415da34c87`.
Legacy archive UI open ~57.65 s and save ~44.50 s; these are separate from the small-fixture timing and have no legacy browser RAM peak claim.

## Evidence and remaining gate

Drive task folder: https://drive.google.com/drive/folders/16X7Z_lQIl0BC1P91mCIDww2ve_rGnVa3

Files: measurements.json; acceptance-verified/browser-acceptance.json, browser-memory.json, comparison.png, restored-regenerated.png, author-loop.skincreation; surface-evidence/* with actual arrays and worker logs; legacy-regression.json/png; unit-tests-final.txt; build-final.txt; publication-audit.json; recovery.json. SHA256 inventory and a recovery Git bundle are included in the evidence package. Embedded archive code is never executed. Exact prior R1 and Fix1 code identities are allowlisted; no general validator relaxation.

Review cycle 1 found an external-result null mesh hash in the old print panel, and a late scene response hazard; bounded fixes were committed as fb5e847. Final real-browser recheck passed. One intervening test precondition failure was a retained draft flower scale; the runner now explicitly initializes every fixture parameter. No second runtime repair cycle was required.

Next bounded task (one): define the external-Host domain/core connection contract for the existing D6 back anchors on one fixture, based on the surface-only adapter; no implementation is included here.

FOLLOW-UP: legacy large-scene load/save latency and bundle-size advisory are recorded only; no unrelated optimization performed. Internal Host core/domain/branches/Support remain unsupported with explicit reasons. Protected original assets, processes, jobs, printers, G-code, main and existing archives were untouched.

Publication addendum: Author reply explicitly allowed the inherited old 20.3 MB artifact. Earlier Drive evidence packages remain immutable historical checkpoints; this addendum supersedes their publication BLOCKED status. No runtime changes since tested HEAD 7a2bbf0e8f4972c5c75db1bf8b1b399a11c65def.

STOP: SKIN STL-TO-MOTIF AUTHOR LOOP — READY FOR AUTHOR OPERATION REVIEW
