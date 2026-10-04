# SLICE_KEY v0.2 request generator — evidence
Status: **AUTHOR REVIEW**, no self-acceptance. Decision owner: Author.

PR48 immediately verified Draft/OPEN/mergeable, exact head `420edff8023263b5f5af1733f656404785db23c9`, base main `f55a0b8180af5fa7809bc1649c3a5ad5524f7f2b`, fetched behind0, old branch clean. Ready then normal merge with expected_head_sha fixed; merge `029d0fa492fbb559ee5921b05f5a1d22a4f194f9`. PR48 confirmed MERGED; fetched main parents are old main and accepted head. New isolated `agent/slice-console-r0.1-request-key-v02`, no work added to PR48 branch.

[API/schema](../../tools/slice-console/SLICE_KEY_V02_GENERATOR.md), [task](../tasks/SLICE_CONSOLE_R01_REQUEST_KEY_V02.md), [all test/process records + protected byte hashes](SLICE_CONSOLE_R01_REQUEST_KEY_V02_2026-10-04/TEST_RESULTS.json).

## Implementation / evidence boundary
Explicit `slice_key_v02.generate_request_key_v0_2(descriptor)` only. No old default switch/dispatch/fallback/migration. Separate version-local canonicalization and A validator; existing module unchanged. COMPLETE proves declared requested FULL_SLICE identity only. Trusted caller A assertions, policy-bound selected role and neutral output rule are not fresh file verification, policy approval or full runtime compatibility. Unknown/unclassified critical fields produce HOLD/INCOMPLETE with key/digests/tree/bytes null.

Canonical tree contains exact request inputs/order/format/transforms/semantics, profiles/mappings/nozzle/material, exe SHA/version, reviewed finite backend manifest plus explicit custom dependencies, contracts/policies, selected request config, semantic argv/order/repeats, exact opaque cwd/path and semantic env overrides. Excludes B/C observations and non-key references/metadata. No normalization/relocation inference; only bound output-only rule excludes physical destination.

## Independent golden triples
[Oracle](../../tools/slice-console/tests/build_v02_goldens.py) never imports either generator; independently declared normalized descriptor uses standard JSON serialization/control escape adaptation. Fixtures have explicit [synthetic selected/requested coverage](../../tools/slice-console/tests/fixtures/slice_key_v02/SYNTHETIC_COVERAGE.md), not production observations.

| Golden | Canonical bytes | SHA256 / full key suffix |
|---|---:|---|
|base|4837|b077e6e74c8a3a6f007955452ffe138ab642e9b050ed231b202185ed1f09e198|
|unicode / opaque path|4858|096eb240318b45415c2bde501e8a5e4a7e96318197d5979b18cc254e0c2afd09|

Each full key is `SLICE_KEY/v0.2:sha256:<above SHA>`; descriptor/canonical bytes/expected SHA+key are separate files. Golden bytes have no BOM/trailing newline. Re-running independent oracle reproduced both hashes. Old v0.1 six fixture files compared byte-for-byte with untouched PR48 checkout, unchanged; protected SHA records also cover slice_key.py, identity_lock.py, job.py, runner.py, progress.py and Console. Git diff scope confirms existing runtime/tests/contracts/policies/forensic evidence unchanged.

## Tests / launch counts
Full unittest discovery on Python3.12.14 Windows: **201 PASS, 0 FAIL, 0 ERROR, 0 SKIP** = existing110 + new91. Existing v0.1 37, Identity Lock22, Console16, Runner24, package2, app4, startup5 all pass (existing total110). New vectors individually recorded in TEST_RESULTS.json.

DIFFERENT: exact input SHA/order, placement/intended transform, assembly/modifier/enforcer/authored support/fixture, printer/process/filaments/auxiliary, all mappings/nozzle/material/map mode, semantic argv/repeat/env, exe SHA/version, backend SHA, request policy SHA/version, selected resource SHA, opaque path/cwd. SAME: request ID/time/GUI label/run/artifact/B/C pointers; source evidence location and approved output destination metadata; member/set ordering and equivalent decimals. INCOMPLETE: missing A/false attestation, unknown semantics/classification, candidate resource/invalid selection or output policy binding, missing backend/custom coverage, float/null/bool/nonfinite numeric, duplicate JSON member, surrogate, unbound references, hidden B/C objects and mixed/legacy namespaces. v0.1 descriptor rejected by v0.2 and vice versa; full namespaces never equated by bare SHA.

All91 new generator tests forbid builtins.open/io.open/os.walk/os.scandir/os.listdir/subprocess.Popen/run during calls; zero calls asserted (fixture load precedes guards). New generator process/discovery/engine0. Existing regression fake CLI18; separate temporary shortcut helper PowerShell1. No other process was allowed by regression guard. Per-test successful launch counts are recorded. These fake regression counts are not real engine evidence.

Bambu process0; additional loader forensic0; environment compatibility implementation0; cache0; REUSE0; real slice0; printer send0; print0; geometry/MINIL/Print GO changes0.

## Review / limitations / FOLLOW-UP
Bounded manual review: **pass for DoD submission**, subject to Author acceptance. Checked root/member closure, separate version/API, A attestations, role/policy binding, opaque path retention, no I/O imports, null incomplete result, independent goldens and unchanged protected files. No implementation blocker remains. Production coverage/actual caller assertions are unverified by this pure synthetic task. COMPLETE does not authorize cache lookup integration or reuse and cannot verify referenced metadata. Canonical bytes need explicit encoding in a future transport; no transport implementation added. No inherited host env or loader evidence claim.

FOLLOW-UP / exact next candidate: **WINDOWS A1/0.4 REQUEST_IDENTITY COVERAGE POLICY + ACTUAL DESCRIPTOR ADAPTER**. Requires separate Author authorization; not started. B collector/evaluator/cache/REUSE follow later. Retained PR44–47 forensic lane remains CHECKPOINT/HOLD.

STOP: **SLICE CONSOLE R0.1 SLICE_KEY v0.2 REQUEST GENERATOR — AUTHOR REVIEW**
