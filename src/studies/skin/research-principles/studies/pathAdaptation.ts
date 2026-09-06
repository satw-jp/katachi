import {
  clamp,
  drawCurve,
  drawGlowPoint,
  hashNoise,
  normalizedToCanvas,
  type StudyDefinition,
  type StudyView,
} from "../runtime/studyTypes.ts";

export interface PathNode {
  x: number;
  y: number;
}

export interface PathEdge {
  id: number;
  a: number;
  b: number;
  conductance: number;
  flow: number;
  usage: number;
}

export interface PathAdaptationState {
  kind: "path-adaptation";
  seed: number;
  elapsedSeconds: number;
  nodes: readonly PathNode[];
  edges: readonly PathEdge[];
  source: number;
  sink: number;
  activePath: readonly number[];
  demandSwitchCount: number;
}

export interface PathAdaptationParams {
  feedback: number;
  decay: number;
  demandPeriod: number;
}

const DEFAULT_PARAMS: PathAdaptationParams = { feedback: 0.78, decay: 0.44, demandPeriod: 8 };

function makeFixture(seed: number): Pick<PathAdaptationState, "nodes" | "edges"> {
  const nodes: PathNode[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      nodes.push({ x: 0.09 + column * 0.205, y: 0.12 + row * 0.19 });
    }
  }
  const edges: PathEdge[] = [];
  const add = (a: number, b: number): void => {
    const id = edges.length;
    edges.push({ id, a, b, conductance: 0.42 + hashNoise(seed, id) * 0.18, flow: 0, usage: 0 });
  };
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const index = row * 5 + column;
      if (column < 4) add(index, index + 1);
      if (row < 4) add(index, index + 5);
      if (row < 4 && column < 4 && (row + column) % 2 === 0) add(index, index + 6);
      if (row < 4 && column > 0 && (row + column) % 2 === 1) add(index, index + 4);
    }
  }
  return { nodes, edges };
}

function edgeNeighbors(state: PathAdaptationState, node: number): readonly { edge: PathEdge; next: number }[] {
  const result: { edge: PathEdge; next: number }[] = [];
  for (const edge of state.edges) {
    if (edge.a === node) result.push({ edge, next: edge.b });
    else if (edge.b === node) result.push({ edge, next: edge.a });
  }
  return result;
}

function bestPath(state: PathAdaptationState): number[] {
  const distances = new Array<number>(state.nodes.length).fill(Number.POSITIVE_INFINITY);
  const previousNode = new Array<number>(state.nodes.length).fill(-1);
  const previousEdge = new Array<number>(state.nodes.length).fill(-1);
  const visited = new Set<number>();
  distances[state.source] = 0;
  while (visited.size < state.nodes.length) {
    let current = -1;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < distances.length; index += 1) {
      if (!visited.has(index) && distances[index] < currentDistance) {
        current = index;
        currentDistance = distances[index];
      }
    }
    if (current < 0 || current === state.sink) break;
    visited.add(current);
    for (const neighbor of edgeNeighbors(state, current)) {
      if (visited.has(neighbor.next)) continue;
      const cost = 1 / (neighbor.edge.conductance + 0.04) + neighbor.edge.id * 1e-7;
      const nextDistance = currentDistance + cost;
      if (nextDistance < distances[neighbor.next]) {
        distances[neighbor.next] = nextDistance;
        previousNode[neighbor.next] = current;
        previousEdge[neighbor.next] = neighbor.edge.id;
      }
    }
  }
  const path: number[] = [];
  let node = state.sink;
  while (node !== state.source && previousEdge[node] >= 0) {
    path.push(previousEdge[node]);
    node = previousNode[node];
  }
  return path.reverse();
}

export function createPathAdaptationState(seed: number): PathAdaptationState {
  const fixture = makeFixture(seed);
  const state: PathAdaptationState = {
    kind: "path-adaptation",
    seed,
    elapsedSeconds: 0,
    ...fixture,
    source: 0,
    sink: 24,
    activePath: [],
    demandSwitchCount: 0,
  };
  return { ...state, activePath: bestPath(state) };
}

