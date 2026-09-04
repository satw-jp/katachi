import assert from "node:assert/strict";
import test from "node:test";
import {
  isHanaDeleteKey,
  shouldIgnoreHanaDeleteForTarget,
} from "./keyboardRouting.ts";

test("keyboard Delete routing recognizes only the standard delete keys", () => {
  assert.equal(isHanaDeleteKey("Delete"), true);
  assert.equal(isHanaDeleteKey("Backspace"), true);
  assert.equal(isHanaDeleteKey("Enter"), false);
  assert.equal(isHanaDeleteKey(""), false);
});

test("keyboard Delete routing guards text and range controls but permits authoring UI", () => {
  assert.equal(shouldIgnoreHanaDeleteForTarget("input", false), true);
  assert.equal(shouldIgnoreHanaDeleteForTarget("textarea", false), true);
  assert.equal(shouldIgnoreHanaDeleteForTarget("select", false), true);
  assert.equal(shouldIgnoreHanaDeleteForTarget("input", true), true);
  assert.equal(shouldIgnoreHanaDeleteForTarget("button", false), false);
  assert.equal(shouldIgnoreHanaDeleteForTarget("canvas", false), false);
  assert.equal(shouldIgnoreHanaDeleteForTarget(null, false), false);
});
