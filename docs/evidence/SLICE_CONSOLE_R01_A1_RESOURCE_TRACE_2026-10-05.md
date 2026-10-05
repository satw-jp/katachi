# Windows A1/0.4 exact-route resource trace / production A-key gate

Result: **HOLD / TRACE_TOOL_UNAVAILABLE** before Bambu launch. Underlying A blocker EXACT_ROUTE_RESOURCE_SELECTION_BINDING remains open. Authorized maximum1 launch was not consumed: actual engine0, diagnostic real slice0, retries0.

## Merge / isolated base

PR51 actual Draft/OPEN, mergeable, head6874ef509e6f807b5130b6c051e7b29e4aebc431, basemain63df462ab119c09f94d49b8c7a924b47af7e34ca, behind0 rechecked. Ready then expected-head normal merge produced67364edc0cdbbdcf0e3b6a6f34a4d41168de8737. Fetched remote main, created isolated branch agent/slice-console-r0.1-a1-resource-trace from that commit. Prior branches and deployed files untouched. [Merge record](SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05/MERGE_IDENTITY.json).

## Mandatory preflight / frozen expectation

Fresh stable reads PASS13: operational job, locks,684-byte diagnostic STL, explicit printer/process/filament, exact installed engine, deployed job.py/runner.py/progress.py, cli_config, unchanged production policy and adapter source. Expected hashes are directive/accepted-base pins, not inferred from new observations; adapter expected hash came from merged Git blob. Each file read twice before tool check and verified unchanged again at checkpoint. Static existing load_job/validate_job PASS; no engine process invocation. [Exact identities and proposed argv](SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05/PREFLIGHT_IDENTITIES.json).

[RESOURCE_TRACE_EXPECTATION](SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05/RESOURCE_TRACE_EXPECTATION.json) was frozen before any capture attempt and remains unchanged. Includes all11 requested classes and PR51's8 candidate decisions. Exact argv comes only from existing resolve_argv. Cwd/datadir retained exactly; only output destination is new isolated outputs/RESOURCE_TRACE unique directory, proposed but not created. No inherited env values/secrets collected; no explicit job cli.env. No interpretation of absence or successful reads without trace.

## Tool availability evidence

No ProcMon executable was found on command lookup; no installed ProcMon driver or per-user EULA registry key observed. Official portable archive fetched from https://download.sysinternals.com/files/ProcessMonitor.zip into work/a1-trace-tools only. Procmon64.exe file/product version4.11, valid Authenticode signer Microsoft Corporation. Archive/exe fresh SHA and URL recorded in [download identity](SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05/TRACE_TOOL_DOWNLOAD.json); [capability](SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05/TRACE_TOOL_CAPABILITY.json) records token non-Administrator. The observed executable manifest says asInvoker; this is not a claim that capture works unprivileged. [Microsoft capture documentation](https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/troubleshoot-apps-start-failure-use-process-monitor) explicitly requires elevated execution. ProcMon was not started; no -AcceptEula, driver/service installation, registry setting, PATH modification or UAC relaunch was performed.

Built-in logman provider query found Microsoft-Windows-Kernel-File with filename/fileio/op-end/create/read keywords. A transient unique ETW capture start using keywords0x1F0 was attempted before engine launch; exit nonzero, output Access is denied / Try running this command as an administrator. Follow-up inspection found a partially created controller session without the required provider shown in query output. It was stopped successfully; final query returned Data Collector Set was not found. No persistent collector was created. Required file events were not captured. Tool-only8KiB ETL is retained and hashed separately, not treated as a Bambu trace; no events of other processes analyzed. [Cleanup record](SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05/ETW_SESSION_CLEANUP.json). [ETW capability probe](SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05/ETW_CAPABILITY_PROBE.json). This is actual Windows access denial, not a sandbox auto-review rejection. No Bambu launch or bare diagnostic slice was attempted; no other system process trace was analyzed.

## Evidence outcome / production gate

[Gate result](SLICE_CONSOLE_R01_A1_RESOURCE_TRACE_2026-10-05/TRACE_GATE_RESULT.json) explicitly distinguishes NOT_OBSERVED from empty access sets: successful reads/probes null, raw/exported trace null, PID/exit code null, resolved_settings unavailable. Candidate classifications preserved from PR51; no new metadata-only/nonselected evidence or missing-file absence rule. cli_config remains confirmed selected with accepted SHA89171aefd3ce218b8f2ca2e813a9b2991d1c715658f564a4e47a7b579f9255b1, but complete finite A set unknown. required_absence_checks null/unknown; no fake hash of absent file.

Coverage INCOMPLETE. No v0.2 policy revision or adapter update. v0.1 policy and helpers byte-preserved. Per directive section20, actual adapter is NOT_EVALUATED because coverage COMPLETE prerequisite failed; descriptor/generator/key/canonical/component digests null, generator0. Prior PR51 adapter HOLD evidence remains historical rather than substituted for a new actual run. No technical slice PASS, environment compatibility, Print GO or REUSE inference.

## Verification / remaining blocker

Current checks: JSON consistency, frozen expectation authority/classes,13 expected stable file identities unchanged, unique output absent, policy/adapter/all protected existing files identical to base, historical CURRENT suffix preserved, local links and diff-check. See VALIDATION.json and ARTIFACT_SHA256.json. No production code/policy change, so existing225 regression was not rerun; its prior PASS is historical. New test processes0; no process success is claimed.

Remaining execution blocker: **TRACE_TOOL_UNAVAILABLE**, with actual nonadmin ETW denial. Next one candidate only: **WINDOWS A1/0.4 TRACE CAPTURE CAPABILITY / ADMINISTRATOR EXECUTION GATE** — establish an authorized capture context while honoring the registry/system-settings boundary before allocating any Bambu launch. No automatic UAC elevation, registry change, trace or retry is authorized by this recommendation; no next task started.

STOP: **SLICE CONSOLE R0.1 EXACT-ROUTE RESOURCE TRACE — AUTHOR REVIEW**.
Engine0 / diagnostic slice0 / retry0 / loader forensic0 / cache0 / REUSE0 / send0 / print0 / Print GO change0. No geometry/profile/Bambu installation change, Large/MINIL or Console integration.
