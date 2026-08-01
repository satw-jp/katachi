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
- reconstructs camera, receiver, Sun, host material, and one analytic spherical inclusion;
- stores assumptions and approximations in `HIKARI_IMPORT_METADATA.json` inside the `.blend` file.

Generic or multiple inclusions require their own primary watertight meshes. Imported output is a comparison baseline, not a finished artwork; Blender material, world, and nested-volume behavior still require visual judgment and recording.
