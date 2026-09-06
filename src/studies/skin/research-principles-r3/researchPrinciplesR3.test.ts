import assert from "node:assert/strict";
import {
  advanceRedundantFreeform,
  createRedundantFreeformState,
  localDisplacement,
  runRedundantFreeform,
} from "./runtime/network.ts";
import { INITIAL_PARAMS, distance, type R3Params, type RedundantFreeformState } from "./runtime/types.ts";

const params: R3Params = { ...INITIAL_PARAMS };

function replay(seed: number, seconds: number): RedundantFreeformState {
  return runRedundantFreeform(createRedundantFreeformState(seed), seconds, params);
}

const initial = createRedundantFreeformState(240906);
assert.ok(initial.origins.length > 1, "the morphology begins with multiple origins");
assert.equal(initial.edges.length, 0, "origins begin as separate components");

const firstRun = replay(240906, 22);
const secondRun = replay(240906, 22);
assert.deepEqual(
  {
    nodes: firstRun.nodes.map((node) => ({ id: node.id, position: node.position, birthTime: node.birthTime })),
    edges: firstRun.edges.map((edge) => ({ id: edge.id, a: edge.a, b: edge.b, birthTime: edge.birthTime, reconnectionOrigin: edge.reconnectionOrigin })),
    events: firstRun.connectionEvents,
  },
  {
    nodes: secondRun.nodes.map((node) => ({ id: node.id, position: node.position, birthTime: node.birthTime })),
    edges: secondRun.edges.map((edge) => ({ id: edge.id, a: edge.a, b: edge.b, birthTime: edge.birthTime, reconnectionOrigin: edge.reconnectionOrigin })),
    events: secondRun.connectionEvents,
  },
  "same seed, parameters, and fixed time replay positions and edge history",
);

assert.ok(firstRun.connectionEvents.length >= 2, "multiple local reconnections accumulate");
assert.ok(firstRun.metrics.cycleRank > 0, "natural local reconnection creates a cycle");
assert.ok(firstRun.metrics.deadEnds > 0, "some trajectories remain valid dead ends");
assert.ok(
  firstRun.edges.length >= firstRun.nodes.length - firstRun.metrics.components + 1,
  "the graph does not collapse to a simple tree",
);
assert.ok(firstRun.history.length > firstRun.nodes.length, "construction history includes connection records");

let eventState = createRedundantFreeformState(240906);
let eventObserved = false;
for (let index = 0; index < 500 && !eventObserved; index += 1) {
  const previousEvents = eventState.connectionEvents.length;
  advanceRedundantFreeform(eventState, 0.1, params);
  eventObserved = eventState.connectionEvents.length > previousEvents;
}
assert.ok(eventObserved, "a connection event is observed during the deterministic run");
const event = eventState.connectionEvents[0];
assert.ok(event, "the first connection event is available");
const nearbyNodes = eventState.nodes.filter((node) => distance(node.position, event.origin) <= event.radius);
const farNodes = eventState.nodes.filter((node) => distance(node.position, event.origin) >= event.radius * 3);
const nearbyDisplacement = Math.max(...nearbyNodes.map((node) => localDisplacement(eventState, node.id)), 0);
const farDisplacement = Math.max(...farNodes.map((node) => localDisplacement(eventState, node.id)), 0);
assert.ok(nearbyDisplacement > 0, "nodes near a reconnection receive local relaxation displacement");
assert.ok(farDisplacement < nearbyDisplacement, "far network does not move as one global relaxation field");

const altered = replay(240906, 22);
const higherRedundancy = runRedundantFreeform(createRedundantFreeformState(240906), 22, { ...params, redundancy: 1.25 });
assert.notEqual(higherRedundancy.connectionEvents.length, altered.connectionEvents.length, "redundancy changes local reconnection propensity rather than directly setting loop count");

console.log("research-principles-r3 tests passed");
