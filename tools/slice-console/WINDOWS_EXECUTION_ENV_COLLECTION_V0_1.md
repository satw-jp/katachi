# Windows A1 execution environment collection v0.1

API: `execution_env_windows_a1.collect_windows_a1_execution_env_v0_1()`; no caller policy/locator/self-certification override. Read-only pinned finite declarations. It returns valid B fingerprint and observation evidence, not comparison/reuse authorization. `COLLECTOR_STATUS=COMPLETE` includes explicit MISSING/UNTRUSTED/UNKNOWN gaps; `INCOMPLETE` has null fingerprint if declaration/document cannot be verified.

Pins: [collection policy](policies/WINDOWS_A1_EXECUTION_ENV_COLLECTION_POLICY_V0_1.json), [accepted compatibility policy](policies/EXECUTION_ENV_COMPATIBILITY_POLICY_V0_1.json), [stdlib distribution policy](policies/PYTHON_EXECUTION_DISTRIBUTION_POLICY_V0_1.json). Exact raw bytes are verified before consumption. Collection/source/run/path evidence is NON-KEY. Distribution fingerprint is SHA256 of sorted compact UTF-8 distribution policy JSON; Python binary/version separately bound, unrelated packages ignored.

Windows OS/build uses os.name plus sys.getwindowsversion; native architecture GetNativeSystemInfo finite map. Stream file candidates at1MiB/chunk,512MiB maximum; path/handle stat before/after, fresh SHA/size, links/reparse/changed reads untrusted, missing MISSING. Native candidates only fixed System32 ucrtbase.dll/vcruntime140.dll/apisetschema.dll; no fallback or loaded-module claim. BambuStudio.dll opened as bytes only. Exact engine executable SHA guards route without adding A fields to B.

Operational Python requires both declared shortcuts to match exact app/cwd/arguments, same regular target, stable executable and Python/PSF version-resource metadata. ShellLink Load/Get only, no Resolve/Save/launch. Missing/ambiguous/reparse/unknown version stays UNTRUSTED; collector runtime is not substituted. No alias/package search. Inherited env reads six approved names only, exact UTF-8 hashes; current collector candidates remain UNTRUSTED because production Runner context is not bound. No public flag can upgrade this assertion.

Caller separately passes fingerprint twice and exact compatibility policy bytes to unchanged compare_execution_env_v0_1. KNOWN-all self gives EXACT_WITHIN_POLICY; any gap gives UNVERIFIED_ENV, even same digest. reuse_authorized=false. Evidence writer and comparator run outside collector, no current-history backfill.

[Bounded task](../../docs/tasks/SLICE_CONSOLE_R01_WINDOWS_ACTUAL_EXECUTION_ENV.md), [actual review evidence/accounting/limits](../../docs/evidence/SLICE_CONSOLE_R01_WINDOWS_ACTUAL_EXECUTION_ENV_2026-10-06.md), [tests](tests/test_execution_env_windows_a1.py).
