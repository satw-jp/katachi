# SKIN Production UI IA v0A Fix 2 · Current Production Parity Evidence

UI checkpoint: `22ef22bcc327e048ed994c8fa8c3964ad20b324c`

Production baseline: `349e1a854d7e3699ac29afd167fc22e8131406d7`

Verification used the existing current-C replay path:
`scripts/replay-skin-production-v0-support-wiring.ts`.

## Exact current identities

- Host: `EXACT`; authored-host, `hostK=0.3`, geometry hash `9a52f5bb`.
- Motifs: `EXACT`; 38 motifs, IDs 1–38, geometry and transform identities unchanged.
- Permanent Graph: `EXACT`; 253 nodes / 272 edges / fingerprint `5cb659849d694beaae6443a4828031b5b6471b836bbe5e78aede5aece1c34435`.
- Permanent BODY: `EXACT`; fingerprint `c9ed4d69512aa20cb994083239afc5d26ce0402abbdb5a79e2165ca521cdb501`.
- `supportSource`: `EXACT`; `current-stage8:sparseResult.graph`.
- Removable Support: `EXACT`; 577 nodes / 395 edges / graph fingerprint `ef1d3eaec4146e171316a81e441797526fef6c8921d88a7689b68ac9c5892121`.
- 3MF Artwork BODY: `EXACT`; canonical and embedded BODY fingerprints match the locked BODY fingerprint.
- 3MF Support: `EXACT`; canonical and embedded Support fingerprints match; separate object, not merged into Artwork BODY.
- Production 3MF SHA-256: `bbc0af54bb6f038e61f211666a7a4378785cf2b6b106f9771acbbe5c96587e1c`.
- 3MF validation: PASS; 2 objects / 2 components / millimeter units / no validation errors.
- FIELD vNext semantics: unchanged / PASS.
- Output Scale semantics: unchanged; existing C millimeter contract retained.

## Deterministic replay

Replay 1 and Replay 2 were run from the same locked FKEI input (`791e47f7b94cdd667516f44d0c2f731d6326fb7949a47cd785189e2eb3963276`).

- Complete current Production result set: `MATCH`.
- Host identity: `MATCH`.
- Motif identity and transforms: `MATCH`.
- Permanent Graph identity: `MATCH`.
- BODY identity: `MATCH`.
- Removable Support graph and diagnostics: `MATCH`.
- 3MF hash, validation, Artwork BODY, and Support identities: `MATCH`.

Detailed replay outputs are under `replay-1/`, `replay-2/`, and `current-production-replay.json`.

## Source boundary

No UI source, Production source, verification harness source, parameters, state, export semantics, or support semantics were changed.
