import assert from "node:assert/strict";
import test from "node:test";
import { parseArchiveUrl, serializeArchiveUrl } from "../urlState.ts";

test("archive URL state round-trips search, filters, view, and selected item", () => {
  const state = parseArchiveUrl("?view=similarity&item=mutual-rescue&q=light&generation=v4&genre=support-relation&source=GRAPH&primitive=GAUSSIAN&time=EVENT&space=CAMERA%20JOURNEY");
  assert.equal(state.view, "similarity");
  assert.equal(state.item, "mutual-rescue");
  assert.equal(state.query, "light");
  assert.equal(state.space, "CAMERA JOURNEY");
  const serialized = serializeArchiveUrl("https://example.test/skin-art/", state);
  const roundTrip = parseArchiveUrl(new URL(serialized).search);
  assert.deepEqual(roundTrip, state);
});
