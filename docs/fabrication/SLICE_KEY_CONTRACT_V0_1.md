# SLICE_KEY v0.1 — requested execution identity contract
Status: DESIGN ONLY / AUTHOR REVIEW. Authority: main `2341bc8a952115a826956b970e6de2f98eeb57dd` after PR #40 normal merge. No implementation.

## Meaning and domain
SLICE_KEY equality means **same requested execution identity** under this versioned contract. It does not guarantee byte-identical G-code, audit PASS, fabrication PASS, Physical PASS, Author ACCEPT or Print GO. REPRO_AUDIT_01 observed raw and ordered canonical toolpath differences between two bounded runs with equivalent audited fabrication semantics.

The operation represented is FULL_SLICE. PREFLIGHT, PACKAGE_ONLY and AUDIT_ONLY do not create slicing identity; a future REUSE request must reference a complete FULL_SLICE descriptor. Existing SLICE_JOB, CONSOLE_REQUEST, CONSOLE_RESULT and RESULT_MANIFEST remain authoritative for their existing responsibilities. No fields are added to them in this task.

## Canonical input tree
Required root members:
- `domain: "SLICE_KEY/v0.1"`, `key_schema_version: "0.1"`, `operation: "FULL_SLICE"`.
- `contracts`: Console schema "0.1", Runner version "0.2.0", job schema "0.2", versioned extraction/argv/environment/resource policy identities and execution backend bundle SHA-256.
- `inputs`: ordered array with slot (canonical decimal string), format, input_mode, exact content SHA-256, declared role, placement/intended_transform and assembly/modifier/enforcer/authored_support/process_fixture semantics. Input count is array length; input order is significant. Unknown role/transform semantics cannot be guessed.
- `profiles`: printer, process and ordered filament entries, exact byte SHA-256 and explicit effective nozzle/material/mapping values. Preserve all profiles supplied through argv, including auxiliary profile inputs. Exact bytes intentionally cause conservative misses for formatting-only edits; profile names alone never suffice.
- `engine`: declared version, exact executable SHA-256, platform/runtime ABI identifier and prelocked execution dependency/resource identities.
- `execution`: ordered typed semantic argv, bound cwd, effective relevant environment and execution-affecting input contract/provenance declarations.

The backend bundle identity covers the versioned, enumerated source/dependency closure that loads/validates jobs, resolves argv/cwd/env and launches/configures the engine. Initial coverage must include job.py and runner.py; any execution-affecting dependency must be covered. This design does not assert that a complete closure manifest already exists. Display-only GUI code is excluded. Same version string with different execution code is not enough.

Intended transforms are included as **requested intent**, even though current Runner records rather than applies them. Identity equality does not certify that intent was realized. Geometry transforms embedded in native 3MF are already covered by exact input bytes; explicit declarations are also included. Missing declarations may use a policy-defined explicit "embedded" or "identity" state only when proven by the input contract; missing is not automatically identity.

## Canonical bytes and digest
This is a custom serialization contract, not a claim of RFC/JCS conformance.
1. A validated, complete canonical tree is serialized as compact JSON, UTF-8, no BOM, whitespace or trailing newline.
2. Object member names are fixed ASCII schema names and sorted by ascending ASCII codepoint. Duplicate source keys and unknown unclassified execution fields fail closed.
3. Canonical tree values are objects, arrays, strings or JSON booleans. JSON numbers and null are forbidden in the key tree. Numeric semantic values use exact decimal strings: no plus sign/exponent, no leading integer zeros except 0, remove trailing fractional zeros and redundant dot; negative zero becomes "0". Expand source decimal exponent exactly, without binary float rounding. NaN/Infinity and precision already lost by a float conversion are invalid. Units are explicit schema units (mm/degrees/unitless); no tolerance rounding.
4. Arrays preserve order; no sorting geometry, filament, mapping, argv or repeated options.
5. Strings preserve Unicode scalar sequences exactly; no case folding or NFC/NFD equivalence. Escape quote/backslash with JSON escapes; all U+0000–001F as lowercase four-digit unicode escapes; other scalars emit directly as UTF-8. Reject unpaired surrogates. Boolean true/false remains boolean, never "true"/"false" or 1/0.
6. Required members cannot be absent. Optional concepts have explicit tagged objects such as {"state":"not_applicable"} or {"state":"present","value":...}; absent is distinct from null and is not silently coerced. Unknown is a blocker outside the key tree.
7. SHA-256 of those bytes yields lowercase 64 hexadecimal digits. External key form: `SLICE_KEY/v0.1:sha256:<digest>`. Algorithm/extraction/serialization policy changes require a new namespace/version; never silently reuse v0.1.

Windows/macOS locator strings are resolved using the backend/platform rules to find exact bytes but are not hashed as physical paths. No slash replacement, drive-letter removal or lowercasing of arbitrary raw argv is permitted. Resource **logical** names use manifest-defined relative POSIX names; retain case/Unicode and reject traversal. Platform ABI and distinct binary/resource identities remain included, so cross-platform equality is not presumed.

