import {
  add,
  clamp,
  cloneVec3,
  distance,
  dot,
  hashUnit,
  magnitude,
  normalize,
  scale,
  subtract,
  type ConnectionEvent,
  type HistoryState,
  type MorphologyMetrics,
  type MorphologyNode,
  type Origin,
  type R3Params,
  type RedundantFreeformState,
  type TrajectoryTip,
  type Vec3,
} from "./types.ts";

export const FIXED_STEP_SECONDS = 0.05;
const ORIGIN_COUNT = 18;
const MAX_TIP_AGE = 15.5;

function originPosition(seed: number, index: number): Vec3 {
  const band = index % 4;
  const angle = (index / ORIGIN_COUNT) * Math.PI * 2 + 0.13 * Math.sin(index * 1.71 + seed * 0.00013);
  const radius = 0.31 + 0.045 * Math.sin(index * 2.17 + seed * 0.00021) + band * 0.012;
  const vertical = -0.22 + band * 0.13 + 0.055 * Math.cos(index * 1.13 + seed * 0.00017);
  return {
    x: Math.cos(angle) * radius * (1 + 0.12 * Math.sin(index * 0.63)),
    y: vertical,
    z: Math.sin(angle) * radius * (0.86 + 0.11 * Math.cos(index * 0.77)),
  };
}

function initialDirection(index: number, position: Vec3): Vec3 {
  const inward = normalize({ x: -position.x, y: 0.1 - position.y * 0.35, z: -position.z });
  const tangent = normalize({ x: -position.z, y: 0.18 * Math.sin(index), z: position.x });
  return normalize(add(scale(inward, 0.72), scale(tangent, 0.46)));
}

function makeHistory(node: MorphologyNode): HistoryState {
  return {
    birthTime: node.birthTime,
    familyId: node.familyId,
    generation: node.generation,
    reconnectionOrigin: null,
    relaxationCount: node.relaxationCount,
    residue: node.residue,
  };
}

function zeroMetrics(): MorphologyMetrics {
  return {
    components: ORIGIN_COUNT,
    cycleRank: 0,
    deadEnds: 0,
    reconnectCount: 0,
    meanLocalTension: 0,
    edgeAgeDistribution: { young: 0, middle: 0, old: 0 },
  };
}

export function createRedundantFreeformState(seed: number): RedundantFreeformState {
  const origins: Origin[] = [];
  const nodes: MorphologyNode[] = [];
  const tips: TrajectoryTip[] = [];
  const history: HistoryState[] = [];
  for (let index = 0; index < ORIGIN_COUNT; index += 1) {
    const position = originPosition(seed, index);
    const originId = `origin-${String(index + 1).padStart(2, "0")}`;
    const familyId = index % 6;
    const origin: Origin = { id: originId, position: cloneVec3(position), familyId, birthTime: 0 };
    const node: MorphologyNode = {
      id: originId,
      position: cloneVec3(position),
      previousPosition: cloneVec3(position),
      velocity: { x: 0, y: 0, z: 0 },
      force: { x: 0, y: 0, z: 0 },
      originId,
      familyId,
      generation: 0,
      birthTime: 0,
      historyWeight: 1,
      reconnectionCount: 0,
      relaxationCount: 0,
      residue: 1,
    };
    origins.push(origin);
    nodes.push(node);
    history.push(makeHistory(node));
    const direction = initialDirection(index, position);
    tips.push({
      id: `tip-${String(index + 1).padStart(2, "0")}`,
      position: cloneVec3(position),
      direction,
      previousDirection: cloneVec3(direction),
      lastNodeId: originId,
      age: 0,
      familyId,
      originId,
      generation: 0,
      historyWeight: 1,
      localDensity: 0,
      phase: hashUnit(seed, index + 31),
      active: true,
      cooldownUntil: 1.6 + hashUnit(seed, index + 81) * 0.8,
      branchCount: 0,
    });
  }
  const state: RedundantFreeformState = {
    seed,
    elapsed: 0,
    accumulator: 0,
    origins,
    nodes,
    edges: [],
    tips,
    connectionEvents: [],
    localTension: [],
    history,
    metrics: zeroMetrics(),
  };
  state.metrics = computeMetrics(state);
  return state;
}

