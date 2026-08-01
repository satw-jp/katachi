# Hikari document (`.hkr`)

Status: implemented v1
UpdatedAt: 2026-08-01

## Purpose

An `.hkr` file is Hikari's editable study document. For every saved view it keeps the replayable shape recipe, material, daylight, receiver/display settings, camera, observation, backend snapshot, app version, and Git commit needed to reopen that view. A PNG is a rendered derivative; Blender files remain a high-quality downstream study. Neither replaces the editable Hikari document.

The first version is UTF-8 JSON with the `.hkr` suffix. It is deliberately not a ZIP or opaque binary container: authors can diff it, GitHub can remain the SSOT, and a future migration can inspect every field. Images are not embedded in v1, so adding many views does not duplicate large pixel payloads.

## Author workflow

1. Adjust shape, camera, transparent media, daylight, and receiver view.
2. Choose **現在のビューを追加**. The application snapshots the complete replayable Hikari case under a named view.
3. Continue changing time, camera, material, or shape and add further views.
4. Select any saved view to restore its shape recipe, settings, and camera.
5. Choose **Hikari文書 (.hkr) を保存** to write every view as one document.
6. Optionally choose **RENDER**, select 16, 64, or 256 spp, and stop or wait for completion. STOP retains the latest completed accumulation.
7. Choose **画像** to export the currently displayed Realtime frame or retained Progressive frame at the renderer's current pixel resolution without application chrome. Normal mode caps device-pixel ratio at 2; compatibility mode uses 1.

The top-bar Save action writes `.hkr`; top-bar Image writes PNG; Export continues to create the Blender handoff. Legacy `.hikari-case.json` files still open and are migrated in memory to a one-view document.

## Progressive Render state

Progressive Render Phase 1 does not change the `.hkr` v1 schema. The document already preserves the reproducible author inputs—the shape recipe, Hikari settings, camera, backend snapshot, application version, and commit—but not a rendered result. The 16/64/256 spp choice, current/target spp, elapsed time, running or stopped state, half-float accumulation targets, GPU resources, and PNG pixels are derived runtime data and are not serialized. Opening a document always begins in Realtime Observation and never resumes an old accumulation automatically.

If a Progressive image is retained, Image exports that completed accumulation and includes `progressive-<spp>spp` in its filename. While accumulation is running, export uses the latest sample that has finished; it never reads a partially written target. If camera, shape, material, daylight, receiver, backend, or viewport state changes, the retained image is discarded and Image returns to the current Realtime frame. PNG remains a separate derivative and is not embedded in `.hkr`.

## Custom outer-host absorption

From v0.27.0, each nested Hikari case may store `hostPreset: "custom"` and `hostTransmissionColor: "#rrggbb"` in its Hikari settings. This is the author's desired transmitted sRGB hue, not a painted surface color and not the derived RGB absorption coefficient. The existing Absorption value remains the separate concentration; the OpticalScene adapter reconstructs the complementary linear Beer–Lambert coefficients when the view opens. Documents and legacy cases that omit `hostTransmissionColor` normalize to the existing amber default.

From v0.28.0, `inclusionTransmissionColor: "#rrggbb"` provides the same author-facing separation for the one analytic inclusion. `inclusionAbsorption` remains its independent concentration. A missing inclusion color migrates to white, which preserves the legacy neutral inclusion coefficient exactly. The derived RGB coefficients, rather than the picker value, travel through BODY, receiver transport, and the Blender sidecar. Spatial concentration fields are not part of the current document contract yet.

## Version 1 structure

```ts
type HikariDocument = {
  format: "hikari-document";
  formatVersion: 1;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  commit: string;
  activeViewId: string | null;
  views: Array<{
    viewId: string;
    name: string;
    createdAt: string;
    case: HikariCaseV1;
  }>;
};
```

View IDs are unique inside one document. `activeViewId` is either `null` or points to an existing view. Every nested case passes the existing schema validator before the document is accepted. Unknown format versions, duplicate view IDs, invalid active references, malformed histories, and invalid camera records fail closed. Individual Hikari setting fields are normalized on load rather than exhaustively rejected by this v1 validator.

## Extension and media type

`.hkr` has no widely established application association in the sources checked on 2026-08-01; one extension directory lists only an unspecified/unknown binary association. Treat the suffix as a provisional Hikari project convention, not a globally reserved identifier. Version 1 is served/downloaded as `application/json`; a vendor media type should only be used after an actual registration decision and published format specification.

## Next slices

- author-editable view names, duplication, ordering, and deletion;
- thumbnail generation stored separately or as optional bounded assets;
- explicit dirty/saved state and autosave recovery;
- optional multi-PNG batch export from selected views;
- schema migration functions when format version 2 is introduced;
- operating-system file association only after the extension decision stabilizes.
