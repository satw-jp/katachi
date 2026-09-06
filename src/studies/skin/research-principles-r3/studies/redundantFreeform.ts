import {
  clamp,
  phaseFor,
  type MorphologyEdge,
  type MorphologyNode,
  type ProjectedPoint,
  type R3Params,
  type RedundantFreeformState,
  type StudyView,
  type Vec3,
} from "../runtime/types.ts";
import { advanceRedundantFreeform, createRedundantFreeformState } from "../runtime/network.ts";

function project(point: Vec3, view: StudyView): ProjectedPoint {
  const yaw = -0.34;
  const pitch = 0.18;
  const yawX = Math.cos(yaw) * point.x - Math.sin(yaw) * point.z;
  const yawZ = Math.sin(yaw) * point.x + Math.cos(yaw) * point.z;
  const pitchY = Math.cos(pitch) * point.y - Math.sin(pitch) * yawZ;
  const depth = Math.sin(pitch) * point.y + Math.cos(pitch) * yawZ;
  const scaleFactor = 1.2 / (1.75 + depth);
  return {
    x: view.width * 0.5 + yawX * view.width * 0.52 * scaleFactor,
    y: view.height * 0.36 - pitchY * view.height * 0.78 * scaleFactor,
    depth,
    scale: scaleFactor,
  };
}