function lowFrequencyField(position: Vec3, time: number, familyId: number): Vec3 {
  return normalize({
    x: Math.sin(position.z * 3.2 + time * 0.27 + familyId * 0.73) * 0.8,
    y: Math.cos(position.x * 2.7 - time * 0.19 + familyId * 0.41) * 0.55,
    z: Math.sin(position.y * 3.7 + position.x * 1.3 + time * 0.23 - familyId * 0.52) * 0.8,
  });
}

function familyBias(familyId: number, phase: number): Vec3 {
  return normalize({
    x: Math.cos(familyId * 1.7 + phase * 2.1),
    y: Math.sin(familyId * 0.83 + phase * 1.4) * 0.5,
    z: Math.cos(familyId * 1.13 - phase * 1.7),
  });
}

function localDensity(position: Vec3, nodes: readonly MorphologyNode[], ignoreId: string): number {
  let density = 0;
  for (const node of nodes) {
    if (node.id === ignoreId) continue;
    const d = distance(position, node.position);
    if (d < 0.24) density += (0.24 - d) / 0.24;
  }
  return density;
}

function nearbyPathInfluence(position: Vec3, nodes: readonly MorphologyNode[], ignoreId: string): Vec3 {
  let total = 0;
  let sum = { x: 0, y: 0, z: 0 };
  for (const node of nodes) {
    if (node.id === ignoreId) continue;
    const d = distance(position, node.position);
    if (d > 0.34 || d < 0.001) continue;
    const weight = (0.34 - d) / 0.34;
    sum = add(sum, scale(normalize(subtract(node.position, position)), weight));
    total += weight;
  }
  return total > 0 ? normalize(scale(sum, 1 / total)) : { x: 0, y: 0, z: 0 };
}

function avoidanceField(position: Vec3, nodes: readonly MorphologyNode[], ignoreId: string): Vec3 {
  let sum = { x: 0, y: 0, z: 0 };
  for (const node of nodes) {
    if (node.id === ignoreId) continue;
    const delta = subtract(position, node.position);
    const d = magnitude(delta);
    if (d > 0.2 || d < 0.001) continue;
    sum = add(sum, scale(normalize(delta), (0.2 - d) / (d + 0.035)));
  }
  return normalize(sum);
}

function boundaryField(position: Vec3): Vec3 {
  const radius = magnitude(position);
  return radius > 0.62 ? normalize(scale(position, -1)) : { x: 0, y: 0, z: 0 };
}

function directionForTip(state: RedundantFreeformState, tip: TrajectoryTip, dt: number): Vec3 {
  const field = lowFrequencyField(tip.position, state.elapsed, tip.familyId);
  const avoidance = avoidanceField(tip.position, state.nodes, tip.lastNodeId);
  const path = nearbyPathInfluence(tip.position, state.nodes, tip.lastNodeId);
  const boundary = boundaryField(tip.position);
  const family = familyBias(tip.familyId, tip.phase);
  const densityTurn = clamp(tip.localDensity / 3.5, 0, 0.32);
  const slowBend = Math.sin(state.elapsed * 0.31 + tip.familyId * 0.7) * 0.07;
  const mixed = add(
    add(scale(tip.previousDirection, 0.69), scale(field, 0.22)),
    add(
      add(scale(avoidance, 0.16 + densityTurn * 0.48), scale(path, 0.1)),
      add(scale(family, 0.08), add(scale(boundary, 0.22), { x: slowBend, y: -slowBend * 0.4, z: slowBend * 0.7 })),
    ),
  );
  const direction = normalize(mixed);
  tip.previousDirection = lerpDirection(tip.previousDirection, direction, clamp(dt * 3.2, 0, 1));
  return tip.previousDirection;
}

