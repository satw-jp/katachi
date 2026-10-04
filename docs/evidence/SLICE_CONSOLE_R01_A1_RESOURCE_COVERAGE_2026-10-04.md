# A1 profile default / datadir request-resource coverage decision

Status: **HOLD / REQUEST_RESOURCE_COVERAGE_UNRESOLVED**. This is a decision/evidence checkpoint, not a COMPLETE policy. Existing adapter and policy remain unchanged; actual descriptor, generator result and key remain null.

PR #50 was rechecked Draft/OPEN, exact head59e3c87998d6885a0b96bb47c1ce03d4098c0476, base f2dd047354dfacbda03be432f4dd2d2cba49f5d2, mergeable and behind0. Ready then expected-head normal merge produced63df462ab119c09f94d49b8c7a924b47af7e34ca. Remote main was fetched; isolated branch agent/slice-console-r0.1-a1-resource-coverage uses that base. No prior branch or deployed input changed.

## Existing execution evidence

No exact-identity historical manifest/resolved_settings was found within the documented bounded scope. The operational sample has no declared runs-output directory. Operational root CURRENT refers to other package fixtures, and root result.json has no identity binding; neither can substitute. Drive exact-name searches returned no matches but may omit JSON; direct selected folder listing showed job and four input/data folders without a run folder. Its identity was not proven, so it is only a search observation. This is not a global absence claim. No reslice was performed. Effective-value origin comparison is unavailable rather than fabricated; schema labels are preserved in the search JSON. See [search record](SLICE_CONSOLE_R01_A1_RESOURCE_COVERAGE_2026-10-04/HISTORICAL_EVIDENCE_SEARCH.json).

## Profile/default boundary

Fresh explicit profiles remain flat with no inherits. Printer names default_print_profile and default_filament_profile; from=system and instantiation=true are present. Names alone neither select bytes nor prove metadata-only behavior.

Public tag v02.08.02.61 resolves to commit926a7192574bcb9b3a732e1ec59a46d79cb45466. Targeted source shows explicit JSON loading, a conditional default process read when process is absent and machine variant changes, default filament auto-fill under estimate mode with no supplied filament, and user-filament inherited parent handling. The supplied process/filament and system origin do not satisfy those observed branch prerequisites. However source/binary correspondence is UNVERIFIED: these observations cannot certify production NOT_SELECTED_FOR_ROUTE. A further printer_model machine_full/model_id read is visible; its request relevance and installed-route selection remain unresolved. from and instantiation parser metadata treatment does not establish end-to-end metadata-only classification. See [source evidence](SLICE_CONSOLE_R01_A1_RESOURCE_COVERAGE_2026-10-04/SOURCE_OBSERVATION.json), including pinned source links and inspected ranges. No parent/default file was added merely because its name or directory exists.

## Datadir boundary

Direct custom data listing contains only .gitkeep. Targeted source sets the supplied absolute data_dir, but neither this setter nor an empty listing closes downstream configuration, user/AppData or bundled/template fallback behavior. These candidate classes remain UNRESOLVED. No recursive resource/config crawl or loader investigation was performed.

## Machine decision / selected set

[Coverage decision](SLICE_CONSOLE_R01_A1_RESOURCE_COVERAGE_2026-10-04/COVERAGE_DECISION.json) contains each candidate classification, nullable selection/content-required fields, basis, evidence, confidence and blocker. Unknowns are null, not false. The only confirmed extra selected request resource remains resources/profiles/BBL/cli_config.json, SHA89171aefd3ce218b8f2ca2e813a9b2991d1c715658f564a4e47a7b579f9255b1, independently selected by accepted policy. This is not the complete finite set. Explicit three profiles/input/engine/backend are already key material and are not new auxiliary resources. No PR44 candidate promotion, directory hash or all-parent inclusion.

Policy v0.1 raw SHA15a49d183e1702cec0eccccdec114555828f32ea69cf7865688d8ab03f941f59 unchanged. Fresh [adapter result](SLICE_CONSOLE_R01_A1_RESOURCE_COVERAGE_2026-10-04/ACTUAL_ADAPTER_RESULT.json) remains HOLD, selected resource coveragefalse, descriptor/generator/key/digests null, enginefalse. Re-evaluation used an explicit proposed destination; no directory/run was created and no launch/version probe was made.

## Validation and one remaining gap

Docs/evidence-only changes: no helper, policy, Runner, old tests or golden fixture change. Prior PR50 regression225 PASS is historical, not rerun or claimed as new. Current JSON/schema consistency, actual fresh HOLD checks, protected tracked-file equality and diff-check are recorded in VALIDATION.json. No required-resource key mutation test is newly required because no executable policy/adapter change is proposed.

One gap: **EXACT_ROUTE_RESOURCE_SELECTION_BINDING** — identity-bound evidence of request-relevant reads/exclusions for the exact installed route, covering both profile defaults and datadir fallback. A same-version source label is insufficient. Next one candidate: **WINDOWS A1/0.4 EXACT-ROUTE REQUEST-RESOURCE SELECTION EVIDENCE DECISION**, to decide an authorized finite evidence method before any collection/implementation; not started. No Bambu process evidence is authorized by this recommendation.

STOP: **SLICE CONSOLE R0.1 A1 REQUEST RESOURCE COVERAGE — AUTHOR REVIEW**.
Bambu process launch0; additional loader forensic0; cache0; REUSE0; real slice0; printer send0; print0. No GUI, descriptor implementation, geometry/MINIL or Print GO change.
