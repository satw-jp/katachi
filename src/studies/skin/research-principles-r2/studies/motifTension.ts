import {
  clamp,
  distance,
  drawLine,
  drawPoint,
  hashNoise,
  lerp,
  runFixedSteps,
  smoothstep,
  type NetworkEdge,
  type NetworkNode,
  type StudyDefinition,
  type StudyView,
  type Vec2,
} from "../runtime/types.ts";
import { relaxNetwork, topologySignature } from "../runtime/network.ts";

interface Motif {
  id: string;
  base: Vec2;
  targetA: Vec2;
  targetB: Vec2;
  position: Vec2;
}

export interface MotifTensionState {
  seed: number;
  time: number;
  accumulator: number;
  motifs: Motif[];
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  unprestressedLengths: Record<string, number>;
  maxNetForce: number;
  meanNetForce: number;
  meanVelocity: number;
  settled: boolean;
  settledDuration: number;
  anchorMotionCount: number;
  topology: string;
}

const motifFixture = [
  { id: "motif-a", base: { x: 0.25, y: 0.33 }, targetA: { x: 0.34, y: 0.25 }, targetB: { x: 0.29, y: 0.42 } },
  { id: "motif-b", base: { x: 0.52, y: 0.68 }, targetA: { x: 0.61, y: 0.59 }, targetB: { x: 0.46, y: 0.57 } },
  { id: "motif-c", base: { x: 0.75, y: 0.35 }, targetA: { x: 0.67, y: 0.27 }, targetB: { x: 0.77, y: 0.47 } },
] as const;

const freeFixture = [
  { id: "node-0", x: 0.38, y: 0.34 },
  { id: "node-1", x: 0.54, y: 0.37 },
  { id: "node-2", x: 0.43, y: 0.50 },
  { id: "node-3", x: 0.64, y: 0.51 },
  { id: "node-4", x: 0.57, y: 0.62 },
] as const;

const edgeFixture = [
  ["e-a0", "motif-a", "node-0"],
  ["e-a1", "motif-a", "node-2"],
  ["e-01", "node-0", "node-1"],
  ["e-02", "node-0", "node-2"],
  ["e-12", "node-1", "node-2"],
  ["e-13", "node-1", "node-3"],
  ["e-24", "node-2", "node-4"],
  ["e-34", "node-3", "node-4"],
  ["e-b4", "motif-b", "node-4"],
  ["e-c3", "motif-c", "node-3"],
] as const;

function nodeById(state: MotifTensionState, id: string): NetworkNode | undefined {
  return state.nodes.find((node) => node.id === id);
}

function motionPhase(time: number): "MOVE" | "HOLD" {
  const cycle = time % 16;
  return cycle < 4 || (cycle >= 7 && cycle < 11) || cycle >= 15 ? "MOVE" : "HOLD";
}

function cyclePosition(time: number): number {
  return time % 16;
}

function motifPosition(motif: Motif, time: number, motionScale: number): Vec2 {
  const cycle = cyclePosition(time);
  const scaledA = lerp(motif.base, motif.targetA, motionScale);
  const scaledB = lerp(motif.base, motif.targetB, motionScale);
  if (cycle < 4) return lerp(motif.base, scaledA, smoothstep(cycle / 4));
  if (cycle < 7) return scaledA;
  if (cycle < 11) return lerp(scaledA, scaledB, smoothstep((cycle - 7) / 4));
  if (cycle < 15) return scaledB;
  return lerp(scaledB, motif.base, smoothstep(cycle - 15));
}

function setMotifPositions(state: MotifTensionState, motionScale: number): void {
  for (const motif of state.motifs) {
    const next = motifPosition(motif, state.time, motionScale);
    if (distance(next, motif.position) > 1e-5) state.anchorMotionCount += 1;
    motif.position = next;
    const node = nodeById(state, motif.id);
    if (node) {
      node.position = next;
      node.velocity = { x: 0, y: 0 };
    }
  }
}

