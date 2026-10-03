# Engine / Resource / Backend Identity Lock v0
Decision owner: Author. Explicit manifest only; no automatic discovery, generator adapter or Console integration.

## API
`from identity_lock import validate_plan, build_lock, verify_lock, receipt_sha256`
- validate_plan(dict or raw JSON): validates fixed schema/path bindings, returns detached plan; errors raise LockError.
- build_lock(plan, read_hook=None): reads only listed files; returns (receipt_text, result). Receipt is immutable JSON text; caller may save with exclusive-create mode. Builder does not write any file. Invalid plan returns (null, HOLD).
- receipt_sha256(receipt_text): digest of exact UTF-8 receipt bytes, externally pin/store it.
- verify_lock(plan, receipt_text, expected_receipt_sha256=..., read_hook=None): checks external receipt pin and logical binding, then **rehashes every listed file** against receipt SHA/size. No generate_key call. Reverification returns a new result; original receipt remains unchanged.
- read_hook(path, observed_count) is a deterministic synthetic concurrency test hook after each chunk, normally omitted.

[Plan schema](identity_lock_schemas/IDENTITY_LOCK_PLAN.schema.json), [receipt schema](identity_lock_schemas/IDENTITY_LOCK.schema.json), [result schema](identity_lock_schemas/VERIFICATION_RESULT.schema.json), all version0.1 / contractv0. Schemas describe transport; runtime additionally enforces kind uniqueness, path safety, direct source coverage and cross-field consistency. Register result schema by its URN when resolving receipt references offline.

## Plan
Root: schema_version, allowed_roots (absolute explicit roots), groups (exactly engine/resources/backend).
Each group: identity_kind, metadata, closure_policy, entries.
- Engine metadata: declared_version, platform_abi, both nonempty/known. One required entry role executable. Its bytes/SHA/size are measured; declared version is not extracted or verified as executable-reported version.
- Resource/backend metadata: empty object.
- Entry: logical_name (relative POSIX binding), exact absolute source_path, role, required boolean, expected_sha256 (lowercase64 hex or null when creating first baseline).
- Closure policy: version "0.1", policy_id, sha256 (Author-supplied policy/evidence identity), status COMPLETE/INCOMPLETE, path_semantics INSENSITIVE/UNRESOLVED, unresolved string list. COMPLETE cannot have unresolved items.
- Backend must explicitly include job.py, runner.py and progress.py for the current Runner boundary. Policy must enumerate any additional execution dependency. This static minimum is **not proof** of full Python/runtime closure.

Raw JSON rejects duplicate keys/nonfinite constants; unknown/missing fields/versions/kinds, duplicate logical names and malformed hashes fail closed. No expansion of env, home, relative paths or pattern/glob inputs.

## Hashing and paths
Fixed1MiB streaming chunks, constant memory relative to file size. Record observed byte count, exact SHA and before/after path metadata plus before/after open-handle metadata: size, mtime_ns, ctime_ns, device/inode.
Windows path stat and handle fstat may differ in ctime; compare ctime within each metadata source. Cross-source initial size/mtime/device/inode must agree. Byte count must equal initial size. Changed metadata/count yields CHANGED_DURING_READ and no usable file SHA. No retries that hide concurrent change.

Reject nonregular files, symlinks, Windows reparse points/junctions in the explicitly selected file or any ancestor, unexpected resolution, traversal and paths outside explicit roots. Uses O_NOFOLLOW where available. Ancestor metadata checks are not recursive scans. This is best-effort stable-read detection, **not a filesystem snapshot, adversarial TOCTOU guarantee or future immutability guarantee**. Metadata-preserving writes or changes between sequential file reads cannot all be excluded. Future execution must reverify/bind immutable snapshots under a separate policy.

Physical roots/source/resolved paths, times and metadata belong to receipt/provenance. Logical identity contains ordered-by-name content manifests, engine metadata and closure policy. Moving identical bytes with same logical binding/policy yields same identity digest; plan/receipt hashes change. File required flag is part of the separate binding digest. Hashes expected by plan constrain verification; they do not themselves define content identity. Changes to logical role/name, content, engine metadata or closure policy affect identity.

## Result and receipt semantics
- BUILD hashes stable files: entry HASHED (no expected SHA or match), MISMATCH, MISSING, CHANGED_DURING_READ or explicit read/path blocker. Builder creates a baseline; verified is always false. status LOCK_CREATED only if all entries and policy gates complete.
- VERIFY rehashes against pinned receipt: entry VERIFIED on SHA/size match; changed content MISMATCH. Incomplete/failed original file baseline cannot be promoted. Updating plan's expected SHA incompatibly with pinned baseline is EXPECTED_HASH_CONFLICT.
- FILES_STATUS separates HASHED/VERIFIED/INCOMPLETE from CLOSURE_STATUS COMPLETE/INCOMPLETE.
- Overall verified true/status VERIFIED requires freshly matched files, declared COMPLETE coverage and resolved INSENSITIVE path policy. This means **file integrity under the explicitly approved coverage**, not proof that the plan omitted no dependency.
- Unresolved closure/path, any missing/mismatched/unreadable listed dependency yields HOLD, verified false, identity_sha256/logical_identity null. Known observed content remains diagnostic_identity labelled partial / non-reusable. No partial identity digest becomes usable.
- Optional listed files may be absent as an observation but absence still leaves closure INCOMPLETE; no silent deletion of optional semantics. A deliberately absent concept must be resolved in a new reviewed policy/plan.
- plan_sha256 pins normalized full plan including paths; binding_sha256 pins logical binding/policy; identity_sha256 pins complete observed logical content. Receipt pin covers exact receipt bytes, timestamps and provenance.
- A caller-controlled receipt digest is not a digital signature. Policy completeness/ABI/version/path declarations remain Author/design evidence responsibilities. Program provides independent rehash evidence, not automatic discovery/semantic proof.

Machine-readable logical groups expose executable manifest SHA/size, resource manifest, backend manifest and verification state to a future descriptor builder. No descriptor flags are written automatically. Lock VERIFIED does not certify environment/argv/input semantics or a COMPLETE SLICE_KEY, successful execution, audit/physical/Print GO.

## Actual bounded source review
Runner imports job and progress; job/progress imports are stdlib. progress executes during Runner construction/stdout processing and callbacks, so include it conservatively; no GUI app/startup/Console/package-only module is imported by Runner. Packaging helpers are inside runner.py. Python executable/stdlib/extensions/runtime and Bambu libraries/resources/defaults/config inheritance remain unresolved. Listing3 files cannot establish deployment/runtime identity. No automatic graph analysis.

## Tests / next gate
Small synthetic manifests cover stable PASS, relocation, one-byte change, missing/optional, wrong SHA, streaming, size/mtime concurrent change, duplicate/traversal/outside-root, symlink/reparse metadata, unexpected resolution, policy HOLD and receipt integrity. New22 + existing88 =110 PASS. New lock calls prohibit process/discovery/generator invocation.
No actual Bambu installation was read. A separately labelled actual repo-source observation rehashes only job.py/runner.py/progress.py, with CLOSURE_STATUS INCOMPLETE and verified false.

Next candidate: ENGINE / RESOURCE CLOSURE POLICY + EXPLICIT LOCK PLAN, to resolve actual installation/runtime coverage before EXECUTION IDENTITY DESCRIPTOR BUILDER. Not started. Cache remains later.
STOP: **SLICE CONSOLE R0.1 IDENTITY LOCK — AUTHOR REVIEW**
