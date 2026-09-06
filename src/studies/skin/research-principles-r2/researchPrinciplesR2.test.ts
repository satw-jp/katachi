import assert from "node:assert/strict";
import { advanceMotifTension, createMotifTensionState } from "./studies/motifTension.ts";
import { advanceMultiReconnect, createMultiReconnectState } from "./studies/multiReconnect.ts";
import { advanceRelaxRewire, createRelaxRewireState } from "./studies/relaxRewire.ts";

function run<T>(state: T, seconds: number, update: (current: T, deltaSeconds: number) => T): T {
  let current = state;
  const steps = Math.ceil(seconds / 0.1);
  for (let index = 0; index < steps; index += 1) current = update(current, Math.min(0.1, seconds - index * 0.1));
  return current;
}

const multiInitial = createMultiReconnectState(240906);
assert.ok(multiInitial.connectedComponents > 1, "multi reconnect starts with separate components");
assert.equal(multiInitial.pulseState.reachable, false, "pulse is initially confined");
const multiFinal = run(multiInitial, 24, (state, delta) => advanceMultiReconnect(state, delta, {
  growth: 1,
  reconnectRadius: 0.085,
  connectionRate: 1.2,
}));
assert.ok(multiFinal.reconnectCount >= 3, "multiple reconnection events accumulate");
assert.ok(multiFinal.pulseState.reachable, "a functional route becomes reachable after reconnection");
assert.ok(multiFinal.cycleCount >= 1, "an alternative route creates a cycle");
const multiReplay = run(createMultiReconnectState(240906), 24, (state, delta) => advanceMultiReconnect(state, delta, {
  growth: 1,
  reconnectRadius: 0.085,
  connectionRate: 1.2,
}));
assert.deepEqual(multiFinal.connectionHistory, multiReplay.connectionHistory, "same seed and time replay connection history");

const tensionInitial = createMotifTensionState(240906);
const tensionTopology = tensionInitial.topology;
const tensionMoved = run(tensionInitial, 4.2, (state, delta) => advanceMotifTension(state, delta, {
  prestress: 0.06,
  damping: 0.86,
  motifMotion: 1,
}));
assert.ok(tensionMoved.anchorMotionCount > 0, "motif movement changes anchor position");
assert.ok(tensionMoved.maxNetForce > 0, "anchor movement creates non-zero network force");
const tensionHeld = run(tensionMoved, 2.1, (state, delta) => advanceMotifTension(state, delta, {
  prestress: 0.06,
  damping: 0.86,
  motifMotion: 1,
}));
assert.ok(tensionHeld.settledDuration > 0, "settling duration comes from measured residual state");
assert.equal(tensionHeld.topology, tensionTopology, "motif tension never rewires topology");
const highPrestress = run(createMotifTensionState(240906), 5.2, (state, delta) => advanceMotifTension(state, delta, {
  prestress: 0.14,
  damping: 0.86,
  motifMotion: 1,
}));
const lowPrestress = run(createMotifTensionState(240906), 5.2, (state, delta) => advanceMotifTension(state, delta, {
  prestress: 0.02,
  damping: 0.86,
  motifMotion: 1,
}));
assert.notDeepEqual(highPrestress.nodes.map((node) => node.position), lowPrestress.nodes.map((node) => node.position), "prestress changes transient response");

const rewireInitial = createRelaxRewireState(240906);
const rewireBefore = run(rewireInitial, 3.5, (state, delta) => advanceRelaxRewire(state, delta, {
  motifMotion: 1,
  instabilityThreshold: 0.18,
  damping: 0.86,
}));
assert.equal(rewireBefore.rewired, false, "topology stays fixed before instability");
assert.equal(rewireBefore.topologyAfter, rewireBefore.topologyBefore, "no early topology change");
const rewireAfter = run(rewireBefore, 9, (state, delta) => advanceRelaxRewire(state, delta, {
  motifMotion: 1,
  instabilityThreshold: 0.18,
  damping: 0.86,
}));
assert.equal(rewireAfter.rewireHistory.length, 1, "one discrete rewire event occurs");
assert.equal(rewireAfter.rewired, true, "actual instability triggers rewire");
assert.notEqual(rewireAfter.topologyAfter, rewireAfter.topologyBefore, "adjacency changes at rewire");
assert.deepEqual(rewireAfter.nodes.map((node) => node.id), rewireInitial.nodes.map((node) => node.id), "node IDs remain stable");
assert.ok(rewireAfter.meanVelocity >= 0, "post-event relaxation remains measurable");
const rewireReplay = run(createRelaxRewireState(240906), 12.5, (state, delta) => advanceRelaxRewire(state, delta, {
  motifMotion: 1,
  instabilityThreshold: 0.18,
  damping: 0.86,
}));
assert.deepEqual(rewireAfter.rewireHistory, rewireReplay.rewireHistory, "same input replays rewire history");

console.log("research-principles-r2 tests passed");
