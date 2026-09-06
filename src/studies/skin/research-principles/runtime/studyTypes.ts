export type Phase = "BEFORE" | "CHANGE" | "AFTER";

export type StudyKey =
  | "path-adaptation"
  | "anastomosis"
  | "constrained-relaxation"
  | "neighbor-exchange"
  | "coarsening";

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

export interface StudyView {
  width: number;
  height: number;
  elapsedSeconds: number;
  phase: Phase;
}

export interface StudyDefinition {
  key: StudyKey;
  studyId: string;
  title: string;
  artTitle: string;
  principle: string;
  controls: readonly StudyControl[];
  documentation: StudyDocumentation;
  createState: (seed: number) => unknown;
  advanceState: (state: unknown, deltaSeconds: number, params: Readonly<Record<string, number>>) => unknown;
  render: (context: CanvasRenderingContext2D, state: unknown, view: StudyView) => void;
  readouts: (state: unknown) => readonly string[];
  manifest: (state: unknown, params: Readonly<Record<string, number>>) => Record<string, unknown>;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function phaseForElapsed(elapsedSeconds: number): Phase {
  if (elapsedSeconds < 5) return "BEFORE";
  if (elapsedSeconds < 11) return "CHANGE";
  return "AFTER";
}

export function normalizedToCanvas(point: { x: number; y: number }, view: StudyView, padding = 42): { x: number; y: number } {
  const width = Math.max(1, view.width - padding * 2);
  const height = Math.max(1, view.height - padding * 2);
  return { x: padding + point.x * width, y: padding + point.y * height };
}

export function hashNoise(seed: number, index: number): number {
  const value = Math.sin(seed * 0.000071 + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function drawGlowPoint(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 1,
): void {
  context.save();
  context.globalAlpha = alpha;
  context.shadowBlur = radius * 5;
  context.shadowColor = color;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function drawCurve(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  view: StudyView,
  options: { color: string; width: number; alpha?: number; glow?: number; dash?: number[] } = { color: "#ffffff", width: 1 },
): void {
  if (points.length < 2) return;
  context.save();
  context.globalAlpha = options.alpha ?? 1;
  context.strokeStyle = options.color;
  context.lineWidth = options.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (options.glow) {
    context.shadowBlur = options.glow;
    context.shadowColor = options.color;
  }
  if (options.dash) context.setLineDash(options.dash);
  context.beginPath();
  const first = normalizedToCanvas(points[0], view);
  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = normalizedToCanvas(points[index], view);
    context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.restore();
}

export function interpolatePoint(
  points: readonly { x: number; y: number }[],
  amount: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const clamped = clamp(amount, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(clamped));
  const local = clamped - index;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * local,
    y: points[index].y + (points[index + 1].y - points[index].y) * local,
  };
}
