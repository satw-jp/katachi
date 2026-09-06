import {
  clamp,
  distance,
  drawLine,
  drawPoint,
  lerp,
  runFixedSteps,
  smoothstep,
  type NetworkEdge,
  type NetworkNode,
  type StudyDefinition,
  type StudyView,
} from "../runtime/types.ts";
import { edgeLength, relaxNetwork, topologySignature } from "../runtime/network.ts";

interface RewireEvent {
  time: number;
  removedEdgeId: string;
  addedEdgeId: string;
  instabilityLength: number;
}

export interface RelaxRewireState {
  seed: number;
  time: number;
  accumulator: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  oldEdgeId: string;
  alternateEdgeId: string;
  instabilityLength: number;
  instabilityThreshold: number;
  rewired: boolean;
  rewireHistory: RewireEvent[];
  rewireTime: number;
  settled: boolean;
  settledDuration: number;
  maxNetForce: number;
  meanNetForce: number;
  meanVelocity: number;
  topologyBefore: string;
  topologyAfter: string;
}

const oldEdgeId = "old-boundary-edge";
const alternateEdgeId = "alternate-local-edge";

function nodeById(state: RelaxRewireState, id: string): NetworkNode | undefined {
  return state.nodes.find((node) => node.id === id);
}

function boundaryPosition(time: number, motionScale: number): { x: number; y: number } {
  const start = { x: 0.76, y: 0.42 };
  const target = { x: clamp(0.76 - 0.37 * motionScale, 0.30, 0.76), y: 0.42 };
  if (time < 4) return start;
  if (time < 7) return lerp(start, target, smoothstep((time - 4) / 3));
  return target;
}

function stepRelaxRewire(state: RelaxRewireState, deltaSeconds: number, params: Readonly<Record<string, number>>): void {
  state.time += deltaSeconds;
  const damping = clamp(params.damping ?? 0.86, 0.7, 0.96);
  const motionScale = clamp(params.motifMotion ?? 1, 0.55, 1.45);
  state.instabilityThreshold = clamp(params.instabilityThreshold ?? 0.18, 0.14, 0.25);
  const movingAnchor = nodeById(state, "anchor-b");
  if (movingAnchor) {
    movingAnchor.position = boundaryPosition(state.time, motionScale);
    movingAnchor.velocity = { x: 0, y: 0 };
  }
  const metrics = relaxNetwork(state.nodes, state.edges, deltaSeconds, damping, 0.02);
  state.maxNetForce = metrics.maxNetForce;
  state.meanNetForce = metrics.meanNetForce;
  state.meanVelocity = metrics.meanVelocity;
  const oldEdge = state.edges.find((edge) => edge.id === state.oldEdgeId);
  if (oldEdge) state.instabilityLength = edgeLength(state.nodes, oldEdge);

  if (!state.rewired && state.instabilityLength < state.instabilityThreshold) {
    state.edges = state.edges.filter((edge) => edge.id !== state.oldEdgeId);
    const first = nodeById(state, "free-a");
    const second = nodeById(state, "free-b");
    const alternateLength = first && second ? distance(first.position, second.position) : 0.16;
    state.edges.push({
      id: state.alternateEdgeId,
      a: "free-a",
      b: "free-b",
      restLength: alternateLength * 0.68,
      stiffness: 1.65,
      length: alternateLength,
      tension: 0,
    });
    state.rewired = true;
    state.rewireTime = state.time;
    state.rewireHistory.push({
      time: state.time,
      removedEdgeId: state.oldEdgeId,
      addedEdgeId: state.alternateEdgeId,
      instabilityLength: state.instabilityLength,
    });
    state.topologyAfter = topologySignature(state.edges);
  }

  if (state.rewired) {
    if (state.maxNetForce < 0.045 && state.meanVelocity < 0.006) state.settledDuration += deltaSeconds;
    else state.settledDuration = 0;
    state.settled = state.settledDuration >= 0.55;
  }
}

