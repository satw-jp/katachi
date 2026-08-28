import assert from "node:assert/strict";
import { DEFAULT_FIELD_PARAMS, resetBallIdCounter } from "../cloud-sculpt/field.ts";
import { captureMotifShapeParams, DEFAULT_SKIN_PARAMS, resetPatchIdCounter, type SkinParams } from "./field.ts";
import {
  createEmptyState,
  DEFAULT_SKIN_HOST_PARAMS,
  parseRecipe,
  record,
  replay,
  serializeRecipe,
  undoLastHistoryEntry,
  type SkinHistoryEntry,
} from "./history.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("undo removes the first surface packing and keeps the visible host baseline", () => {
  const history: SkinHistoryEntry[] = [];
  const state = createEmptyState();
  record(history, state, "growHost", { params: { ...DEFAULT_FIELD_PARAMS } });
  record(history, state, "packPatches", {
    identity: "replace",
    patches: [{ id: 1, shape: "coin", points: [{ id: 1, x: 0, y: 0, z: 0, r: 0.2 }] }],
  });

  const result = undoLastHistoryEntry(history);

  assert.equal(result.undone?.op, "packPatches");
  assert.equal(result.history.length, 1);
  assert.equal(result.state.host.length, state.host.length);
  assert.equal(result.state.patches.length, 0);
  assert.equal(history.length, 2, "undo must not mutate the input history");
});

test("undo stops at the initial host baseline", () => {
  const history: SkinHistoryEntry[] = [];
  const state = createEmptyState();
  record(history, state, "growHost", { params: { ...DEFAULT_FIELD_PARAMS } });

  const result = undoLastHistoryEntry(history);

  assert.equal(result.undone, null);
  assert.equal(result.history.length, 1);
  assert.equal(result.state.host.length, state.host.length);
});

test("current SkinParams recipe export parses and replays losslessly", () => {
  resetBallIdCounter(1);
  resetPatchIdCounter(1);
  const history: SkinHistoryEntry[] = [];
  const state = createEmptyState();
  record(history, state, "growHost", { params: { ...DEFAULT_SKIN_HOST_PARAMS } });

  // Exercise every current SkinParams field, including the Internal
  // Structure controls added after the original recipe format was defined.
  const current: SkinParams = {
    ...DEFAULT_SKIN_PARAMS,
    patchShape: "ring3d",
    motifPlacement: "inside",
    surfaceGenerationMode: "quadFlow",
    quadTilingMode: "varied",
    internalStructure: "voronoiEdge",
    internalDensity: 36,
    internalRadius: 0.06,
    internalRandomness: 0.4,
    coinBulge: 0.08,
    coinBulgeBalance: -0.4,
  };
  for (const key of Object.keys(current) as Array<keyof SkinParams>) {
    record(history, state, "setSkinParam", { key, value: current[key] });
  }
  record(history, state, "packPatches", {
    identity: "replace",
    patches: [{
      id: 7,
      shape: "ring3d",
      motifPlacement: "inside",
      ringDiameter: 0.72,
      motifParams: captureMotifShapeParams(current),
      points: [
        { id: 7, x: 0.1, y: 0.2, z: 0.3, r: 0.06, ringPrimary: true },
        { id: 8, x: -0.1, y: -0.2, z: -0.3, r: 0.06, ringPrimary: true },
      ],
    }],
  });
  record(history, state, "setMode", { mode: "window" });

  const text = serializeRecipe(history);
  const parsed = parseRecipe(text);
  const replayed = replay(parsed);

  assert.deepEqual(replayed, state);
  assert.deepEqual(parsed, history);
  assert.equal(JSON.parse(text).formatVersion, 1, "the export schema remains formatVersion 1");
  assert.deepEqual(parseRecipe(JSON.stringify(history)), history, "legacy array recipes remain readable");
  assert.deepEqual(parseRecipe(JSON.stringify({ entries: history })), history, "legacy entries recipes remain readable");
});

if (process.exitCode) process.exit(process.exitCode);
console.log(`${passed} history undo tests passed`);
