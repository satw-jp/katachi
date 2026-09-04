import assert from "node:assert/strict";
import test from "node:test";
import { ARCHIVE_ITEMS, ARCHIVE_TOTAL, archiveItem } from "../registry.ts";

test("archive registers the complete six-generation catalog", () => {
  assert.equal(ARCHIVE_TOTAL, 40);
  assert.equal(new Set(ARCHIVE_ITEMS.map((item) => item.id)).size, 40);
  assert.deepEqual(
    Object.fromEntries(["works", "studies", "v1", "v2", "v3", "v4"].map((generation) => [generation, ARCHIVE_ITEMS.filter((item) => item.generation === generation).length])),
    { works: 10, studies: 9, v1: 5, v2: 5, v3: 1, v4: 10 },
  );
  assert.equal(archiveItem("mutual-rescue")?.id, "v4-mutual-rescue");
  assert.equal(archiveItem("study-field")?.generation, "studies");
  assert.equal(ARCHIVE_ITEMS.every((item) => item.versions.length > 0 && item.tags.length > 0), true);
  assert.equal(archiveItem("v4-mutual-rescue")?.versions.some((version) => version.status === "baseline"), true);
});
