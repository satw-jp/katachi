import assert from "node:assert/strict";
import test from "node:test";
import {
  blenderBridgePlatformLabel,
  blenderBridgeUrl,
} from "../../src/studies/cloud-sculpt/blenderBridge.ts";

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

test("Blender Bridge button names the local desktop platform", () => {
  assert.equal(blenderBridgePlatformLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Windows");
  assert.equal(blenderBridgePlatformLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "Mac");
  assert.equal(blenderBridgePlatformLabel("Mozilla/5.0 (X11; Linux x86_64)"), "PC");
});
