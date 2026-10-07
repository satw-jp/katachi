# EXECUTION_ENV_FINGERPRINT/v0.1 — finite B contract

The caller supplies two **preverified synthetic descriptors** and an independently approved finite compatibility policy. The pure comparator compares B identity within declared coverage. It collects nothing, reads no files, launches no process and verifies no actual host. `KNOWN` asserts that the caller has already verified freshness and trust; no wall clock or provenance timestamp establishes that assertion here. Likewise, an ACTIVE policy field and a matching SHA do not prove external Author approval: selecting an approved policy is the trusted caller's responsibility. This policy/implementation is delivered for Author review.

`same SLICE_KEY ≠ environment compatible ≠ REUSE authorized`.

## API and namespaces

`execution_env_v01.compare_execution_env_v0_1(prior_fingerprint, current_fingerprint, compatibility_policy)` accepts Python dictionaries or UTF-8 JSON bytes/text. Dictionaries are copied, never mutated. Duplicate JSON fields, unknown fields, unsupported namespaces/versions, invalid shapes/numeric/string states and nonfinite JSON numbers fail closed as `status=HOLD`, `comparison_class=null`, blockers; malformed values are not echoed. There is no CLI, collector, cache or artifact lookup.

- Fingerprint: `EXECUTION_ENV_FINGERPRINT/v0.1`, schema_version `0.1`.
- Policy: `EXECUTION_ENV_COMPATIBILITY_POLICY/v0.1`, policy_version `0.1`.
- Result: `EXECUTION_ENV_COMPARISON/v0.1`, schema_version `0.1`.

Machine schemas: [fingerprint](schemas/EXECUTION_ENV_FINGERPRINT_V0_1.schema.json), [policy](schemas/EXECUTION_ENV_COMPATIBILITY_POLICY_V0_1.schema.json), [result](schemas/EXECUTION_ENV_COMPARISON_V0_1.schema.json). The API additionally enforces semantic coverage sets, logical-name/rule uniqueness, unknown/classification gaps, precedence and exact policy identity.

## Fingerprint

Required top-level fields: `schema_version`, `domain`, `policy`, `coverage`, `observations`, `provenance`. Unknown keys are rejected at every defined object boundary.

`policy={domain,policy_id,version,sha256}` binds the supplied comparison policy. `coverage={scope_id,required_observations,native_runtime_names,inherited_env_names,verification_mode}` declares finite coverage. Verification mode is `CALLER_PREVERIFIED_OBSERVED_CANDIDATES`. Coverage mismatch produces UNVERIFIED_ENV, even if observations happen to be equal.

Each observation is `{state,value}`. States: `KNOWN`, `MISSING`, `STALE`, `UNTRUSTED`, `UNKNOWN`. A missing observation key is a MISSING gap; null or nested null identity values are unknown gaps. Literal declared string values `unknown`/`unclassified` are also gaps. Two identical missing/unknown/stale/untrusted observations never count as exact. `KNOWN` with a null identity still produces UNVERIFIED_ENV. Malformed supplied shapes produce HOLD before any comparison. SHA values must be lowercase 64 hex digits or explicit null; fake hashes for missing identities are prohibited.

| Required observation | Value / meaning |
|---|---|
| `os_family` | nonempty OS family string |
| `os_build` | nonempty build string |
| `architecture` | nonempty canonical architecture string; no alias inference |
| `engine_companion` | `{sha256}` for BambuStudio.dll |
| `native_runtime_manifest` | `identity_kind=OBSERVED_CANDIDATES_NOT_LOADED`, entries `{logical_name,sha256,size,role}`; exact finite names, role `runtime_candidate`, nonnegative integer size |
| `api_set_schema` | `{sha256}` |
| `vc_runtime_candidate` | `identity_kind=OBSERVED_CANDIDATE_FINGERPRINT`, `sha256` |
| `ucrt_candidate` | same candidate fingerprint shape |
| `python` | executable_sha256, version, implementation, distribution `{fingerprint_sha256,policy_id,policy_version,policy_sha256}` |
| `inherited_environment` | policy_version, finite entries `{name,state,value_identity,classification}` |

Native manifests and CRT/UCRT fingerprints identify **observed candidates**, never a loaded verification or physical binding graph. Python distribution fingerprint is a caller-preverified finite distribution identity under its named policy, not a discovery result or hash computed here.

Default native candidate names: `ucrtbase.dll`, `vcruntime140.dll`. Default inherited-environment names: `LANG`, `LC_ALL`, `PATH`, `TEMP`, `TMP`, `TZ`, under environment policy0.1. This is a finite declaration for the synthetic Windows route, not a claim that all OS/runtime influences have been covered. A future collector must stay within approved policy or return unverified coverage.

Environment entry state is `unset|empty|present`. unset/empty use `value_identity=null`; present uses the SHA256 identity of the exact nonsecret value, preverified by the caller. These states are distinct. classification must be `HASHED_NONSECRET`; unknown/other classification, missing entry, extra name, present unknown identity or wrong env policy version produces UNVERIFIED_ENV. Raw value/secret fields are rejected. No raw env values are accepted or returned. No secret discovery or automatic hashing of secret values occurs.

