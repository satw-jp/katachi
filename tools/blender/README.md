# Hikari Blender bootstrap

`import_hikari_study.py` rebuilds a Hikari Blender study from a `*.blender-study.json` sidecar and the files beside it.

## Handoff

In Hikari:

1. Save or name the interesting case.
2. Choose the intended real longest edge in millimetres.
3. Choose mesh smoothness.
4. Press **Blender用一式を書き出す**.
5. Keep the five files with the same base name in one folder.

The OBJ is the primary render geometry. The STL is a checksum/topology check and is not imported as a second object.

## Import

From a terminal, using the Blender application executable:

```text
Blender --background \
  --python tools/blender/import_hikari_study.py \
  -- /path/to/<case-id>.blender-study.json \
  --clear \
  --save /path/to/<case-id>.blend
```

Remove `--background` when running with Blender's interface. Omit `--clear` to preserve existing scene objects. Omit `--save` to inspect before choosing a filename.

The importer:

- rejects unknown or old sidecar versions;
- checks SHA-256 and declared physical scale;
- imports only assets marked `primary`;
- converts Hikari right-handed Y-up to Blender right-handed Z-up through the visible axis root;
- imports shared-index OBJ topology, welds legacy per-face duplicate vertices, and smooth-shades the connected host;
- rebuilds the visible surface with a scale-aware Voxel Remesh (longest edge / 80) followed by six 0.5 Smooth iterations, removing marching-grid corrugation without the triangle pinching caused by Catmull-Clark;
- reconstructs camera, receiver, Sun, and host material;
- represents generated inclusions as Ref-style Empty object-coordinate masks in the host Volume Absorption rather than separate refractive meshes;
- stores assumptions and approximations in `HIKARI_IMPORT_METADATA.json` inside the `.blend` file.

Run `verify_hikari_ref_match.py` against a generated file to guard the authored surface and Empty-mask contract:

```text
Blender --background /path/to/<case-id>.blend \
  --python tools/blender/verify_hikari_ref_match.py
```

Ref's Catmull-Clark modifier belongs to its low-density connected quad mesh. It is intentionally not copied to Hikari's marching-tetrahedra surface: doing so to the older disconnected triangle OBJ pinched every face into the reported geometric pattern. Welding fixes topology; the scale-aware remesh and relax pair removes the remaining sampling-grid corrugation. The Empty mask remains the equal-IOR, lower-absorption Ref baseline. A genuinely different-IOR inclusion still needs an explicitly authored cavity and inner body in Blender. Imported output is a comparison baseline, not a finished artwork; Blender material, world, and nested-volume behavior still require visual judgment and recording.