function nodeMap(state: RedundantFreeformState): Map<string, MorphologyNode> {
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

function edgeDepth(edge: MorphologyEdge, nodes: Map<string, MorphologyNode>, view: StudyView): number {
  const a = nodes.get(edge.a);
  const b = nodes.get(edge.b);
  if (!a || !b) return 0;
  return (project(a.position, view).depth + project(b.position, view).depth) * 0.5;
}

function edgeColor(edge: MorphologyEdge): string {
  const hue = 202 + ((edge.familyId * 13 + Math.floor(edge.birthTime * 3)) % 26);
  const lightness = 73 + Math.round(edge.residue * 12);
  const saturation = edge.reconnectionOrigin ? 34 : 20;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function drawEdge(context: CanvasRenderingContext2D, edge: MorphologyEdge, nodes: Map<string, MorphologyNode>, view: StudyView): void {
  const a = nodes.get(edge.a);
  const b = nodes.get(edge.b);
  if (!a || !b) return;
  const start = project(a.position, view);
  const end = project(b.position, view);
  const depthAlpha = clamp(0.84 - ((start.depth + end.depth) * 0.5 + 0.5) * 0.42, 0.2, 0.86);
  const ageFade = clamp(0.55 + edge.residue * 0.45, 0.55, 1);
  const color = edgeColor(edge);
  context.save();
  context.globalAlpha = depthAlpha * ageFade * (edge.reconnectionOrigin ? 0.9 : 0.72);
  context.strokeStyle = color;
  context.lineWidth = edge.reconnectionOrigin ? 1.15 : 0.72;
  context.lineCap = "round";
  context.shadowBlur = edge.reconnectionOrigin ? 7 : 3;
  context.shadowColor = color;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawNode(context: CanvasRenderingContext2D, node: MorphologyNode, degree: number, view: StudyView): void {
  const point = project(node.position, view);
  const depthAlpha = clamp(0.48 + (1 - point.depth) * 0.22, 0.35, 0.82);
  const radius = (0.95 + Math.min(2.2, degree * 0.34) + node.reconnectionCount * 0.26) * point.scale;
  const color = node.reconnectionCount > 0 ? "#f2e8d6" : "#d9e6f3";
  context.save();
  context.globalAlpha = depthAlpha;
  context.fillStyle = color;
  context.shadowBlur = node.reconnectionCount > 0 ? 10 : 4;
  context.shadowColor = color;
  context.beginPath();
  context.arc(point.x, point.y, Math.max(0.7, radius), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawEvent(context: CanvasRenderingContext2D, eventOrigin: Vec3, radius: number, view: StudyView, age: number): void {
  const point = project(eventOrigin, view);
  const pulse = 1 + Math.sin(age * 3.2) * 0.16;
  const screenRadius = Math.max(2, radius * view.width * 0.43 * point.scale * pulse);
  const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, screenRadius);
  gradient.addColorStop(0, "rgba(255, 239, 208, .42)");
  gradient.addColorStop(0.2, "rgba(198, 224, 255, .17)");
  gradient.addColorStop(1, "rgba(153, 189, 238, 0)");
  context.save();
  context.globalCompositeOperation = "screen";
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(point.x, point.y, screenRadius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function renderRedundantFreeform(context: CanvasRenderingContext2D, state: RedundantFreeformState, view: StudyView): void {
  const nodes = nodeMap(state);
  const degrees = degreeMap(state);
  const sortedEdges = [...state.edges].sort((a, b) => edgeDepth(a, nodes, view) - edgeDepth(b, nodes, view));
  for (const edge of sortedEdges) drawEdge(context, edge, nodes, view);
  for (const node of state.nodes) drawNode(context, node, degrees.get(node.id) ?? 0, view);
  for (const event of state.connectionEvents.slice(-12)) {
    const active = state.localTension.find((field) => field.eventId === event.id);
    if (active) drawEvent(context, event.origin, event.radius, view, active.age);
  }
  for (const tip of state.tips) {
    if (!tip.active) continue;
    const point = project(tip.position, view);
    context.save();
    context.fillStyle = "#fff7e8";
    context.globalAlpha = 0.72;
    context.shadowBlur = 9;
    context.shadowColor = "#d6e9ff";
    context.beginPath();
    context.arc(point.x, point.y, Math.max(1, 1.35 * point.scale), 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function readouts(state: RedundantFreeformState): readonly string[] {
  const activeTips = state.tips.filter((tip) => tip.active).length;
  return [
    `ORIGINS ${state.origins.length} · NODES ${state.nodes.length} · EDGES ${state.edges.length}`,
    `COMPONENTS ${state.metrics.components} · CYCLE RANK ${state.metrics.cycleRank}`,
    `RECONNECT EVENTS ${state.metrics.reconnectCount} · DEAD ENDS ${state.metrics.deadEnds}`,
    `LOCAL TENSION ${state.metrics.meanLocalTension.toFixed(3)} · ACTIVE TIPS ${activeTips}`,
  ];
}

function manifest(state: RedundantFreeformState, params: R3Params): Record<string, unknown> {
  return {
    study: "R3-01 / redundant-freeform",
    seed: state.seed,
    elapsedSeconds: Number(state.elapsed.toFixed(3)),
    params,
    counts: {
      origins: state.origins.length,
      nodes: state.nodes.length,
      edges: state.edges.length,
      components: state.metrics.components,
      cycleRank: state.metrics.cycleRank,
      deadEnds: state.metrics.deadEnds,
      reconnectEvents: state.metrics.reconnectCount,
    },
    meanLocalTension: Number(state.metrics.meanLocalTension.toFixed(6)),
    edgeAgeDistribution: state.metrics.edgeAgeDistribution,
    historyRecords: state.history.length,
    localTensionStates: state.localTension.length,
    activeTips: state.tips.filter((tip) => tip.active).length,
  };
}

export const redundantFreeformDefinition = {
  key: "redundant-freeform" as const,
  studyId: "R3-01",
  title: "REDUNDANT FREEFORM MORPHOGENESIS",
  artTitle: "A BODY THAT KEEPS ANOTHER WAY",
  principle: "Multiple weak rules accumulate into a strange spatial body: trajectories grow, find one another locally, and keep the excess paths that a single clean tree would discard.",
  phaseSequence: ["ORIGINS", "GROWTH", "INTERWEAVE", "LATE MORPHOGENESIS"] as const,
  controls: [
    { key: "growth" as const, label: "GROWTH", min: 0.45, max: 1.45, step: 0.01, value: 1 },
    { key: "reconnect" as const, label: "RECONNECT", min: 0.55, max: 1.2, step: 0.01, value: 0.88 },
    { key: "redundancy" as const, label: "REDUNDANCY", min: 0.7, max: 1.3, step: 0.01, value: 1 },
    { key: "relaxation" as const, label: "RELAXATION", min: 0.55, max: 1.5, step: 0.01, value: 1 },
  ],
  documentation: {
    scientificCore: "A deterministic 3D graph grows from many non-uniform origins. Tip direction mixes memory, a low-frequency field, density avoidance, nearby path influence, and a small family bias. Local score-based reconnection adds edges without deleting old routes; only bounded event neighborhoods relax.",
    artTranslation: "The form is not an illustration of a tree. It is a record of alternatives: crossings, loops, residue, and a few unresolved ends make the body feel as if it has found several answers at once.",
    whatChanged: "Round 03 moves from explaining reconnection to letting several generative principles coexist inside one freeform morphology study.",
    notClaimed: "This is a deterministic visual research instrument, not a material support solver, shortest-path system, or globally optimized physical simulation.",
  },
  createState: createRedundantFreeformState,
  advanceState: advanceRedundantFreeform,
  phase: phaseFor,
  render: renderRedundantFreeform,
  readouts,
  manifest,
};
