import assert from "node:assert/strict";
import {
  DEFAULT_CORE_NETWORK_PARAMS,
  ROUTE_STRATEGIES,
  buildCoreGraph,
  buildCenterStemGraph,
  createNetworkFixture,
  distance,
  dot,
  instancesForNodes,
  realizeRoutes,
  realizeCenterStemRoutes,
  selectPatch,
} from "./model.ts";
import { buildNetworkMesh, createNetworkField } from "./field.ts";
import { inspectCoreNetwork } from "./diagnostics.ts";

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

const params = { ...DEFAULT_CORE_NETWORK_PARAMS, buildDirection: { ...DEFAULT_CORE_NETWORK_PARAMS.buildDirection } };
const fixture = createNetworkFixture(params);

test("fixture is deterministic and comes from the 50% six-petal core packing", () => {
  const again = createNetworkFixture(params);
  assert.equal(fixture.nodes.length, again.nodes.length);
  assert.ok(fixture.nodes.length >= 40);
  assert.deepEqual(
    fixture.nodes.map((node) => [node.id, node.coreCenter]),
    again.nodes.map((node) => [node.id, node.coreCenter]),
  );
  assert.equal(fixture.packingParams.motif.petalCount, 6);
  assert.equal(fixture.packingParams.motif.showCore, true);
});

test("top side and bottom each select one central flower plus six neighbours", () => {
  const top = selectPatch(fixture.nodes, "top");
  const side = selectPatch(fixture.nodes, "side");
  const bottom = selectPatch(fixture.nodes, "bottom");
  for (const patch of [top, side, bottom]) {
    assert.equal(patch.length, 7);
    assert.equal(new Set(patch.map((node) => node.id)).size, 7);
  }
  assert.ok(Math.max(...top.map((node) => dot(node.normal, { x: 0, y: 1, z: 0 }))) > 0.9);
  assert.ok(Math.max(...side.map((node) => dot(node.normal, { x: 1, y: 0, z: 0 }))) > 0.9);
  assert.ok(Math.max(...bottom.map((node) => dot(node.normal, { x: 0, y: -1, z: 0 }))) > 0.9);
});

test("the deterministic graph is connected and loop amount creates redundancy", () => {
  const nodes = selectPatch(fixture.nodes, "top");
  const tree = buildCoreGraph(nodes, { ...params, loopAmount: 0 });
  const looped = buildCoreGraph(nodes, params);
  assert.equal(tree.length, nodes.length - 1);
  assert.ok(looped.length > tree.length);
  assert.deepEqual(looped, buildCoreGraph(nodes, params));
});

test("all three routes share edges, begin behind their cores, and remain deterministic", () => {
  const nodes = selectPatch(fixture.nodes, "top");
  const edges = buildCoreGraph(nodes, params);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const strategy of ROUTE_STRATEGIES) {
    const routes = realizeRoutes(nodes, edges, strategy, params);
    assert.deepEqual(routes, realizeRoutes(nodes, edges, strategy, params));
    assert.deepEqual(routes.map((route) => route.edge), edges);
    for (const route of routes) {
      const a = nodeById.get(route.edge.a)!;
      const b = nodeById.get(route.edge.b)!;
      assert.ok(distance(route.samples[0].position, a.coreCenter) <= params.rootInset + 1e-8);
      assert.ok(distance(route.samples.at(-1)!.position, b.coreCenter) <= params.rootInset + 1e-8);
      assert.ok(route.samples[0].radius > route.samples[Math.floor(route.samples.length / 2)].radius);
    }
  }
});

test("round and diamond fields both contain roots and route middles", () => {
  const nodes = selectPatch(fixture.nodes, "side");
  const edges = buildCoreGraph(nodes, params);
  const routes = realizeRoutes(nodes, edges, "build-arch", params);
  const instances = instancesForNodes(fixture.result, nodes);
  for (const crossSection of ["round", "diamond"] as const) {
    const field = createNetworkField(instances, fixture.packingParams, routes, { ...params, crossSection });
    for (const route of routes) {
      for (const sample of [route.samples[0], route.samples[Math.floor(route.samples.length / 2)], route.samples.at(-1)!]) {
        assert.ok(field.sample(sample.position.x, sample.position.y, sample.position.z) <= 0);
      }
    }
  }
});

test("a seven-flower arch derives a closed one-component manufacturing mesh", () => {
  const nodes = selectPatch(fixture.nodes, "top");
  const edges = buildCoreGraph(nodes, params);
  const routes = realizeRoutes(nodes, edges, "build-arch", params);
  const field = createNetworkField(instancesForNodes(fixture.result, nodes), fixture.packingParams, routes, params);
  const mesh = buildNetworkMesh(field, params, 88);
  const diagnostics = inspectCoreNetwork(nodes.map((node) => node.id), edges, mesh, field, params, 18);
  assert.ok(mesh.triangles.length > 0);
  assert.equal(diagnostics.graphComponents, 1);
  assert.equal(diagnostics.meshComponents, 1);
  assert.equal(diagnostics.watertight, true);
  assert.equal(diagnostics.printGeometryReady, true);
  assert.ok(Number.isFinite(diagnostics.support.maximumUnsupportedSpanMm));
});

test("radial stems from every flower converge into one closed center-connected mesh", () => {
  const nodes = selectPatch(fixture.nodes, "side");
  const edges = buildCenterStemGraph(nodes);
  const routes = realizeCenterStemRoutes(nodes, params);
  assert.equal(edges.length, nodes.length);
  assert.ok(routes.every((route) => distance(route.samples.at(-1)!.position, { x: 0, y: 0, z: 0 }) < 1e-9));
  const field = createNetworkField(instancesForNodes(fixture.result, nodes), fixture.packingParams, routes, params);
  const mesh = buildNetworkMesh(field, params, 104);
  const diagnostics = inspectCoreNetwork([...nodes.map((node) => node.id), -1], edges, mesh, field, params, 16);
  assert.equal(diagnostics.graphComponents, 1);
  assert.equal(diagnostics.meshComponents, 1);
  assert.equal(diagnostics.watertight, true);
  assert.equal(diagnostics.printGeometryReady, true);
});

if (!process.exitCode) console.log(`\n${passed} flower core network tests passed.`);