export function advancePathAdaptation(
  state: PathAdaptationState,
  deltaSeconds: number,
  params: Partial<PathAdaptationParams> = {},
): PathAdaptationState {
  const options = { ...DEFAULT_PARAMS, ...params };
  const nextElapsed = state.elapsedSeconds + Math.max(0, deltaSeconds);
  const nextDemandSwitchCount = Math.floor(nextElapsed / options.demandPeriod);
  const demandPhase = nextDemandSwitchCount % 2;
  const source = demandPhase === 0 ? 0 : 20;
  const sink = demandPhase === 0 ? 24 : 4;
  const demandChanged = source !== state.source || sink !== state.sink;
  const routingState = { ...state, source, sink };
  const activePath = bestPath(routingState);
  const active = new Set(activePath);
  const edges = state.edges.map((edge) => {
    const used = active.has(edge.id);
    const reinforcement = used ? options.feedback * (0.055 + edge.conductance * 0.035) : -options.decay * 0.032;
    return {
      ...edge,
      conductance: clamp(edge.conductance + reinforcement * Math.max(0, deltaSeconds), 0.12, 1.45),
      flow: used ? 1 : 0,
      usage: used ? clamp(edge.usage + deltaSeconds * 0.22, 0, 1) : clamp(edge.usage - deltaSeconds * 0.09, 0, 1),
    };
  });
  return {
    ...state,
    elapsedSeconds: nextElapsed,
    edges,
    source,
    sink,
    activePath,
    demandSwitchCount: state.demandSwitchCount + (demandChanged ? 1 : 0),
  };
}

function edgePoints(state: PathAdaptationState, edge: PathEdge): readonly PathNode[] {
  return [state.nodes[edge.a], state.nodes[edge.b]];
}

function renderPathAdaptation(context: CanvasRenderingContext2D, rawState: unknown, view: StudyView): void {
  const state = rawState as PathAdaptationState;
  const active = new Set(state.activePath);
  for (const edge of state.edges) {
    const level = edge.conductance / 1.45;
    const isActive = active.has(edge.id);
    drawCurve(context, edgePoints(state, edge), view, {
      color: isActive ? "#b8d7ff" : "#6b7585",
      width: isActive ? 0.85 + level * 1.1 : 0.35 + level * 0.45,
      alpha: isActive ? 0.28 + level * 0.6 : 0.08 + level * 0.2,
      glow: isActive ? 4 + level * 5 : 0,
    });
  }
  state.nodes.forEach((node, index) => {
    const point = normalizedToCanvas(node, view);
    drawGlowPoint(context, point.x, point.y, index === state.source || index === state.sink ? 2.8 : 1.1, index === state.source ? "#ffcf99" : index === state.sink ? "#b7d7ff" : "#c5cedd", index === state.source || index === state.sink ? 0.9 : 0.36);
  });
  for (const [index, edgeId] of state.activePath.entries()) {
    const edge = state.edges[edgeId];
    const progress = (state.elapsedSeconds * 0.19 + index * 0.17) % 1;
    const a = state.nodes[edge.a];
    const b = state.nodes[edge.b];
    const point = normalizedToCanvas({ x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress }, view);
    drawGlowPoint(context, point.x, point.y, 2.2, "#f8fbff", 0.9);
  }
}

export const pathAdaptationDefinition: StudyDefinition = {
  key: "path-adaptation",
  studyId: "rps01",
  title: "FLOW-CONDITIONED PATH ADAPTATION",
  artTitle: "USE / FORGET",
  principle: "Used paths strengthen; unused paths weaken.",
  controls: [
    { key: "feedback", label: "FEEDBACK", min: 0.1, max: 1.2, step: 0.01, value: DEFAULT_PARAMS.feedback },
    { key: "decay", label: "DECAY", min: 0.1, max: 1.2, step: 0.01, value: DEFAULT_PARAMS.decay },
    { key: "demandPeriod", label: "DEMAND PERIOD", min: 5, max: 14, step: 0.5, value: DEFAULT_PARAMS.demandPeriod },
  ],
  documentation: {
    scientificCore: "A weighted candidate graph changes its conductance from the flow it carries and the flow it does not carry.",
    artTranslation: "A dim field of possible routes gradually remembers use as brightness and local thickness.",
    whatChanged: "The demand switches once without resetting conductance, so the old route survives while a new route becomes favored.",
    notClaimed: "This is not a biological simulation of Physarum and does not present one specific equation as a universal natural law.",
  },
  createState: (seed) => createPathAdaptationState(seed),
  advanceState: (state, deltaSeconds, params) => advancePathAdaptation(state as PathAdaptationState, deltaSeconds, params),
  render: renderPathAdaptation,
  readouts: (rawState) => {
    const state = rawState as PathAdaptationState;
    return [`SOURCE ${state.source} → SINK ${state.sink}`, `ACTIVE EDGES ${state.activePath.length}`, `DEMAND SWITCHES ${state.demandSwitchCount}`];
  },
  manifest: (rawState, params) => {
    const state = rawState as PathAdaptationState;
    return { studyId: "rps01", principle: "FLOW-CONDITIONED PATH ADAPTATION", seed: state.seed, parameters: params, elapsedSeconds: Number(state.elapsedSeconds.toFixed(3)), phase: state.elapsedSeconds < 5 ? "BEFORE" : state.elapsedSeconds < 11 ? "CHANGE" : "AFTER" };
  },
};
