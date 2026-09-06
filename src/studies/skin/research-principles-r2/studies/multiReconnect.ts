import {
  add,
  clamp,
  distance,
  drawLine,
  drawPoint,
  length,
  lerp,
  normalize,
  runFixedSteps,
  scale,
  subtract,
  type NetworkEdge,
  type NetworkNode,
  type StudyDefinition,
  type StudyView,
  type Vec2,
} from "../runtime/types.ts";

interface MultiNode extends NetworkNode {
  z: number;
}

interface Trajectory {
  familyId: number;
  nodeIds: string[];
  tipId: string;
  targets: readonly { x: number; y: number; z: number }[];
  targetIndex: number;
  waitForFamily?: number;
  lastGrowthPosition: Vec2;
  finished: boolean;
}

interface ConnectionHistory {
  edgeId: string;
  familyA: number;
  familyB: number;
  time: number;
  junctionId: string;
}

interface Junction {
  id: string;
  position: Vec2;
  time: number;
  families: [number, number];
}

export interface MultiReconnectState {
  seed: number;
  time: number;
  accumulator: number;
  nodes: MultiNode[];
  edges: NetworkEdge[];
  trajectories: Trajectory[];
  activeTips: string[];
  connectedComponents: number;
  junctions: Junction[];
  cycleCount: number;
  pulseState: { reachable: boolean; routeEdgeIds: string[]; phase: number };
  connectionHistory: ConnectionHistory[];
  reconnectCount: number;
  nextReconnectAt: number;
}

const trajectoryFixture = [
  { start: { x: 0.13, y: 0.24, z: 0.24 }, targets: [{ x: 0.50, y: 0.30, z: 0.25 }, { x: 0.50, y: 0.65, z: 0.25 }], waitForFamily: 3 },
  { start: { x: 0.12, y: 0.47, z: 0.12 }, targets: [{ x: 0.50, y: 0.49, z: 0.16 }, { x: 0.50, y: 0.65, z: 0.16 }], waitForFamily: 4 },
  { start: { x: 0.16, y: 0.68, z: 0.18 }, targets: [{ x: 0.50, y: 0.65, z: 0.22 }] },
  { start: { x: 0.54, y: 0.30, z: 0.30 }, targets: [{ x: 0.50, y: 0.30, z: 0.30 }, { x: 0.84, y: 0.30, z: 0.34 }], waitForFamily: 0 },
  { start: { x: 0.54, y: 0.50, z: 0.19 }, targets: [{ x: 0.50, y: 0.49, z: 0.19 }, { x: 0.84, y: 0.50, z: 0.23 }], waitForFamily: 1 },
  { start: { x: 0.53, y: 0.67, z: 0.14 }, targets: [{ x: 0.50, y: 0.65, z: 0.12 }] },
  { start: { x: 0.89, y: 0.30, z: 0.31 }, targets: [{ x: 0.86, y: 0.30, z: 0.31 }] },
  { start: { x: 0.88, y: 0.68, z: 0.15 }, targets: [{ x: 0.91, y: 0.50, z: 0.11 }] },
] as const;

const reconnectPairs: readonly [number, number][] = [[0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [0, 2], [1, 5], [0, 5]];
const palette = ["#9fbff4", "#b5a6f6", "#74d8c5", "#f2c28d", "#d9a7d9", "#86c6eb", "#ecc58b", "#a8d8c3"];

function nodeById(state: MultiReconnectState, id: string): MultiNode | undefined {
  return state.nodes.find((node) => node.id === id);
}

function createNode(id: string, position: { x: number; y: number; z: number }): MultiNode {
  return { id, position: { x: position.x, y: position.y }, velocity: { x: 0, y: 0 }, force: { x: 0, y: 0 }, z: position.z };
}

function updateGraphMetrics(state: MultiReconnectState): void {
  const parent = new Map(state.nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    let current = parent.get(id) ?? id;
    while (parent.get(current) !== current) current = parent.get(current) ?? current;
    return current;
  };
  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };
  for (const edge of state.edges) union(edge.a, edge.b);
  state.connectedComponents = new Set(state.nodes.map((node) => find(node.id))).size;
  state.cycleCount = Math.max(0, state.edges.length - state.nodes.length + state.connectedComponents);
}