## Semantic argv, cwd and environment
Use the actual resolved argv list, not a regenerated approximation. A versioned engine/route registry classifies tokens into option/literal, input slot, profile slot, locked resource reference, cwd binding and output destination. Retain options, repetitions, order, semicolon profile order, mapping order and literal values exactly. Engine executable token binds to engine identity. Ordered input/profile slots bind to their content identities.

Only recognized destination values (output_dir/run_dir/export destination/log destination where proven output-only) become typed logical output slots. Keep export/output option flags and position; those can request engine work. If distinct outputs alias the same path, retain the alias relation. Input/output overlap or unproven filename/path-sensitive behavior is INCOMPLETE. Do not strip arbitrary paths, timestamps or substrings. Relative dependencies must resolve through a locked cwd/resource closure. A relocation is SAME only when these bindings and complete semantics remain identical.

Current Runner expands {inputs}, {profiles} in source order, validates argv and executes it as supplied. The A1 runbook uses ordered printer/process --load-settings, filament/mapping/nozzle options and --assemble/--ensure-on-bed/arrange/orient/slice. A registry must distinguish this mesh route from native-3MF routes; no universal flag assumptions.

Runner inherits os.environ and overlays declared cli.env. A complete, versioned environment policy must classify effective inherited variables as relevant values or evidence-backed inert variables. Distinguish unset, empty and present. PATH/library lookup, locale, thread controls, TEMP/TMP, HOME and config discovery need classification, not automatic exclusion. Sensitive values require an approved identity policy; do not publish secrets or pretend they are inert. Missing policy or unknown effective dependency yields INCOMPLETE. Console window/stdio/process flags require a policy classification; the historical audit only bounds that particular transport difference.

## Include / Exclude
| Field | Include? | Why | Evidence/uncertainty |
|---|---|---|---|
| Input count/order/format/mode/exact SHA | Yes | Parser and assembled inputs depend on these | job.py preserves order; native bytes contain scene metadata |
| Placement/intended transform | Yes | Requested execution intent differs | Runner records intent, does not apply mesh transform |
| Assembly/modifier/enforcer/authored support/process fixture | Yes | Toolpath-affecting semantics | Embedded bytes plus explicit role declarations; unsupported/unknown closure HOLD |
| Printer/process/ordered filament exact bytes | Yes | Content determines settings | Runner records SHA; argv preserves profile order |
| Filament/material mapping and nozzle | Yes | Runtime interpretation changes | Runbook mapping is logical, not physical AMS slot |
| Engine version and exact executable | Yes | Version string cannot identify bytes | REPRO executable SHA was missing |
| Relevant datadir/resources/runtime libraries/ABI | Yes | Hidden defaults/dependencies can change | Historical datadir path known, content unknown |
| Backend/Console/job/key versions and coverage policies | Yes | Execution/extraction contract must be identified | Current versions verified; source identity also required |
| Semantic argv/order/repeated flags | Yes | Effective invocation is authoritative | resolve_argv retains tokens/order |
| Bound cwd / relevant effective env | Yes | Relative/config/runtime dependencies | Runner inherits env; historic full env not snapshotted |
| Raw input/profile/engine folder or filename | No, conditional | Locator only, content binding replaces path | Path-sensitive evidence requires explicit versioned rule; otherwise HOLD |
| job_id / request_id | No | Correlation identifiers | If injected into semantic content/argv/env, include that effect |
| Timestamps | No | Record timing | Semantic timestamp argument/content would be included |
| output_dir / run_dir / log path | No physical locator | Destination binding avoids arbitrary misses | Only proven destination slots; preserve alias/operation semantics |
| GUI display name / candidate display name | No | Presentation/history labels | Runner run naming uses candidate; semantic injection still included |
| Worker hostname / hardware identity | No | Separate worker/benchmark provenance | Env injection still classified; platform executable/ABI included |
| Runtime duration/CPU/RAM/history | No | Observations after execution | No implementation in this task |

## Prelocked resource identities
A reusable lock manifest must enumerate the relevant immutable dependency closure: engine binary, loaded runtime libraries, engine defaults, datadir config/profile inheritance and auxiliary files actually discoverable by the route. Each entry has logical name, exact SHA-256 and size (canonical decimal); ordered deterministically by logical name. Manifest schema/coverage policy identity is included. Store a digest of this canonical manifest in the key plus required component identities.

Prepare/verify locks per trusted installation/resource revision, using an immutable snapshot or trusted revision change detection. Path, mtime or declared version alone cannot establish freshness. Jobs bind to a verified lock; changes invalidate it. Do not hash an entire mutable datadir every run. If transitive inheritance/discovery cannot be bounded, report MISSING_RESOURCE_IDENTITY rather than selecting a convenient partial subset. Lock verification implementation is deferred.

## COMPLETE / INCOMPLETE
COMPLETE requires every required identity, current lock verification, closed argv/path/env/dependency classification and valid canonical representation. Only then emit SLICE_KEY and CANONICAL_INPUT_DIGESTS.

