import assert from "node:assert/strict";
import test from "node:test";
import { ARCHIVE_ITEMS } from "../registry.ts";
import { jaccardSimilarity, relatedArchiveItems } from "../similarity.ts";

test("similarity is deterministic Jaccard over the declared signature", () => {
  const left = ARCHIVE_ITEMS.find((item) => item.id === "study-gaussian")!;
  const right = ARCHIVE_ITEMS.find((item) => item.id === "v2-luminous-cloud")!;
  assert.equal(jaccardSimilarity(left, left), 1);
  assert.equal(jaccardSimilarity(left, right), jaccardSimilarity(right, left));
  assert.ok(jaccardSimilarity(left, right) > 0);
  const related = relatedArchiveItems(left, ARCHIVE_ITEMS);
  assert.equal(related.length, 5);
  assert.equal(related.every((entry) => entry.item.id !== left.id), true);
  assert.ok(related[0]!.score >= related.at(-1)!.score);
});
