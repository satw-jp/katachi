# A1 Bambu CLI Runbook

Version: 0.1 — retained execution evidence plus explicit operating requirements.
Recorded: 2026-09-19. Owner: Fabrication SOL. This document is not a print authorization.

## Scope and evidence level

This runbook separates a reusable process from the candidate-specific settings supplied by CURRENT and its task. The demonstrated route is **Windows, Bambu Studio 02.08.02.61, A1 / 0.4 mm, single filament, two aligned STL inputs**. One complete D22 run succeeded. Repeatability, arbitrary geometry, other versions/machines/materials and a general SKIN implementation are not established.

Sources: [D22 recovery package](https://drive.google.com/drive/folders/1Auh3vlDGU5uhyt7WPWBDAPHJPhkEH4C8), especially the [successful execution manifest](https://drive.google.com/file/d/1CJLHLu6vJumOkWodQXS2Xmm7RNhDvRQl/view), [reference runner](https://drive.google.com/file/d/1bVreHb9ZNqbVa1GDUrHfvPOgmR8lHsmh/view), `source/ENGINE_LOCKS.json`, `audit/CLI_SAFE_LIMIT_EXPLANATION.json` and `audit/RECOVERY_VERIFICATION.json`.

The requirements below are the operating contract for subsequent runs; do not claim every requirement is already enforced by the historical Python runner. That runner contains case-specific paths, fixed attempt names and declared fields; it is evidence, not a generic production API.

## RUN-01 — Resolve authority and resume before executing

Read the active CURRENT, bounded task and [Fabrication Principles](FABRICATION_PRINCIPLES.md). Resolve the working candidate separately from the baseline geometry and last successful slice. Do not pick a candidate by filename recency alone.

Read existing attempt records first. For a RUNNING record, check the worker's actual process identity, start time, logs and output before launching anything. A saved PID can be stale or reused. Do not kill a process, duplicate a run, or redo an applied geometry repair merely to resume a chat.

If scope, candidate identity or approval is unclear, stop. Preserve existing files and return the concrete conflict. Execution permission is not machine-send/print permission.

## RUN-02 — Lock inputs, engine and profiles

Before a new authorized attempt, record candidate ID, input paths/Drive IDs, byte sizes, SHA-256, units, assembly frame, engine binary/version/hash, bundled resource identity, printer/process/filament profiles and their hashes. Compare actual input bytes to the lock; declared `geometry_unchanged=true` is not verification.

Use the authorized pre-aligned permanent geometry and authored Support together. Do not individually center, orient or scale them. Verify the assembly/bed placement transformation used by the engine; `ensure-on-bed` is part of the recorded route, not permission to silently change composition.

Temperature, layer height, fill, raft, brim, retraction and plate settings come from the **case profile**, not universal constants in this runbook. The reference case used 0.2 mm layers and 240 C, but those values do not become a generic PLA recipe.

Changes of engine, machine, filament count, profile semantics or input representation require a new bounded validation record. Do not silently switch Bambu/Orca versions to obtain a PASS.

## RUN-03 — Recorded single-filament route

The following is a parameterized **argv template**, not a new wrapper proven by execution:

```text
<ENGINE>
  --debug 2
  --datadir <DATA_DIR>
  --load-settings "<PRINTER_JSON>;<PROCESS_JSON>"
  --load-filaments <FILAMENT_JSON>
  --filament-map 1
  --filament-volume-map 0
  --filament-nozzle-map 0
  --filament-map-mode "Auto For Flush"
  --assemble
  --ensure-on-bed
  --arrange 0
  --orient 0
  --slice 0
  --export-settings <OUT_DIR>/resolved_settings.json
  --outputdir <OUT_DIR>
  <PERMANENT_STL>
  <AUTHORED_SUPPORT_STL>
```

Pass arguments as an argv list, preserving the semicolon-separated settings argument and spaces inside the mapping mode. This 1/0/0 assignment is the recorded **single-filament runtime mapping**, not a rule for selecting a physical AMS slot or a multi-material job.

The reference Python runner launches Bambu with engine-directory `cwd`, redirected stdout/stderr, stdin disabled, Windows no-window process creation, and temporary Windows error-dialog suppression. It resolves its own relative `work/native_recovery` directory before launch. Record the launcher cwd and resolved datadir explicitly when adapting it; do not depend on an accidental shell directory.

The successful route exports resolved settings but **does not export 3MF in that invocation**. A `.gcode.zip` is a transport archive, not a `.gcode.3mf`. Do not rename an archive and claim native print-container equivalence.

Explicit mapping plus the recorded execution combination succeeded once. Mapping alone has not been established as the crash fix. Upstream issue #12091 remains a diagnostic hypothesis, not a demonstrated identical cause. A downloaded Orca fallback is not a proven executed route.

## RUN-04 — CLI 6000 and effective settings

For the archived Bambu 02.08.02.61 A1 `cli_config.json`, X/Y/travel safe acceleration is 6000; reference GUI values were X/Y 12000 and travel 9000. The archived resource SHA-256 is `89171aefd3ce218b8f2ca2e813a9b2991d1c715658f564a4e47a7b579f9255b1`.

Keep this documented CLI limit for the validated route. Do not classify it as profile corruption or force 12000 without a new explicit task. Record the input profile, resolved settings, actual G-code config and GUI comparison separately. For another engine/resource version, inspect its actual limits instead of assuming 6000 forever.

A config limit is not proof of every effective motion command or actual machine acceleration. Audit command-level differences where required. An explained difference is not physical failure-cause resolution, and the complete GUI/CLI settings are not claimed identical.

## RUN-05 — Attempt evidence and incomplete output

Use a distinct attempt identity/output location for a new authorized run; retain previous manifests, stdout/stderr, exit records and partial outputs. Record start/end UTC, process identity, exact argv, cwd, elapsed execution time and native result. These timestamps describe execution, not physical failure Z.

A small smoke-test PASS does not replace a full-candidate run. Native exit 0 and a Success result are necessary execution evidence but not sufficient integrity or printability evidence. Missing/nonzero exit, truncated output or stale result files must remain non-success/unknown; do not fill them with another candidate's output.

Quarantine incomplete G-code and mark it not printable. A Windows-style nonzero code alone is not a crash-root-cause diagnosis. Never use duration or file size alone as a reason to declare a run hung or complete.

## RUN-06 — Stream, archive and verify

For the actual completed output, use bounded-memory/stream processing and retain the uncompressed source G-code. Record:

1. Byte size and SHA-256 of the complete G-code; exact candidate/input/profile/engine/attempt association.
2. Full-file line scan, executable end marker (`EXECUTABLE_BLOCK_END` in the demonstrated dialect), layer-change and Z-height counts, layer Z range and header values. Compare expected and observed counts within this run. Do not hardcode D22's 1,058 layers or equate header max Z with the last layer Z.
3. Actual G-code settings and relevant executable temperature/support/motion commands, compared against the case contract. Preserve deviations and warnings.
4. ZIP archive size/SHA-256 and archive readability. Stream the intended ZIP member back through SHA-256; require its bytes/hash to match the saved uncompressed G-code. ZIP-file hash and payload hash are different identities.
5. Input geometry/profile hashes after execution, to verify preservation rather than trusting declarations.

The D22 reference package contains these integrity results for a 1.22 GB G-code. Its [archive script](https://drive.google.com/file/d/1ataRDn1h1-4vVblvULKWWoR-RkHK_4MX/view) and manifest remain retained implementation references; review scope and assumptions before reuse. Documentation review of those results is not a new independent full-file verification.

## RUN-07 — Audit, package and stop

Integrity PASS is only the entry condition for [Toolpath Audit Rules](TOOLPATH_AUDIT_RULES.md). Bind the audit to the exact G-code SHA-256 and rule/tool versions. A changed G-code invalidates the old audit association.

Retain input locks, final geometry or exact pointers, all three profiles, engine identity, execution/result/settings records, full G-code and ZIP, integrity report, audit coverage/findings, review images and unresolved risks in the package. Return independent execution/integrity/audit/Author gate states.

STOP at the task's **AUTHOR A1 PRINT PACKAGE GATE**. This route includes no implicit printer transfer, printing, geometry redesign or Production promotion.

## Maintaining this runbook

Update this stable file when a reusable procedure, applicability condition or evidence limit changes. Keep candidate-specific counts, temperatures, hashes and progress in the case locks/CURRENT/evidence record. Link the supporting attempt and explain what was superseded. See the [promotion and retention contract](FABRICATION_PRINCIPLES.md#fab-08--retention-and-promotion).
