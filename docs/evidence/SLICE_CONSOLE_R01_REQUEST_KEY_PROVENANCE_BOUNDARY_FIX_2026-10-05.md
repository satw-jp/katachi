# Request key provenance boundary correction — PR #53

One bounded corrective commit on `agent/slice-console-r0.1-a1-elevated-resource-trace`, parent `423b5eaf74ce43e3024b1aa11c6c234f9705a8d2`, base main `e9c033ccaac1d3190e6b929fb121ddf2582f35b5`. Existing trace/resource selection remains ACCEPTED. PR remains Draft/OPEN; no merge.

The policy previously hashed post-execution evidence into requested identity indirectly. Its exact pre-fix bytes are preserved in [PRE_FIX policy](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/PRE_FIX_WINDOWS_A1_04_REQUEST_IDENTITY_POLICY_V0_2.json), SHA `f89bf8db07b279d4990672c2f7617e98c9d594ee6e960fb784a7dbee1e1a023b`. All original PR53 evidence files remain byte-identical. [Old→new relation](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/REQUEST_KEY_SUPERSESSION.json) marks old key `SLICE_KEY/v0.2:sha256:62a5049a40a59351c5bf56494d2dee4addd7bbd45ce897094fd4b7ea5f278615` **SUPERSEDED — TRACE PROVENANCE LEAKED INDIRECTLY THROUGH POLICY SHA**. Historical reports/key documents are retained as historical records, not current key authority.

Semantic policy SHA: `60701d2dce4352f0c76c10a27d7b7a1f636777b34b8cd2335f4b261c37f81664`. Top-level fields: `policy_version`, `policy_id`, `route`, `classification`, `backend`, `job_fields`, `cli_fields`, `mesh_fields`, `argv_template`, `argv_classification`, `output_rule`, `cwd_rule`, `semantic_env`, `input_semantics`, `request_resources`, `required_absence_checks`, `observed_profile_sha256`, `observed_route_context`. Finite constraints cover route engine SHA/version, printer/nozzle/material/input mode, backend entry coverage, allowed fields, argv template/classification, conservative output/cwd/env rules and input semantic scope. Selected resources contain only logical_name/path/sha256/role. Absence entries contain only logical_name/path/required_state=ABSENT. Profile SHA/cwd/datadir constraints remain. Coverage COMPLETE retained; contradictory blocker and unnecessary unresolved array removed.

[NON-KEY provenance](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/REQUEST_IDENTITY_POLICY_V0_2_PROVENANCE.json) contains classification/included_in_request_key=false, semantic_policy_sha256, source PR/head/base, evidence citations, resource_trace_evidence (PID, trace/cleanup flags, execution success, raw/filtered hashes, unknown/fallback observations, loss/drop limitation), execution timestamps, ProcMon identity, raw PML identity/pointer, coverage/cleanup pointers and moved output/resource/absence rationale. Adapter does not load this document. No provenance digest is included in canonical request or components.

Live gates retain pinned semantic policy SHA, exact fresh input/locks/profile/engine/backend bytes, cli_config SHA, absent path plus non-reparse ancestors before/after fresh file reverify, exact profile SHA/cwd/datadir scope, argv template/classification and existing request checks. Seventh attestation describes accepted semantic coverage plus these current checks. Stored trace COMPLETE, cleanup PASS, unknown reads/fallback arrays are no longer authorization gates. The descriptor's existing `selection.evidence_pointer` carries only the versioned semantic policy identifier, not a trace file pointer; generator/schema unchanged.

Same actual job/input/profiles/engine/backend/cli_config/cwd/datadir/output/run directory used read-only. Exact resolved argv matches saved actual execution. Adapter COMPLETE, seven individually checked attestations; production generator called once, engine/process launches0. [Descriptor](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/CORRECTED_DESCRIPTOR.json), [canonical bytes](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/CORRECTED_CANONICAL_REQUEST.json), [adapter result](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/CORRECTED_ACTUAL_ADAPTER_RESULT.json), [key/digests](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/CORRECTED_PRODUCTION_REQUEST_KEY.json).