function routeBetween(state: MultiReconnectState, startId: string, targetId: string): string[] {
  const queue = [startId];
  const previous = new Map<string, { nodeId: string; edgeId: string }>();
  const visited = new Set([startId]);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === targetId) break;
    for (const edge of state.edges) {
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : undefined;
      if (!next || visited.has(next)) continue;
      visited.add(next);
      previous.set(next, { nodeId: current, edgeId: edge.id });
      queue.push(next);
    }
  }
  if (!visited.has(targetId)) return [];
  const route: string[] = [];
  let current = targetId;
  while (current !== startId) {
    const step = previous.get(current);
    if (!step) return [];
    route.unshift(step.edgeId);
    current = step.nodeId;
  }
  return route;
}

function updatePulse(state: MultiReconnectState): void {
  const start = state.trajectories[0]?.nodeIds[0];
  const target = state.trajectories[state.trajectories.length - 1]?.tipId;
  const routeEdgeIds = start && target ? routeBetween(state, start, target) : [];
  state.pulseState = { reachable: routeEdgeIds.length > 0, routeEdgeIds, phase: (state.time * 0.18) % 1 };
}

function addJunction(state: MultiReconnectState, first: Trajectory, second: Trajectory): void {
  const firstTip = nodeById(state, first.tipId);
  const secondTip = nodeById(state, second.tipId);
  if (!firstTip || !secondTip) return;
  const id = `junction-${state.reconnectCount + 1}`;
  const midpoint = {
    x: (firstTip.position.x + secondTip.position.x) * 0.5,
    y: (firstTip.position.y + secondTip.position.y) * 0.5,
    z: (firstTip.z + secondTip.z) * 0.5,
  };
  state.nodes.push(createNode(id, midpoint));
  state.edges.push(
    { id: `${id}-a`, a: first.tipId, b: id, restLength: 0, stiffness: 1, length: 0, tension: 0 },
    { id: `${id}-b`, a: second.tipId, b: id, restLength: 0, stiffness: 1, length: 0, tension: 0 },
  );
  state.reconnectCount += 1;
  state.connectionHistory.push({
    edgeId: id,
    familyA: first.familyId,
    familyB: second.familyId,
    time: state.time,
    junctionId: id,
  });
  state.junctions.push({ id, position: midpoint, time: state.time, families: [first.familyId, second.familyId] });
  for (const trajectory of [first, second]) {
    if (trajectory.waitForFamily !== undefined && trajectory.targetIndex < trajectory.targets.length - 1) {
      trajectory.targetIndex += 1;
      trajectory.waitForFamily = undefined;
      trajectory.finished = false;
      trajectory.lastGrowthPosition = { x: midpoint.x, y: midpoint.y };
    }
  }
  updateGraphMetrics(state);
  updatePulse(state);
}

function stepMultiReconnect(state: MultiReconnectState, deltaSeconds: number, params: Readonly<Record<string, number>>): void {
  state.time += deltaSeconds;
  const growth = clamp(params.growth ?? 1, 0.4, 1.6);
  for (const trajectory of state.trajectories) {
    if (trajectory.finished) continue;
    const tip = nodeById(state, trajectory.tipId);
    if (!tip) continue;
    const target = trajectory.targets[trajectory.targetIndex];
    if (!target) continue;
    const towardTarget = subtract({ x: target.x, y: target.y }, tip.position);
    const remaining = length(towardTarget);
    if (remaining < 0.006) {
      tip.position = { x: target.x, y: target.y };
      if (trajectory.targetIndex < trajectory.targets.length - 1) {
        trajectory.targetIndex += 1;
        if (trajectory.waitForFamily !== undefined) {
          trajectory.targetIndex -= 1;
          continue;
        }
        trajectory.lastGrowthPosition = { x: tip.position.x, y: tip.position.y };
      } else {
        trajectory.finished = true;
      }
      continue;
    }
    const direction = normalize(towardTarget);
    const perpendicular = { x: -direction.y, y: direction.x };
    const flow = Math.sin(state.time * 0.75 + trajectory.familyId * 0.8) * 0.0022;
    const motion = add(scale(direction, Math.min(remaining, 0.055 * growth * deltaSeconds)), scale(perpendicular, flow));
    tip.position = add(tip.position, motion);
    tip.z += (target.z - tip.z) * Math.min(1, deltaSeconds * 0.7);
    if (distance(tip.position, trajectory.lastGrowthPosition) > 0.028) {
      const newId = `family-${trajectory.familyId}-node-${trajectory.nodeIds.length}`;
      state.nodes.push(createNode(newId, { x: tip.position.x, y: tip.position.y, z: tip.z }));
      state.edges.push({
        id: `${trajectory.tipId}-${newId}`,
        a: trajectory.tipId,
        b: newId,
        restLength: 0,
        stiffness: 1,
        length: 0,
        tension: 0,
      });
      trajectory.nodeIds.push(newId);
      trajectory.tipId = newId;
      trajectory.lastGrowthPosition = { x: tip.position.x, y: tip.position.y };
    }
  }

  const radius = clamp(params.reconnectRadius ?? 0.085, 0.035, 0.14);
  const connectionRate = clamp(params.connectionRate ?? 1.2, 0.4, 2.5);
  if (state.time >= state.nextReconnectAt) {
    const candidate = reconnectPairs.find(([familyA, familyB]) => {
      const first = state.trajectories[familyA];
      const second = state.trajectories[familyB];
      if (!first || !second) return false;
      if (state.connectionHistory.some((event) => event.familyA === familyA && event.familyB === familyB)) return false;
      const firstTip = nodeById(state, first.tipId);
      const secondTip = nodeById(state, second.tipId);
      return Boolean(firstTip && secondTip && distance(firstTip.position, secondTip.position) < radius);
    });
    if (candidate) {
      const first = state.trajectories[candidate[0]];
      const second = state.trajectories[candidate[1]];
      if (first && second) {
        addJunction(state, first, second);
        state.nextReconnectAt = state.time + Math.max(0.7, 2.2 / connectionRate);
      }
    }
  }
  updateGraphMetrics(state);
  updatePulse(state);
}

