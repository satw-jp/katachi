# BambuStudio.dll load call-site static analysis — 2026-10-04
Decision owner: Author. Static DLL load request expression **RESOLVED**; full context **INCOMPLETE / HOLD**, Author review pending.

## Authority / method
PR46 premerge actual Draft/OPEN/mergeable, head5e8c35999cde995c2dbb4a83e520889f4653f135, base main02d1f9a4da55bc05cf72431ccaeabe703289bb1d, behind0 (rev-list1/0). Ready then expected-head normal merge `d4d240f855540b045b733dcbea0f277a8b71abc4`; fetched main parents02d1f9a and5e8c359. New isolated `agent/slice-console-r0.1-dll-load-callsite`; prior branches/dirty or unpushed work not modified.
Exact exe159776bytes, SHA7680dac4a953cb4f8a96cc2b4ad4ea0b8bfc62f937d3491256922ff24dbb8268, AMD64/PE32+, preferred ImageBase0x140000000. RVAs/file offsets avoid ASLR address assumptions. BambuStudio.dll binary itself is not disassembled in this task.
Tool: Python3.12.14 and [Capstone5.0.6](https://pypi.org/project/capstone/5.0.6/), prepared only in sibling work/static-analysis-deps. Tool binding and disassembler library hashes/path recorded in [STATIC_XREF_OBSERVATION](SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04/STATIC_XREF_OBSERVATION.json). Read-only file bytes; no target native image mapping/execution, decompiler, debugger, source-build correspondence claim or DLL graph. [Capstone primary usage documentation](https://www.capstone-engine.org/lang_python.html).
Custom bounded PE parser reuses accepted evidence helper for file/RVA conversion; normal import INT/IAT identities parsed. Executable .text25442bytes linear decoded7716 instructions/skipdata0, supplemented at PE .pdata function anchors. Only loader-IAT/string xrefs persisted, and one connected fragment plus required path prefix deepened. This is direct static xref coverage, not proof of all possible dynamically resolved/indirect calls.

## Import/IAT and xref inventory
| API | IAT RVA / file offset | INT RVA | Direct decoded references |
|---|---|---|---|
|LoadLibraryExW|0x8030 /0x6830|0xa728|calls0x45fc,0x55db,0x5660; import jump thunk0x5789|
|GetProcAddress|0x8028 /0x6828|0xa720|calls0x4640,0x4657,0x466e,0x4685,0x56bb; import jump thunk0x5783|
|LoadLibraryW|Not imported|Not applicable|No matching direct imported reference|
|LoadLibraryA|Not imported|Not applicable|No matching direct imported reference|

Ten IAT references enumerated; no direct immediate callers of the two jump thunks in decoded bytes. No IAT-pointer reference was promoted to a call. Arbitrary indirect/register/computed targets remain unproven. Other DLL sites only enumerated, not deep analyzed. Same-function site0x55db uses separate buffer[rbp+0x2c0]/different literal-source addresses and is excluded from BambuStudio.dll-connected result.
Literal UTF16 BambuStudio.dll is at RVA0x8868/file0x7068;32bytes include NUL. Two ASCII occurrences at0x8888 and0x88ff are not assumed loader arguments. Exact literal-start xrefs0x563f (UTF16 data copy) and0x5673 (ASCII diagnostic). A data-flow trace, not string proximity, links the UTF16 bytes to0x5660.

## Relevant call-site and path construction
**LoadLibraryExW call RVA0x5660/file0x4a60**, bytes `ff15ca290000`. RIP calculation0x5660+6+0x29ca=IAT0x8030, naming KERNEL32.dll!LoadLibraryExW in exact INT. [Windows x64 calling convention](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention?view=msvc-170) assigns first integer/pointer arguments RCX/RDX/R8.

| Stage | Instruction/API evidence | Result supported |
|---|---|---|
|Current module path|0x5492 R8D0x104,0x5498 RDX[rbp+0xb0],0x549f ECX0,0x54a1 call IAT0x8018 GetModuleFileNameW|Requests current executable filename,260 WCHAR capacity; actual return/output not observed|
|Split|0x54cf call IAT0x8208 _wsplitpath|path[rbp+0xb0], drive[rbp+0xa0], dir[rbp+0x6e0], fname[rbp+0xae0], ext[rbp+0x8e0]|
|Directory-only composition|0x54f2 call IAT0x8210 _wmakepath; R9D0 and stack ext0|Destination[rbp+0xb0] from drive+dir with no filename/extension|
|Copy directory|0x5610..0x5627 UTF16 loop|Copies directory including NUL to[rbp+0x4d0]|
|Append DLL literal|0x5629..0x563d terminator scan;0x563f/0x564b read0x8868/0x8878;0x5659/0x565c write two16byte chunks|Appends exact BambuStudio.dll +NUL at directory terminator|
|API arguments|0x5646 XOR R8D,R8D;0x5649 XOR EDX,EDX;0x5652 LEA RCX,[rbp+0x4d0]; no intervening call|lpLibFileName=constructed buffer; hFileNULL; dwFlags0|

Path expression: `directory(GetModuleFileNameW(NULL,...)) + "BambuStudio.dll"`. It is constructed from the current executable's directory, not a bare literal passed directly or hardcoded J:/ installation path. Absolute app-dir form is conditional on successful/untruncated module filename and ordinary helper outcomes. GetModuleFileNameW return is not checked in the shown path. No guessed concrete runtime string, failure/truncation result, path normalization or relocation equivalence. [GetModuleFileNameW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-getmodulefilenamew), [_wsplitpath](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/splitpath-wsplitpath?view=msvc-170), [_wmakepath](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/makepath-wmakepath?view=msvc-170).
Flags exact local value **0x00000000**: no explicit LOAD_LIBRARY_SEARCH_* or LOAD_WITH_ALTERED_SEARCH_PATH bits. [LoadLibraryExW documentation](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexw) describes zero flags as ordinary LoadLibrary behavior; this does not prove that process search state is default or that an absolute top-level path pins dependency DLL identities.

## Control flow and preceding mutation limit
Relevant .pdata fragment0x550e..0x570b has chained unwind info0x9614 ->0x95a0 ->root0x9588/function0x5120. Required prefix0x547e..0x550e captured separately.0x5508 can skip optional earlier preload to0x55f9; continuing routes converge through directory copy/argument assignment to0x5660. Direct branch edges into the bounded region are archived; indirect entry/reachability is not claimed globally closed.
Successful returned HMODULE branch0x5669 ->0x56b1 sets RDX to ASCII `bambustu_main` atRVA0x88b8 and RCX to returned handle; GetProcAddress call0x56bb/file0x4abb. Its returned pointer is subsequently called indirectly at0x56e8. This proves requested export-name intent only, not actual export/function address or successful execution. Failure route uses GetLastError/error reporting.
No direct normal imports named SetDllDirectoryA/W, AddDllDirectory, SetDefaultDllDirectories or SetCurrentDirectoryA/W were observed in exe. No direct such mutation in shown path. This is **not** a global absence proof: earlier helpers, optional other module load0x55db, callbacks/initializers, dynamically resolved functions and parent/startup search state remain unclosed. No other DLL reverse engineering was undertaken.

## Result and preservation
[CALLSITE_RESULT](SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04/CALLSITE_RESULT.json) records all requested fields, exact call/API/arguments/path/flags/control flow/confidence/blockers.
`BAMBUSTUDIO_DLL_STATIC_LOAD_INTENT=RESOLVED` means this observed instruction-level request expression/API/flags are resolved. `CALLSITE_STATUS=INCOMPLETE` retains unknown runtime path outcomes and complete preceding search context. `PHYSICAL_MODULE_BINDING=UNRESOLVED`; `STATIC_BINDING_RESOLVED=false`; `LOADED_MODULE_VERIFIED=false`. Overall HOLD/closure INCOMPLETE/verifiedfalse.
**Later BambuStudio.dll loading is distinct from exe startup static imports.** Parent/startup-loader state for the latter remains an independent blocker; no MSVC/UCRT binding or PR46 result is promoted by this call-site.
[ACCEPTED_AUTHORITY](SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04/ACCEPTED_AUTHORITY.json) pins accepted PR46 result/scope Git bytes. [Additive delta](SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04/CLOSURE_POLICY_DELTA_V0_1.json) adds only load intent/path/flags and remaining runtime state. Accepted policy SHA0e723c91813e0c126f43852bf8bf25faf358d66e42e032fa10c4792b520e8af3, plan/Identity Lock/17 import results/runtime/deployment preserved. Other unresolved closures untouched; no usable identity/key or descriptor integration.

## Checks / counts / next gate
New10 evidence checks PASS/0 FAIL: exact SHA; IAT/INT;10 xref bytes; UTF16/string xref; call displacement; path API/register flow; flags0/NULL with no intervening call; fail-closed boundaries; accepted result/policy/plan unchanged; loadedfalse/actions0. [CHECK_RESULTS](SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04/CHECK_RESULTS.json), [artifact digests](SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04/ARTIFACT_DIGESTS.json). These are static evidence checks, not runtime behavior tests. Git-stored artifact digest and protected-source preservation checked before commit. Existing110 tests NOT RERUN because runtime unchanged; historical PR44 result separate. Helpers use exact accepted PE helper; reproduce only in scratch copy with pinned Capstone; no native target load.
Bambu process/suspended/debugger/ProcMon/loader trace/module enumeration/slice0. Descriptor/generator/Console/cache/REUSE0; geometry/MINIL/send/print/Print GO change0.
Next one recommendation: **AUTHOR STARTUP LOADER EVIDENCE DECISION** — Author reviews whether static request intent is sufficient and whether to separately scope startup-loader evidence or authorize bounded process evidence. Proposal only; no launch, trace or native graph/descriptor/cache task starts automatically.

STOP: **SLICE CONSOLE R0.1 BAMBUSTUDIO DLL LOAD CALL-SITE — AUTHOR REVIEW**
