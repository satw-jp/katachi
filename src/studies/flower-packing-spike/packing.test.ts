import assert from "node:assert/strict";
import {
  DEFAULT_PACKING_PARAMS,
  DOMAIN_RADIUS,
  createComparison,
  createInitialInstances,
  flowerComponents,
  parseComparison,
  serializeComparison,
  softPetalDisplacementLimit,
  solvePacking,
} from "./packing.ts";
import { flowerFieldSdf, unifiedSamplingCube } from "./unifiedField.ts";
import {
  DEFAULT_FLOWER_FORM_PARAMS,
  FLOWER_FORM_VARIANTS,
  createFlowerFormComponents,
  paramsForFlowerVariant,
} from "./flowerForm.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const denseParams = {
  ...DEFAULT_PACKING_PARAMS,
  count: 28,
  flowerSize: 0.28,
  iterations: 80,
  seed: 917,
};

test("same seed and parameters reproduce identical transforms and diagnostics", () => {
  assert.deepEqual(createComparison(denseParams, "response"), createComparison(denseParams, "response"));
});

test("rigid packing preserves every petal rest offset", () => {
  const initial = createInitialInstances(denseParams);
  const result = solvePacking(initial, denseParams, "rigid", "multi");
  for (let instanceIndex = 0; instanceIndex < initial.length; instanceIndex++) {
    assert.deepEqual(result.instances[instanceIndex].petals, initial[instanceIndex].petals);
  }
  assert.equal(result.diagnostics.meanDeformation, 0);
});

test("soft packing records a finite non-zero deformation in a dense case", () => {
  const initial = createInitialInstances(denseParams);
  const result = solvePacking(initial, denseParams, "soft", "multi");
  assert.ok(Number.isFinite(result.diagnostics.meanDeformation));
  assert.ok(result.diagnostics.meanDeformation > 0);
  assert.ok(result.diagnostics.maxDeformation >= result.diagnostics.meanDeformation);
  assert.ok(
    result.diagnostics.maxDeformation <=
      softPetalDisplacementLimit(denseParams) / (denseParams.flowerSize * 1.06) + 1e-9,
  );
});

test("sphere-domain anchors remain projected to the same surface", () => {
  const comparison = createComparison(denseParams, "response");
  for (const panel of [comparison.left, comparison.right]) {
    for (const instance of panel.result.instances) {
      assert.ok(Math.abs(Math.hypot(instance.anchor.x, instance.anchor.y, instance.anchor.z) - DOMAIN_RADIUS) < 1e-6);
    }
    assert.equal(panel.result.diagnostics.outsideCount, 0);
  }
});

test("saved comparison round-trips without rerunning the solver", () => {
  const original = createComparison(denseParams, "proxy");
  assert.deepEqual(parseComparison(serializeComparison(original)), original);
});

test("the unified field keeps every core-to-petal path inside for Rigid and Soft", () => {
  const comparison = createComparison(denseParams, "response");
  const blend = denseParams.flowerSize * 0.24;
  for (const panel of [comparison.left, comparison.right]) {
    for (const instance of panel.result.instances) {
      const components = flowerComponents(instance, denseParams);
      const core = components[0];
      for (const petal of components.slice(1)) {
        for (let step = 0; step <= 24; step++) {
          const t = step / 24;
          const point = {
            x: core.position.x + (petal.position.x - core.position.x) * t,
            y: core.position.y + (petal.position.y - core.position.y) * t,
            z: core.position.z + (petal.position.z - core.position.z) * t,
          };
          assert.ok(
            flowerFieldSdf(components, point, blend) <= 0,
            `${panel.result.response} flower ${instance.id} lost its core-petal field connection`,
          );
        }
      }
    }
  }
});

test("the unified sampling cube contains every deformed Soft component inside the meshing guard band", () => {
  const comparison = createComparison(denseParams, "response");
  const blend = denseParams.flowerSize * 0.24;
  for (const instance of comparison.right.result.instances) {
    const components = flowerComponents(instance, denseParams);
    const cube = unifiedSamplingCube(components, blend, 20);
    for (const component of components) {
      const expandedRadius = component.radius + blend * 0.35;
      for (const axis of ["x", "y", "z"] as const) {
        const normalizedExtent =
          (Math.abs(component.position[axis] - cube.center[axis]) + expandedRadius) / cube.halfExtent;
        assert.ok(
          normalizedExtent <= cube.usableRatio + 1e-10,
          `soft flower ${instance.id} ${axis}-extent can be clipped by the meshing boundary`,
        );
      }
    }
  }
});

test("the one-flower checkpoint builds connected 3-petal and 4-petal forms under the same controls", () => {
  const blend = 0.72 * 0.2;
  for (const petalCount of [3, 4] as const) {
    const components = createFlowerFormComponents(petalCount, DEFAULT_FLOWER_FORM_PARAMS);
    assert.equal(components.length, petalCount + 1);
    const core = components[0];
    for (const petal of components.slice(1)) {
      for (let step = 0; step <= 24; step++) {
        const t = step / 24;
        const point = {
          x: core.position.x + (petal.position.x - core.position.x) * t,
          y: core.position.y + (petal.position.y - core.position.y) * t,
          z: core.position.z + (petal.position.z - core.position.z) * t,
        };
        assert.ok(
          flowerFieldSdf(components, point, blend, DEFAULT_FLOWER_FORM_PARAMS.neck) <= 0,
          `${petalCount}-petal form lost its core-petal connection`,
        );
      }
    }
  }
});

test("every Form Atlas cause remains deterministic, three-dimensional, and field-connected", () => {
  const blend = 0.72 * 0.2;
  for (const variant of FLOWER_FORM_VARIANTS) {
    const params = paramsForFlowerVariant(variant.id);
    const first = createFlowerFormComponents(4, params);
    const second = createFlowerFormComponents(4, params);
    assert.deepEqual(second, first, `${variant.id} did not reproduce exactly`);

    const core = first[0];
    for (const petal of first.slice(1)) {
      for (let step = 0; step <= 24; step++) {
        const t = step / 24;
        const point = {
          x: core.position.x + (petal.position.x - core.position.x) * t,
          y: core.position.y + (petal.position.y - core.position.y) * t,
          z: core.position.z + (petal.position.z - core.position.z) * t,
        };
        assert.ok(
          flowerFieldSdf(first, point, blend, params.neck) <= 0,
          `${variant.id} lost its core-petal field connection`,
        );
      }
    }
  }

  const flat = createFlowerFormComponents(4, paramsForFlowerVariant("flat"));
  assert.ok(flat.every((component) => component.position.z === 0));
  const cupped = createFlowerFormComponents(4, paramsForFlowerVariant("cupped"));
  assert.ok(cupped.slice(1).every((petal) => petal.position.z > cupped[0].position.z));
  const raised = createFlowerFormComponents(4, paramsForFlowerVariant("raised-core"));
  assert.ok(raised[0].position.z > Math.max(...raised.slice(1).map((petal) => petal.position.z)));
  const growth = createFlowerFormComponents(4, paramsForFlowerVariant("growth-difference"));
  assert.ok(new Set(growth.slice(1).map((petal) => petal.radius)).size > 1);
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.error("SOME TESTS FAILED");
else console.log("ALL TESTS PASSED");