function stepMotifTension(state: MotifTensionState, deltaSeconds: number, params: Readonly<Record<string, number>>): void {
  state.time += deltaSeconds;
  const prestress = clamp(params.prestress ?? 0.06, 0.01, 0.18);
  const damping = clamp(params.damping ?? 0.86, 0.7, 0.96);
  const motionScale = clamp(params.motifMotion ?? 1, 0.45, 1.45);
  setMotifPositions(state, motionScale);
  for (const edge of state.edges) edge.restLength = state.unprestressedLengths[edge.id] * (1 - prestress);
  const metrics = relaxNetwork(state.nodes, state.edges, deltaSeconds, damping, 0.018);
  state.maxNetForce = metrics.maxNetForce;
  state.meanNetForce = metrics.meanNetForce;
  state.meanVelocity = metrics.meanVelocity;
  if (motionPhase(state.time) === "MOVE") {
    state.settled = false;
    state.settledDuration = 0;
  } else if (state.maxNetForce < 0.06 && state.meanVelocity < 0.006) {
    state.settledDuration += deltaSeconds;
    if (state.settledDuration >= 0.55) state.settled = true;
  } else {
    state.settled = false;
    state.settledDuration = 0;
  }
}

export function createMotifTensionState(seed: number): MotifTensionState {
  const motifs: Motif[] = motifFixture.map((motif) => ({ ...motif, position: { ...motif.base } }));
  const nodes: NetworkNode[] = motifs.map((motif) => ({
    id: motif.id,
    position: { ...motif.position },
    velocity: { x: 0, y: 0 },
    force: { x: 0, y: 0 },
    anchor: true,
    motifId: motif.id,
  }));
  const jitter = (hashNoise(seed, 19) - 0.5) * 0.012;
  for (const fixture of freeFixture) {
    nodes.push({
      id: fixture.id,
      position: { x: fixture.x + jitter, y: fixture.y - jitter },
      velocity: { x: 0, y: 0 },
      force: { x: 0, y: 0 },
    });
  }
  const unprestressedLengths: Record<string, number> = {};
  const edges: NetworkEdge[] = edgeFixture.map(([id, a, b]) => {
    const first = nodes.find((node) => node.id === a);
    const second = nodes.find((node) => node.id === b);
    const rest = first && second ? distance(first.position, second.position) : 0.2;
    unprestressedLengths[id] = rest;
    return { id, a, b, restLength: rest * 0.94, stiffness: 1.35, length: rest, tension: 0 };
  });
  return {
    seed,
    time: 0,
    accumulator: 0,
    motifs,
    nodes,
    edges,
    unprestressedLengths,
    maxNetForce: 0,
    meanNetForce: 0,
    meanVelocity: 0,
    settled: false,
    settledDuration: 0,
    anchorMotionCount: 0,
    topology: topologySignature(edges),
  };
}

export function advanceMotifTension(
  state: MotifTensionState,
  deltaSeconds: number,
  params: Readonly<Record<string, number>> = {},
): MotifTensionState {
  runFixedSteps(state, deltaSeconds, 1 / 60, (current, step) => stepMotifTension(current, step, params));
  return state;
}

function activePhase(state: MotifTensionState): { label: string; index: number; detail: string } {
  const cycle = cyclePosition(state.time);
  if (motionPhase(state.time) === "MOVE") return { label: "MOVE", index: 0, detail: "motif boundary is moving" };
  if (state.settled) return { label: "SETTLED", index: 3, detail: "low residual force and motion" };
  if (cycle < 4.35 || (cycle >= 7 && cycle < 7.35)) return { label: "HOLD", index: 1, detail: "motif has stopped; network response remains" };
  return { label: "RELAX", index: 2, detail: "tension is redistributing" };
}

