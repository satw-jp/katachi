# SKIN External STL Host Phase 6 — Persistence / Save-Reopen v0

Date: 2026-09-05
Source checkpoint: `1d8fd04f5c77499580f8501c310613afdb92b716`
Branch: `agent/skin-external-stl-host-v0`

## Controlled scope

This phase adds a new External Host project envelope, `katachi.skin.fkei.v2`.
The existing `katachi.skin.fkei.v1` schema, serializer, parser and runtime
restore path are unchanged. No silent migration is performed.

The v2 envelope persists:

- exact original STL bytes, SHA-256, byte length, filename, STL format and
  explicit source interpretation;
- the exact Host instance transform;
- approved repair policy, approved boundary-loop list, repair parameters and
  expected repaired-mesh fingerprint;
- original/repaired Surface and Signed Volume capability facts;
- exact authored V6 Flower motif geometry, ids, shape parameters, Host
  placement, authored Host transform, adapter version, seed, source and
  `GEOMETRIC` normal policy;
- presentation-only Host visibility.

The Reference Host is `printable=false`. Authored motifs are permanent artwork
candidates and have no `printable` field. Repaired mesh authority, BVH/cache
objects and Three objects are not serialized.

## Fail-closed reopen contract

Reopen uses only the embedded source bytes. It does not read
`C:\dev\samples\rabbit_230223.stl` or any source path. The bytes are rehashed
and their length is checked before the original Host is reconstructed. The
approved repair is reapplied, its parameters and derived fingerprint are
compared with the saved expectations, and Surface/Signed Volume capabilities
are revalidated. Authored motifs are restored exactly and are not regenerated.

Hash, byte-length, source format, policy, repair, capability, transform or
motif-contract failures reject the project before live replacement. Hydration
completes before `replace`; replacement failures restore the previous live
state and redraw it.

## Actual Rabbit gate

Source: `C:\dev\samples\rabbit_230223.stl`
Source SHA-256: `c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8`
Source bytes: `10,215,684`
Interpretation: `1 mm/source unit`, `+Y`, right-handed
Instance transform: identity rotation/translation, uniform scale `20` (2000%)
Repair fingerprint: `90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6`
Capabilities: original Surface `AVAILABLE`, original Signed Volume `UNAVAILABLE (OPEN_BOUNDARY)`; repaired Surface/Signed Volume `AVAILABLE`

Windows Chrome loaded the actual source, applied the approved seven-loop
repair, generated 128 V6 motifs, saved the embedded v2 project and reopened
it. The saved JSON was `14,761,406` bytes and contained all `10,215,684`
source bytes. Reopen reported:

```text
save → reopen: PASS
reopen source path required: NO
embedded source rehash: PASS
repair fingerprint recheck: PASS
motif geometry exact: PASS
motifs restored: 128
Signed Volume: AVAILABLE
Host visibility: OFF
motif positions unchanged: PASS
host group only: PASS
motifs: 128
console errors: 0
console warnings: 0
```

Host visibility is presentation-only; the authored motifs remained unchanged
when the Host was toggled OFF.

## Verification

- existing FKEI v1, save and atomic restore tests pass;
- External Host, diagnostics, volume, approved repair and V6 adapter tests pass;
- v2 persistence tests pass for embedded byte identity, exact motif restore,
  query/transform parity, hash/fingerprint tamper rejection and atomic rollback;
- `npx tsc -p tsconfig.test.json --noEmit --pretty false` passes;
- `npx tsc -p tsconfig.json --noEmit --pretty false` passes;
- `npm run build` passes;
- `git diff --check` passes.

No Astra, Permanent Connection, Web/Internal, Support/FAB, G-code, final BODY,
deployment or physical-print claim is included in this phase.
