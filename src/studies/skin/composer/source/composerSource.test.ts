import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { composerSourceFromFkeiText } from "./composerSource.ts";

const samplePath = fileURLToPath(new URL("../../../../../public/samples/skin-rebuild-first-print.fkei", import.meta.url));

test("composer source reads the completed FKEI without changing production data", () => {
  const text = readFileSync(samplePath, "utf8");
  const source = composerSourceFromFkeiText(text);
  assert.match(source.fingerprint, /^fkei-[0-9a-f]+$/);
  assert.ok(source.statistics.nodeCount > 0);
  assert.ok(source.statistics.edgeCount > 0);
  assert.ok(source.statistics.motifCount > 0);
  assert.ok(source.span > 0);
  assert.equal(source.bounds.containsPoint(source.center), true);
  assert.equal(text, readFileSync(samplePath, "utf8"));
});
