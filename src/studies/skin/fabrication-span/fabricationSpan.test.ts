import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildFabricationSpanCoupon } from "./fabricationSpanCoupon.ts";
import { generateMaterialSpanGcode } from "./fabricationSpanGcode.ts";
import { materialSpanPathLengthMm } from "./fabricationSpanPath.ts";
import { FABRICATION_SPAN_PRESETS, findFabricationSpanPreset } from "./fabricationSpanPresets.ts";
import { validateMaterialSpanCoupon, validateMaterialSpanMotions } from "./fabricationSpanValidation.ts";

const GENERATOR_COMMIT = "a87e09794d07986ba792e928b52b6ac5eb61a373";

function artifact(variantId: "baseline" | "fast" | "slow" | "low-flow" | "high-lift") {
  return generateMaterialSpanGcode(buildFabricationSpanCoupon(variantId), { variantId, generatorCommit: GENERATOR_COMMIT });
}

test("all five variants are valid and deterministic byte-for-byte", () => {
  for (const preset of FABRICATION_SPAN_PRESETS) {
    const first = artifact(preset.id);
    const second = artifact(preset.id);
    assert.equal(first.gcode, second.gcode, `${preset.id} G-code must be deterministic`);
    assert.deepEqual(first.metadata, second.metadata, `${preset.id} metadata must be deterministic`);
    assert.equal(first.validation.ok, true);
    assert.ok(first.lineCount > 100);
    assert.ok(first.byteLength > 1_000);
  }
});

test("coupon path starts and ends at the exact anchors", () => {
  const coupon = buildFabricationSpanCoupon();
  assert.deepEqual(coupon.path.points[0], coupon.anchors.a.positionMm);
  assert.deepEqual(coupon.path.points.at(-1), coupon.anchors.b.positionMm);
  assert.equal(coupon.path.startAnchor.id, "A");
  assert.equal(coupon.path.endAnchor.id, "B");
  assert.equal(validateMaterialSpanCoupon(coupon).ok, true);
  assert.equal(materialSpanPathLengthMm(coupon.path) > 40, true, "lifted path must include departure/arrival movement");
});

test("exported span motions correspond to the accepted commanded path", () => {
  const coupon = buildFabricationSpanCoupon("baseline");
  const generated = artifact("baseline");
  const spanMotions = generated.motions.slice(-(coupon.path.points.length - 1));
  assert.equal(spanMotions.length, coupon.path.points.length - 1);
  for (let index = 0; index < spanMotions.length; index += 1) {
    assert.deepEqual(spanMotions[index].start, coupon.path.points[index]);
    assert.deepEqual(spanMotions[index].end, coupon.path.points[index + 1]);
  }
  assert.equal(validateMaterialSpanMotions(coupon, generated.motions).ok, true);
  assert.equal(generated.metadata.physicalInterpretation, "commanded-path-only; measure-final-filament");
});

test("non-finite and unsafe parameter values fail closed before G-code is produced", () => {
  assert.throws(() => generateMaterialSpanGcode(buildFabricationSpanCoupon("baseline", { printSpeedMmPerSec: 0 }), {
    variantId: "baseline",
    generatorCommit: GENERATOR_COMMIT,
  }), /validation failed/);
  assert.throws(() => generateMaterialSpanGcode(buildFabricationSpanCoupon("baseline", { spanLiftMm: Number.NaN }), {
    variantId: "baseline",
    generatorCommit: GENERATOR_COMMIT,
  }), /validation failed/);
  assert.equal(validateMaterialSpanCoupon(buildFabricationSpanCoupon("baseline", { fanPercent: 101 })).ok, false);
});

test("motion coordinates, feed, temperature, fan and absolute E obey the safety contract", () => {
  for (const preset of FABRICATION_SPAN_PRESETS) {
    const coupon = buildFabricationSpanCoupon(preset.id);
    const generated = artifact(preset.id);
    const result = validateMaterialSpanMotions(coupon, generated.motions);
    assert.deepEqual(result, { ok: true, errors: [] }, preset.id);
    assert.match(generated.gcode, /^; REVIEW ONLY/m);
    assert.match(generated.gcode, /G90\n.*M82/s);
    assert.doesNotMatch(generated.gcode, /G28|M104|M109|M140|M190|M106/);
    assert.equal(generated.metadata.parameters.fanPercent >= 0 && generated.metadata.parameters.fanPercent <= 100, true);
    let previousE = 0;
    for (const line of generated.gcode.split("\n")) {
      if (!/^G[01]\s/.test(line)) continue;
      for (const axis of ["X", "Y", "Z"]) {
        const value = line.match(new RegExp(`(?:^| )${axis}(-?\\d+(?:\\.\\d+)?)`))?.[1];
        assert.ok(value !== undefined, `${axis} must be explicit on every motion`);
        assert.equal(Number.isFinite(Number(value)), true);
      }
      const e = line.match(/(?:^| )E(-?\d+(?:\.\d+)?)/)?.[1];
      if (e !== undefined) {
        assert.equal(Number(e) >= previousE, true, "absolute E must be monotonic");
        previousE = Number(e);
      }
    }
  }
});

test("variants change only their named parameter and never pre-draw sag", () => {
  const baseline = findFabricationSpanPreset("baseline");
  for (const preset of FABRICATION_SPAN_PRESETS) {
    const changedKeys = (Object.keys(baseline.parameters) as Array<keyof typeof baseline.parameters>)
      .filter((key) => baseline.parameters[key] !== preset.parameters[key]);
    if (preset.id === "baseline") assert.deepEqual(changedKeys, []);
    else assert.deepEqual(changedKeys, [preset.changedParameter], preset.id);
    const coupon = buildFabricationSpanCoupon(preset.id);
    for (const point of coupon.path.points) assert.equal(Number.isFinite(point.z), true);
  }
  assert.equal(artifact("baseline").gcode.includes("Math.random"), false);
});

test("production SKIN has no dependency on the independent Fabrication Span study", () => {
  const skinDir = join(process.cwd(), "src", "studies", "skin");
  const fabricationDir = join(skinDir, "fabrication-span");
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (fullPath !== fabricationDir) visit(fullPath);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(fullPath);
      }
    }
  };
  visit(skinDir);
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /fabricationSpan|fabrication-span/i, file);
  }
});
