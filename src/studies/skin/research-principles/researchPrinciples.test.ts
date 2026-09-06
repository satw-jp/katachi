import assert from "node:assert/strict";
import { DeterministicClock, stepDeterministically } from "./runtime/deterministicClock.ts";
import { advanceAnastomosis, createAnastomosisState } from "./studies/anastomosis.ts";
import { advanceCoarsening, createCoarseningState } from "./studies/coarsening.ts";
import { advanceConstrainedRelaxation, createConstrainedRelaxationState } from "./studies/constrainedRelaxation.ts";
import { adjacencyChangesOnlyAtExchange, advanceNeighborExchange, createNeighborExchangeState } from "./studies/neighborExchange.ts";
import { advancePathAdaptation, createPathAdaptationState } from "./studies/pathAdaptation.ts";

const run = <T>(state: T, seconds: number, update: (current: T, delta: number) => T): T => stepDeterministically(state, seconds, 0.1, update);

const pathA = run(createPathAdaptationState(12345), 6, (state, delta) => advancePathAdaptation(state, delta));
const pathB = run(createPathAdaptationState(12345), 6, (state, delta) => advancePathAdaptation(state, delta));
assert.deepEqual(pathA, pathB, "same seed and elapsed time must replay the same path state");
const pathBefore = createPathAdaptationState(12345);
const pathAfterUse = run(pathBefore, 3, (state, delta) => advancePathAdaptation(state, delta));
const usedEdge = pathAfterUse.activePath[0];
assert.ok(pathAfterUse.edges[usedEdge].conductance > pathBefore.edges[usedEdge].conductance, "used edge reinforces");
const unusedEdge = pathBefore.edges.find((edge) => !pathAfterUse.activePath.includes(edge.id));
assert.ok(unusedEdge, "fixture has unused candidate edges");
assert.ok(pathAfterUse.edges[unusedEdge.id].conductance < unusedEdge.conductance, "unused edge decays");
const switched = run(pathAfterUse, 6, (state, delta) => advancePathAdaptation(state, delta));
assert.equal(switched.demandSwitchCount, 1, "demand switch occurs once");
assert.ok(switched.edges.some((edge) => edge.usage > 0), "history survives demand switch");

const separate = run(createAnastomosisState(12345), 4, (state, delta) => advanceAnastomosis(state, delta));
assert.equal(separate.connectedComponents, 3, "trajectory families begin separated");
const reconnected = run(separate, 8, (state, delta) => advanceAnastomosis(state, delta));
assert.equal(reconnected.connectedComponents, 1, "reconnect creates one component");
assert.equal(reconnected.connected, true, "new relation is present");
assert.ok(reconnected.reconnectPoint, "reconnect event has a junction");

const relaxedInitial = createConstrainedRelaxationState(12345);
const relaxedFinal = run(relaxedInitial, 18, (state, delta) => advanceConstrainedRelaxation(state, delta));
assert.deepEqual(relaxedFinal.adjacency, relaxedInitial.adjacency, "relaxation never rewires adjacency");
assert.notDeepEqual(relaxedFinal.cells.map((cell) => [cell.x, cell.y]), relaxedInitial.cells.map((cell) => [cell.x, cell.y]), "relaxation changes geometry");

const exchangeInitial = createNeighborExchangeState(12345);
const exchangeBefore = run(exchangeInitial, 8, (state, delta) => advanceNeighborExchange(state, delta));
assert.deepEqual(exchangeBefore.adjacency, exchangeInitial.adjacency, "no exchange before the threshold event");
const exchangeAfter = run(exchangeBefore, 5, (state, delta) => advanceNeighborExchange(state, delta));
assert.notDeepEqual(exchangeAfter.adjacency, exchangeInitial.adjacency, "adjacency changes at the event");
assert.equal(adjacencyChangesOnlyAtExchange(exchangeBefore, exchangeAfter), true, "rewiring is tied to the event");
assert.deepEqual(exchangeAfter.cells.map((cell) => cell.id), exchangeInitial.cells.map((cell) => cell.id), "cell identities persist");

const coarseInitial = createCoarseningState(12345);
const coarseFinal = run(coarseInitial, 20, (state, delta) => advanceCoarsening(state, delta));
const initialMass = coarseInitial.units.reduce((sum, unit) => sum + unit.mass, 0);
const finalMass = coarseFinal.units.reduce((sum, unit) => sum + unit.mass, 0);
assert.ok(coarseFinal.units.filter((unit) => unit.alive).length < 96, "unit count decreases");
assert.ok(Math.abs(finalMass - initialMass) < 1e-7, "mass is conserved through disappearance");
const coarseReplay = run(createCoarseningState(12345), 20, (state, delta) => advanceCoarsening(state, delta));
assert.deepEqual(coarseFinal.deaths, coarseReplay.deaths, "same seed gives the same death order");

const clock = new DeterministicClock();
clock.advance(0.5);
const elapsed = clock.elapsedSeconds;
clock.reset();
assert.equal(clock.elapsedSeconds, 0, "restart resets deterministic time");
assert.ok(elapsed > 0, "clock advances while playing");
