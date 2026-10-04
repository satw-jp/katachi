# Windows Bambu MSVC / UCRT binding evidence — 2026-10-04
Decision owner: Author. **INCOMPLETE / HOLD**. Bounded outcome B complete; Author review pending.

## Authority and preservation
PR #44 was Draft/OPEN, mergeable, head32c0411714de254e499371566ed1b423aa645156, base main6997bd185b20839f2e63721c1ed3f45bb1a2343a, behind0 (rev-list1/0). Ready then expected-head normal merge. Fetched main/base6b5df19b0a2adc10f032a1ff0f6f58caad972bcf has parents6997bd1 and32c0411. New isolated branch `agent/slice-console-r0.1-msvc-ucrt-binding`; previous branch/worktree and installed source preserved.
Exact exe SHA7680dac4a953cb4f8a96cc2b4ad4ea0b8bfc62f937d3491256922ff24dbb8268 rechecked, version02.08.02.61. BambuStudio.dll SHA matches accepted receipt. Scope is Windows/Runner0.2.0/A1 0.4 single-filament configuration reference, no route execution claim.

## Fixed import scope
[SCOPE_MANIFEST](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/SCOPE_MANIFEST.json) derives only names from accepted two-module PE observation with exact source digest and importing-module/table provenance. Five MSVC + twelve API-set names; no other native graph inspected.
- `CONCRT140.dll`
- `MSVCP140.dll`
- `MSVCP140_CODECVT_IDS.dll`
- `VCRUNTIME140.dll`
- `VCRUNTIME140_1.dll`
- `api-ms-win-crt-convert-l1-1-0.dll`
- `api-ms-win-crt-environment-l1-1-0.dll`
- `api-ms-win-crt-filesystem-l1-1-0.dll`
- `api-ms-win-crt-heap-l1-1-0.dll`
- `api-ms-win-crt-locale-l1-1-0.dll`
- `api-ms-win-crt-math-l1-1-0.dll`
- `api-ms-win-crt-multibyte-l1-1-0.dll`
- `api-ms-win-crt-runtime-l1-1-0.dll`
- `api-ms-win-crt-stdio-l1-1-0.dll`
- `api-ms-win-crt-string-l1-1-0.dll`
- `api-ms-win-crt-time-l1-1-0.dll`
- `api-ms-win-crt-utility-l1-1-0.dll`

## Candidate file identities
All table paths are `C:/Windows/System32/<name>`. Versions are FileVersionInfo snapshots, not provenance or selected-load proof. Five MSVC candidates share version14.50.35719.0; VC x64 registry reports installed1/v14.50.35719.00. Registry version alone does not bind files to Bambu.

| Candidate | Bytes | File version | Architecture | SHA256 |
|---|---:|---|---|---|
| MSVCP140.dll | 553552 | 14.50.35719.0 | AMD64 | `def46aa6a8f72f27bafac0c43334419486a4d1dcdb6c479a8ef7034b3e1fa4cb` |
| MSVCP140_CODECVT_IDS.dll | 31392 | 14.50.35719.0 | AMD64 | `ae8d922b00cdd93e3ebecc37beb46c800f383ebdeb9f9e5b84e04a72428b6fb3` |
| VCRUNTIME140.dll | 123472 | 14.50.35719.0 | AMD64 | `184146852727a9db4eea06178716bec3cdbb1015c911f6b0f915b184ad7775b2` |
| VCRUNTIME140_1.dll | 47264 | 14.50.35719.0 | AMD64 | `e6bfb3662ab4b1969a73441dbe35c96d51441b6bff8cf1fe7430bd5b246ca605` |
| CONCRT140.dll | 321696 | 14.50.35719.0 | AMD64 | `b2faf3b85b23c840b654e57d5497a0ad31acd02fb01856cad4725a1715d5f78e` |
| ucrtbase.dll | 1377512 | 10.0.26100.9444 (WinBuild.160101.0800) | AMD64 | `5c52e3a303baaac0e0af8bd9b96134993da34bc9d834a31ef37e1d2cdc7fe192` |

[Candidate identities](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/CANDIDATE_IDENTITIES.json) records exact paths, existence, bytes/SHA, PE header, version, stable read for9 files (2 target rechecks,5 MSVC,1 UCRT host,1 schema). Six adjacent candidates are absent. No installed VC tree or Windows-wide DLL inventory was crawled. System32 files are installed-runtime candidates; no additional redistributable cache is inferred.

