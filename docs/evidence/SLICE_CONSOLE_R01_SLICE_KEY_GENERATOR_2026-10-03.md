# SLICE_KEY generator evidence — 2026-10-03
Status: bounded implementation verification PASS; Author acceptance pending.

## Merge / authority / preservation
PR #41 actual Draft/OPEN/mergeable/base main/head `5d24467e99413bf0a74e98f2280c526f327ee544`; base `2341bc8a952115a826956b970e6de2f98eeb57dd`; fetched comparison behind0/ahead1. Marked Ready then normal merge with exact expected_head_sha. [PR #41](https://github.com/satw-jp/katachi/pull/41) confirmed MERGED. Fetched main `ab09232526b2190ad3dda970d9e8d4fb04e6d103` parents are prior main and accepted head; accepted contract exists.

New isolated branch `agent/slice-console-r0.1-slice-key-generator` at that main. Prior contract checkout clean before start and not changed. Read merged AGENTS, TEAM_PROTOCOL, CURRENT, accepted contract, actual job/runner and slice_console package. No rewrite of prior contract.

## Implementation review against DoD
Independent pure slice_key.py imports only decimal/hashlib/json/re. Fixed descriptor schema, preverified trust assertions, typed ordered argv and complete manifest/env/input bindings. No imports/calls to Runner, Console, filesystem, environment discovery or cache. Actual lock validity/semantic classification remains caller responsibility. No real-job closure capability claim.

Decimal parser preserves JSON lexeme precision; exact fixed decimal output (no Decimal context normalization or binary float), negative zero0, bool/float/null/nonfinite rejected numerically. Serializer fixes ASCII key order/control escapes, keeps ordered semantic arrays and Unicode unchanged, rejects surrogates/numbers/null, emits compact UTF-8 with no BOM/newline. Incomplete results expose no bytes/digests/key; schema0.1 jobs are unsupported by generator while unchanged Runner still executes its legacy fake fixture.

## Golden artifacts
Version-controlled [fixture directory](../../tools/slice-console/tests/fixtures/slice_key):
- base canonical4114 bytes; SHA `65e54ecdda7af2f85f48338d810d7d899b50b149416775616a8b4e53c8735433`.
- unicode canonical4128 bytes; SHA `9d104950fc9e0e471932df8664ab8941773b0e6d5c05ce018761561cbad92adc`.
Each expected file pins complete external key. Reference constructed independently from fully normalized synthetic tree, no generator import; raw canonical files carry no trailing newline. Two triples total about17KiB. Not real engine/resource identities.

## Results
Windows Python3.12.14: final suite **88 PASS / 0 FAIL / 0 ERROR / 0 SKIP** = unchanged51 regression (including prior35 backend tests) + new37 key tests.
Command: python -m unittest discover -s tests -v from tools/slice-console. Final temporary measurement wrapper reruns same suite, permits only exact Python fake_cli.py route plus existing temporary shortcut test's PowerShell helper. It confirms88 PASS and records [per-test counts](SLICE_CONSOLE_R01_SLICE_KEY_GENERATOR_2026-10-03/test_results.json).

S01, C01, N01–N06, W01: SAME bytes/key.
D01–D11, C03, W02: DIFFERENT bytes/key.
I01–I03, C02 plus missing backend/env/path/input, unsupported schemas and unclassified bindings: HOLD/INCOMPLETE, no key/component hashes/bytes.
New tests patch process creation/file opens/discovery to raise; every generator invocation in test setup/body under these guards. No descriptor mutation.
Code review cycle1 added explicit unknown engine/ABI rejection and output-slot alias consistency. Cycle2 fixed supported policy versions to0.1; independent reference fixtures were finalized for those versions. Final tests pass; review/fix work stops within the two-cycle limit.

Measurement wrapper initially misclassified fake argv position and shortcut helper, causing harness-only failures; corrected the temporary wrapper without changing existing tests/backend, then passed. This is not hidden production regression evidence.

## Launch / protected scope counts
Generator tests37: process launches0, engine launches0, file open/discovery0.
Real Bambu engine launches0.
Existing regression intentionally launches18 Python fake CLI processes and1 temporary shortcut PowerShell helper in final measured run; claiming all regression subprocesses0 would be incorrect.
Console integration0, cache0, REUSE0, discovery0, geometry/MINIL change0, send0, print0, Print GO change0. Backend source/tests/schemas compare unchanged to base. No operational deployment change.

## Limitations / FOLLOW-UP
Caller trust assertions are not proof or a signed lock. Full engine/resource/backend dependency closure and evidence-backed argv/path/env policies are still absent in production. No filesystem discovery, package/artifact reuse gates, cross-platform benchmark or determinism claim. Input descriptor shape is explicit; direct JobSpec/legacy conversion is unsupported. Follow-up candidate: ENGINE / RESOURCE IDENTITY LOCK CONTRACT + FIXTURE TOOLING, before Console integration/cache. Not started.

STOP: **SLICE CONSOLE R0.1 SLICE_KEY GENERATOR — AUTHOR REVIEW**
