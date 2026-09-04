import assert from "node:assert/strict";
import test from "node:test";
import { ARCHIVE_ITEMS } from "../registry.ts";
import { searchArchiveItems } from "../search.ts";

test("archive search reaches titles, descriptions, and tags", () => {
  assert.ok(searchArchiveItems(ARCHIVE_ITEMS, "gaussian").some((item) => item.id === "study-gaussian"));
  assert.ok(searchArchiveItems(ARCHIVE_ITEMS, "hesitation").some((item) => item.id === "study-residue"));
  assert.equal(searchArchiveItems(ARCHIVE_ITEMS, "not-a-real-exploration").length, 0);
});
