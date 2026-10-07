# SLICE_KEY v0.2 request generator

Explicit API: `slice_key_v02.generate_request_key_v0_2(descriptor)`. Accept a dict or raw UTF-8 JSON str/bytes. Standard library only; no I/O, process, filesystem discovery, JobSpec conversion, Console integration or version dispatch. `slice_key.generate_key()` remains v0.1. Either API rejects the other descriptor. Always compare full `SLICE_KEY/v0.2:sha256:<digest>`, never a bare digest across versions.

COMPLETE means **same requested FULL_SLICE identity under v0.2**. It says nothing about environment compatibility, G-code byte equality, execution success, audit/package PASS, Author ACCEPT or Print GO. Multiple actual artifacts may share one request key.

## Descriptor schema 0.2

All objects have exactly the listed fields unless explicitly marked optional; unexpected/missing members fail closed. Fields are required even for empty sets. See [complete base fixture](tests/fixtures/slice_key_v02/base.descriptor.json) and [synthetic coverage](tests/fixtures/slice_key_v02/SYNTHETIC_COVERAGE.md). Input/reference arrays preserve order. Manifest entries, custom dependency names and semantic env overrides are sets sorted by logical name/name for canonicalization.

Root: `descriptor_schema_version="0.2"`, `request_attestations`, `request_identity`, `provenance`.

`request_attestations` contains exactly seven boolean assertions, all must be literal true:
`request_bytes_bound`, `input_semantics_complete`, `profile_mapping_complete`, `engine_declaration_bound`, `backend_coverage_complete`, `selected_request_resource_coverage_complete`, `execution_classification_complete`.
They assert trusted caller completeness of finite **A** coverage. They are not key material, file evidence verification, signatures, or renamed v0.1 verification flags. This pure function cannot establish fresh bytes, policy approval, actual route consumption or immutable execution binding; a future reviewed adapter must supply those assertions honestly.

| request_identity member | Exact shape / rule |
|---|---|
|domain, key_schema_version, operation|`SLICE_KEY/v0.2`, `0.2`, `FULL_SLICE` only|
|contracts|console_schema `0.1`, runner_version `0.2.0`, job_schema `0.2`, policies|
|contracts.policies|Exactly extraction, argv, semantic_env, request_resource, paths, backend; each `{version,sha256}`. Nonempty declared version, lowercase exact SHA. Policy version/hash are key material; no production policy is selected here.|
|backend_bundle|`schema_version="0.2"`, entries, custom_execution_dependencies. Exact entries for job.py/runner.py/progress.py (role backend_core) and explicitly listed custom dependencies (role custom_execution_dependency); no unlisted extra entry. Names unique relative POSIX logical names.|
|inputs|Nonempty ordered list. Each `{slot,format,input_mode,sha256,role,placement,intended_transform,semantics}`. Slots contiguous starting0. Modes mesh_import/native_bambu_project. Count follows array length; no inferred extraction/geometry change.|
|inputs transforms|`{state:identity}` / `{state:embedded}` / `{state:present,value:{translation_mm:[x,y,z],rotation_deg:[x,y,z],scale:[x,y,z]}}`; scale positive. No implicit transform defaults.|
|inputs.semantics|Exactly assembly/modifier/enforcer/authored_support/process_fixture/other/provenance. Each explicit `{state:not_applicable}` or `{state:present,value:{identity_sha256,description}}`. This semantic provenance tag is A, separate from root non-key metadata. Unknown state rejected.|
|profiles|printer, process, ordered filaments (nonempty), auxiliary (may empty); each profile `{sha256,format}`. Positive nozzle; filament_mapping/volume_mapping/nozzle_mapping arrays of nonnegative integers and material_mapping strings (all lengths equal filament count); map_mode string.|
|engine|Exactly `{version,executable_sha256}`. Bambu version declaration/observed metadata; no DLL, OS, platform ABI or Python runtime.|
|selected_request_resources|`schema_version="0.2"`, entries (may empty only when attested complete), selection. All entry roles toolpath_request_configuration. Selection `{policy_sha256,role,evidence_pointer}`: role selected_toolpath_request_configuration; policy SHA equals contracts.policies.request_resource.sha256. Evidence pointer nonempty, non-key. This asserts reviewed selected/requested role, never candidate-by-presence discovery.|
|execution|Exactly argv, cwd, semantic_env_overrides, transport. argv starts engine token, order/repeats preserved; cwd must opaque_path. transport is explicit semantic tag as above.|