function lerpDirection(a: Vec3, b: Vec3, amount: number): Vec3 {
  return normalize({
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount,
  });
}

function nodeById(state: RedundantFreeformState): Map<string, MorphologyNode> {
  return new Map(state.nodes.map((node) => [node.id, node]));
}

function degreeMap(state: RedundantFreeformState): Map<string, number> {
  const degrees = new Map(state.nodes.map((node) => [node.id, 0]));
  for (const edge of state.edges) {
    degrees.set(edge.a, (degrees.get(edge.a) ?? 0) + 1);
    degrees.set(edge.b, (degrees.get(edge.b) ?? 0) + 1);
  }
  return degrees;
}

function edgeExists(state: RedundantFreeformState, a: string, b: string): boolean {
  return state.edges.some((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));
}

function componentMap(state: RedundantFreeformState): { components: number; roots: Map<string, string> } {
  const parent = new Map(state.nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    let root = parent.get(id) ?? id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  for (const edge of state.edges) union(edge.a, edge.b);
  const roots = new Map<string, string>();
  for (const node of state.nodes) roots.set(node.id, find(node.id));
  return { components: new Set(roots.values()).size, roots };
}

export function computeMetrics(state: RedundantFreeformState): MorphologyMetrics {
  const degrees = degreeMap(state);
  const { components } = componentMap(state);
  const ageDistribution = { young: 0, middle: 0, old: 0 };
  let tensionTotal = 0;
  for (const edge of state.edges) {
    const age = state.elapsed - edge.birthTime;
    if (age < 4) ageDistribution.young += 1;
    else if (age < 10) ageDistribution.middle += 1;
    else ageDistribution.old += 1;
    tensionTotal += edge.tension;
  }
  return {
    components,
    cycleRank: Math.max(0, state.edges.length - state.nodes.length + components),
    deadEnds: [...degrees.values()].filter((degree) => degree === 1).length,
    reconnectCount: state.connectionEvents.length,
    meanLocalTension: state.edges.length > 0 ? tensionTotal / state.edges.length : 0,
    edgeAgeDistribution: ageDistribution,
  };
}

function addGrowthNode(state: RedundantFreeformState, tip: TrajectoryTip): MorphologyNode {
  const previous = nodeById(state).get(tip.lastNodeId);
  const node: MorphologyNode = {
    id: `node-${String(state.nodes.length + 1).padStart(4, "0")}`,
    position: cloneVec3(tip.position),
    previousPosition: cloneVec3(tip.position),
    velocity: { x: 0, y: 0, z: 0 },
    force: { x: 0, y: 0, z: 0 },
    originId: tip.originId,
    familyId: tip.familyId,
    generation: tip.generation,
    birthTime: state.elapsed,
    historyWeight: tip.historyWeight,
    reconnectionCount: 0,
    relaxationCount: 0,
    residue: 1,
  };
  state.nodes.push(node);
  if (previous) {
    const length = distance(previous.position, node.position);
    state.edges.push({
      id: `edge-${String(state.edges.length + 1).padStart(4, "0")}`,
      a: previous.id,
      b: node.id,
      birthTime: state.elapsed,
      familyId: tip.familyId,
      generation: tip.generation,
      reconnectionOrigin: null,
      relaxationCount: 0,
      restLength: length,
      currentLength: length,
      tension: 0,
      residue: 1,
    });
  }
  state.history.push(makeHistory(node));
  tip.lastNodeId = node.id;
  return node;
}

function maybeBranch(state: RedundantFreeformState, tip: TrajectoryTip): TrajectoryTip | null {
  if (tip.branchCount > 0 || tip.generation > 1 || tip.age < 3.7 || tip.age > 4.3) return null;
  if (hashUnit(state.seed, tip.familyId * 131 + Math.floor(tip.age * 10)) < 0.34) return null;
  const branchDirection = normalize(add(tip.direction, familyBias((tip.familyId + 2) % 6, tip.phase + 0.31)));
  tip.branchCount += 1;
  return {
    id: `tip-branch-${String(state.tips.length + 1).padStart(3, "0")}`,
    position: cloneVec3(tip.position),
    direction: branchDirection,
    previousDirection: cloneVec3(branchDirection),
    lastNodeId: tip.lastNodeId,
    age: 0,
    familyId: (tip.familyId + 2) % 6,
    originId: tip.originId,
    generation: tip.generation + 1,
    historyWeight: tip.historyWeight * 0.82,
    localDensity: tip.localDensity,
    phase: tip.phase + 0.21,
    active: true,
    cooldownUntil: state.elapsed + 1.1,
    branchCount: 1,
  };
}

function growTips(state: RedundantFreeformState, dt: number, params: R3Params): void {
  const branches: TrajectoryTip[] = [];
  const nodeLookup = nodeById(state);
  for (const tip of [...state.tips]) {
    if (!tip.active) continue;
    tip.age += dt;
    if (tip.age > MAX_TIP_AGE - tip.familyId * 0.48) {
      tip.active = false;
      continue;
    }
    const lastNode = nodeLookup.get(tip.lastNodeId);
    if (!lastNode) continue;
    tip.localDensity = localDensity(tip.position, state.nodes, tip.lastNodeId);
    tip.direction = directionForTip(state, tip, dt);
    const familySpeed = 0.79 + 0.1 * tip.familyId + 0.13 * Math.sin(tip.phase * 4.1);
    const densitySlowdown = 1 - clamp(tip.localDensity * 0.045, 0, 0.18);
    const speed = 0.032 * params.growth * familySpeed * densitySlowdown;
    tip.position = add(tip.position, scale(tip.direction, speed * dt));
    tip.position.x = clamp(tip.position.x, -0.76, 0.76);
    tip.position.y = clamp(tip.position.y, -0.72, 0.72);
    tip.position.z = clamp(tip.position.z, -0.76, 0.76);
    tip.phase += dt * (0.08 + tip.familyId * 0.013);
    if (distance(tip.position, lastNode.position) > 0.055) addGrowthNode(state, tip);
    const branch = maybeBranch(state, tip);
    if (branch) branches.push(branch);
  }
  state.tips.push(...branches);
}

interface ReconnectionCandidate {
  tip: TrajectoryTip;
  node: MorphologyNode;
  score: number;
  distance: number;
  density: number;
}

function bestReconnectionCandidate(state: RedundantFreeformState, tip: TrajectoryTip, params: R3Params): ReconnectionCandidate | null {
  if (!tip.active || state.elapsed < tip.cooldownUntil) return null;
  const degrees = degreeMap(state);
  const searchRadius = 0.34 * params.reconnect;
  let best: ReconnectionCandidate | null = null;
  for (const node of state.nodes) {
    if (node.id === tip.lastNodeId) continue;
    const d = distance(tip.position, node.position);
    if (d < 0.045 || d > searchRadius || edgeExists(state, tip.lastNodeId, node.id)) continue;
    const directionToNode = normalize(subtract(node.position, tip.position));
    const angleFit = Math.abs(dot(tip.direction, directionToNode));
    const historyFit = 1 / (1 + node.reconnectionCount * 0.48);
    const degreeFit = 1 / (1 + (degrees.get(node.id) ?? 0) * 0.22);
    const density = localDensity(node.position, state.nodes, node.id);
    const densityFit = 1 / (1 + density * 0.32);
    const distanceFit = 1 - d / searchRadius;
    const score = distanceFit * 0.42 + angleFit * 0.17 + historyFit * 0.15 + degreeFit * 0.12 + densityFit * 0.14;
    if (!best || score > best.score) best = { tip, node, score, distance: d, density };
  }
  return best;
}

function addReconnection(state: RedundantFreeformState, candidate: ReconnectionCandidate, params: R3Params): void {
  const source = nodeById(state).get(candidate.tip.lastNodeId);
  if (!source || edgeExists(state, source.id, candidate.node.id)) return;
  const eventId = `connection-${String(state.connectionEvents.length + 1).padStart(3, "0")}`;
  const origin = scale(add(source.position, candidate.node.position), 0.5);
  const event: ConnectionEvent = {
    id: eventId,
    time: state.elapsed,
    sourceNodeId: source.id,
    targetNodeId: candidate.node.id,
    score: candidate.score,
    distance: candidate.distance,
    localDensity: candidate.density,
    origin: cloneVec3(origin),
    radius: 0.145 + 0.035 * params.relaxation,
  };
  const length = candidate.distance;
  state.edges.push({
    id: `edge-${String(state.edges.length + 1).padStart(4, "0")}`,
    a: source.id,
    b: candidate.node.id,
    birthTime: state.elapsed,
    familyId: candidate.tip.familyId,
    generation: candidate.tip.generation,
    reconnectionOrigin: eventId,
    relaxationCount: 0,
    restLength: length * (0.82 + 0.05 * params.redundancy),
    currentLength: length,
    tension: Math.abs(length - length * (0.82 + 0.05 * params.redundancy)),
    residue: 1,
  });
  state.connectionEvents.push(event);
  state.localTension.push({
    eventId,
    center: cloneVec3(origin),
    radius: event.radius,
    residual: 1,
    age: 0,
    relaxationCount: 0,
  });
  source.reconnectionCount += 1;
  candidate.node.reconnectionCount += 1;
  candidate.tip.cooldownUntil = state.elapsed + 1.35 + hashUnit(state.seed, state.connectionEvents.length * 17) * 0.8;
  candidate.tip.historyWeight *= 0.97;
  state.history.push({
    birthTime: state.elapsed,
    familyId: candidate.tip.familyId,
    generation: candidate.tip.generation,
    reconnectionOrigin: eventId,
    relaxationCount: 0,
    residue: 1,
  });
}

function reconnectLocally(state: RedundantFreeformState, params: R3Params): void {
  const lastEvent = state.connectionEvents[state.connectionEvents.length - 1];
  const minimumInterval = 0.52 / params.redundancy;
  if (lastEvent && state.elapsed - lastEvent.time < minimumInterval) return;
  const candidates = state.tips
    .map((tip) => bestReconnectionCandidate(state, tip, params))
    .filter((candidate): candidate is ReconnectionCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score);
  const threshold = 0.43 + (1.1 - params.redundancy) * 0.09 + (1.05 - params.reconnect) * 0.05;
  const maximumEvents = params.redundancy > 1.05 ? 2 : 1;
  let events = 0;
  for (const candidate of candidates) {
    if (events >= maximumEvents || candidate.score < threshold) break;
    if (edgeExists(state, candidate.tip.lastNodeId, candidate.node.id)) continue;
    addReconnection(state, candidate, params);
    events += 1;
  }
}

function updateEdgeMeasurements(state: RedundantFreeformState): void {
  const nodes = nodeById(state);
  for (const edge of state.edges) {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b) continue;
    edge.currentLength = distance(a.position, b.position);
    edge.tension = Math.abs(edge.currentLength - edge.restLength) / Math.max(edge.restLength, 1e-5);
    edge.residue = clamp(edge.residue - 0.0012, 0.12, 1);
  }
}

