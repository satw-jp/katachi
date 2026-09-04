import assert from "node:assert/strict";
import test from "node:test";
import { chooseHanaSelectionCandidate } from "./selectionHitTest.ts";

test("semantic hit testing chooses the closest candidate and ignores misses", () => {
  const result = chooseHanaSelectionCandidate([
    { kind: "stroke", id: "stroke-2", distance: 11 },
    { kind: "stroke", id: "stroke-1", distance: 4 },
    { kind: "flower", id: "flower-1", distance: 30 },
  ], 18);
  assert.deepEqual(result, { kind: "stroke", id: "stroke-1", distance: 4, frontMost: 0 });
});

test("semantic hit testing uses front-most then stable kind/id tie breaks", () => {
  assert.equal(chooseHanaSelectionCandidate([
    { kind: "stroke", id: "stroke-1", distance: 5, frontMost: 1 },
    { kind: "flower", id: "flower-1", distance: 5, frontMost: 2 },
  ], 18)?.id, "flower-1");
  assert.equal(chooseHanaSelectionCandidate([
    { kind: "stroke", id: "stroke-z", distance: 5 },
    { kind: "stroke", id: "stroke-a", distance: 5 },
  ], 18)?.id, "stroke-a");
  assert.equal(chooseHanaSelectionCandidate([{ kind: "stroke", id: "stroke-1", distance: 19 }], 18), null);
});