export function createRelaxRewireState(seed: number): RelaxRewireState {
  const nodes: NetworkNode[] = [
    { id: "anchor-a", position: { x: 0.24, y: 0.42 }, velocity: { x: 0, y: 0 }, force: { x: 0, y: 0 }, anchor: true },
    { id: "anchor-b", position: { x: 0.76, y: 0.42 }, velocity: { x: 0, y: 0 }, force: { x: 0, y: 0 }, anchor: true },
    { id: "free-a", position: { x: 0.42, y: 0.30 }, velocity: { x: 0, y: 0 }, force: { x: 0, y: 0 } },
    { id: "free-b", position: { x: 0.58, y: 0.30 }, velocity: { x: 0, y: 0 }, force: { x: 0, y: 0 } },
    { id: "free-c", position: { x: 0.42, y: 0.58 }, velocity: { x: 0, y: 0 }, force: { x: 0, y: 0 } },
    { id: "free-d", position: { x: 0.58, y: 0.58 }, velocity: { x: 0, y: 0 }, force: { x: 0, y: 0 } },
  ];
  const edges: NetworkEdge[] = [
    { id: oldEdgeId, a: "anchor-a", b: "anchor-b", restLength: 0.34, stiffness: 1.6, length: 0.52, tension: 0 },
    { id: "left-upper", a: "anchor-a", b: "free-a", restLength: 0.20, stiffness: 1.2, length: 0.2, tension: 0 },
    { id: "left-lower", a: "anchor-a", b: "free-c", restLength: 0.21, stiffness: 1.2, length: 0.2, tension: 0 },
    { id: "right-upper", a: "anchor-b", b: "free-b", restLength: 0.20, stiffness: 1.2, length: 0.2, tension: 0 },
    { id: "right-lower", a: "anchor-b", b: "free-d", restLength: 0.21, stiffness: 1.2, length: 0.2, tension: 0 },
    { id: "upper-left", a: "free-a", b: "free-c", restLength: 0.20, stiffness: 1.05, length: 0.2, tension: 0 },
    { id: "upper-right", a: "free-b", b: "free-d", restLength: 0.20, stiffness: 1.05, length: 0.2, tension: 0 },
  ];
  const topologyBefore = topologySignature(edges);
  return {
    seed,
    time: 0,
    accumulator: 0,
    nodes,
    edges,
    oldEdgeId,
    alternateEdgeId,
    instabilityLength: 0.52,
    instabilityThreshold: 0.18,
    rewired: false,
    rewireHistory: [],
    rewireTime: -Infinity,
    settled: false,
    settledDuration: 0,
    maxNetForce: 0,
    meanNetForce: 0,
    meanVelocity: 0,
    topologyBefore,
    topologyAfter: topologyBefore,
  };
}

export function advanceRelaxRewire(
  state: RelaxRewireState,
  deltaSeconds: number,
  params: Readonly<Record<string, number>> = {},
): RelaxRewireState {
  runFixedSteps(state, deltaSeconds, 1 / 60, (current, step) => stepRelaxRewire(current, step, params));
  return state;
}

function activePhase(state: RelaxRewireState): { label: string; index: number; detail: string } {
  if (state.rewired && state.time - state.rewireTime < 0.7) return { label: "REWIRE", index: 2, detail: "one discrete neighbor exchange occurred" };
  if (state.rewired && state.settled) return { label: "SETTLED", index: 3, detail: "the changed topology has relaxed" };
  if (!state.rewired && state.instabilityLength < state.instabilityThreshold * 1.35) return { label: "INSTABILITY", index: 1, detail: "the actual edge-length metric is approaching threshold" };
  return { label: "RELAX", index: 0, detail: state.rewired ? "post-rewire forces are redistributing" : "topology remains fixed while the network relaxes" };
}