## API-set mapping
Read-only `C:/Windows/System32/apisetschema.dll` PE .apiset v6:194016bytes, SHA391a2818fdef14f4a9b6e6ce2a7e7f01d04f943de9ef543ec683927cfe480889, version10.0.26100.9278, AMD64. Namespace size171104/flags0/984 entries; only12 scoped matches retained. All have one empty-importer-alias default value `ucrtbase.dll`, with entry offsets recorded in [schema evidence](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/API_SET_SCHEMA_OBSERVATION.json). This host name comes from local bytes, not a filename guess. Format layout follows [System Informer phnt primary header](https://github.com/winsiderss/phnt/blob/master/ntpebteb.h) observed2026-10-04; private format, v6 only, unsupported versions/ranges reject.
On-disk schema mapping is proven for these bytes; effective process namespace/host binding is not established. `API_SET_BINDING=UNRESOLVED`. No same-name API-set file is treated as implementation. [Microsoft API-set loader operation](https://learn.microsoft.com/en-us/windows/win32/apiindex/api-set-loader-operation) explains contract/schema/host distinction; host exports and per-function binding were outside this name-level observation.

## Static loader reasoning and blocker
[Platform metadata](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/PLATFORM_METADATA.json): helper/OS64-bit, both Bambu target images and candidates AMD64. No WOW64 redirection experiment; native System32 candidate is architecture-consistent. [Microsoft filesystem redirector](https://learn.microsoft.com/en-us/windows/win32/winprog64/file-system-redirector).
Limited HKLM Session Manager KnownDLLs values were read for5 MSVC names plus the schema-derived UCRT host; no matching values. This is registry evidence only, not inspection of the boot-time KnownDll object namespace. Adjacent runtime files and two external module manifests were absent. Embedded activation contexts, redirection, package/search configuration and dynamic BambuStudio.dll load flags remain unproven.
Under an assumed ordinary unpackaged/default search, application directory precedes System32 after loader redirection/API-set/SxS/loaded-module/KnownDLL handling. Adjacent absence makes observed System32 files plausible candidates, but does not prove that assumption for this engine. Changed search flags/AddDllDirectory/SetDllDirectory or module load context can alter selection. [Microsoft DLL search order](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order). [Microsoft VC redistribution](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170) distinguishes central/local deployment; existence is not engine binding.

Every [binding result](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/BINDING_RESULT.json) is UNRESOLVED with candidates/evidence/blocker. API rows retain RESOLVED_LOGICAL_HOST only as on-disk-schema logical mapping; physical RESOLVED_PATH/SHA256/VERSION/ARCH are null. Their candidate identities remain available separately. `STATIC_BINDING_RESOLVED=false`, `LOADED_MODULE_VERIFIED=false`. PE name, physical filename, contract, logical host and loaded module are distinct.

## Policy / Identity Lock delta
[New observation delta](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/CLOSURE_POLICY_DELTA_V0_1.json) references exact accepted policy/plan digests; it is an additive review artifact, not a replacement complete policy. Accepted policy SHA0e723c91813e0c126f43852bf8bf25faf358d66e42e032fa10c4792b520e8af3 preserved. No lock entries or receipts modified; no key generated. Overall CLOSURE_STATUS INCOMPLETE, verifiedfalse. Remaining other native graph/resource inheritance/datadir/Python/env/path gaps retained.

## Checks and action counts
New evidence checks:11 PASS/0 FAIL, including4 synthetic v6 parser checks, scope extraction,9 file rehashes, AMD64,12 mapping rows, held result/action zeros and accepted-policy digest. [CHECK_RESULTS](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/CHECK_RESULTS.json), [exact artifact digests](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/ARTIFACT_DIGESTS.json). One-shot observation/verification helpers are evidence tools only, never import or load native images; no production runtime changes. Source and accepted evidence Git diff checked separately before commit. Version metadata collected with Get-Item VersionInfo; registry reads Get-Item/Get-ItemProperty only. Helpers require the archived PLATFORM_METADATA and scope authority; they are not a general discovery API.
Existing110 tests NOT RERUN because runtime is unchanged; PR44's110 PASS is historical, not new test evidence. Bambu process/GUI/help/info/dummy/slice0; descriptor/cache/REUSE0; geometry/MINIL/send/print/Print GO change0. No process/module trace or environment/resource/path closure work.

## Next one task and stop
**WINDOWS BAMBU MSVC/UCRT LOADER CONTEXT — STATIC ACTIVATION/SEARCH CONFIGURATION ONLY**: one remaining blocker, determine whether bounded manifest/redirection/search-flag evidence can support a unique selection without process launch. Not started. Native transitive DLL task remains gated; descriptor/cache not advanced.

STOP: **SLICE CONSOLE R0.1 WINDOWS MSVC/UCRT BINDING — AUTHOR REVIEW**
