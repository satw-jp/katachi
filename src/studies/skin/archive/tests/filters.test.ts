import assert from "node:assert/strict";
import test from "node:test";
import { ARCHIVE_ITEMS } from "../registry.ts";
import { filterArchiveItems } from "../filters.ts";

test("archive filters combine exact axis constraints", () => {
  const gaussianResults = filterArchiveItems(ARCHIVE_ITEMS, { query: "", generation: "", genre: "light-atmosphere", source: "", primitive: "GAUSSIAN", time: "", space: "" });
  assert.ok(gaussianResults.length >= 3);
  assert.equal(gaussianResults.every((item) => item.primaryGenre === "light-atmosphere" && item.primitives.includes("GAUSSIAN")), true);
  const growthResults = filterArchiveItems(ARCHIVE_ITEMS, { query: "", generation: "", genre: "support-relation", source: "", primitive: "", time: "GROWTH", space: "" });
  assert.ok(growthResults.length > 0);
  assert.equal(growthResults.every((item) => item.primaryGenre === "support-relation" && item.temporalModes.includes("GROWTH")), true);
});
