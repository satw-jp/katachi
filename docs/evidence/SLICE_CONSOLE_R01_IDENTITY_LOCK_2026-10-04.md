# Identity Lock v0 evidence — 2026-10-04 JST
Decision owner: Author. Bounded implementation verification PASS; acceptance pending.

## Merge / preservation
PR #42 actual Draft/OPEN/mergeable, head `0cc468c3e1b0d73326adf5ddf2bf5e69704572d2`, base main `ab09232526b2190ad3dda970d9e8d4fb04e6d103`, behind0/ahead1. Ready then expected-head normal merge. [PR #42](https://github.com/satw-jp/katachi/pull/42) confirmed MERGED.
Fetched main `1b353056043f7ac2b8244d945d1eb1f7f314ae26` has prior main and accepted head as parents. Generator exists. New isolated branch `agent/slice-console-r0.1-identity-lock`. Prior generator checkout was clean and unchanged.

## Authority / dependency inspection
Read AGENTS, TEAM_PROTOCOL, CURRENT, accepted key contract/API and actual job/runner/progress imports/call sites.
Runner directly imports job.py and progress.py; progress participates during construction/stdout processing/callbacks. Current backend manifest minimum explicitly includes all3. The other observed imports are stdlib; runtime/stdlib/extensions and installation source loading are not fully locked. GUI-only sources excluded. This is bounded manual inspection, not automatic dependency discovery.

## Implementation and review
[API/semantics](../../tools/slice-console/IDENTITY_LOCK.md), new independent identity_lock.py and3 versioned JSON schemas. Explicit3-kind plans; fixed1MiB streaming, before/after path+handle metadata, exact hashes/size, receipt externally pinned and rehashed. Physical path kept out of logical identity. No writes by builder/verifier; returned receipt is immutable text.
File evidence and externally approved closure declaration separated. All files matching under INCOMPLETE closure returns HOLD/verified false/no usable identity. No claim of complete snapshot/security proof.

Initial tests exposed Windows path-stat vs handle-fstat ctime mismatch on stable files. Fix cycle1 compares ctime within each source and retains cross-source size/mtime/device/inode checks. New22 tests then PASS. No further implementation fix cycle needed.

## Results
Windows Python3.12.14 final **110 PASS / 0 FAIL / 0 ERROR / 0 SKIP**, unchanged88 + new22. Command: python -m unittest discover -s tests -v from tools/slice-console; temporary measurement wrapper permits only existing fake_cli.py and existing temporary shortcut helper. [Counts](SLICE_CONSOLE_R01_IDENTITY_LOCK_2026-10-04/test_results.json).
- PASS: stable explicit bytes, build baseline then independent verifier rehash.
- RELOCATION: identical logical content digest; physical plan/receipt hashes differ.
- CHANGE: one-byte mutation changes fresh identity; old receipt verification MISMATCH.
- MISSING/optional missing: HOLD/INCOMPLETE; no silent dropping.
- WRONG SHA: MISMATCH; baseline cannot promote.
- CONCURRENT CHANGE: append/size and mtime hooks yield CHANGED_DURING_READ, no usable file SHA.
- Duplicate/traversal/outside policy: rejected before reads.
- Symlink/junction/reparse and unexpected resolution: HOLD, exercised with platform-independent metadata hooks (not native Windows link creation).
- Partial closure and unresolved path: no overall VERIFIED despite matching files.
- Receipt mutation/wrong pin/binding/expected hash: HOLD.
New22 lock tests process launches0; generator invocation0; recursive discovery0. Existing88 regression including37 generator vectors and35 prior backend tests retained.

## Actual observation, distinct from synthetic PASS
[Source observation](SLICE_CONSOLE_R01_IDENTITY_LOCK_2026-10-04/backend_source_observation.json) lists exact selected paths, hashes/sizes/metadata and current rehash evidence.
Only actual repo job.py (25419 bytes), runner.py (26496 bytes), progress.py (3856 bytes) were read as backend identity inputs. Engine/resource entries in that observation are explicitly synthetic placeholders. Actual Bambu installation executable/resources/datadir were **not read or hashed**.
FILES_STATUS VERIFIED, CLOSURE_STATUS INCOMPLETE, verified false, no usable identity digest. All synthetic source temp paths are historical provenance, not retained source artifacts.

## Counts / limitations / next candidate
Real Bambu engine launch0; new lock process launches0; generator integration0; cache lookup0; Console/cache/REUSE0; geometry/MINIL/send/print/Print GO changes0.
Final existing regression intentionally18 Python fake CLI launches +1 temporary shortcut PowerShell helper, separately counted.
Existing backend/generator/Console/tests/schema source unchanged from base; operational deployment unchanged.
Unresolved: Bambu runtime/resource/defaults/profile inheritance, Python runtime/stdlib/extensions, installation source loading and path-sensitive behavior. No complete installation closure claim; reverify receipt freshness before future use. Metadata comparison is not immutable snapshot guarantee.
Next1 task candidate: **ENGINE / RESOURCE CLOSURE POLICY + EXPLICIT LOCK PLAN**, before descriptor builder because actual closure remains missing. No automatic start.

STOP: **SLICE CONSOLE R0.1 IDENTITY LOCK — AUTHOR REVIEW**
