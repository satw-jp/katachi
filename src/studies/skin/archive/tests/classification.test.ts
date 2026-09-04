import assert from "node:assert/strict";
import test from "node:test";
import { ARCHIVE_ITEMS } from "../registry.ts";
import { archiveAxisValues, archiveSignature } from "../classification.ts";

test("archive signatures are made from the declared research axes", () => {
  const gaussian = ARCHIVE_ITEMS.find((item) => item.id === "study-gaussian")!;
  const signature = archiveSignature(gaussian);
  assert.equal(signature.has("GAUSSIAN"), true);
  assert.equal(signature.has("LIGHT"), true);
  assert.equal(signature.has("SCREEN-FILLING"), true);
  assert.equal(archiveAxisValues(gaussian).includes("GAUSSIAN"), true);
  assert.equal(ARCHIVE_ITEMS.every((item) => archiveSignature(item).size > 0), true);
});
