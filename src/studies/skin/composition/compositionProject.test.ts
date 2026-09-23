import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256Hex } from "../../../lib/hash.ts";
import { buildCompositionBranches, DEFAULT_COMPOSITION_RECIPE, LOCKED_HOST_INPUT, type CompositionFlower, type CompositionRecipe } from "./compositionModel.ts";
import { canonicalCompositionJson, COMPOSITION_PROJECT_SCHEMA, restoreCompositionProject } from "./compositionProject.ts";
import { loadMotifPrototype } from "./motifSource.ts";

async function signedProject(value: Record<string, unknown>): Promise<string> {
  return JSON.stringify({ ...value, snapshotSha256: await sha256Hex(canonicalCompositionJson(value)) });
}

const flower: CompositionFlower = Object.freeze({
  id: "flower-0000",
  triangleIndex: 0,
  barycentric: [1, 0, 0] as const,
  position: [0, 0, 0] as const,
  normal: [0, 0, 1] as const,
  rotation: [0, 0, 0, 1] as const,
  scale: 1,
});

function minimalBody(recipe: CompositionRecipe = { ...DEFAULT_COMPOSITION_RECIPE, flowerCount: 1 }) {
  return {
    schema: COMPOSITION_PROJECT_SCHEMA,
    recipe,
    flowers: [flower],
    presentation: { showHost: false },
    status: { role: "permanent-structure-draft", containment: "UNVERIFIED", fabrication: "UNVERIFIED", authorAccept: false },
  };
}

test("restore rejects unknown schema and a changed snapshot before replacing any caller state", async () => {
  const unknown = JSON.stringify({ schema: "katachi.skin.composition.v9", snapshotSha256: "0".repeat(64) });
  await assert.rejects(restoreCompositionProject(unknown), /Unknown composition package schema/);
  const corrupt = JSON.stringify({ schema: "katachi.skin.composition.v0", snapshotSha256: "0".repeat(64), host: {} });
  await assert.rejects(restoreCompositionProject(corrupt), /snapshot hash is invalid/);
});

test("motif loading rejects any NPZ/frame pair other than the locked source bytes", async () => {
  await assert.rejects(loadMotifPrototype(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])), /does not match the locked/);
});

test("restore rejects non-positive diameter before reading assets", async () => {
  const value = minimalBody({ ...DEFAULT_COMPOSITION_RECIPE, flowerCount: 1, branchDiameterMm: 0 });
  await assert.rejects(restoreCompositionProject(await signedProject(value)), /must be positive/);
});

test("restore rejects a branch graph with an unknown node reference", async () => {
  const value = {
    ...minimalBody(),
    branches: { recipe: "inset-relay-mst-v0", rootNodeId: "missing-node", insetMm: 8, diameterMm: 3, nodes: [], edges: [] },
  };
  await assert.rejects(restoreCompositionProject(await signedProject(value)), /invalid references/);
});

test("restore rejects changed Host identity metadata before decoding its payload", async () => {
  const recipe = { ...DEFAULT_COMPOSITION_RECIPE, flowerCount: 1 };
  const value = {
    ...minimalBody(recipe),
    branches: buildCompositionBranches([flower], recipe.branchDiameterMm, recipe.insetMm),
    host: {
      fileName: LOCKED_HOST_INPUT.fileName,
      sha256: "0".repeat(64),
      byteLength: LOCKED_HOST_INPUT.byteLength,
      bytesBase64: "",
      triangleCount: LOCKED_HOST_INPUT.triangleCount,
      sourceToScene: { units: "mm", upAxis: "z", handedness: "right", scale: 1, rotationXYZW: [0, 0, 0, 1], translation: LOCKED_HOST_INPUT.translation },
    },
  };
  await assert.rejects(restoreCompositionProject(await signedProject(value)), /metadata differs from the locked source/);
});

test("restore decodes a full-size Host base64 string without a regexp stack overflow", async () => {
  const recipe = { ...DEFAULT_COMPOSITION_RECIPE, flowerCount: 1 };
  const repetitions = Math.floor(LOCKED_HOST_INPUT.byteLength / 3);
  const remainder = LOCKED_HOST_INPUT.byteLength % 3;
  const bytesBase64 = "AAAA".repeat(repetitions) + (remainder === 1 ? "AA==" : remainder === 2 ? "AAA=" : "");
  const value = {
    ...minimalBody(recipe),
    branches: buildCompositionBranches([flower], recipe.branchDiameterMm, recipe.insetMm),
    host: {
      fileName: LOCKED_HOST_INPUT.fileName,
      sha256: LOCKED_HOST_INPUT.sha256,
      byteLength: LOCKED_HOST_INPUT.byteLength,
      bytesBase64,
      triangleCount: LOCKED_HOST_INPUT.triangleCount,
      sourceToScene: { units: "mm", upAxis: "z", handedness: "right", scale: 1, rotationXYZW: [0, 0, 0, 1], translation: LOCKED_HOST_INPUT.translation },
    },
  };
  await assert.rejects(restoreCompositionProject(await signedProject(value)), /neither a recognized binary nor ASCII STL/);
});
