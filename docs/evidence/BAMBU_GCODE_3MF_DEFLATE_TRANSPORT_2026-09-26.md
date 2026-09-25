# Bambu sliced-only `.gcode.3mf` DEFLATE transport evidence — Large A1

Recorded: 2026-09-26 JST  
Scope: bounded transport/package evidence from the final Large A1 2.2 mm / resolution 0.02 job. This is not a general Bambu-format specification and not a Physical PASS.

## Why this matters

A completed standalone G-code can be larger than the Bambu Cloud upload limit while still being usable as the exact payload inside a sliced-only `.gcode.3mf` package.

The observed working route is:

`standalone G-code -> sliced-only .gcode.3mf -> ZIP DEFLATE the Metadata/plate_1.gcode member -> Bambu Studio send UI`

The G-code itself is **not rewritten, recompressed into a different G-code format, or re-sliced**. The `.gcode.3mf` container is ZIP-based, and the embedded `Metadata/plate_1.gcode` member may use ZIP compression method 8 (DEFLATE). Bambu Studio transparently reads the expanded G-code payload from that package in the demonstrated route.

This is distinct from renaming an arbitrary `.zip` / `.gcode.zip` archive to `.gcode.3mf`.

## Demonstrated Large A1 case

Final standalone G-code:

- bytes: `1,098,992,698`
- SHA-256: `97d846b62308af20f9c9e9c473280490989a191c1ce208b59dd81b070546c256`
- layers: `1,060`
- resolved resolution: `0.02`
- source geometry candidate SHA-256: `0229c2ad64c69748cd4f4294b7518e8d80f1d7f068fd57adac1c86d818635e15`

The first send-metadata package retained the G-code essentially uncompressed:

- package bytes: `1,099,007,915`
- package SHA-256: `9384e96485a452d7a6f07156a565257e75eae8e92520d75114778781813a5b0b`
- Bambu Studio send UI showed the job/material mapping correctly but rejected the upload with error `-3090`, reporting that the print file exceeded the 1 GB maximum.

The package was then repacked **without changing the G-code, slice, geometry, Runner or filament metadata**.

Final DEFLATE package:

- package bytes: `294,636,058`
- package SHA-256: `d8574b8a6df5d09194062268775ab7d5935b610f4b84943bbd834b58d1834150`
- embedded member: `Metadata/plate_1.gcode`
- ZIP compression method: `8` / DEFLATE
- compressed member bytes: `294,620,961`
- expanded member bytes: `1,098,992,698`
- expanded member SHA-256: `97d846b62308af20f9c9e9c473280490989a191c1ce208b59dd81b070546c256`
- ZIP CRC: PASS
- non-G-code members: payload content preserved
- Generic PLA mapping: `GFL99`
- recorded material use: `801.956 g` / `268.883 m`
- geometry entries: `0`

The expanded embedded G-code is byte-identical to the verified standalone G-code.

Author observation after repack:

- Bambu Studio 02.08.02.61 recognized A1 / 0.4 mm;
- PLA row and approximately `801.96 g` usage were shown;
- the earlier >1 GB error was gone;
- cloud upload started successfully and visibly progressed.

This establishes transport/package compatibility for this demonstrated route. It does **not** establish successful completed printing or a universal Bambu Cloud limit/format guarantee.

## Reference evidence

Drive result:

- `A1_PRINT_PACKAGE_LARGE_2P2_0P02_SEND_METADATA_DEFLATE_R1/PACKAGE_COMPRESSION_RESULT.json`
- status: `GCODE_ONLY_DEFLATE_REPACK_PASS`
- Drive folder: https://drive.google.com/drive/folders/1xkohN7DAY-5ksohukFHnpzxrK8BlvvlV

The repack used MINIA's previously working sliced-only package as the compression-method reference; that reference also used ZIP method 8 for the G-code member.

## Operational rule promoted from this evidence

For a large sliced-only `.gcode.3mf` delivery package:

1. Keep the verified standalone G-code as the authoritative payload.
2. Build or repair only the package/container metadata required by Bambu Studio.
3. Store `Metadata/plate_1.gcode` using ZIP method 8 (DEFLATE) when the selected known-good sliced-only package pattern uses it.
4. After repack, stream/decompress the member and require exact byte count + SHA-256 equality to the standalone G-code.
5. Require ZIP CRC PASS.
6. Require all non-target package member payloads to remain unchanged unless an explicitly authorized metadata repair is being made.
7. Do not call a package valid for send merely because it is smaller; confirm Bambu Studio recognizes printer/material mapping and that the upload path accepts it.
8. Keep `package SHA`, `expanded G-code SHA`, and `standalone G-code SHA` as separate identities.
9. Compression/package transport PASS does not imply Print GO, Physical PASS, or Production.

## Applicability boundary

Demonstrated here with:

- Bambu Studio `02.08.02.61`
- Bambu Lab A1 / 0.4 mm
- single-filament Generic PLA send metadata
- sliced-only G-code package
- one Large SKIN job

Do not silently generalize this to arbitrary Bambu/Orca versions, arbitrary printer models, arbitrary multi-material package schemas, or raw `.gz` / `.zip` G-code input.

The reusable finding is specifically:

> **Bambu-compatible sliced-only `.gcode.3mf` can carry a DEFLATE-compressed `Metadata/plate_1.gcode` member while preserving the exact expanded G-code payload. This can reduce transport size dramatically without re-slicing.**