export function createMultiReconnectState(seed: number): MultiReconnectState {
  const nodes: MultiNode[] = [];
  const edges: NetworkEdge[] = [];
  const trajectories: Trajectory[] = [];
  trajectoryFixture.forEach((fixture, familyId) => {
    const startId = `family-${familyId}-start`;
    const tipId = `family-${familyId}-tip`;
    const direction = normalize(subtract(fixture.targets[0], fixture.start));
    const first = {
      x: fixture.start.x + direction.x * 0.035,
      y: fixture.start.y + direction.y * 0.035,
      z: fixture.start.z,
    };
    nodes.push(createNode(startId, fixture.start), createNode(tipId, first));
    edges.push({ id: `${startId}-${tipId}`, a: startId, b: tipId, restLength: 0, stiffness: 1, length: 0, tension: 0 });
    trajectories.push({
      familyId,
      nodeIds: [startId, tipId],
      tipId,
      targets: fixture.targets,
      targetIndex: 0,
      waitForFamily: "waitForFamily" in fixture ? fixture.waitForFamily : undefined,
      lastGrowthPosition: { x: first.x, y: first.y },
      finished: false,
    });
  });
  const state: MultiReconnectState = {
    seed,
    time: 0,
    accumulator: 0,
    nodes,
    edges,
    trajectories,
    activeTips: trajectories.map((trajectory) => trajectory.tipId),
    connectedComponents: 0,
    junctions: [],
    cycleCount: 0,
    pulseState: { reachable: false, routeEdgeIds: [], phase: 0 },
    connectionHistory: [],
    reconnectCount: 0,
    nextReconnectAt: 3.8,
  };
  updateGraphMetrics(state);
  return state;
}

export function advanceMultiReconnect(
  state: MultiReconnectState,
  deltaSeconds: number,
  params: Readonly<Record<string, number>> = {},
): MultiReconnectState {
  runFixedSteps(state, deltaSeconds, 1 / 60, (current, step) => stepMultiReconnect(current, step, params));
  state.activeTips = state.trajectories.filter((trajectory) => !trajectory.finished).map((trajectory) => trajectory.tipId);
  return state;
}

function activePhase(state: MultiReconnectState): { label: string; index: number; detail: string } {
  if (state.reconnectCount >= 4) return { label: "INTERWOVEN", index: 3, detail: "alternative routes are now available" };
  if (state.reconnectCount > 0) return { label: "RECONNECT", index: 2, detail: "functional junctions are changing the route" };
  if (state.time >= 2) return { label: "APPROACH", index: 1, detail: "independent tips are approaching" };
  return { label: "SEPARATE", index: 0, detail: "families remain separate" };
}