function renderRelaxRewire(context: CanvasRenderingContext2D, state: RelaxRewireState, view: StudyView): void {
  const phase = activePhase(state);
  for (const edge of state.edges) {
    const a = nodeById(state, edge.a);
    const b = nodeById(state, edge.b);
    if (!a || !b) continue;
    const isNew = edge.id === state.alternateEdgeId;
    const isCritical = !state.rewired && edge.id === state.oldEdgeId;
    drawLine(context, a.position, b.position, view, isNew ? "#d6c3ff" : isCritical ? "#edc58d" : "#b8cae9", isNew || isCritical ? 1.25 : 0.72, isNew || isCritical ? 0.78 : 0.46, phase.label === "REWIRE" ? 7 : 0);
  }
  for (const node of state.nodes) {
    drawPoint(context, node.position, view, node.anchor ? 4.2 : 2.4, node.anchor ? "#f0d8a8" : "#b7c9e9", node.anchor ? 0.92 : 0.74, node.anchor ? 12 : 4);
  }
  context.save();
  context.fillStyle = "rgba(235, 242, 255, 0.72)";
  context.font = "10px Helvetica Neue, Arial, sans-serif";
  context.fillText(phase.label, 22, 28);
  context.restore();
}

export const relaxRewireDefinition: StudyDefinition = {
  key: "relax-rewire",
  studyId: "R2-03",
  title: "RELAX → REWIRE",
  artTitle: "BREAKING EQUILIBRIUM",
  principle: "A local instability can become a discrete topology event, followed by another relaxation.",
  phaseSequence: ["RELAX", "INSTABILITY", "REWIRE", "SETTLED"],
  controls: [
    { key: "motifMotion", label: "MOTIF MOTION", min: 0.55, max: 1.45, step: 0.05, value: 1 },
    { key: "instabilityThreshold", label: "INSTABILITY THRESHOLD", min: 0.14, max: 0.25, step: 0.005, value: 0.18 },
    { key: "damping", label: "DAMPING", min: 0.7, max: 0.96, step: 0.01, value: 0.86 },
  ],
  documentation: {
    scientificCore: "A damped tension network is allowed to relax continuously. A local edge-length metric can trigger one discrete neighbor exchange.",
    artTranslation: "The visible sequence is continuous relaxation, a brief instability, one topology event, and a second settling process.",
    whatChanged: "Round 01's relaxation and rewiring studies are joined into one time system while their operations remain distinct.",
    notClaimed: "This is a T1-inspired neighbor-exchange abstraction, not a physical soap-foam simulation or a generic morph effect.",
  },
  createState: (seed) => createRelaxRewireState(seed),
  advanceState: (rawState, deltaSeconds, params) => advanceRelaxRewire(rawState as RelaxRewireState, deltaSeconds, params),
  phase: (rawState) => activePhase(rawState as RelaxRewireState),
  render: (context, rawState, view) => renderRelaxRewire(context, rawState as RelaxRewireState, view),
  readouts: (rawState) => {
    const state = rawState as RelaxRewireState;
    return [
      `TOPOLOGY ${state.rewired ? "CHANGED" : "FIXED"}`,
      `EDGE LENGTH ${state.instabilityLength.toFixed(3)}`,
      `REWIRES ${state.rewireHistory.length}`,
      `FORCE ${state.maxNetForce.toFixed(3)}`,
      state.rewired ? "POST-EVENT RELAXATION" : "AWAITING ACTUAL INSTABILITY",
    ];
  },
  manifest: (rawState, params) => {
    const state = rawState as RelaxRewireState;
    return {
      study: "R2-03 RELAX / REWIRE",
      seed: state.seed,
      parameters: params,
      instabilityThreshold: state.instabilityThreshold,
      topologyBefore: state.topologyBefore,
      topologyAfter: state.topologyAfter,
      rewireHistory: state.rewireHistory,
      settled: state.settled,
    };
  },
};