Manifest/env list ordering and coverage set ordering are nonsemantic; names are unique and sorted for fingerprint semantic digest. Strings/identities are otherwise exact, without path/OS/version/architecture normalization.

## Semantic policy and provenance

[Default semantic policy](policies/EXECUTION_ENV_COMPATIBILITY_POLICY_V0_1.json) contains only schema/domain/policy identity, ACTIVE/REVOKED status, finite coverage, hard-deny observations, finite environment policy and explicit directional rules. No timestamps, human rationale, trace pointers or provenance fields are allowed. Its **exact supplied JSON bytes** SHA256 is returned in policy_identity. For dictionary input, the exact identity representation is sorted-key compact UTF-8 JSON with no trailing newline. Pretty JSON bytes and a dictionary representation can therefore have different policy SHAs; callers must bind the representation they supply.

Fingerprint semantic digest is SHA256 of sorted-key compact UTF-8 JSON after finite list normalization and removal of the entire `provenance` object; schema/domain/policy/coverage/observation states and values remain. It is **diagnostic identity**, never an A key or a shortcut for compatibility.

Allowed NON-KEY provenance keys: collected_at, hostname, collector_run_id, file_path, evidence_pointer, pid, trace_sha256, human_note. All metadata must be nonsecret. Unknown provenance keys are rejected; provenance is neither compared nor returned in differences. Changing these fields does not change semantic digest or class. Stored evidence does not grant freshness/trust.

## Fixed evaluation precedence

1. Malformed/unsupported document or policy → HOLD/error, no comparison class.
2. Known hard deny → INCOMPATIBLE_ENV, even if another observation or policy binding has a gap.
3. Required observation/policy/coverage gap → UNVERIFIED_ENV.
4. All required observations KNOWN/fresh/trusted and equal, same active policy/coverage → EXACT_WITHIN_POLICY.
5. Differences exist, all covered by exact explicit directional allows → COMPATIBLE_WITHIN_POLICY.
6. Otherwise → UNVERIFIED_ENV.

Default hard deny observations: os_family, architecture, engine_companion. All three must remain hard denies in v0.1; additional finite observation denies are permitted. Explicit directional `allowed=false` is also a known hard deny. An allow cannot override a hard deny. A stale/untrusted/unknown value cannot establish a known deny on that item.

Default directional rules are **empty**. No OS/Python/CRT upgrade compatibility is invented. Other known differences with no rule are UNVERIFIED_ENV. Revoked policy or policy SHA/coverage mismatch cannot authorize exact/compatible results. Hard denies remain conservative rejection, never authorization.

Rule shape: `{rule_id,observation,from,to,allowed}`. Both endpoints must be known typed values within policy coverage; exact directed edge match only. Unique IDs/edges and nonempty differences are required. `from=A,to=B` does not permit B→A. A→B and B→C do not infer A→C. [Synthetic directional fixture](tests/fixtures/execution_env_v01/synthetic_directional.policy.json) is explicitly a test policy; it does not add production upgrade permissions.

## Result and safety boundary

Result contains schema_version, domain, status, comparison_class, policy_identity, prior_fingerprint_digest, current_fingerprint_digest, differences, blockers, rule_applications, reuse_authorized. Valid classifications are only EXACT_WITHIN_POLICY, COMPATIBLE_WITHIN_POLICY, UNVERIFIED_ENV, INCOMPATIBLE_ENV; `EXACT_ENV` is not used. Diagnostics identify observation differences and matched prior→current rule IDs. Equal semantic digests still require the complete policy/state/value checks. `reuse_authorized` is always false.

B does not duplicate A input/profile bytes, engine executable SHA, semantic argv, selected A resources or request policy SHA. C loaded module graph, parent loader state, process trace, physical DLL bindings and dynamic GetProcAddress graph are not required B fields. Historical PR44–47 evidence remains diagnostic context; it is not a dependency on indefinite loader closure.

Future REUSE requires separate A key match, B compatibility, prior execution SUCCESS, artifact SHA/existence/integrity, audit/package state and explicit REUSE policy. No comparator class grants Print GO.

Tests: [synthetic tests](tests/test_execution_env_v01.py), [exact fingerprint](tests/fixtures/execution_env_v01/base.fingerprint.json), [independent golden digest](tests/fixtures/execution_env_v01/base.expected.json). Comparator calls guard process, file I/O and discovery APIs; fixture loading is explicit and outside those calls. A production key/policy regression pin is maintained through the unchanged pure A generator.

Next one candidate: WINDOWS EXECUTION_ENV_FINGERPRINT COLLECTOR + ACTUAL A1 B-FINGERPRINT. Not started.

STOP: SLICE CONSOLE R0.1 EXECUTION ENV FINGERPRINT v0.1 — AUTHOR REVIEW.
