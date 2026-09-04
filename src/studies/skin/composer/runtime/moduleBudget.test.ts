import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { composerSourceFromFkeiText } from "../source/composerSource.ts";
import { composerBudget } from "./moduleBudget.ts";

const samplePath = fileURLToPath(new URL("../../../../../public/samples/skin-rebuild-first-print.fkei", import.meta.url));

test("composer budget is source-derived and deterministic", () => {
  const source = composerSourceFromFkeiText(readFileSync(samplePath, "utf8"));
  const first = composerBudget(source);
  assert.deepEqual(composerBudget(source), first);
  assert.ok(first.pointLike > 0);
  assert.ok(first.gaussian > 0);
  assert.ok(first.complexityScale > 0);
});
