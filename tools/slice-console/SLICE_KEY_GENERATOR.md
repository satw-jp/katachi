# SLICE_KEY generator v0.1 API
Authority: [accepted design](../../docs/fabrication/SLICE_KEY_CONTRACT_V0_1.md). Independent pure module `slice_key.py`; no Console integration or CLI.

`from slice_key import generate_key, canonical_decimal`

`generate_key(descriptor)` accepts a plain dict or raw UTF-8 JSON str/bytes. It neither reads files nor starts processes, discovers env/dependencies, looks up cache or selects artifacts. A JobSpec/SLICE_JOB is not a descriptor.

## Trust boundary
Caller supplies **preverified immutable** identity, full effective classified semantics and fresh dependency locks. Every verification flag must be JSON true. These are caller attestations, not cryptographic signatures or independent proof by this generator. Production lock/discovery/classification tooling does not yet exist; fixture COMPLETE is not evidence a real installation is complete. An untrusted caller can lie about identity; this API is not a trust verifier.

Raw JSON uses Decimal for every number and detects duplicate members. Dict semantic numbers accept int, Decimal or lossless decimal string; float/bool/null are rejected. Never feed float-converted JobSpec values. Caller must preserve source precision before constructing the descriptor. Unknowns must be represented by absent identities or non-true verification flags, never invented SHA, value "unknown" or permissive classification.

## Exact descriptor schema 0.1
All objects have fixed fields; extra/missing fields HOLD. An executable complete shape is in [base.descriptor.json](tests/fixtures/slice_key/base.descriptor.json).
- Root: descriptor_schema_version "0.1", verification, identity, provenance.
- verification: immutable, engine, resources, backend, environment, argv, paths, inputs; all true required.
- identity root: domain "SLICE_KEY/v0.1", key_schema_version "0.1", operation "FULL_SLICE", contracts, inputs, profiles, engine, execution.
- contracts: console_schema "0.1", runner_version "0.2.0", job_schema "0.2", policies, backend_bundle. Policies has extraction/argv/environment/resource/paths/backend, each {version:"0.1", sha256}; these identify the caller's already verified classification, not a discovery registry implemented here. Unimplemented policy versions HOLD; upstream algorithm changes require a new key namespace/schema before support is added.
- Manifest (backend_bundle/resource_manifest): schema_version "0.1", nonempty entries [{logical_name, sha256, size, role}]. Names are unique relative POSIX names with no traversal/colon/backslash; entries canonicalize by logical name. Backend closure includes job.py and runner.py plus all execution-affecting dependencies asserted by verification. Manifest content identities are bound in canonical bytes; component SHA in CANONICAL_INPUT_DIGESTS covers the entire contracts/engine subtree, including policy/manifest identities.
- inputs: nonempty ordered [{slot, format, input_mode, sha256, role, placement, intended_transform, semantics}]. slot is zero-based contiguous decimal string after normalization. input_mode is mesh_import or native_bambu_project. The preverified input role/format/route policy must cover any auxiliary/toolpath effect. Legacy unspecified mode cannot be assumed valid.
- Transform: {state:"identity"} or {state:"embedded"} with preverified meaning; or {state:"present", value:{translation_mm:[x,y,z], rotation_deg:[x,y,z], scale:[x,y,z]}}. Numeric scalars canonicalize exactly; scale is positive. Identity/embedded states are explicit caller assertions, never defaults.
- semantics: assembly/modifier/enforcer/authored_support/process_fixture/other/provenance, each semantic tag. Tags: {state:"not_applicable"} or {state:"present",value:{identity_sha256,description}}. identity_sha256 binds the exact complete preverified semantic declaration (including any booleans and effect inputs), description is semantic text, not a GUI label. Generator does not invent, inspect or resolve declaration contents.
- profiles: printer/process file identities; ordered filaments/auxiliary file identities; nozzle (mm), filament_mapping/volume_mapping/nozzle_mapping (nonnegative integers), material_mapping (strings), map_mode. File identity: {sha256,format}. Mapping arrays align to ordered filament entries; filaments nonempty. Repeated identical profile content may occupy different slots; order/binding remains explicit.
- engine: version, executable_sha256, platform_abi, resource_manifest. Binary SHA and complete resource closure required. Unknown engine version/ABI HOLD.
- execution: argv (ordered classified typed tokens), cwd, environment, transport/provenance semantic tags. environment has variables [{name,state:"unset"} or {name,state:"present",value:string}], unique names, canonicalized by name; policy covers full inherited env and omitted evidence-backed inert variables. Empty differs from unset.
- argv token shapes: {kind:"engine"}; {kind:"option"/"literal",value:string}; {kind:"decimal",value:lossless_number}; {kind:"input",slot}; {kind:"profile",group:"printer"/"process"/"filaments"/"auxiliary",slot}; {kind:"profile_group",items:[profile tokens]}; {kind:"resource"/"cwd",logical_name}; {kind:"output",slot,alias}. First argv token is engine. References must exist; profile groups preserve semicolon order; output slot must have consistent alias across repeats. The caller's policy supplies stable slot/alias assignments and proves no input/output overlap or path-sensitive unresolved effects. No raw path rewriting by generator.
- cwd: {kind:"cwd",logical_name} referring to locked resource closure.
- provenance: optional members only from job_id/request_id/timestamp/output_dir/run_dir/log_path/input_paths/profile_paths/engine_path/resource_paths/cwd_path/worker_hostname/worker_hardware/gui_display_name/candidate_display_name. Values are strings or ordered string arrays. Omitted provenance members are allowed; they never enter key bytes. Execution effects of these values belong in identity, not merely provenance.

