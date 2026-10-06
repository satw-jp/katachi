# EXECUTION_ENV_FINGERPRINT v0.1 — contract + pure comparator

Branch `agent/slice-console-r0.1-execution-env-v0.1`; base `f30fac5f44efdf0d0ddacfc9e227b50c0da6285a`. PR53 was verified Draft/OPEN, mergeable, head `0b1ae1d0bdf57d2183aa7062eed2238727d1bcbf`, base `e9c033ccaac1d3190e6b929fb121ddf2582f35b5`, behind0; marked ready then normal merged with expected_head_sha fixed. Main fetched again, merge parents and accepted head ancestry verified, fresh isolated worktree created. [Merge identity](SLICE_CONSOLE_R01_EXECUTION_ENV_FINGERPRINT_V0_1_2026-10-05/MERGE_IDENTITY.json).

[B contract/API](../../tools/slice-console/EXECUTION_ENV_V0_1.md), [bounded task](../tasks/SLICE_CONSOLE_R01_EXECUTION_ENV_FINGERPRINT_V0_1.md), [fingerprint schema](../../tools/slice-console/schemas/EXECUTION_ENV_FINGERPRINT_V0_1.schema.json), [compatibility policy schema](../../tools/slice-console/schemas/EXECUTION_ENV_COMPATIBILITY_POLICY_V0_1.schema.json), [result schema](../../tools/slice-console/schemas/EXECUTION_ENV_COMPARISON_V0_1.schema.json).

Pure API: `compare_execution_env_v0_1(prior_fingerprint,current_fingerprint,compatibility_policy)` in `execution_env_v01.py`. Inputs are caller-preverified synthetic descriptors, with explicit KNOWN/MISSING/STALE/UNTRUSTED/UNKNOWN states. No actual environment collection or launch. Dictionaries and UTF-8 JSON accepted; duplicate/unknown fields, unsupported contracts and malformed values fail closed as HOLD/error.

Fingerprint has schema_version/domain/policy/coverage/observations/provenance. Ten required observations: OS family/build/architecture, BambuStudio.dll SHA, finite native candidate manifest, API-set SHA, VC/UCRT candidate fingerprints, finite Python identity and versioned inherited-environment list. Native candidates are not loaded verification. Env values are preverified nonsecret identities; unset/empty/present distinct, raw env/secret fields rejected.

Independent semantic policy exact SHA: `f1b1e98e4d74582921da2c8bc1981ec9b46c784fd82cb08d96ea30395b6660e4`. Default required coverage/hard-deny/env rules are finite; **directional rules empty**. No OS/Python/CRT upgrade permission invented. Policy human provenance/timestamps cannot enter its schema/hash. Dictionary policy uses sorted compact JSON exact bytes; byte/text policy SHA is exact supplied bytes. Caller must bind that representation and externally establish approval. An ACTIVE flag alone does not prove Author approval.

Fingerprint semantic digest omits the entire NON-KEY provenance object, normalizes finite list order and retains policy/coverage/state/value identity. PID/time/host/run/file/evidence/trace/human-note changes leave digest and class unchanged. Digests are diagnostic identity; equality alone cannot permit compatibility.

Fixed precedence: malformed/unsupported→HOLD; known hard deny→INCOMPATIBLE_ENV; observation/policy/coverage gap→UNVERIFIED_ENV; all required known/trusted/fresh equal→EXACT_WITHIN_POLICY; every difference explicitly directionally allowed→COMPATIBLE_WITHIN_POLICY; otherwise UNVERIFIED_ENV. No EXACT_ENV label or reverse/transitive inference. No returned class authorizes REUSE; result reuse_authorized=false.

[15 complete synthetic vectors](SLICE_CONSOLE_R01_EXECUTION_ENV_FINGERPRINT_V0_1_2026-10-05/SYNTHETIC_VECTORS.json):