function renderMultiReconnect(context: CanvasRenderingContext2D, state: MultiReconnectState, view: StudyView): void {
  const routeSet = new Set(state.pulseState.routeEdgeIds);
  for (const edge of state.edges) {
    const a = nodeById(state, edge.a);
    const b = nodeById(state, edge.b);
    if (!a || !b) continue;
    const family = Number((a.id.match(/family-(\d+)/) ?? ["", "0"])[1]);
    const depthAlpha = 0.35 + (a.z + b.z) * 0.35;
    const isRoute = routeSet.has(edge.id);
    drawLine(context, a.position, b.position, view, isRoute ? "#dbe9ff" : palette[family % palette.length], isRoute ? 1.35 : 0.7, isRoute ? 0.78 : clamp(depthAlpha, 0.2, 0.72), isRoute ? 4 : 0);
  }
  for (const trajectory of state.trajectories) {
    const tip = nodeById(state, trajectory.tipId);
    if (tip) drawPoint(context, tip.position, view, 2.4, palette[trajectory.familyId % palette.length], 0.8, 6);
  }
  for (const junction of state.junctions) {
    const age = state.time - junction.time;
    const emphasis = age < 1.5 ? 1 : 0.55;
    drawPoint(context, junction.position, view, 3.2, "#edf5ff", emphasis, age < 1.5 ? 14 : 5);
  }
  if (state.pulseState.routeEdgeIds.length > 0) {
    const pulseIndex = Math.min(state.pulseState.routeEdgeIds.length - 1, Math.floor(state.pulseState.phase * state.pulseState.routeEdgeIds.length));
    const edge = state.edges.find((candidate) => candidate.id === state.pulseState.routeEdgeIds[pulseIndex]);
    if (edge) {
      const a = nodeById(state, edge.a);
      const b = nodeById(state, edge.b);
      if (a && b) drawPoint(context, lerp(a.position, b.position, (state.pulseState.phase * state.pulseState.routeEdgeIds.length) % 1), view, 3.5, "#ffffff", 0.95, 12);
    }
  }
  const phase = activePhase(state);
  context.save();
  context.fillStyle = "rgba(223, 235, 255, 0.72)";
  context.font = "10px Helvetica Neue, Arial, sans-serif";
  context.letterSpacing = "0.18em";
  context.fillText(phase.label, 22, 28);
  context.restore();
}

export const multiReconnectDefinition: StudyDefinition = {
  key: "multi-reconnect",
  studyId: "R2-01",
  title: "MULTI RECONNECT",
  artTitle: "ENTANGLED RECONNECTION",
  principle: "Separate trajectories acquire several functional relations over time.",
  phaseSequence: ["SEPARATE", "APPROACH", "RECONNECT", "INTERWOVEN"],
  requiresSeed: true,
  controls: [
    { key: "growth", label: "GROWTH", min: 0.4, max: 1.6, step: 0.05, value: 1 },
    { key: "reconnectRadius", label: "RECONNECT RADIUS", min: 0.035, max: 0.14, step: 0.005, value: 0.085 },
    { key: "connectionRate", label: "CONNECTION RATE", min: 0.4, max: 2.5, step: 0.1, value: 1.2 },
  ],
  documentation: {
    scientificCore: "Anastomosis is translated as a functional connection between already separate trajectories, not as a visual crossing.",
    artTranslation: "Multiple deterministic paths grow, reconnect, and change which pulse routes are reachable.",
    whatChanged: "Round 01's single reconnection becomes a sequence of connections that can close loops and create alternative routes.",
    notClaimed: "This is not a botanical, vascular, or biological simulation. The junctions are an art abstraction of acquired relation.",
  },
  createState: (seed) => createMultiReconnectState(seed),
  advanceState: (rawState, deltaSeconds, params) => advanceMultiReconnect(rawState as MultiReconnectState, deltaSeconds, params),
  phase: (rawState) => activePhase(rawState as MultiReconnectState),
  render: (context, rawState, view) => renderMultiReconnect(context, rawState as MultiReconnectState, view),
  readouts: (rawState) => {
    const state = rawState as MultiReconnectState;
    return [
    `COMPONENTS ${state.connectedComponents}`,
    `RECONNECTS ${state.reconnectCount}`,
    `CYCLES ${state.cycleCount}`,
    `PULSE ROUTE ${state.pulseState.reachable ? "REACHABLE" : "SEPARATE"}`,
    `ACTIVE TIPS ${state.activeTips.length}`,
    ];
  },
  manifest: (rawState, params) => {
    const state = rawState as MultiReconnectState;
    return {
      study: "R2-01 MULTI RECONNECT",
      seed: state.seed,
      parameters: params,
      connectedComponents: state.connectedComponents,
      reconnectCount: state.reconnectCount,
      cycleCount: state.cycleCount,
      pulseReachable: state.pulseState.reachable,
      connectionHistory: state.connectionHistory,
    };
  },
};
