# Team AB — A2 Large 3MF Validator Parity Closure v0

Date: 2026-09-06
Owner: Team AB / SKIN SOL -> Temporary AB Implementation SOL / LUNA

## Review basis

Reviewed implementation checkpoint:

- branch: `agent/skin-astra-large-3mf-validator-v0`
- commit: `948c676fa966c9881d13971b4761636c5fe77d83`
- base: `4599d6a4ac7351633d7860d6e9f594803107e10f`

The checkpoint proves the actual A2 archive can complete streaming validation, placement, download and release at the measured large scale. However the validator implementation is not yet accepted as legacy-semantic parity because code review found bounded incremental XML cases that can diverge from the legacy parser depending on input boundaries.

## Exact blocker

### 1. Partial `<!...` token boundary handling

`IncrementalXmlParser.write()` recognizes complete `<!--` and `<![CDATA[` prefixes, then otherwise rejects `<!` as an unsupported declaration.

If a valid comment or CDATA opener is split across input chunks, a buffer such as `<!`, `<!-`, `<![`, etc. can be rejected before enough bytes have arrived to determine whether it is a supported comment / CDATA opener.

Legacy `parseXml()` accepts comments and CDATA. Streaming must preserve that behavior independent of chunk boundaries.

### 2. Exact report parity for non-model root

For a submodel whose XML root is not `model`, the legacy path reports the existing model-root error directly, while the streaming path currently throws from `parseModelStreaming()` and can wrap that condition as `malformed XML ...`.

The full `Skin3mfValidationReport` must remain deep-equal between forced legacy and forced streaming for the same package.

## Required implementation

Change validator/parity-test code only.

1. Make incremental XML prefix handling boundary-safe for supported XML constructs already accepted by the legacy parser.
2. Preserve exact legacy report semantics for non-model-root submodels.
3. Add differential regression fixtures that exercise the new boundary cases.
4. For small stored fixtures, sweep enough `compressedInputChunkBytes` values to cross every relevant opener / tag / entity boundary rather than relying only on 7 / 31 / 64 bytes.
5. Keep fail-closed behavior for malformed XML, invalid UTF-8, CRC / size mismatch, invalid indices and non-finite coordinates.

Recommended parity corpus includes at least:

- valid BODY-only
- valid BODY + Support
- XML comment in object-model XML
- CDATA accepted by the legacy parser
- XML entity split across boundaries
- wrong submodel root
- malformed index
- non-finite coordinate
- truncated XML
- invalid UTF-8
- CRC mismatch

## Actual A2 evidence reuse

Do not rerun Sparse Support merely to reproduce already-proven geometry/support facts unless the validator fix changes something outside validator/test scope (which is forbidden).

After the parity fix:

- revalidate the already-generated A2 3MF archive if it is still available locally, or run only the minimum bounded A2 export/validation path needed to prove the exact fix commit accepts the same A2 archive;
- preserve the existing A2 source, geometry fingerprint, support fingerprint and package placement facts;
- explicitly record source / geometry / support fingerprint continuity through export as `PASS` from the existing fail-closed currentness checks and returned export summary, or add a read-only explicit parity assertion if needed.

Do not reinterpret or regenerate Candidate geometry or Support to satisfy this task.

## Protected scope

DO NOT CHANGE:

- Candidate geometry authority
- source-space Float32 execution
- exact-zero canonicalization
- deferred common placement
- Outside-only Removable Support
- Rabbit forbidden volume / repair authority
- Support semantics or physical parameters
- 3MF exporter schema / entry layout / ordering
- FKEI / authoring semantics
- no remesh / decimation
- no hidden candidate-specific tuning
- A/G/H/J equal-condition comparison contract
- G/H/J execution
- winner selection
- production SKIN
- deploy

## Done when

Return to Team AB / SKIN SOL only when all are true:

- validator parity regression suite: PASS
- boundary-safe comment / CDATA handling: PASS
- wrong-root full-report parity: PASS
- representative malformed-fixture full-report parity: PASS
- bounded telemetry remains PASS
- synthetic large validator gate remains PASS, or the code change is demonstrated not to alter its bounded large-entry behavior with equivalent evidence
- actual A2 archive validation on the fix commit: PASS
- placement parity: PASS
- source / geometry / support fingerprint continuity: PASS
- download/release semantics unchanged
- Candidate geometry / Support / Rabbit / FKEI / exporter semantics changed: NO
- G/H/J run: NO
- winner selected: NO

Then return the normal compact SOL review handoff.
