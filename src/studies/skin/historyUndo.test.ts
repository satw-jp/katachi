import assert from "node:assert/strict";
import { DEFAULT_FIELD_PARAMS } from "../cloud-sculpt/field.ts";
import { createEmptyState, record, undoLastHistoryEntry, type SkinHistoryEntry } from "./history.ts";

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

if (process.exitCode) process.exit(process.exitCode);
console.log(`${passed} history undo tests passed`);