function renderMotifTension(context: CanvasRenderingContext2D, state: MotifTensionState, view: StudyView): void {
  const maxTension = Math.max(0.01, ...state.edges.map((edge) => edge.tension));
  for (const edge of state.edges) {
    const a = nodeById(state, edge.a);
    const b = nodeById(state, edge.b);
    if (!a || !b) continue;
    const tensionAlpha = 0.27 + (edge.tension / maxTension) * 0.45;
    drawLine(context, a.position, b.position, view, "#bfd3ec", 0.65 + (edge.tension / maxTension) * 0.45, tensionAlpha, edge.tension > maxTension * 0.8 ? 4 : 0);
  }
  for (const node of state.nodes) {
    if (node.anchor) drawPoint(context, node.position, view, 4.2, "#e8d9b3", 0.9, 13);
    else drawPoint(context, node.position, view, 2.2, "#b8cbea", 0.78, 4);
  }
  for (const motif of state.motifs) {
    drawPoint(context, { x: motif.position.x + 0.014, y: motif.position.y }, view, 1.3, "#fff4d1", 0.72, 5);
    drawPoint(context, { x: motif.position.x - 0.011, y: motif.position.y + 0.012 }, view, 1.2, "#fff4d1", 0.62, 4);
  }
  const phase = activePhase(state);
  context.save();
  context.fillStyle = "rgba(235, 242, 255, 0.72)";
  context.font = "10px Helvetica Neue, Arial, sans-serif";
  context.fillText(phase.label, 22, 28);
  context.restore();
}

export const motifTensionDefinition: StudyDefinition = {
  key: "motif-tension",
  studyId: "R2-02",
  title: "MOTIF–TENSION",
  artTitle: "SEEKING EQUILIBRIUM",
  principle: "A moving motif redistributes tension; a stopped motif leaves the network searching for balance.",
  phaseSequence: ["MOVE", "HOLD", "RELAX", "SETTLED"],
  controls: [
    { key: "prestress", label: "PRESTRESS", min: 0.01, max: 0.18, step: 0.01, value: 0.06 },
    { key: "damping", label: "DAMPING", min: 0.7, max: 0.96, step: 0.01, value: 0.86 },
    { key: "motifMotion", label: "MOTIF MOTION", min: 0.45, max: 1.45, step: 0.05, value: 1 },
  ],
  documentation: {
    scientificCore: "A small prestressed tension-network abstraction uses edge extension, damping, and measured residual force.",
    artTranslation: "Motifs act as moving boundary conditions. During holds, the network keeps moving until residual force and velocity become low.",
    whatChanged: "The same topology is revisited after each motif movement, producing different transient geometries without rewiring.",
    notClaimed: "SETTLED means a local low-motion, low-residual state in this simplified system. It is not a unique or globally optimal structure, and this is not a spider-silk simulation.",
  },
  createState: (seed) => createMotifTensionState(seed),
  advanceState: (rawState, deltaSeconds, params) => advanceMotifTension(rawState as MotifTensionState, deltaSeconds, params),
  phase: (rawState) => activePhase(rawState as MotifTensionState),
  render: (context, rawState, view) => renderMotifTension(context, rawState as MotifTensionState, view),
  readouts: (rawState) => {
    const state = rawState as MotifTensionState;
    return [
    `MOTIF ${motionPhase(state.time)}`,
    `NETWORK ${state.settled ? "SETTLED" : "RELAXING"}`,
    `MAX RESIDUAL ${state.maxNetForce.toFixed(3)}`,
    `MEAN VELOCITY ${state.meanVelocity.toFixed(3)}`,
    `TOPOLOGY ${state.topology === topologySignature(state.edges) ? "FIXED" : "CHANGED"}`,
    ];
  },
  manifest: (rawState, params) => {
    const state = rawState as MotifTensionState;
    return {
      study: "R2-02 MOTIF–TENSION RELAXATION",
      seed: state.seed,
      parameters: params,
      time: state.time,
      settled: state.settled,
      settledDuration: state.settledDuration,
      maxNetForce: state.maxNetForce,
      meanNetForce: state.meanNetForce,
      meanVelocity: state.meanVelocity,
      topology: state.topology,
    };
  },
};
