# Slice Console R0.1 — Windows MSVC/UCRT loader context
Subtitle: STATIC ACTIVATION / SEARCH CONFIGURATION ONLY.
Decision owner: Author. Status: bounded task complete, **INCOMPLETE / HOLD**, Author review pending.
Base: Author-accepted PR45 normal merge `02d1f9a4da55bc05cf72431ccaeabe703289bb1d`.
Isolated branch: `agent/slice-console-r0.1-loader-context`.

## Definition of Done
1. Verify PR45 exact head/base/Draft/OPEN/mergeable/behind0, Ready and expected-head normal merge.
2. Fetch main; new isolated branch/worktree; preserve previous work and installed bytes.
3. Preserve accepted scope17 imports; read two target PE RT_MANIFEST/activation metadata.
4. Read only exact redirection pointers and limited search registry/source context.
5. Per-import fail-closed selection plus additive policy delta; preserve accepted policy/plan/evidence.
6. Check evidence, Draft PR, Author review STOP; Bambu process launch0, no next task.

[Evidence](../evidence/SLICE_CONSOLE_R01_LOADER_CONTEXT_2026-10-04.md), [per-import result](../evidence/SLICE_CONSOLE_R01_LOADER_CONTEXT_2026-10-04/LOADER_CONTEXT_RESULT.json), [delta](../evidence/SLICE_CONSOLE_R01_LOADER_CONTEXT_2026-10-04/CLOSURE_POLICY_DELTA_V0_1.json).

Exact Windows Bambu02.08.02.61 exe SHA7680dac4a953cb4f8a96cc2b4ad4ea0b8bfc62f937d3491256922ff24dbb8268, accepted BambuStudio.dll identity,5 MSVC/12 API-set contracts only.
No CRT/VC SxS redirect declaration in observed embedded manifests;26 exact static adjacent/redirection pointers absent. This narrows observed static configuration only. Runtime/parent loader context and BambuStudio.dll LoadLibraryExW flags/path/order remain unproven. All17 selection statuses UNRESOLVED; STATIC_BINDING_RESOLVED=false; LOADED_MODULE_VERIFIED=false.
New12 checks PASS, including4 synthetic resource/XML checks. Production runtime unchanged; existing110 not rerun.
Protected accepted policy/plan/PR45 evidence/runtime/tests/deployment, geometry/MINIL/Print GO. No new API-set parser generalization, process/trace/module enumeration, transitive graph, resource/datadir/Python/env/path closure, descriptor/generator/Console/cache/REUSE/slice/send/print.
Next one recommendation: BAMBU LAUNCHER LoadLibraryExW CALL-SITE — EXACT BINARY STATIC ANALYSIS ONLY. Proposal only, not started. If code evidence cannot resolve effective context, a bounded process-evidence proposal must return to Author before any launch.

STOP: **SLICE CONSOLE R0.1 WINDOWS MSVC/UCRT LOADER CONTEXT — AUTHOR REVIEW**
