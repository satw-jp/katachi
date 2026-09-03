import assert from "node:assert/strict";
import test from "node:test";
import { selectVideoMimeType } from "../capture/mimeType.ts";

test("MIME selector falls back through supported WebM candidates", () => {
  assert.equal(selectVideoMimeType((mime) => mime === "video/webm;codecs=vp8"), "video/webm;codecs=vp8");
  assert.equal(selectVideoMimeType(() => false), null);
});