Corrected production key: `SLICE_KEY/v0.2:sha256:2a930b89ef411450fa625275a8db40fef3b796a5961b704d1100232a2b9d988c`.
Canonical SHA256: `2a930b89ef411450fa625275a8db40fef3b796a5961b704d1100232a2b9d988c`.

| Component | SHA256 |
|---|---|
| `/backend_bundle` | `357ff0d746ebc2e63c3326f2ad8a6623702cdc4d2454bb3ec7a5adb40c9c01b5` |
| `/contracts` | `b00361d907d2b638ccf4baf01e8e4e573c0b4cadf1ed569039407dd46d20436e` |
| `/engine` | `479b5604155038d26c480599dc30a211cda067cf2e3b3678b4677130ed4e10a0` |
| `/execution` | `efb1293b65af01f13dfa2aecfc3ce80e2a8aa44ff9524b030b1e8503f78beecd` |
| `/inputs` | `c145e45fc0ba0cd8301d07aaef0dec15af2266b5d4f0262ef4ea9606ac1d5e0d` |
| `/profiles` | `66e9f47b7a387929933a19441c7577bd07b2456b262002a4d8ea64773838515b` |
| `/selected_request_resources` | `9f2b38a68d613bcd536ee4f62bdce86acb69ef4b5a20219582f96e2c23b8bc2e` |

Only contracts and selected_request_resources component digests changed through the corrected policy SHA. Backend, engine, execution, inputs and profiles are identical to the old key. Canonical bytes exclude old PID, raw/filtered trace SHA, execution_success, base_main and evidence paths.

[Full regression](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/CORRECTED_FULL_REGRESSION.txt): **238 PASS, 0 failure/error/skip**, baseline234 +4 added boundary tests. Two obsolete stored-history gate tests now assert NON-KEY metadata independence. Focused adapter37 PASS; unchanged Runner/app/package/startup group35 PASS, Console16, Identity Lock22, v0.1 generator37 and v0.2 generator91. Existing generators, goldens, Identity Lock, Runner/Console and old policy v0.1 bytes unchanged. [Test counts](SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05/CORRECTED_TEST_RESULTS.json).

Critical regression writes and parses two different provenance documents on disk, uses the public pinned-policy adapter entry (synthetic pin/route fixtures), rejects any adapter provenance read and asserts identical canonical bytes/key. Differences cover PID, raw/filtered hashes, execution timestamp, success and evidence description. Historical unknown/cleanup/trace flags similarly cannot gate the accepted semantic policy. Selected resource bytes+accepted SHA change → DIFFERENT; stale SHA → HOLD; absence appears → HOLD; unknown required state → HOLD; profile SHA → HOLD; cwd/datadir scope → HOLD. Pre-fix policy SHA preserved and corrected policy pin verified.

This corrective task: Bambu0, ProcMon0, real slice0, retry0, send0, print0, Print GO change0, cache0, REUSE0. New/focused boundary tests process launches0. Full unchanged legacy suite launches19 synthetic CLI/helpers (18 fake CLI,1 shortcut helper); therefore a literal all-suite process-launch count0 is not claimed. Existing accepted trace's Bambu1 is historical and was not rerun.

Validation recorder initially treated component digests as a dict after successfully saving the once-generated production result; digests are a list. Relation completed offline from saved files, without a second generator or test execution.

Limitations: exact single diagnostic route only; opaque output/cwd/path policy may cause conservative cache misses; stable read observation is not immutable future consumption. B environment compatibility remains unverified. Same SLICE_KEY ≠ same GCODE_SHA256; requested identity alone authorizes neither REUSE nor Print GO. Full runtime provenance remains separate; no new loader investigation. No scope expansion.

Changed files: semantic policy, adapter, adapter tests, CURRENT/adapter guidance, this report; new pre-fix policy snapshot, NON-KEY provenance, corrected descriptor/canonical/adapter/key, supersession relation, regression records and correction validation/hash manifest. Existing raw PML/full-system CSV remain local only; existing exact-PID CSV unchanged.

Next one candidate: **EXECUTION_ENV_FINGERPRINT v0.1 CONTRACT + PURE COMPARATOR DESIGN**. Not started.

STOP: **SLICE CONSOLE R0.1 REQUEST KEY PROVENANCE BOUNDARY FIX — AUTHOR REVIEW**
