import assert from "node:assert/strict";
import { DEFAULT_SKIN_PARAMS, placeMotifRelativeToSurface, type PatchPoint, type Projected } from "./field.ts";
import { flowerConnectionPreviewModel } from "./motifPreview.ts";
import { choosePreviewMeshResolution, chooseProgressivePreviewResolutions, deriveSkinLayerVisibility, observationModeKeepingInternalGraphVisible, packPreviewMeshBuffers, selectedBeadWireScale } from "./previewMeshBuffers.ts";
import { createEmptyState, record, replay, type SkinHistoryEntry } from "./history.ts";
import { buildMeshFromField, buildMeshTrianglesFromFieldSlice, meshGridShape, type Bounds } from "../cloud-sculpt/meshExport.ts";

const surface: Projected = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1 };
const points: PatchPoint[] = [
  { x: -0.2, y: 0, z: 0.3, r: 0.2 },
  { x: 0.2, y: 0, z: 0.7, r: 0.1 },
];
assert.equal(placeMotifRelativeToSurface(points, surface, "surface"), points, "surface placement preserves the legacy realized array exactly");
const centered = placeMotifRelativeToSurface(points, surface, "center");
const centerMin = Math.min(...centered.map((point) => point.z - point.r));
const centerMax = Math.max(...centered.map((point) => point.z + point.r));
assert.ok(Math.abs(centerMin + centerMax) < 1e-12, "center placement balances the complete motif envelope across the host surface");
const inside = placeMotifRelativeToSurface(points, surface, "inside");
assert.ok(Math.abs(Math.max(...inside.map((point) => point.z + point.r))) < 1e-12, "inside placement keeps the motif's outermost extent at the host surface");
assert.deepEqual(points, [{ x: -0.2, y: 0, z: 0.3, r: 0.2 }, { x: 0.2, y: 0, z: 0.7, r: 0.1 }], "placement never mutates realized input points");
const placementHistory: SkinHistoryEntry[] = [];
const placementState = createEmptyState();
record(placementHistory, placementState, "setSkinParam", { key: "motifPlacement", value: "inside" });
assert.equal(replay(placementHistory).skinParams.motifPlacement, "inside", "placement choice round-trips through the authoring history");

const separate = flowerConnectionPreviewModel({ ...DEFAULT_SKIN_PARAMS, patchShape: "flower", flowerConnectionMode: "separate", flowerExpansion: 2 });
const fusedLow = flowerConnectionPreviewModel({ ...DEFAULT_SKIN_PARAMS, patchShape: "flower", flowerConnectionMode: "fused", flowerExpansion: 0.5 });
const fusedHigh = flowerConnectionPreviewModel({ ...DEFAULT_SKIN_PARAMS, patchShape: "flower", flowerConnectionMode: "fused", flowerExpansion: 1.5 });
assert.equal(separate.mode, "separate", "separate flowers remain visually separate regardless of the expansion control");
assert.equal(separate.overlap, 0, "separate connection diagram never implies fusion");
assert.ok(fusedHigh.flowerScale > fusedLow.flowerScale, "higher fusion visibly grows neighbouring flowers");
assert.ok(fusedHigh.centerGap < fusedLow.centerGap, "higher fusion visibly closes the connection gap");