INCOMPLETE returns HOLD, KEY_STATUS=INCOMPLETE, SLICE_KEY=null, CANONICAL_INPUT_DIGESTS=null, blocker codes and field pointers sorted by ASCII code then pointer. Null here belongs to the non-key result envelope, not canonical key material. Non-key evidence may retain known component hashes, explicitly labelled partial; never a reusable partial key. Blockers include MISSING_ENGINE_IDENTITY, MISSING_RESOURCE_IDENTITY, MISSING_BACKEND_IDENTITY, MISSING_ENVIRONMENT_IDENTITY, UNCLASSIFIED_ARGV, UNRESOLVED_PATH_SEMANTICS, MISSING_INPUT_SEMANTICS and INVALID_CANONICAL_INPUT. No hashing "unknown", no unknown-to-unknown equality, no cache lookup, artifact selection, fallback or slice authorization.

The historic REPRO pair cannot be retroactively assigned COMPLETE merely from matching paths/version/settings.

## Synthetic design vectors (not executed)
Base A assumes all locks/policies complete and valid, ordered geometry/profile slots and unambiguous output bindings. Each row changes only the named field from A unless stated. No hashes are computed; golden byte/digest fixtures belong to a separately authorized implementation task.
| ID | Mutation B | Expected |
|---|---|---|
| S01 | Copy same bytes to other folders; change output paths, job_id/request_id; retain bindings | SAME |
| D01 | One geometry byte (still valid synthetic format) | DIFFERENT |
| D02 | Placement decimal "0" -> "1" mm | DIFFERENT |
| D03 | Process profile content byte | DIFFERENT |
| D04 | Printer profile content byte | DIFFERENT |
| D05 | Filament profile content byte | DIFFERENT |
| D06 | Filament mapping ["1","1"] -> ["1","2"] | DIFFERENT |
| D07 | Nozzle semantic "0.4" -> "0.6" | DIFFERENT |
| D08 | Relevant CLI --orient literal "0" -> "1" | DIFFERENT |
| D09 | Engine binary SHA | DIFFERENT |
| D10 | Relevant resource manifest entry SHA | DIFFERENT |
| D11 | Swap distinct geometry/profile/filament ordered slots | DIFFERENT |
| N01 | output_dir only | SAME |
| N02 | record timestamp only | SAME |
| N03 | request_id only | SAME |
| N04 | job_id only | SAME |
| N05 | run folder only | SAME |
| N06 | GUI/candidate display label only | SAME |
| I01 | Remove exact engine SHA | HOLD / INCOMPLETE / MISSING_ENGINE_IDENTITY |
| I02 | Remove relevant resource lock | HOLD / INCOMPLETE / MISSING_RESOURCE_IDENTITY |
| I03 | Same unknown env/argv in both descriptors | HOLD / INCOMPLETE; no equality |
| C01 | Decimal 1.00 vs 1e0, parsed losslessly | SAME canonical "1" |
| C02 | Absent required member, null numeric, duplicate key, invalid Unicode | HOLD / INCOMPLETE / INVALID_CANONICAL_INPUT |
| C03 | Unicode composed vs decomposed semantic string | DIFFERENT |
| W01 | Hardware/hostname changed, complete execution closure identical | SAME |
| W02 | Windows vs macOS distinct executable/runtime ABI | DIFFERENT; no output determinism claim |

## Cache and worker boundaries
Proposed future metadata: SLICE_KEY, KEY_SCHEMA_VERSION, KEY_STATUS, CANONICAL_INPUT_DIGESTS (ordered component identities and manifest/policy digests); non-key provenance contains exact job/request/run pointers, physical locators, lock verification evidence and worker/benchmark identity.

A COMPLETE key match only finds candidate requested execution identities. Future REUSE separately requires successful terminal run, artifact existence/exact SHA, integrity/corruption checks, required audit/package state and explicit policy authorization. Execution_success is not technical/print PASS. No artifact selected by name/time/latest. Cache and REUSE remain unimplemented.

Hardware/hostname remain separate worker identity to permit controlled comparisons. Actual Windows/M4 binaries/resources/ABI can differ and therefore keys may differ. No measured cross-worker equivalence claim. If measured platform/hardware effects require a new requested execution dimension, revise the contract/version before allowing reuse.

## Unresolved / FOLLOW-UP
No complete installed engine/resource/backend closure or effective environment registry currently exists. Path/basename sensitivity, dependency discovery, environment relevance, output alias semantics and cross-platform effects need bounded evidence. This design conservatively fails closed; it does not prove current jobs can generate COMPLETE keys. REPRO nondeterminism mechanism remains unidentified.

## Exact next implementation task (proposal only)
Implement only a pure, versioned descriptor validator/canonicalizer/SHA-256 generator with preverified immutable identity descriptors supplied by fixtures, status/blocker results and synthetic golden canonical-byte/digest vectors above. Cover numeric/Unicode/order/path bindings and namespace changes; preserve the existing 51 tests. No engine launch or dynamic resource discovery; absent/unverified locks HOLD. Do not wire into Console requests, Runner manifests, cache or REUSE. End at Author review. Installation lock tooling / evidence-backed argv-env registry and Console integration are separately authorized follow-ups, not implicit work.

STOP: **SLICE CONSOLE R0.1 SLICE_KEY CONTRACT — AUTHOR REVIEW**