SHA values must be lowercase 64 hex. Unknown state/tag/token/schema fails closed. Job schema0.1 returns UNSUPPORTED_JOB_SCHEMA; no implicit migration. Other unsupported fixed contract/descriptor/manifest versions return UNSUPPORTED_CONTRACT_SCHEMA.

## Result
Always: KEY_SCHEMA_VERSION, KEY_STATUS, SLICE_KEY, CANONICAL_INPUT_DIGESTS, blockers, status, CANONICAL_TREE, CANONICAL_BYTES.
- COMPLETE: exact canonical tree and bytes, external key, ordered component digests for /contracts,/engine,/execution,/inputs,/profiles, blockers []. Bytes are Python bytes for direct evidence persistence; the result is not directly JSON serializable.
- INCOMPLETE: status HOLD; SLICE_KEY/CANONICAL_INPUT_DIGESTS/CANONICAL_TREE/CANONICAL_BYTES all null. Blockers sorted by code then pointer. A structural error reports the first invalid field plus any collected verification blockers; not an exhaustive error catalogue. No partial reusable hashes.

`canonical_decimal(value)` is the public lossless numeric helper; invalid inputs raise InvalidDescriptor (ValueError). generate_key converts descriptor errors to INCOMPLETE.

## Canonical implementation
Fixed ASCII member names sorted; arrays preserve semantic order. Resource manifests and effective env are name-indexed sets serialized in declared canonical order, not input/argv reordering. Semantic numbers normalize as exact strings using Decimal and fixed decimal formatting without context rounding or binary float. JSON numbers/null never emitted. Booleans emit true/false. Unicode scalars unchanged; controls escaped as lowercase four-digit unicode escapes; quote/backslash escaped; other scalars UTF-8. No BOM/spacing/newline. Namespaced SHA-256 output follows accepted contract. No fields added to existing contracts/manifests.

## Evidence
Two small immutable golden triples: base and unicode, each descriptor + exact canonical bytes + expected SHA/external key. Built independently from normalized synthetic reference trees, without importing generator, using sorted stdlib JSON and contract control escapes. Tests compare full bytes and fixed expected hashes; never regenerate expected values from code under test. Fixture strings are synthetic, not real installation locks.

New 37 tests include every contract S/D/N/I/C/W vector, alias consistency, unset/empty env, semantic ID injection, closed manifest references, lossless numeric precision, unsupported schemas and zero process/I/O checks. Existing backend tests intentionally launch Python fake CLI; this is separate from generator/real engine counts.