function applyLocalRelaxation(state: RedundantFreeformState, dt: number, params: R3Params): void {
  for (const node of state.nodes) {
    node.previousPosition = cloneVec3(node.position);
    node.force = { x: 0, y: 0, z: 0 };
  }
  const nodes = nodeById(state);
  const activeFields = state.localTension.filter((field) => field.age < 2.8 || field.residual > 0.002);
  const touchedEdges = new Set<string>();
  for (const edge of state.edges) {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b) continue;
    const current = distance(a.position, b.position);
    edge.currentLength = current;
    edge.tension = Math.abs(current - edge.restLength) / Math.max(edge.restLength, 1e-5);
    for (const field of activeFields) {
      const aLocal = distance(a.position, field.center) <= field.radius;
      const bLocal = distance(b.position, field.center) <= field.radius;
      if (!aLocal && !bLocal) continue;
      const extension = current - edge.restLength;
      const force = scale(normalize(subtract(b.position, a.position)), extension * 1.25);
      if (aLocal) a.force = add(a.force, force);
      if (bLocal) b.force = subtract(b.force, force);
      touchedEdges.add(edge.id);
    }
  }
  let totalResidual = 0;
  for (const field of state.localTension) {
    let fieldResidual = 0;
    let fieldCount = 0;
    for (const node of state.nodes) {
      if (distance(node.position, field.center) <= field.radius) {
        fieldResidual += magnitude(node.force) + magnitude(node.velocity) * 0.5;
        fieldCount += 1;
      }
    }
    field.residual = fieldCount > 0 ? fieldResidual / fieldCount : 0;
    field.age += dt;
    if (field.residual > 0.001) field.relaxationCount += 1;
    totalResidual += field.residual;
  }
  for (const node of state.nodes) {
    const local = activeFields.some((field) => distance(node.position, field.center) <= field.radius);
    if (!local) {
      node.velocity = scale(node.velocity, 0.75);
      continue;
    }
    node.velocity = scale(add(node.velocity, scale(node.force, dt)), 0.82);
    node.position = add(node.position, scale(node.velocity, dt * 0.32 * params.relaxation));
    node.position.x = clamp(node.position.x, -0.78, 0.78);
    node.position.y = clamp(node.position.y, -0.74, 0.74);
    node.position.z = clamp(node.position.z, -0.78, 0.78);
    if (magnitude(node.force) > 0.001) node.relaxationCount += 1;
    node.residue = clamp(node.residue + 0.002, 0.1, 1);
  }
  for (const edge of state.edges) {
    if (touchedEdges.has(edge.id)) edge.relaxationCount += 1;
  }
  state.localTension = state.localTension.filter((field) => field.age < 3.2 || field.residual > 0.001);
  if (state.localTension.length > 0 && totalResidual > 0) {
    for (const event of state.connectionEvents) {
      const field = state.localTension.find((candidate) => candidate.eventId === event.id);
      if (field) event.score = clamp(event.score + field.residual * 0.0001, 0, 1);
    }
  }
}

