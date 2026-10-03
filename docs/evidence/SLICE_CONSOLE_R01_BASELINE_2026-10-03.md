# Slice Console R0.1 — Operational Baseline Freeze

Recorded: 2026-10-03 JST. Decision owner: Author. Gate: **SLICE CONSOLE R0.1 BASELINE FREEZE — AUTHOR REVIEW**. This is source promotion and architecture start evidence, not approval to implement the next features or deploy a replacement.

## Definition of Done

1. Resolve GitHub authority and its exact operational-source pointer.
2. Freeze exact source/tests/sample bytes, SHA-256, paths, modified times and version/schema.
3. Inspect Windows deployment read-only and distinguish shortcut configuration from loaded process bytes.
4. Audit existing capabilities and run focused fake/synthetic tests without editing the original.
5. Import an exact copy on a dedicated branch; record discrepancy, responsibility boundary and bounded sequence.
6. Stop for Author review; no new orchestration/cache/preflight/GUI implementation or heavy slice/printer operation.

## Actual authority and source

GitHub base: `satw-jp/katachi`, main `b5422dbbf937eca8b3fb7781978c7c9fed3a8262`. Read `AGENTS.md`, `docs/TEAM_PROTOCOL_CORE.md`, `docs/status/R5_SLICE_RUNNER_CURRENT.md`, Issue #30, `docs/fabrication/A1_BAMBU_CLI_RUNBOOK.md`, `docs/fabrication/TOOLPATH_AUDIT_RULES.md`. Issue #30 was open, zero comments, body still READY FOR LUNA / IMPLEMENTATION NOT STARTED when retrieved.

