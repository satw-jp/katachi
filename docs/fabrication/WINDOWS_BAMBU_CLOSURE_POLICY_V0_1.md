# Windows Bambu02.08.02.61 — closure policy v0.1
Status: **INCOMPLETE**, bounded policy/review artifact, not executable routing logic.
[Machine-readable policy](../../tools/slice-console/policies/ENGINE_RESOURCE_CLOSURE_POLICY_V0_1.json) and [actual lock plan](../../tools/slice-console/policies/WINDOWS_BAMBU_02080261_LOCK_PLAN.json).

## Target and actual boundary
Windows installed `J:/Program Files/Bambu Studio/bambu-studio.exe`, FileVersionInfo02.08.02.61, PE32+/AMD64; Runner0.2.0 deployed source matches merged main. No executable/GUI/slice launch. File version metadata does not prove binary provenance/build commit, actual running version or loaded DLLs.

Configured reference is operational clean_mesh_box job schema0.2 with A1/0.4, single-filament mesh argv: explicit datadir/printer+process/filament profiles, mapping1/0/0, assemble/ensure-on-bed/arrange0/orient0/slice0 and output settings/destination. Existing runbook bounds the known route; sample itself is not newly executed or proof of current job selection.
D22 sample is legacy0.1 with placeholder argv and C:/ engine pointer: not converted, not substituted. Historic native_recovery path is absent. Mac/M4, mini/multi-material, Orca and other engine versions remain outside this policy.

## Dependency classifications
| Class | Items | Evidence and bound |
|---|---|---|
| REQUIRED | Exact exe | Configured exact pointer, measured SHA/size/version/PE metadata |
| REQUIRED, conservative | BambuStudio.dll | Exe contains its literal name; adjacent large native module has static imports; actual dynamic binding still unresolved |
| REQUIRED, conservative | libgmp-10.dll / libmpfr-4.dll | Direct names in BambuStudio.dll import table; chosen adjacent bytes pinned, loaded identities/call relevance not proven |
| REQUIRED | cli_config.json | Existing route documents CLI6000 cap; selected installed file matches archived SHA and values |
| REQUIRED | job.py / runner.py / progress.py | Actual Runner import/call sites; operational hashes match main |
| REQUIRED, separate domain | Explicit printer/process/filament bytes | SLICE_KEY profiles identity; not duplicated as resource entries |
| UNRESOLVED | Remaining CRT/system/API-set/adjacent/transitive/dynamic DLLs | Static names alone cannot establish loaded bindings/full closure |
| UNRESOLVED | Installed A1 defaults/inheritance/templates | A1 profile declares fdm_bbl_3dp_001_common; explicit flat profiles still contain default profile names; actual fallback selection unproven |
| UNRESOLVED | Effective datadir/config/user discovery | Configured datadir shallow listing contains only .gitkeep; not proof discovery is disabled |
| UNRESOLVED | Python executable/runtime/stdlib/extensions/launcher | Known shortcut target is a0-byte WindowsApps reparse alias; no actual runtime resolved or launched |
| EVIDENCE-BACKED INERT, narrowly scoped | progress format_duration/format_remaining in direct SliceRunner graph | Not called by Runner; no whole-file exemption (progress.py still required) |
| UNRESOLVED | Other installed GUI/media/locale/config/plugin assets | No evidence sufficient to omit them from engine closure as inert |

Only2 explicitly named PE files were inspected; normal/delay import **names**, not transitive graph traversal or a runtime module list. Imported name sets are retained in evidence. Exe import table does not directly list BambuStudio.dll; its literal reference motivates conservative inclusion, not proof of loader behavior. Delay tables yielded no entries; this does not rule out dynamic imports.
Windows DLL bindings depend on loader context, so static names are insufficient for completeness. Primary references: [Microsoft PE format](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format) and [DLL search order](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order). These explain inspection limits, not Bambu-specific consumption.

## Environment classifications
| Variables | Class | Bound |
|---|---|---|
| PATH | INCLUDE_VALUE conservatively | Potential DLL/discovery binding; effective lookup/normalization unresolved |
| TEMP/TMP | INCLUDE_VALUE conservatively | Requested environment identity; temp path semantics not proven safe |
| Named OMP/TBB/MKL/OpenBLAS thread controls | INCLUDE_VALUE conservatively | Do not assume irrelevant; exact engine consumption unproven |
| cli.env[*] | INCLUDE_VALUE with safe-secret gate | Runner overlays resolved explicit strings; sample has no override |
| LANG/LC_ALL/LC_CTYPE | UNRESOLVED | Exact locale/config interpretation unmeasured |
| HOME/USERPROFILE/APPDATA/LOCALAPPDATA | UNRESOLVED | Config/resource discovery not bounded |
| Python import/encoding/hash env and candidate Bambu config names | UNRESOLVED | Names are classification candidates, not proof they are consumed |
| All other inherited variables | UNRESOLVED | No closed inert allowlist |

No semantic INCLUDE_STATE_ONLY or environment EVIDENCE_BACKED_INERT rule is established. Evidence contains presence/absence **only for selected names in analysis helper**, not values, lengths or whole-env dumps. That diagnostic state is not claimed to be Runner's effective environment or sufficient key material. Future semantic secret handling unresolved -> HOLD.

## Path semantics
Engine relocation, datadir relocation, cwd, TEMP/TMP, profile/input physical paths and output destinations are all **UNRESOLVED** for exact current installed route. Source shows explicit cwd/env/argv handling, not engine filesystem semantics. Generic content-binding/output-neutralization remains a design candidate conditional on complete route evidence; no relocation execution or key equivalence claim.

## Actual plan and receipts
10 explicitly enumerated files:
- Engine: actual exe.
- Resources: BambuStudio.dll, libgmp-10.dll, libmpfr-4.dll, cli_config.json, installed A1/0.4 machine JSON, its directly named common parent JSON.
- Backend: actual deployed job.py/runner.py/progress.py.

Default files in resources are candidates observed/pinned as files; explicit job profiles are separately observed in ROUTE_OBSERVATION, not resource entries. No full datadir, Program Files tree, stdlib set or automatic dependency resolver.
Every group uses policy artifact SHA from **exact UTF-8 file bytes**, status INCOMPLETE and path_semantics UNRESOLVED. Full unresolved list retained; incomplete items are not deleted to obtain COMPLETE.
Build/verify under unchanged Identity Lock v0: all10 files rehashed/matched, FILES_STATUS VERIFIED, CLOSURE_STATUS INCOMPLETE, overall HOLD, verified false, usable identity/key absent. Partial identities are diagnostic only. Receipt timestamps/provenance remain installation-specific, not a complete immutable snapshot.

## Unresolved exact items / next1 task
1. Exact Windows MSVC/CRT/API-set loaded binding identities/search configuration.
2. Remaining transitive/dynamic BambuStudio.dll dependency set.
3. Actual resource/default/template inheritance and fallback selection.
4. Effective datadir/user config discovery and current execution/job binding.
5. Actual WindowsApps Python runtime/stdlib/native-extension/import closure.
6. Closed effective inherited env and safe semantic-secret policy.
7. Exact physical path/basename/cwd/TEMP/output semantics.

Next1 candidate: **WINDOWS BAMBU MSVC / UCRT BINDING CLOSURE**, scoped to the MSVC/CRT names in the2 observed PE import tables and exact loaded/search binding evidence; no entire DLL graph/engine discovery generalization. This closes one gap before descriptor builder. No task started; cache stays later.

STOP: **SLICE CONSOLE R0.1 CLOSURE POLICY — AUTHOR REVIEW**
