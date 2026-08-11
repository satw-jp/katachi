import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getHikariPublishedStudyPreset } from "../../src/studies/cloud-sculpt/opticalStudyPreset.ts";

const ROOT = process.cwd();
const PUBLISHED_STUDIES = ["form-points", "flow-trails", "orbit", "optical-imprint", "dissolve-drawing"] as const;

test("published Hikari expression studies have immutable bounded presets and standalone entries", () => {
  for (const id of PUBLISHED_STUDIES) {
    const preset = getHikariPublishedStudyPreset(id);
    assert.ok(preset, `${id} preset`);
    assert.ok(preset.trailLength >= 0.01 && preset.trailLength <= 1.8);
    assert.ok(preset.speed >= 0.1 && preset.speed <= 20);
    assert.ok(preset.pointMotion >= 0 && preset.pointMotion <= 0.8);
    assert.ok(preset.opticalMapping >= 0 && preset.opticalMapping <= 20);
    assert.ok(preset.trailDensity >= 0.25 && preset.trailDensity <= 4);
    assert.ok(preset.causticBoost >= 0 && preset.causticBoost <= 8);
    const htmlPath = join(ROOT, "hikari/studies", id, "index.html");
    assert.ok(existsSync(htmlPath), `${id} HTML entry`);
    assert.match(readFileSync(htmlPath, "utf8"), new RegExp(`data-hikari-study=["']${id}["']`));
  }
  assert.equal(getHikariPublishedStudyPreset("unknown"), null);
});

test("Hikari build publishes the five existing causal light-drawing harnesses without copying them", () => {
  const config = readFileSync(join(ROOT, "vite.hikari.config.ts"), "utf8");
  for (const slug of ["thickness", "source-size", "stability", "shape-source", "shape-gesture"]) {
    assert.match(config, new RegExp(`studies/light-drawing/${slug}/index`));
  }
  assert.match(config, /tests\/hikari\/light-drawing\/harness\.html/);
  assert.doesNotMatch(config, /copyFileSync|cpSync/);
});