Operational directory is the CURRENT-linked [Drive folder](https://drive.google.com/drive/folders/1jDZUQy3YH_V59fih7xnU_0UN8LVv0u2u), read through its locally mounted exact path:

`J:/My Drive/codex/2026-09-20/files-pasted-by-the-user-fukei/outputs/fukei_slice_runner`

This is not the review ZIP. The current source is Runner **0.2.0**, job schema **0.2**, result schema **0.2**, confirmed from actual AST constants. Schema 0.1 without input_mode remains readable/executable; missing input_mode is treated as legacy even for other declared schema strings, so this is not an exhaustive schema-version enforcement claim.

The imported source is `tools/slice-console/`. Top-level Python files (including `phase_b_proof.py` as an unexecuted historical helper), original README/CURRENT, tests and both small sample trees are exact copies. The imported CURRENT/README preserve old claims as source bytes; this baseline report governs their evidence interpretation. Excluded: caches, screenshots, result.json and historical evidence directories. No large artifact was copied or rehashed. Original source and jobs were unchanged.

Exact paths/bytes/SHA/times for every copied file are in [SOURCE_IDENTITY.json](SLICE_CONSOLE_R01_BASELINE_2026-10-03/SOURCE_IDENTITY.json). Source-set SHA-256: `514cfc9ce41b56f3b062aa9d858d8b78b85f21cd8c5483de212d166ea41ada7d` (definition in manifest). Git attributes disable text conversion for the snapshot; no compatibility wrapper is needed because the deployed original remains in place.

## Windows deployment identity

**Shortcut configuration VERIFIED; loaded source identity UNVERIFIED.** Actual Desktop and Startup `.lnk` were inspected through WScript.Shell read-only. Both target:

`C:/Users/as/AppData/Local/Microsoft/WindowsApps/PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0/pythonw.exe`

Desktop arguments point to the operational `app.py`; Startup adds `--startup`. Both working directories match the operational source root. The recorded target exists. No matching python/pythonw process with `fukei_slice_runner` or `app.py` command line was observed. This does not prove historical execution, user activation of either shortcut, or loaded source bytes. Shortcut interpreter runtime version was not executed/verified. See [WINDOWS_DEPLOYMENT_IDENTITY.json](SLICE_CONSOLE_R01_BASELINE_2026-10-03/WINDOWS_DEPLOYMENT_IDENTITY.json). No shortcut reinstall, GUI launch or process change occurred.

## GitHub / Drive discrepancy

| Record | Old GitHub state | Actual current source / reconciliation |
|---|---|---|
| Runner/schema | CURRENT describes retrieved 0.1.0 / historical 0.1 smoke | Current runner.py is 0.2.0; job/result constants 0.2. Historical 0.1 smoke remains historical. |
| Source inventory | Six Python files hashed on 2026-09-21 | app.py, runner.py and job.py differ; progress.py, startup.py and setup_windows.py match that checkpoint. New package_gcode.py, tests, README and sample identity are now locked. |
| Issue #30 | IMPLEMENTATION NOT STARTED | Clean-mesh/provenance/manifest code and focused tests exist. This proves implementation, not closure of Issue #30's real Bambu T2 gate. |
| Tests | CURRENT 24 OK / 3 platform skips; Drive CURRENT 26 tests | This run: 35 PASS, 0 SKIP, 0 FAIL on Windows. Earlier counts stay historical. |
| Output hashes | CURRENT says manifest has no full G-code hash | Successful review packaging records native/standalone/embedded hashes and equality; absent/failed review still provides no universal output-integrity guarantee. |
| Promotion | Drive-only implementation | Exact source snapshot plus this report promoted to review branch; deployment unchanged and main unmerged. |

The CURRENT front now points to this dated checkpoint and marks its older source block historical. Issue #30 is deliberately left open; its stale body is explained here, not silently converted into real-slice PASS. README states a historical real sample PASS; the underlying real clean-mesh execution evidence was not independently audited in this task.

## Capability audit

IMPLEMENTED means present in this exact source, not a universal machine/print guarantee. PARTIAL scopes a capability; NOT IMPLEMENTED means absent from inspected runtime source.

| Area | Capability | State | Evidence / limit |
|---|---|---|---|
| Execution | SLICE_JOB.json / job validation | IMPLEMENTED | job.load_job / validate_job; declared contract, not exhaustive JSON Schema. |
| Execution | Input locks | PARTIAL | SHA verification of listed entries; explicit exact STL lock required for mesh_import, rechecked before launch. Legacy/native do not enforce complete lock coverage of every input. |
| Execution | Profile identities | IMPLEMENTED | path, bytes, SHA per resolved profile; no semantic/profile suitability certificate. |
| Execution | Exact argv | IMPLEMENTED | supplied argv, placeholders resolved, shell=False; validator does not independently prove supplied flags were accepted by installed CLI. |
| Execution | cwd / datadir | IMPLEMENTED | recorded paths and supplied datadir placeholder; no datadir-tree identity lock. |
| Execution | Isolated run folder | IMPLEMENTED | timestamp/suffix per attempt; no persistent same-job duplicate prevention. |
| Execution | stdout / stderr | IMPLEMENTED | stream logs and callbacks. |
| Execution | Cancel | IMPLEMENTED | child signal/terminate/kill fallback; tests fake child only, no universal descendant-tree guarantee. |
| Execution | Terminal RESULT_MANIFEST.json | PARTIAL | terminal execution records after run folder exists; pre-run validation rejection emits error without terminal manifest. SUCCESS follows exit0, does not assert all expected outputs. |
| Input | Legacy job | IMPLEMENTED | schema 0.1 fake execution regression PASS. |
| Input | mesh_import | IMPLEMENTED | one ASCII/binary STL, mm only; transform is declared intent, not applied. |
| Input | native_bambu_project | PARTIAL | one .3mf and strict provenance booleans; internal Bambu validity is not certified. |
| Input | Provenance | PARTIAL | validates declaration, cannot independently prove it true. |
| Input | Mesh validation | PARTIAL | facets/finite coordinates/counts; not manifold, watertightness or printability validation. |
| Input | Bounds validation | IMPLEMENTED | finite declared min/max, actual comparison absolute tolerance 1e-6 mm; no printer-envelope test. |
| Review | Native sliced 3MF | PARTIAL | consumes native artifact from supplied CLI; engine/export support depends on job and is not ensured for every run. |
| Review | Standalone G-code | PARTIAL | discovers/inventories CLI output; engine job must produce it. |
| Review | Embedded/standalone equality | IMPLEMENTED | automatic review uses exact bytes and SHA; mismatch fails review while execution stays SUCCESS. |
| Review | Sliced-only .gcode.3mf | IMPLEMENTED | removes geometry, retains plate metadata, writes preserved G-code. No new Bambu Preview proof here. |
| Package | package-only | IMPLEMENTED | standalone independent function and GUI tab; no slicer invocation; source context 3MF required. |
| Package | CRC / SHA validation | PARTIAL | package-only verifies completed ZIP CRC, embedded size/SHA and unchanged standalone; automatic review validates native CRC and compares payload, but does not reopen final archive for full CRC validation. |
| GUI | Job selection / validation / slice start | IMPLEMENTED | ASTRA-prepared job read-only; no Author Job Builder. |
| GUI | Cancel / progress / logs / result folder | IMPLEMENTED | source handlers; fake completion/failure/cancel tests. Interactive rendering not exercised. |
| GUI | Bambu Studio review | IMPLEMENTED | user-triggered open of ready artifact; mocked Popen test, no Studio launch here. |
| GUI | Package-only | IMPLEMENTED | separate completed-G-code tab, worker thread, context required. |
| Progress | Current phase detection | PARTIAL | keyword mapping from actual log lines, not authoritative stage boundaries. |
| Progress | Actual progress | PARTIAL | JSON progress/percent/percentage only; no proof installed engine emits it. |
| Progress | Estimated progress | IMPLEMENTED | supplied reference duration or 2971 sec; capped at 99 before completion. |
| Progress | Elapsed / ETA | IMPLEMENTED | total elapsed; ETA inferred from actual percent or reference, not measured remaining time. |
| Performance | Stage timings | NOT IMPLEMENTED | no persistent per-stage start/end/duration. |
| Performance | CPU logging / RAM logging | NOT IMPLEMENTED | no sampler/resource series. |
| Performance | Runtime history | NOT IMPLEMENTED | job.history reference duration is input, not accumulated execution history. |
| Cache | Persistent cache | NOT IMPLEMENTED | no cache/index/reuse verification. |
| Cache | Duplicate detection | PARTIAL | GUI active-instance/start guards and named mutex; no persistent same-job/semantic deduplication. |
| Cache | SLICE_KEY | NOT IMPLEMENTED | no deterministic execution identity key. |
| Performance | Known-slow rule | NOT IMPLEMENTED | fixed reference duration is not a machine-readable rule set. |

Automatic review currently reads complete standalone/native embedded G-code into memory; package-only streams its G-code payload. This memory difference is a FOLLOW-UP recommendation, not permission to refactor during freeze.

## Tests / evidence

Executed unchanged snapshot with bundled Python **3.12.14**, Windows 11 build 26200, `python -B -m unittest discover -s tests -v`. **PASS 35; SKIP 0; FAIL 0**. Windows shortcut test created/removed only temporary fixture shortcuts; Windows mutex fixture used its distinct test mutex. GUI tests used fake widgets/mocked opening, not the deployed GUI. Bytecode writes were disabled. [Full output](SLICE_CONSOLE_R01_BASELINE_2026-10-03/FOCUSED_TESTS.txt).

Small clean_mesh_box static sample: **PASS** for existing input/profile locks, ASCII STL counts/bounds and argv placeholder resolution, with no engine launch or original output write probe. [Static evidence](SLICE_CONSOLE_R01_BASELINE_2026-10-03/SAMPLE_STATIC_CHECK.json). The sample explicitly supplies printer/process/filament and Bambu argv. The old D22 sample is a structural placeholder, not a valid production mesh.

**NOT RUN**: real Bambu slice (including small sample), Large/MINIL slice, existing-run replay, heavy artifact rehash, interactive Tk GUI, Studio Preview, send/print. No claim of new native-engine, physical or artistic PASS.

## Reuse and R0.1 architecture

Reuse unchanged: JobSpec/load_job/validate_job, supplied argv resolution, input/profile identity capture, SliceRunner process supervision and events, isolated attempts/log/context/manifests, progress parser/estimator with current limits, automatic review packager, independent package_gcode, existing GUI as legacy execution UI.

```text
Author GUI / AI
       ↓
Slice Console orchestration
       ↓
existing Runner backend (frozen exact copy)
       ↓
Bambu CLI
```

Fabrication / Author owns **WHAT / WHEN / REVIEW** (geometry, profiles, timing, toolpath review, acceptance and Print GO). Runner owns **EXECUTE / RECORD**. Console will own **ORCHESTRATE / PREFLIGHT / CACHE / OBSERVE / PACKAGE routing / AUDIT handoff**. PACKAGE delegates existing package-only implementation; AUDIT_ONLY routes evidence to the auditor rather than inventing an auditor in Runner. The baseline repository copy is not installed over the operational directory. A future deployment/migration requires its own bounded identity and shortcut validation.

Preserve independent gates:

`Runner execution SUCCESS ≠ slice technical PASS ≠ fabrication PASS ≠ audit PASS ≠ package PASS ≠ Physical PASS ≠ Author ACCEPT ≠ Print GO ≠ Production`.

## Ordered bounded tasks after Author review

1. **Mode router / backend adapter**: define PREFLIGHT, FULL_SLICE, AUDIT_ONLY, PACKAGE_ONLY, REUSE. Delegate current static checks/execution/package entrypoints. Explicitly unsupported audit/reuse must return HOLD/NOT_IMPLEMENTED, never launch an engine or fabricate PASS.
2. **Deterministic SLICE_KEY**: specified canonical contract covering input bytes, profile bytes, engine/resource identities, effective argv, relevant cwd/datadir/env semantics and schema/backend identity. Same key means same requested execution identity, not byte-deterministic G-code. Existing nondeterminism remains acknowledged.
3. **Persistent cache / REUSE**: only compatible completed records with required output identity and independent gate states; preserve failed/cancelled attempts. A key match alone cannot grant printability or Print GO.
4. **Stage timing**: separately record observable boundaries; unobservable stages remain UNKNOWN rather than guessed from phase keywords.
5. **CPU / RAM resource logging**: bounded sampler bound to actual subprocess identity; record sampler scope/interval and unavailable metrics.
6. **Runtime history**: schema for comparable engine/profile/input/key/timing outcomes; explicit estimate provenance.
7. **Machine-readable known-slow rules**: evidence-linked conditions, rule version and uncertainty; no universal timeout or safe-print inference.
8. **Author Job Builder GUI**: author/AI share the same prepared-job contract; preview and explicit operation gates; no redesign now.

## Unverified / FOLLOW-UP

- Exact source used by past successful real runs, current loaded process bytes, whether Author activated these shortcuts, shortcut runtime version, full engine/resource/env/datadir identity: UNVERIFIED.
- Issue #30 historical real clean-mesh execution evidence and all acceptance criteria: not independently closed here. Leave Issue open; next operational evidence reconciliation is a separate bounded follow-up.
- General Bambu Preview compatibility, printer/material mapping, native output availability for every argv, production behavior: not newly proved.
- Complete legacy/native lock coverage, universal expected-output validation, automatic review memory scaling/final CRC reopening and cross-process duplicate prevention: FOLLOW-UP recommendations only; no freeze-blocking refactor.
- No scan/reuse/reset of unrelated local checkouts. A new isolated clone was clean at base HEAD; remote requested branch was absent at initial inspection. Original deployment has no Git history assumed.

## Next one task — handoff ready, not started

**SLICE CONSOLE R0.1 MODE ROUTER CONTRACT + BACKEND ADAPTER**

Prerequisite: Author accepts this baseline checkpoint. Decision owner: Author. Implementer: LUNA/Codex. Start from the accepted baseline commit on a new dedicated branch. Own only new orchestration adapter/router files and focused synthetic tests under `tools/slice-console/`, plus its bounded task/evidence; do not edit frozen Runner files or operational Drive deployment.

Deliver a machine-readable request/result contract for the five modes. PREFLIGHT delegates current job validation and explicitly describes its limited scope; FULL_SLICE delegates SliceRunner only on explicit execution request; PACKAGE_ONLY delegates package_gcode independently; AUDIT_ONLY and REUSE return clear HOLD/NOT_IMPLEMENTED until their contracts have actual implementations. Use dependency injection/fakes so all acceptance tests run without real Bambu, original jobs, GUI/shortcut changes or printer operations. Preserve separate execution/review/package/Author/Print GO gates. No SLICE_KEY, persistent cache, resource logging, geometry edits or GUI redesign.

DoD: all five modes deterministic routing; preflight/package/audit/reuse never start slicer; fake FULL_SLICE preserves cancellation/events/manifest identity; unsupported modes never silently fall back to FULL_SLICE; existing 35 tests remain passing; dedicated branch/commit/evidence and STOP at AUTHOR REVIEW. Scope-out findings are FOLLOW-UP only. No implementation is authorized until baseline Author review.

## Stop / protected counters

DoD evidence review: **pass** for this bounded baseline handoff; Author acceptance remains pending. Verified 29 original/copy/staged Git blobs byte-identical and 37 changed files within the allowed import/evidence/CURRENT scope. Authored documentation passes whitespace checks. The exact imported snapshot retains original CRLF/end-of-file whitespace reported by the default full diff check; this is a follow-up recommendation only and was not cleaned because byte preservation is the freeze requirement.

**SLICE CONSOLE R0.1 BASELINE FREEZE — AUTHOR REVIEW**.

geometry changes 0; MINIL changes 0; real heavy slice 0; printer send 0; print 0; Print GO changes 0. No new features implemented. Baseline review does not auto-start task 1.

## Source SHA checkpoint

| File | Bytes | SHA-256 | Modified UTC |
|---|---:|---|---|
| `app.py` | 22859 | `cad09c2d29370e7c34cf224543a306925cc010fae13df23df9985ccf196d3d5f` | 2026-09-24T02:28:41.1716142Z |
| `CURRENT.md` | 1061 | `d36b58fc2085c623631132a37eaaf2a720f86184b094848e5682d27309d70ced` | 2026-09-23T01:37:18.0611559Z |
| `job.py` | 25419 | `5526026f2bb7ab28b109e9dad6b1cd753d51e07b5b78fbf76a3d836a9c2c66cb` | 2026-09-24T02:26:45.3944229Z |
| `package_gcode.py` | 10710 | `2aa5e57766b6f1b8921fae709f090834c1be4a1d3c549c6f41fd7fd74367a206` | 2026-09-23T01:31:04.6581986Z |
| `phase_b_proof.py` | 5442 | `069277b4b622b4ba10f75213989ab56218c9442a3e04f314eb59d19c7b0dec90` | 2026-09-21T06:44:48.7222097Z |
| `progress.py` | 3856 | `0cbb84245e6b3252b14838bda1cd1f89f93c98b4b39016e08cdd78f8c3362622` | 2026-09-20T07:54:03.2906952Z |
| `README.md` | 8389 | `815f40e8f08543b4f8a1f97733e630825b83eadccc1652dbcbf29e2c165cfe97` | 2026-09-24T02:54:34.3496169Z |
| `runner.py` | 26496 | `405df011733de4cf469305a29c8609e1aa468202716c05d3cdb905435d3fde28` | 2026-09-24T02:47:51.5982089Z |
| `setup_windows.py` | 6952 | `ba0cde12e02d253ca6e9b2224b19be452277bf38e2e225f891a12ff720bd154f` | 2026-09-20T07:21:45.1399112Z |
| `startup.py` | 4863 | `aafece1c6c2327b44458bf24f619bd93073c6ea0efd1d9972891f4330bea6c78` | 2026-09-20T07:21:42.8003435Z |
| `tests/test_app.py` | 8849 | `c2c8b4e704574763c91eba3530981821f0ec188572ccddea7e97fc14fd1a9dd9` | 2026-09-21T07:22:30.6862713Z |
| `tests/test_package_gcode.py` | 2033 | `1f83fa03d1cb90d86f19b06dfbaec0f47dfe5f07a4e1515c4b346ab8d8577233` | 2026-09-23T01:32:20.7397603Z |
| `tests/test_runner.py` | 30538 | `b2570f3c5a92db597f26a639f1cd3433ac4ea2f7a94101c2928e7116e33db9e9` | 2026-09-24T02:48:06.5050520Z |
| `tests/test_startup.py` | 3110 | `e20a11c2ec7b715c889414ab04578b5f41f3310897adcbfe2121d88789f2dd7b` | 2026-09-20T07:22:35.2951428Z |
