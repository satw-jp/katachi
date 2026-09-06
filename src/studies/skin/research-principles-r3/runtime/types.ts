export type Vec3 = { x: number; y: number; z: number };

export type PhaseLabel = "ORIGINS" | "GROWTH" | "INTERWEAVE" | "LATE MORPHOGENESIS";

export interface Origin {
  id: string;
  position: Vec3;
  familyId: number;
  birthTime: number;
}

export interface TrajectoryTip {
  id: string;
  position: Vec3;
  direction: Vec3;
  previousDirection: Vec3;
  lastNodeId: string;
  age: number;
  familyId: number;
  originId: string;
  generation: number;
  historyWeight: number;
  localDensity: number;
  phase: number;
  active: boolean;
  cooldownUntil: number;
  branchCount: number;
}

export interface MorphologyNode {
  id: string;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  force: Vec3;
  originId: string;
  familyId: number;
  generation: number;
  birthTime: number;
  historyWeight: number;
  reconnectionCount: number;
  relaxationCount: number;
  residue: number;
}

export interface MorphologyEdge {
  id: string;
  a: string;
  b: string;
  birthTime: number;
  familyId: number;
  generation: number;
  reconnectionOrigin: string | null;
  relaxationCount: number;
  restLength: number;
  currentLength: number;
  tension: number;
  residue: number;
}

export interface ConnectionEvent {
  id: string;
  time: number;
  sourceNodeId: string;
  targetNodeId: string;
  score: number;
  distance: number;
  localDensity: number;
  origin: Vec3;
  radius: number;
}

export interface LocalTensionState {
  eventId: string;
  center: Vec3;
  radius: number;
  residual: number;
  age: number;
  relaxationCount: number;
}

export interface HistoryState {
  birthTime: number;
  familyId: number;
  generation: number;
  reconnectionOrigin: string | null;
  relaxationCount: number;
  residue: number;
}

export interface MorphologyMetrics {
  components: number;
  cycleRank: number;
  deadEnds: number;
  reconnectCount: number;
  meanLocalTension: number;
  edgeAgeDistribution: { young: number; middle: number; old: number };
}

export interface R3Params {
  growth: number;
  reconnect: number;
  redundancy: number;
  relaxation: number;
}

export interface RedundantFreeformState {
  seed: number;
  elapsed: number;
  accumulator: number;
  origins: Origin[];
  nodes: MorphologyNode[];
  edges: MorphologyEdge[];
  tips: TrajectoryTip[];
  connectionEvents: ConnectionEvent[];
  localTension: LocalTensionState[];
  history: HistoryState[];
  metrics: MorphologyMetrics;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
  scale: number;
}

export interface StudyView {
  width: number;
  height: number;
  elapsedSeconds: number;
}

export interface StudyControl {
  key: keyof R3Params;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface R3Phase {
  label: PhaseLabel;
  index: number;
  detail: string;
}

export interface StudyDocumentation {
  scientificCore: string;
  artTranslation: string;
  whatChanged: string;
  notClaimed: string;
}

export interface R3StudyDefinition {
  key: "redundant-freeform";
  studyId: string;
  title: string;
  artTitle: string;
  principle: string;
  phaseSequence: readonly PhaseLabel[];
  controls: readonly StudyControl[];
  documentation: StudyDocumentation;
  createState: (seed: number) => RedundantFreeformState;
  advanceState: (state: RedundantFreeformState, deltaSeconds: number, params: R3Params) => RedundantFreeformState;
  phase: (state: RedundantFreeformState) => R3Phase;
  render: (context: CanvasRenderingContext2D, state: RedundantFreeformState, view: StudyView) => void;
  readouts: (state: RedundantFreeformState) => readonly string[];
  manifest: (state: RedundantFreeformState, params: R3Params) => Record<string, unknown>;
}

export const INITIAL_PARAMS: Readonly<R3Params> = {
  growth: 1,
  reconnect: 0.88,
  redundancy: 1,
  relaxation: 1,
};

export const STUDY_CONTROLS: readonly StudyControl[] = [
  { key: "growth", label: "GROWTH", min: 0.45, max: 1.45, step: 0.01, value: INITIAL_PARAMS.growth },
  { key: "reconnect", label: "RECONNECT", min: 0.55, max: 1.2, step: 0.01, value: INITIAL_PARAMS.reconnect },
  { key: "redundancy", label: "REDUNDANCY", min: 0.7, max: 1.3, step: 0.01, value: INITIAL_PARAMS.redundancy },
  { key: "relaxation", label: "RELAXATION", min: 0.55, max: 1.5, step: 0.01, value: INITIAL_PARAMS.relaxation },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, amount: number): Vec3 {
  return { x: a.x * amount, y: a.y * amount, z: a.z * amount };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function magnitude(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function distance(a: Vec3, b: Vec3): number {
  return magnitude(subtract(a, b));
}

export function normalize(a: Vec3): Vec3 {
  const length = magnitude(a);
  return length > 1e-8 ? scale(a, 1 / length) : { x: 0, y: 0, z: 0 };
}

export function lerp(a: Vec3, b: Vec3, amount: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount,
  };
}

export function hashUnit(seed: number, index: number): number {
  const value = Math.sin(seed * 0.000071 + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

export function phaseFor(state: RedundantFreeformState): R3Phase {
  if (state.elapsed < 2.4) return { label: "ORIGINS", index: 0, detail: "separate sources" };
  if (state.elapsed < 9 || state.connectionEvents.length < 2) return { label: "GROWTH", index: 1, detail: "slow trajectories" };
  if (state.elapsed < 18 || state.metrics.cycleRank < 1) return { label: "INTERWEAVE", index: 2, detail: "local reconnection" };
  return { label: "LATE MORPHOGENESIS", index: 3, detail: "history in residue" };
}
