export type Vec2 = { x: number; y: number };

export interface NetworkNode {
  id: string;
  position: Vec2;
  velocity: Vec2;
  force: Vec2;
  anchor?: boolean;
  motifId?: string;
}

export interface NetworkEdge {
  id: string;
  a: string;
  b: string;
  restLength: number;
  stiffness: number;
  length: number;
  tension: number;
}

export interface StudyControl {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface StudyDocumentation {
  scientificCore: string;
  artTranslation: string;
  whatChanged: string;
  notClaimed: string;
}

export interface R2Phase {
  label: string;
  index: number;
  detail: string;
}

export interface StudyView {
  width: number;
  height: number;
  elapsedSeconds: number;
}

export interface StudyDefinition {
  key: StudyKey;
  studyId: string;
  title: string;
  artTitle: string;
  principle: string;
  phaseSequence: readonly string[];
  controls: readonly StudyControl[];
  requiresSeed?: boolean;
  documentation: StudyDocumentation;
  createState: (seed: number) => unknown;
  advanceState: (state: unknown, deltaSeconds: number, params: Readonly<Record<string, number>>) => unknown;
  phase: (state: unknown) => R2Phase;
  render: (context: CanvasRenderingContext2D, state: unknown, view: StudyView) => void;
  readouts: (state: unknown) => readonly string[];
  manifest: (state: unknown, params: Readonly<Record<string, number>>) => Record<string, unknown>;
}

export type StudyKey = "multi-reconnect" | "motif-tension" | "relax-rewire";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(vector: Vec2, amount: number): Vec2 {
  return { x: vector.x * amount, y: vector.y * amount };
}

export function length(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return length(subtract(a, b));
}

export function normalize(vector: Vec2): Vec2 {
  const magnitude = length(vector);
  return magnitude > 1e-9 ? scale(vector, 1 / magnitude) : { x: 0, y: 0 };
}

export function lerp(a: Vec2, b: Vec2, amount: number): Vec2 {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}

export function smoothstep(amount: number): number {
  const t = clamp(amount, 0, 1);
  return t * t * (3 - 2 * t);
}

export function hashNoise(seed: number, index: number): number {
  const value = Math.sin(seed * 0.000071 + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function normalizedToCanvas(point: Vec2, view: StudyView, padding = 42): Vec2 {
  const width = Math.max(1, view.width - padding * 2);
  const height = Math.max(1, view.height - padding * 2);
  return { x: padding + point.x * width, y: padding + point.y * height };
}

export function drawLine(
  context: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  view: StudyView,
  color: string,
  width: number,
  alpha = 1,
  glow = 0,
): void {
  const start = normalizedToCanvas(a, view);
  const end = normalizedToCanvas(b, view);
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  if (glow > 0) {
    context.shadowBlur = glow;
    context.shadowColor = color;
  }
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

export function drawPoint(
  context: CanvasRenderingContext2D,
  point: Vec2,
  view: StudyView,
  radius: number,
  color: string,
  alpha = 1,
  glow = 0,
): void {
  const mapped = normalizedToCanvas(point, view);
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  if (glow > 0) {
    context.shadowBlur = glow;
    context.shadowColor = color;
  }
  context.beginPath();
  context.arc(mapped.x, mapped.y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function runFixedSteps<T extends { accumulator: number }>(
  state: T,
  deltaSeconds: number,
  stepSeconds: number,
  step: (state: T, deltaSeconds: number) => void,
): void {
  state.accumulator += Math.min(Math.max(deltaSeconds, 0), 0.25);
  let steps = 0;
  while (state.accumulator >= stepSeconds && steps < 30) {
    step(state, stepSeconds);
    state.accumulator -= stepSeconds;
    steps += 1;
  }
}
