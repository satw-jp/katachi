# Slice Console R0.1 — BambuStudio.dll load call-site static analysis
Decision owner: Author. Status: bounded task complete, static load intent **RESOLVED**, complete call-site/runtime context **INCOMPLETE / HOLD**, Author review pending.
Base: PR46 expected-head normal merge `d4d240f855540b045b733dcbea0f277a8b71abc4`.
Isolated branch `agent/slice-console-r0.1-dll-load-callsite`.

## Definition of Done
1. Verify PR46 exact head/base/Draft/OPEN/mergeable/behind0; Ready and expected-head normal merge.
2. Fetch main; new isolated worktree; preserve previous branch/installation/accepted evidence.
3. Exact exe SHA; loader API import/IAT and bounded xref enumeration.
4. Only BambuStudio.dll-connected instruction flow: API/path/flags/control-flow/search-mutation limits.
5. Machine-readable result/delta, new checks, no binding/initial-loader promotion.
6. Draft PR and Author review STOP, Bambu launch0, no next task.

[Evidence](../evidence/SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04.md), [call-site result](../evidence/SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04/CALLSITE_RESULT.json), [delta](../evidence/SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04/CLOSURE_POLICY_DELTA_V0_1.json).
Exact `J:/Program Files/Bambu Studio/bambu-studio.exe`, SHA7680dac4a953cb4f8a96cc2b4ad4ea0b8bfc62f937d3491256922ff24dbb8268. Windows Bambu02.08.02.61 only; no source-build identity substitution.
RVA0x5660 directly calls LoadLibraryExW through IAT0x8030 with constructed current-exe-directory+BambuStudio.dll buffer, NULL hFile/flags0. Concrete runtime path, complete preceding search mutation and selected module remain unproven. Startup static-import phase stays independently UNRESOLVED. BAMBUSTUDIO_DLL_STATIC_LOAD_INTENT=RESOLVED is local instruction-level request expression only; CALLSITE_STATUS=INCOMPLETE, STATIC_BINDING_RESOLVED=false, LOADED_MODULE_VERIFIED=false.
New10 evidence checks PASS; runtime unchanged, existing110 not rerun.
Protected accepted PR46 result/all17 scope/policy/plan/Identity Lock/runtime/tests/deployment/geometry/Print GO. No target launch/debugger/suspended launch/trace/ProcMon/module enumeration, other DLL deep analysis, native graph, resource/datadir/Python/env closure, descriptor/generator/Console/cache/REUSE/slice/send/print.
Next one recommendation: AUTHOR STARTUP LOADER EVIDENCE DECISION — review sufficient static intent versus a separately scoped startup/process-evidence proposal. No process authorization or next task follows automatically.

STOP: **SLICE CONSOLE R0.1 BAMBUSTUDIO DLL LOAD CALL-SITE — AUTHOR REVIEW**