Manifest entry: `{logical_name,sha256,size,role}`; exact lowercase SHA256, size nonnegative integer. Logical names reject absolute paths, colon/backslash, empty/dot/parent segments; names unique. Numeric values may be lossless Decimal/int/decimal strings (raw JSON numeric parse uses Decimal), converted to canonical strings. Binary float, bool/null numeric and nonfinite values fail closed. `unknown`/`unclassified` are reserved invalid declarations for format/input role/material/map mode/policy version/engine version; unknown tagged states or unknown token kinds fail closed. Opaque/literal values retain exact lexical text, including legitimate words; completeness/classification attestations are the caller boundary.

## Execution types / path boundary

argv tokens:
- `{kind:engine}`.
- `{kind:option|literal|decimal|opaque_path,value}`; only decimal canonicalizes numeric text. opaque_path nonempty, retained exactly, no case folding, slash replacement, normalization or relocation claim.
- `{kind:input,slot}` / `{kind:profile,group,slot}` with valid bound references; group printer/process/filaments/auxiliary.
- `{kind:profile_group,items:[profile tokens...]}` nonempty ordered.
- `{kind:resource,logical_name}` refers to declared selected request resource.
- `{kind:output,slot,alias,neutral_rule:{id:output_only_destination,policy_sha256}}`; SHA must bind contracts.policies.paths. Same slot must retain same alias. Physical destination appears only in non-key output_paths. A trusted reviewed rule is mandatory before this type can exclude a physical path; otherwise retain opaque_path. Generator checks rule binding, not actual filesystem/route neutrality.

cwd `{kind:opaque_path,value}` always retained in A in this bounded API. No inferred neutral cwd. Env overrides are explicit `{name,classification:semantic_override,state:present,value}` or `{name,classification:semantic_override,state:unset}`; names unique and case preserved. Empty value differs from unset. Inherited host env belongs to B, not this list. No unclassified override or hidden field accepted. No secret identity scheme is implemented; do not publish raw secrets in descriptors/canonical bytes.

Optional root provenance members (text or ordered text arrays only): request_id, timestamp, gui_display_name, run_pointer, artifact_pointers, environment_fingerprint_pointer, deep_runtime_provenance_pointer, output_paths. Empty object allowed. No B/C observation objects; references only. Metadata and selection.evidence_pointer never enter canonical request tree/digests. Changing pointers does not validate what they reference; no compatibility/REUSE evaluation/result is emitted.

## Result / canonicalization

Result always contains REQUEST_KEY_SCHEMA_VERSION `0.2`, REQUEST_STATUS COMPLETE/INCOMPLETE, status COMPLETE/HOLD, SLICE_KEY, CANONICAL_REQUEST_DIGESTS, blockers, CANONICAL_REQUEST_TREE, CANONICAL_REQUEST_BYTES. INCOMPLETE leaves all four key/digest/tree/bytes fields null. Blockers are sorted `{code,pointer}` records; no unknown/partial data hashed.

COMPLETE tree is the normalized request_identity, excluding only selection.evidence_pointer. Bytes are compact UTF-8 without BOM/trailing newline; ASCII object member names sorted lexically, arrays ordered, scalar Unicode preserved without normalization, surrogate rejected (including non-key metadata). Control scalars use lowercase `\u00xx`, quotes/backslash escaped. Decimal spelling is lossless, no context rounding, no exponent/trailing fractional zeros, negative zero becomes0. Duplicate raw JSON members/nonfinite constants rejected. Input descriptor is not mutated.

SLICE_KEY is namespace plus SHA256(canonical request bytes). CANONICAL_REQUEST_DIGESTS contains independent subtree SHA256 for contracts, backend_bundle, inputs, profiles, engine, selected_request_resources, execution (sorted pointers). Canonical bytes are Python bytes, not directly JSON-serializable; a future transport adapter needs explicit encoding, out of scope.

[Golden oracle](tests/build_v02_goldens.py) independently constructs already-normalized A declarations and uses standard JSON serialization/control escape adaptation, never imports a generator. Two descriptor/canonical/expected triples under tests/fixtures/slice_key_v02. Six old v0.1 goldens remain byte-identical. Synthetic policies are not Windows A1/0.4 coverage approval; no default migration, historical run conversion or production key claim.

Next one task candidate: **WINDOWS A1/0.4 REQUEST_IDENTITY COVERAGE POLICY + ACTUAL DESCRIPTOR ADAPTER**. Not started. B collector/evaluator, cache/REUSE and loader forensics remain outside this task.
