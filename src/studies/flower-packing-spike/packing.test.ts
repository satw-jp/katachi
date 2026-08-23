import assert from "node:assert/strict";
import {
  DEFAULT_PACKING_PARAMS,
  DOMAIN_RADIUS,
  PACKING_MOTIF_PRESETS,
  collisionProxies,
  createComparison,
  createInitialInstances,
  flowerComponents,
  packingMotifFromSearch,
  packingMotifToSearch,
  parseComparison,
  recommendedPackingCount,
  measureSurfaceCoverage,
  serializeComparison,
  softPetalDisplacementLimit,
  solvePacking,
} from "./packing.ts";
import { flowerFieldSdf, unifiedSamplingCube } from "./unifiedField.ts";
import {
  DEFAULT_FLOWER_FORM_PARAMS,
  FLOWER_PETAL_COUNTS,
  FLOWER_FORM_VARIANTS,
  createFlowerFormComponents,
  paramsForFlowerVariant,
} from "./flowerForm.ts";
import {
  DEFAULT_LACE_MESH_OPTIONS,
  buildLaceMesh,
  encodeLaceStl,
  inspectLaceConnectivity,
} from "./laceMesh.ts";

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

test("the selected Form Atlas motif packs rigidly beside the current four-petal flower", () => {
  const tenRing = PACKING_MOTIF_PRESETS.find((preset) => preset.id === "ten-ring");
  assert.ok(tenRing);
  const params = {
    ...DEFAULT_PACKING_PARAMS,
    count: 10,
    iterations: 50,
    motif: { ...tenRing.definition },
  };
  const comparison = createComparison(params, "motif");
  assert.equal(comparison.left.params.motif.petalCount, 4);
  assert.equal(comparison.left.params.motif.showCore, true);
  assert.equal(comparison.right.params.motif.petalCount, 10);
  assert.equal(comparison.right.params.motif.showCore, false);

  const leftInitial = createInitialInstances(comparison.left.params);
  const rightInitial = createInitialInstances(comparison.right.params);
  for (let index = 0; index < leftInitial.length; index++) {
    assert.deepEqual(
      rightInitial[index].anchor,
      leftInitial[index].anchor,
      "motif comparison lost its shared seeded anchor",
    );
    assert.equal(
      rightInitial[index].angle,
      leftInitial[index].angle,
      "motif comparison lost its shared seeded angle",
    );
  }

  const chosen = comparison.right.result.instances[0];
  const components = flowerComponents(chosen, comparison.right.params);
  assert.equal(components.length, 10);
  assert.ok(components.every((component) => component.kind === "petal"));
  const center = components.reduce(
    (sum, component) => ({
      x: sum.x + component.position.x / components.length,
      y: sum.y + component.position.y / components.length,
      z: sum.z + component.position.z / components.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const proxies = collisionProxies([chosen], comparison.right.params, "multi");
  assert.ok(proxies.every((proxy) => Math.hypot(
    proxy.position.x - center.x,
    proxy.position.y - center.y,
    proxy.position.z - center.z,
  ) > params.flowerSize * 0.3), "coreless packing inserted a hidden centre proxy");
});

test("every geometric Form Atlas setting survives URL and comparison-record handoff exactly", () => {
  const custom = {
    petalCount: 9 as const,
    showCore: false,
    opening: 1.17,
    neck: 0.23,
    coreSize: 0.71,
    cupping: 0.41,
    coreLift: 0.29,
    growthDifference: 0.27,
  };
  assert.deepEqual(packingMotifFromSearch(packingMotifToSearch(custom)), custom);

  const comparison = createComparison(
    { ...DEFAULT_PACKING_PARAMS, count: 8, iterations: 30, motif: custom },
    "motif",
  );
  const reopened = parseComparison(serializeComparison(comparison));
  assert.deepEqual(reopened.params.motif, custom);
  assert.deepEqual(reopened.right.params.motif, custom);
});

test("dense coreless corollas start with a readable count without becoming capped", () => {
  const ring = {
    ...PACKING_MOTIF_PRESETS.find((preset) => preset.id === "ten-ring")!.definition,
    petalCount: 11 as const,
  };
  assert.equal(recommendedPackingCount(ring), 18);
  assert.equal(recommendedPackingCount({ ...ring, showCore: true }), 20);
  assert.equal(recommendedPackingCount({ ...ring, petalCount: 9 }), 34);

  const comparison = createComparison(
    { ...DEFAULT_PACKING_PARAMS, packingBasis: "count", count: 24, motif: ring },
    "motif",
  );
  assert.equal(comparison.params.count, 24, "the recommendation became a hard packing cap");
});

test("surface coverage gives each motif its own count under one target", () => {
  const ring = {
    ...PACKING_MOTIF_PRESETS.find((preset) => preset.id === "ten-ring")!.definition,
    petalCount: 11 as const,
  };
  const comparison = createComparison(
    { ...DEFAULT_PACKING_PARAMS, packingBasis: "coverage", targetCoverage: 0.2, motif: ring },
    "motif",
  );
  assert.notEqual(comparison.left.params.count, comparison.right.params.count);
  for (const panel of [comparison.left, comparison.right]) {
    assert.ok(Math.abs(panel.result.diagnostics.materialCoverage - 0.2) <= 0.015);
    assert.ok(panel.result.diagnostics.territoryCoverage >= panel.result.diagnostics.materialCoverage);
    assert.equal(panel.result.diagnostics.coverageSamples, 3072);
  }
});

test("a coreless flower leaves more measured surface uncovered than the same flower with a core", () => {
  const ring = {
    ...PACKING_MOTIF_PRESETS.find((preset) => preset.id === "ten-ring")!.definition,
    petalCount: 11 as const,
  };
  const corelessParams = { ...DEFAULT_PACKING_PARAMS, packingBasis: "count" as const, count: 8, motif: ring };
  const coreParams = { ...corelessParams, motif: { ...ring, showCore: true } };
  const corelessCoverage = measureSurfaceCoverage(createInitialInstances(corelessParams), corelessParams);
  const coreCoverage = measureSurfaceCoverage(createInitialInstances(coreParams), coreParams);
  assert.ok(coreCoverage.material > corelessCoverage.material);
  assert.ok(corelessCoverage.territory > corelessCoverage.material);
});

test("higher coverage and fusion connect the packed flowers while a sparse field stays separated", () => {
  const motif = { ...PACKING_MOTIF_PRESETS[1].definition };
  const sparse = createComparison(
    { ...DEFAULT_PACKING_PARAMS, targetCoverage: 0.2, motif },
    "motif",
  ).right;
  const dense = createComparison(
    { ...DEFAULT_PACKING_PARAMS, targetCoverage: 0.5, motif },
    "motif",
  ).right;
  assert.ok(inspectLaceConnectivity(sparse.result, sparse.params, 0.03).groups > 1);
  assert.equal(inspectLaceConnectivity(dense.result, dense.params, 0.1).groups, 1);
});

test("the dense flower-only lace becomes one closed printable STL component", () => {
  const motif = { ...PACKING_MOTIF_PRESETS[1].definition };
  const chosen = createComparison(
    { ...DEFAULT_PACKING_PARAMS, targetCoverage: 0.5, motif },
    "motif",
  ).right;
  const inspection = buildLaceMesh(chosen.result, chosen.params, {
    ...DEFAULT_LACE_MESH_OPTIONS,
    resolution: 40,
  });
  assert.equal(inspection.instanceGroups, 1);
  assert.equal(inspection.meshComponents, 1);
  assert.equal(inspection.mesh.watertight.ok, true);
  assert.ok(inspection.minimumBridgeMm >= inspection.options.minimumThicknessMm);
  assert.equal(inspection.printReady, true);
  assert.ok(encodeLaceStl(inspection, "flower-lace-test").byteLength > 84);
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

test("older count records reopen in count mode and gain coverage diagnostics", () => {
  const original = createComparison({ ...denseParams, packingBasis: "count" }, "motif");
  const record = JSON.parse(serializeComparison(original));
  delete record.comparison.params.packingBasis;
  delete record.comparison.params.targetCoverage;
  for (const side of ["left", "right"] as const) {
    delete record.comparison[side].params.packingBasis;
    delete record.comparison[side].params.targetCoverage;
    delete record.comparison[side].result.diagnostics.materialCoverage;
    delete record.comparison[side].result.diagnostics.territoryCoverage;
    delete record.comparison[side].result.diagnostics.coverageSamples;
  }
  const reopened = parseComparison(JSON.stringify(record));
  assert.equal(reopened.params.packingBasis, "count");
  assert.equal(reopened.params.count, original.params.count);
  assert.ok(reopened.left.result.diagnostics.coverageSamples >= 256);
  assert.ok(reopened.right.result.diagnostics.materialCoverage > 0);
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

test("the one-flower checkpoint builds connected 3-to-12-petal forms under the same controls", () => {
  const blend = 0.72 * 0.2;
  for (const petalCount of FLOWER_PETAL_COUNTS) {
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

test("coreless flowers stay connected as a petal ring without a hidden core", () => {
  const blend = 0.72 * 0.2;
  for (const petalCount of FLOWER_PETAL_COUNTS) {
    const components = createFlowerFormComponents(petalCount, DEFAULT_FLOWER_FORM_PARAMS, false);
    assert.equal(components.length, petalCount);
    assert.ok(components.every((component) => component.kind === "petal"));
    for (let index = 0; index < components.length; index++) {
      const petal = components[index];
      const neighbour = components[(index + 1) % components.length];
      for (let step = 0; step <= 24; step++) {
        const t = step / 24;
        const point = {
          x: petal.position.x + (neighbour.position.x - petal.position.x) * t,
          y: petal.position.y + (neighbour.position.y - petal.position.y) * t,
          z: petal.position.z + (neighbour.position.z - petal.position.z) * t,
        };
        assert.ok(
          flowerFieldSdf(components, point, blend, DEFAULT_FLOWER_FORM_PARAMS.neck) <= 0,
          `${petalCount}-petal coreless ring lost its neighbour connection`,
        );
      }
    }
  }

  for (const petalCount of FLOWER_PETAL_COUNTS) {
    if (petalCount < 5) continue;
    const components = createFlowerFormComponents(petalCount, DEFAULT_FLOWER_FORM_PARAMS, false);
    assert.ok(
      flowerFieldSdf(
        components,
        { x: 0, y: 0, z: components[0].position.z },
        blend,
        DEFAULT_FLOWER_FORM_PARAMS.neck,
      ) > 0,
      `${petalCount}-petal coreless form unexpectedly filled its central opening`,
    );
  }

  const sixPetals = createFlowerFormComponents(6, DEFAULT_FLOWER_FORM_PARAMS, false);
  const twelvePetals = createFlowerFormComponents(12, DEFAULT_FLOWER_FORM_PARAMS, false);
  assert.ok(
    twelvePetals[0].radius < sixPetals[0].radius,
    "higher petal counts should share a comparable envelope with smaller petals",
  );
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