function advanceFixedStep(state: RedundantFreeformState, dt: number, params: R3Params): void {
  state.elapsed += dt;
  growTips(state, dt, params);
  reconnectLocally(state, params);
  applyLocalRelaxation(state, dt, params);
  for (const node of state.nodes) node.residue = clamp(node.residue - dt * 0.004, 0.12, 1);
  updateEdgeMeasurements(state);
  state.metrics = computeMetrics(state);
}

export function advanceRedundantFreeform(state: RedundantFreeformState, deltaSeconds: number, params: R3Params): RedundantFreeformState {
  state.accumulator += Math.min(Math.max(deltaSeconds, 0), 0.25);
  let steps = 0;
  while (state.accumulator >= FIXED_STEP_SECONDS && steps < 30) {
    advanceFixedStep(state, FIXED_STEP_SECONDS, params);
    state.accumulator -= FIXED_STEP_SECONDS;
    steps += 1;
  }
  state.metrics = computeMetrics(state);
  return state;
}

export function runRedundantFreeform(state: RedundantFreeformState, seconds: number, params: R3Params): RedundantFreeformState {
  let remaining = seconds;
  while (remaining > 0) {
    const delta = Math.min(0.1, remaining);
    advanceRedundantFreeform(state, delta, params);
    remaining -= delta;
  }
  return state;
}

export function localDisplacement(state: RedundantFreeformState, nodeId: string): number {
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  return node ? distance(node.position, node.previousPosition) : 0;
}
