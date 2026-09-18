# R4 A1 Fabrication — Documentation Evidence Checkpoint

Recorded: 2026-09-19 JST. Review type: GitHub/Drive source inspection, not fresh geometry, slicing, physical or whole-G-code re-execution.

## GitHub basis

Inspected main: `9f6c607100c25cdfc780377002839726fde044b8`. Its ASTRA/SKIN_ABC CURRENT files still described the 2026-09-13 Artwork Geometry gate. The retained 2026-09-18 Author instruction opens a narrower A1 fabrication lane; this does not imply unrecorded artistic/physical acceptance.

## Source register

| Evidence | Actual source | What it supports |
|---|---|---|
| Author scope | [AUTHOR_TASK_20260918.txt](https://drive.google.com/file/d/1Xpz8vUDrit28pchsYN-3pt_HusV5cY4U/view) | Bounded branch2.2/bottom-Support/240C/Artwork-freeze/slice-audit-Author sequence |
| D22 record | [README](https://drive.google.com/file/d/1pvL3iusckhu7kEwS2IvehwBsubrtHbgj/view) and [Native update](https://drive.google.com/file/d/1svEmZsq_i7RLVDEWGZC8T1DHdwVP19Kh/view) | D22 geometry provenance and explicit supersession of old slice blockers |
| Recovery scope | [RECOVERY_GATE.json](https://drive.google.com/file/d/1bSNe2HcmqjCqfFEVzJbambUeJxo1csuw/view) | One complete D22 native run PASS; Author print HOLD; repeatability not established |
| Recovery integrity | [RECOVERY_VERIFICATION.json](https://drive.google.com/file/d/1p5mZA-qyWS5wjYqUAdShSgMD9Vxs5G_2/view) and [PACKAGE_MANIFEST](https://drive.google.com/file/d/1mdGDARlOLG19slISgHFjNatCrRr3lpQ9/view) | G-code/ZIP/layers/end/settings/hash agreement in stored verification |
| Execution route | [d22_mapping_manifest.json](https://drive.google.com/file/d/1CJLHLu6vJumOkWodQXS2Xmm7RNhDvRQl/view) and [run_bambu_mapping.py](https://drive.google.com/file/d/1bVreHb9ZNqbVa1GDUrHfvPOgmR8lHsmh/view) | Exact argv, single-filament mapping, engine cwd, redirected process route; exit0 |
| CLI limits | [CLI_SAFE_LIMIT_EXPLANATION.json](https://drive.google.com/file/d/1NxKdu9IlV7GCQsHUaslIv4gtIe4pzmwG/view) | Version-pinned bundled6000 vs GUI12000/9000; not an unexplained corruption |
| Native caveats | [result.json](https://drive.google.com/file/d/1_stKH34_hd-FVZobwCM92g2y3HnfLOqR/view) and [INPUT_PRESERVATION.json](https://drive.google.com/file/d/1zW3kUVQJxcRhxuxX1hVJAgzpTa8V-R0F/view) | Floating warning; unchanged D22 source; input/native3-face difference |
| Current D22.1 locks | [INPUT_LOCKS.json](https://drive.google.com/file/d/1wjqiV1CXzZRMf9RPs8vAFIULuZ2U1eNQ/view) | Current permanent/Support identity and profile hashes; inspected modifiedUTC `2026-09-18T22:05:34.373Z` |
| Current D22.1 preservation | [PRESERVATION.json](https://drive.google.com/file/d/1N_42BzRObHez8Tb68E1gsUb0YBIk_ywA/view) | Artwork byte-identical, four changed Support IDs,22,369 others unchanged, local coplanar subdivision; modifiedUTC `2026-09-18T22:05:28.441Z` |
| Current D22.1 contacts | [CONTACT_REPAIR_INTERSECTIONS.json](https://drive.google.com/file/d/11lV7WKRqOIXpxI3gw_E34oW1e1BZJ4Ai/view) | Four positive intersections, taper-bounded modification records; modifiedUTC `2026-09-18T22:05:23.471Z` |
| Current D22.1 attempt | [d221_final_manifest.json](https://drive.google.com/file/d/1P_BizMiDOuJf7_2EIp7_LsrjP6zF4G0D/view) | Stored RUNNING from `2026-09-18T22:06:07Z`, PID34088, no success result yet verified; modifiedUTC `2026-09-18T22:06:07.201Z` |

Drive working files can change in place. Their name/ID does not freeze a revision. Re-read locks and outcomes on restart and before publishing an updated gate. The observed RUNNING state is not independent process-liveness evidence.

## Artifact identities

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| D22 permanent / current D22.1 permanent unchanged | 2034241534 | `d6e558406c05b95a73ca1eb377325964001ec63785feacfc46ca34cb5c77184c` |
| D22 retained Support | 465242584 | `ee726ec0c2daecb617c00dc930619bbd46a73d8d67b981cfa10b7318d301b0ce` |
| Current D22.1 Support after local coplanar subdivision | 465256284 | `043caf7876cee047fc0fa8d37182c883e51fe23b5def502c7b3443e8759a2158` |
| Earlier D22.1 Support snapshot — NOT current input | 465242584 | `31fa2c1e01c60a27c0b7b59221d8f4686d8421208c6bbef3c0f20a3b7835286d` |
| D22 recovery G-code | 1222030422 | `8f172740cdf601a1f9419be96c6047b10ae4989593fbd1239a089fad388658a9` |
| D22 recovery ZIP | 320235122 | `da69f32826ee649bf7955441cee4e62c71a2d6a95066d3c7a71e4d32d6440c41` |

The ZIP's expanded G-code payload hash equals the G-code hash in the saved verification. G-code metadata size agrees with that report. This documentation review did not re-download/re-hash the1.22GB G-code or independently repeat the geometry intersections.

D22 recovery records:53,354,176 lines;1,058 layer-change comments and1,058 Z-height comments; layerZ0.2-211.6mm; executable terminal marker present. Header maxZ211.80mm is a different field. None of these values is prescribed for D22.1.

Profile hashes retained across the inspected recovery/current D22.1 locks:

```text
printer.json  a93eaae87d754082ce68a337d3021ee7432580cbdcffdc674c652e55dd67b31f
process.json  986af5806ba276be2a0932bd5bbc5192c323015d535d3ddc7ffde6c192c0eaf0
filament.json e1c4d0e608b62b34a1607de83c85520ce020770681014ade22ea2f9c82286984
```

## D22.1 repair evidence, not a command to repeat it

| Support -> unchanged branch | Endpoint displacement | Saved D22.1 overlap mm3 |
|---|---:|---:|
| N00192 -> A1187 |0.36mm|0.005476512234671186|
| N01130 -> A0682 |0.38mm|0.010064598159054814|
| N03091 -> A0040 |0.36mm|0.008324388141813856|
| Y01214 -> A3709 |0.34mm|0.003903762059486306|

The latest contact report records Manifold NoError for each and local surface cuts at1.2mm from the contact tip. Other22,369 Support blocks remain unchanged. For the changed blocks, local subdivision changes triangulation; the outside-taper claim is surface preservation within float32 rounding, not byte identity. The preservation record retains4,238 internal2.2mm members and4,283 protected flowers.

Earlier inspection captured D22.1 Support hash31fa2c1e... and an attempt started `2026-09-18T21:51:06Z`, EXITED with code4294967295 after448.2157s. A later inspection found the bounded-subdivision Support hash043caf78... and a RUNNING record started22:06:07Z. Do not call the latter successful or reinterpret the earlier exit code as a specific crash cause. These are different observed snapshots, even though the worker reused a manifest path.

## Unresolved and not demonstrated

D22 native input49,989,679 vs native49,989,676 faces remains an unresolved3-face difference in completed recovery evidence. Zero exact-area triangles and source hash equality do not prove full native retention. D22.1 has a new triangulation count and requires its own comparison.

The floating warning, full D22.1 native completion/integrity, all-layer chronological audit, removal/physical strength, actual failure cause, plate-setting correspondence and Author print GO are not established by this review. Newer diagnostic files or an existing `baseline_full` directory are not completion evidence by their presence alone.

The repeatable procedures and required checks are retained separately in `docs/fabrication/`; this checkpoint is evidence behind them, not a claim that the whole future `skin fab slice` pipeline exists.
