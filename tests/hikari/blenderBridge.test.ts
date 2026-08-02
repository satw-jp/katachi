import assert from "node:assert/strict";
import test from "node:test";
import { blenderBridgeUrl } from "../../src/studies/cloud-sculpt/blenderBridge.ts";

test("Blender Bridge URL keeps a sanitized exported case identity", () => {
  assert.equal(
    blenderBridgeUrl("hikari-landscape-01"),
    "hikari-blender://open?case=hikari-landscape-01",
  );
});

test("Blender Bridge URL rejects paths and unsanitized names", () => {
  assert.throws(() => blenderBridgeUrl("../Downloads/private"));
  assert.throws(() => blenderBridgeUrl("作品 01"));
  assert.throws(() => blenderBridgeUrl(""));
});