assert.equal(choosePreviewMeshResolution(96, 100), 48, "ordinary screen preview uses half of the high-resolution request");
assert.equal(choosePreviewMeshResolution(128, 5_000), 32, "very dense previews use the strict responsive cap");
assert.equal(choosePreviewMeshResolution(96, 1_500), 40, "flower-dense previews reduce resolution before they can stall the page");
assert.equal(choosePreviewMeshResolution(20, 100), 28, "screen preview keeps a legible minimum resolution");
assert.deepEqual(
  chooseProgressivePreviewResolutions(96, 1_500),
  { coarse: 40, final: 96 },
  "dense flower previews become responsive at 40 and then restore the exact selected 96 resolution",
);
assert.deepEqual(
  chooseProgressivePreviewResolutions(224, 5_000),
  { coarse: 32, final: 224 },
  "the responsive first stage never silently replaces an explicitly selected high-fidelity result",
);
const buffers = packPreviewMeshBuffers([{ a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 0, y: 1, z: 0 } }]);
assert.deepEqual([...buffers.positions], [0, 0, 0, 1, 0, 0, 0, 1, 0], "Worker packing preserves triangle positions");
assert.deepEqual([...buffers.normals], [0, 0, 1, 0, 0, 1, 0, 0, 1], "Worker packing supplies flat normals without main-thread computation");
assert.equal(selectedBeadWireScale("raymarch"), null, "raymarch keeps its shader selection instead of adding source-bead wire");
assert.equal(selectedBeadWireScale("beads"), 1.2, "bead view preserves the established emphatic selection outline");
assert.equal(selectedBeadWireScale("mesh"), 1.025, "mesh view reveals selected source beads close to their authored envelope");
const normalBeads = deriveSkinLayerVisibility("beads", "normal");
assert.equal(normalBeads.patchBeads, true, "normal bead view keeps the SKIN layer visible");
assert.equal(normalBeads.internalGraph, true, "normal bead view keeps the independent graph visible");
assert.equal(deriveSkinLayerVisibility("mesh", "normal").internalGraph, false, "normal mesh view avoids doubling the graph already fused into the mesh");
const ghostMesh = deriveSkinLayerVisibility("mesh", "ghostSkin");
assert.equal(ghostMesh.overlay && ghostMesh.internalGraph, true, "ghost observation overlays the opaque graph through a translucent SKIN mesh");
// The targeted Dry Web completion path promotes only the renderer display
// policy from normal mesh to ghost when no manual observation choice exists;
// main's cancel/invalidation path clears the graph and returns to normal mesh.
const completedTargetedDryWeb = deriveSkinLayerVisibility("mesh", "ghostSkin");
assert.equal(completedTargetedDryWeb.internalGraph, true, "completed targeted Dry Web display policy keeps the graph visible");
const invalidatedTargetedDryWeb = deriveSkinLayerVisibility("mesh", "normal");
assert.equal(invalidatedTargetedDryWeb.internalGraph, false, "cancel/invalidation display policy hides the cleared graph");
assert.equal(
  observationModeKeepingInternalGraphVisible("mesh", "normal", 4),
  "ghostSkin",
  "installing a mesh with a non-empty Dry Web promotes the existing ghost observation so the graph cannot appear to vanish",
);
assert.equal(observationModeKeepingInternalGraphVisible("mesh", "normal", 0), "normal", "an empty graph does not change observation mode");
assert.equal(observationModeKeepingInternalGraphVisible("beads", "normal", 4), "normal", "bead view already exposes the graph without changing mode");
assert.equal(observationModeKeepingInternalGraphVisible("mesh", "internalOnly", 4), "internalOnly", "an explicit observation choice is retained");
const internalOnly = deriveSkinLayerVisibility("beads", "internalOnly");
assert.equal(internalOnly.patchBeads || internalOnly.hostBeads || internalOnly.surfaceDecorations, false, "internal-only hides every Surface-derived bead and decoration");
assert.equal(internalOnly.internalGraph, true, "internal-only retains the independent graph");
assert.equal(deriveSkinLayerVisibility("raymarch", "internalOnly").raymarch, false, "internal-only never leaves the opaque raymarch surface in front");

const sliceBounds: Bounds = {
  min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 },
  size: { x: 2, y: 2, z: 2 }, longest: 2,
};
const sphere = (x: number, y: number, z: number) => Math.hypot(x, y, z) - 0.72;
const resolution = 12;
const fullMesh = buildMeshFromField(sliceBounds, sphere, { resolution, targetLongestMm: 40 });
const { nz } = meshGridShape(sliceBounds, resolution);
const splitAt = Math.floor(nz / 2);
const slicedTriangles = [
  ...buildMeshTrianglesFromFieldSlice(sliceBounds, sphere, resolution, 0, splitAt),
  ...buildMeshTrianglesFromFieldSlice(sliceBounds, sphere, resolution, splitAt, nz),
];
assert.deepEqual(slicedTriangles, fullMesh.triangles, "parallel Z slices concatenate to the exact single-pass triangle order");

console.log("Authoring preview tests: 31 passed");
