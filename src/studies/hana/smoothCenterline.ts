import type { HanaSoftEditStrength, HanaViewDirection } from "./gesture.ts";
import type {
  HanaStroke3D,
  HanaVector3,
} from "./stroke3d.ts";

export const HANA_SOFT_EDIT_WEIGHTS = {
  off: [1],
  low: [1, 0.67, 0.33],
  medium: [1, 0.8, 0.6, 0.4, 0.2],
} as const satisfies Record<HanaSoftEditStrength, readonly number[]>;

export const HANA_STROKE_PRESENTATION_COLORS = [
  "#2563eb",
  "#db2777",
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
] as const;

export const HANA_SMOOTHNESS_RELAXATION_PASSES = 4;

export interface HanaSmoothCenterlinePoint {
  position: HanaVector3;
  sourceT: number;
  pressure: number;
  time: number;
  segmentIndex: number;
  segmentT: number;
}

export interface HanaSoftEditResult {
  affectedControlIndices: number[];
  weights: number[];
  delta: HanaVector3;
}

export interface HanaStrokeBounds {
  min: HanaVector3;
  max: HanaVector3;
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function vectorLerp(a: HanaVector3, b: HanaVector3, amount: number): HanaVector3 {
  return {
    x: lerp(a.x, b.x, amount),
    y: lerp(a.y, b.y, amount),
    z: lerp(a.z, b.z, amount),
  };
}

function cloneVector(vector: HanaVector3): HanaVector3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function normalizedSmoothness(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function fullyRelaxedControlPositions(
  positions: readonly HanaVector3[],
): HanaVector3[] {
  let current = positions.map(cloneVector);
  for (let pass = 0; pass < HANA_SMOOTHNESS_RELAXATION_PASSES; pass += 1) {
    current = current.map((position, index) => {
      if (index === 0 || index === current.length - 1) return cloneVector(position);
      return {
        x: 0.25 * current[index - 1].x + 0.5 * position.x + 0.25 * current[index + 1].x,
        y: 0.25 * current[index - 1].y + 0.5 * position.y + 0.25 * current[index + 1].y,
        z: 0.25 * current[index - 1].z + 0.5 * position.z + 0.25 * current[index + 1].z,
      };
    });
  }
  return current;
}

export function displayControlPositions(stroke: HanaStroke3D): HanaVector3[] {
  const original = stroke.controlPoints.map((point) => cloneVector(point.position));
  const amount = normalizedSmoothness(stroke.curve.smoothness);
  if (amount === 0 || original.length < 3) return original;
  const relaxed = fullyRelaxedControlPositions(original);
  return original.map((position, index) => vectorLerp(position, relaxed[index], amount));
}

export function controlPointRoughness(positions: readonly HanaVector3[]): number {
  let energy = 0;
  for (let index = 1; index < positions.length - 1; index += 1) {
    const previous = positions[index - 1];
    const current = positions[index];
    const next = positions[index + 1];
    const x = previous.x - 2 * current.x + next.x;
    const y = previous.y - 2 * current.y + next.y;
    const z = previous.z - 2 * current.z + next.z;
    energy += x * x + y * y + z * z;
  }
  return energy;
}

function extrapolate(anchor: HanaVector3, neighbor: HanaVector3): HanaVector3 {
  return {
    x: anchor.x * 2 - neighbor.x,
    y: anchor.y * 2 - neighbor.y,
    z: anchor.z * 2 - neighbor.z,
  };
}

function knot(previous: number, a: HanaVector3, b: HanaVector3, alpha: number): number {
  const chord = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  return previous + Math.max(1e-6, Math.pow(chord, alpha));
}

function blendAt(
  a: HanaVector3,
  b: HanaVector3,
  ta: number,
  tb: number,
  t: number,
): HanaVector3 {
  const amount = (t - ta) / Math.max(1e-9, tb - ta);
  return vectorLerp(a, b, amount);
}

function centripetalCatmullRom(
  p0: HanaVector3,
  p1: HanaVector3,
  p2: HanaVector3,
  p3: HanaVector3,
  segmentT: number,
  alpha: number,
): HanaVector3 {
  const t0 = 0;
  const t1 = knot(t0, p0, p1, alpha);
  const t2 = knot(t1, p1, p2, alpha);
  const t3 = knot(t2, p2, p3, alpha);
  const t = lerp(t1, t2, segmentT);
  const a1 = blendAt(p0, p1, t0, t1, t);
  const a2 = blendAt(p1, p2, t1, t2, t);
  const a3 = blendAt(p2, p3, t2, t3, t);
  const b1 = blendAt(a1, a2, t0, t2, t);
  const b2 = blendAt(a2, a3, t1, t3, t);
  return blendAt(b1, b2, t1, t2, t);
}

export function sampleSmoothCenterline(stroke: HanaStroke3D): HanaSmoothCenterlinePoint[] {
  const controls = stroke.controlPoints;
  if (controls.length === 0) return [];
  const positions = displayControlPositions(stroke);
  if (controls.length === 1) {
    const point = controls[0];
    return [{
      position: positions[0],
      sourceT: point.provenance.sourceT,
      pressure: point.provenance.pressure,
      time: point.provenance.time,
      segmentIndex: 0,
      segmentT: 0,
    }];
  }

  const result: HanaSmoothCenterlinePoint[] = [];
  const samplesPerSegment = stroke.curve.samplesPerSegment;
  for (let segmentIndex = 0; segmentIndex < controls.length - 1; segmentIndex += 1) {
    const first = controls[segmentIndex];
    const second = controls[segmentIndex + 1];
    const firstPosition = positions[segmentIndex];
    const secondPosition = positions[segmentIndex + 1];
    const p0 = segmentIndex > 0
      ? positions[segmentIndex - 1]
      : extrapolate(firstPosition, secondPosition);
    const p3 = segmentIndex + 2 < controls.length
      ? positions[segmentIndex + 2]
      : extrapolate(secondPosition, firstPosition);
    for (let sampleIndex = 0; sampleIndex < samplesPerSegment; sampleIndex += 1) {
      const segmentT = sampleIndex / samplesPerSegment;
      result.push({
        position: centripetalCatmullRom(
          p0,
          firstPosition,
          secondPosition,
          p3,
          segmentT,
          stroke.curve.alpha,
        ),
        sourceT: lerp(first.provenance.sourceT, second.provenance.sourceT, segmentT),
        pressure: lerp(first.provenance.pressure, second.provenance.pressure, segmentT),
        time: lerp(first.provenance.time, second.provenance.time, segmentT),
        segmentIndex,
        segmentT,
      });
    }
  }
  const last = controls[controls.length - 1];
  result.push({
    position: positions[positions.length - 1],
    sourceT: last.provenance.sourceT,
    pressure: last.provenance.pressure,
    time: last.provenance.time,
    segmentIndex: controls.length - 2,
    segmentT: 1,
  });
  return result;
}

export function applySoftViewportEdit(
  stroke: HanaStroke3D,
  selectedIndex: number,
  direction: Exclude<HanaViewDirection, "axome">,
  visiblePosition: HanaVector3,
  strength: HanaSoftEditStrength,
): HanaSoftEditResult {
  const selected = stroke.controlPoints[selectedIndex];
  if (!selected) throw new Error(`Unknown HANA control point index: ${selectedIndex}`);
  const delta: HanaVector3 = { x: 0, y: 0, z: 0 };
  if (direction === "front") {
    delta.x = visiblePosition.x - selected.position.x;
    delta.z = visiblePosition.z - selected.position.z;
  } else if (direction === "right") {
    delta.y = visiblePosition.y - selected.position.y;
    delta.z = visiblePosition.z - selected.position.z;
  } else {
    delta.x = visiblePosition.x - selected.position.x;
    delta.y = visiblePosition.y - selected.position.y;
  }

  const preset = HANA_SOFT_EDIT_WEIGHTS[strength];
  const affectedControlIndices: number[] = [];
  const weights: number[] = [];
  for (let index = 0; index < stroke.controlPoints.length; index += 1) {
    const distance = Math.abs(index - selectedIndex);
    const weight = preset[distance];
    if (weight === undefined) continue;
    const point = stroke.controlPoints[index].position;
    point.x += delta.x * weight;
    point.y += delta.y * weight;
    point.z += delta.z * weight;
    affectedControlIndices.push(index);
    weights.push(weight);
  }
  return { affectedControlIndices, weights, delta };
}

export function strokeBounds(stroke: HanaStroke3D): HanaStrokeBounds | null {
  if (stroke.controlPoints.length === 0) return null;
  const min = { ...stroke.controlPoints[0].position };
  const max = { ...stroke.controlPoints[0].position };
  for (const point of stroke.controlPoints.slice(1)) {
    min.x = Math.min(min.x, point.position.x);
    min.y = Math.min(min.y, point.position.y);
    min.z = Math.min(min.z, point.position.z);
    max.x = Math.max(max.x, point.position.x);
    max.y = Math.max(max.y, point.position.y);
    max.z = Math.max(max.z, point.position.z);
  }
  return { min, max };
}

export function editorStrokeColor(strokeId: string): string {
  let hash = 0;
  for (let index = 0; index < strokeId.length; index += 1) {
    hash = ((hash << 5) - hash + strokeId.charCodeAt(index)) | 0;
  }
  return HANA_STROKE_PRESENTATION_COLORS[Math.abs(hash) % HANA_STROKE_PRESENTATION_COLORS.length];
}