| Vector | Expected / actual class |
|---|---|
| Known equal | EXACT_WITHIN_POLICY |
| Explicit synthetic runtime A→B | COMPATIBLE_WITHIN_POLICY |
| B→A; A→C despite A→B + B→C | UNVERIFIED_ENV |
| Architecture, OS family, companion DLL SHA mismatch | INCOMPATIBLE_ENV |
| Missing, stale, untrusted, unknown | UNVERIFIED_ENV |
| Coverage mismatch, uncovered build difference | UNVERIFIED_ENV |
| Provenance-only change | SAME digest / EXACT_WITHIN_POLICY |
| Same digest with missing observations | UNVERIFIED_ENV |

Independent [golden semantic digest](../../tools/slice-console/tests/fixtures/execution_env_v01/base.expected.json): `f60bdcae74a50deceab61a7f217a5251c53fa1f6bad50f3618ab58c1751d3949`. Golden was computed from the specified semantic JSON independently of comparator output. Explicit fixture B→C also tested; never inferred A→C. Tests verify deny precedence over gaps/allows, malformed precedence over deny and gap precedence over allowed differences.

[Full regression](SLICE_CONSOLE_R01_EXECUTION_ENV_FINGERPRINT_V0_1_2026-10-05/FULL_REGRESSION.txt): **287 PASS, 0 failure/error/skip = existing238 + new49**. Runner/app/package/startup35, Console16, IdentityLock22, A adapter37, v0.1 generator37 and v0.2 generator91 preserved. [Test results and guard counters](SLICE_CONSOLE_R01_EXECUTION_ENV_FINGERPRINT_V0_1_2026-10-05/TEST_RESULTS.json).

B comparator process/file I/O/discovery calls0 across guarded tests and saved synthetic vectors (`Popen`, `run`, `open`, `io.open`, `walk`, `scandir`, `listdir`, `stat`, `lstat` guarded). Explicit fixture loads and evidence writes occur outside pure calls. Unchanged legacy full-suite fake CLI/helpers19; real Bambu/ProcMon0. Actual registry/OS/DLL/Python collection0, real slice0, cache0, REUSE0, send0, print0, Print GO change0. Core imports only copy/hashlib/json/re.

Initial focused checks exposed duplicate-field error-code translation and a fixture policy-binding mismatch between raw/dict representations; both corrected before final pass. Guard scope is the pure call so unittest failure reporting can perform its own diagnostic reads. No product I/O allowance was added.

A production regression pin remains `SLICE_KEY/v0.2:sha256:2a930b89ef411450fa625275a8db40fef3b796a5961b704d1100232a2b9d988c`, with semantic A policy SHA `60701d2dce4352f0c76c10a27d7b7a1f636777b34b8cd2335f4b261c37f81664`. Unchanged saved A descriptor regenerates this same key via unchanged pure generator under I/O guards. No actual adapter/engine re-execution. Git content of770 preexisting files remains unchanged;71 protected tool files are also raw-byte identical to merge base. A/C policies/evidence/goldens/adapter/Runner/Console/Identity Lock are preserved. [Preservation validation](SLICE_CONSOLE_R01_EXECUTION_ENV_FINGERPRINT_V0_1_2026-10-05/VALIDATION.json).

Known limitations: synthetic descriptors only; no actual B fingerprint or collector, loader/module verification, freshness/trust discovery or proof of external policy approval. JSON schemas define machine shape; API/tests enforce additional semantic constraints. No third-party JSON Schema engine was installed or run. Finite default candidate/environment coverage is proposed for Author review, not full OS identity. Exact/compatible B alone cannot establish A equality, prior execution SUCCESS, artifact existence/integrity, audit/package state, explicit REUSE policy or Print GO. Same A key is not a claim of deterministic G-code bytes.

Changed implementation: one pure comparator, B contract, three schemas, independent default policy, three synthetic fixture files,49 tests; CURRENT front, bounded task and evidence. No A/C runtime changes. Final commit is identified by the PR head containing this report; the report is intentionally not self-hashed with an embedded future commit SHA.

Next one candidate: **WINDOWS EXECUTION_ENV_FINGERPRINT COLLECTOR + ACTUAL A1 B-FINGERPRINT**. Not started.

STOP: **SLICE CONSOLE R0.1 EXECUTION ENV FINGERPRINT v0.1 — AUTHOR REVIEW**
