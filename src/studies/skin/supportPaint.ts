import { buildUniformSpatialGrid3, queryUniformSpatialGridSphere } from "./uniformSpatialGrid.ts";

export const SUPPORT_PAINT_SCHEMA = "katachi.skin.support-paint.v1" as const;
export const SUPPORT_PAINT_COORDINATE_SPACE = "support-free-surface-bbox-normalized-v1" as const;
export const SUPPORT_PAINT_NORMAL_COSINE_THRESHOLD = 0.5;

export type SupportPaintMode = "inside" | "outside" | "auto";
export type SupportPaintClassification = "inside" | "outside" | "unresolved";

export interface SupportPaintPoint3 { x: number; y: number; z: number }

export interface SupportPaintStrokeV1 {
  order: number;
  mode: SupportPaintMode;
  centerNormalized: SupportPaintPoint3;
  radiusMm: number;
  radiusNormalized: number;
  surfaceNormal: SupportPaintPoint3;
  normalCosineThreshold: number;
  paintBackfaces: boolean;
}

export interface SupportPaintV1 {
  schema: typeof SUPPORT_PAINT_SCHEMA;
  coordinateSpace: typeof SUPPORT_PAINT_COORDINATE_SPACE;
  sourceLongestMm: number;
  strokes: SupportPaintStrokeV1[];
}

export interface SupportPaintFrame {
  centerMm: SupportPaintPoint3;
  longestMm: number;
}

export interface SupportPaintSite {
  id: string;
  classification: SupportPaintClassification;
  automaticClassification?: SupportPaintClassification;
  positionMm?: { xMm: number; yMm: number; zMm: number };
  normal?: { xMm: number; yMm: number; zMm: number };
  duplicateOf?: string;
  supportPaintStrokeOrder?: number;
  supportPaintMode?: SupportPaintMode;
  manuallyPainted?: boolean;
  manuallyOverridden?: boolean;
}

export interface SupportPaintClassCounts {
  inside: number;
  outside: number;
  unresolved: number;
}

export interface SupportPaintApplicationFacts {
  strokeCount: number;
  automaticCounts: SupportPaintClassCounts;
  paintedSupportSiteCount: number;
  manualOverrideSupportSiteCount: number;
  autoResetSupportSiteCount: number;
  finalCounts: SupportPaintClassCounts;
}

export interface SupportPaintHistory {
  past: SupportPaintV1[];
  present: SupportPaintV1;
  future: SupportPaintV1[];
}

export interface ActiveSupportPaintStroke {
  readonly startedAtRevision: number;
  readonly samples: SupportPaintStrokeV1[];
}

export interface SupportPaintSession {
  readonly revision: number;
  readonly history: SupportPaintHistory;
  readonly activeStroke: ActiveSupportPaintStroke | null;
}

function finitePoint(value: unknown, label: string): SupportPaintPoint3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const item = value as Record<string, unknown>;
  const point = { x: Number(item.x), y: Number(item.y), z: Number(item.z) };
  if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error(`${label} must contain finite coordinates`);
  return point;
}

function unitNormal(value: SupportPaintPoint3, label: string): SupportPaintPoint3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!(length > 1e-9)) throw new Error(`${label} must be non-zero`);
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function clonePaint(paint: SupportPaintV1): SupportPaintV1 {
  return {
    ...paint,
    strokes: paint.strokes.map((stroke) => ({
      ...stroke,
      centerNormalized: { ...stroke.centerNormalized },
      surfaceNormal: { ...stroke.surfaceNormal },
    })),
  };
}

export function emptySupportPaint(sourceLongestMm = 1): SupportPaintV1 {
  if (!(Number.isFinite(sourceLongestMm) && sourceLongestMm > 0)) throw new Error("supportPaint sourceLongestMm must be positive");
  return {
    schema: SUPPORT_PAINT_SCHEMA,
    coordinateSpace: SUPPORT_PAINT_COORDINATE_SPACE,
    sourceLongestMm,
    strokes: [],
  };
}

export function validateSupportPaint(value: unknown): SupportPaintV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("supportPaint must be an object");
  const root = value as Record<string, unknown>;
  if (root.schema !== SUPPORT_PAINT_SCHEMA || root.coordinateSpace !== SUPPORT_PAINT_COORDINATE_SPACE) {
    throw new Error("supportPaint schema/coordinateSpace is invalid");
  }
  const sourceLongestMm = Number(root.sourceLongestMm);
  if (!(Number.isFinite(sourceLongestMm) && sourceLongestMm > 0)) throw new Error("supportPaint.sourceLongestMm must be positive");
  if (!Array.isArray(root.strokes)) throw new Error("supportPaint.strokes must be an array");
  let previousOrder = -1;
  const strokes = root.strokes.map((raw, index): SupportPaintStrokeV1 => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`supportPaint.strokes[${index}] must be an object`);
    const stroke = raw as Record<string, unknown>;
    const order = Number(stroke.order);
    if (!Number.isInteger(order) || order < 0 || order <= previousOrder) throw new Error("supportPaint stroke order must be strictly increasing");
    previousOrder = order;
    if (stroke.mode !== "inside" && stroke.mode !== "outside" && stroke.mode !== "auto") throw new Error(`supportPaint.strokes[${index}].mode is invalid`);
    const radiusMm = Number(stroke.radiusMm);
    const radiusNormalized = Number(stroke.radiusNormalized);
    if (!(Number.isFinite(radiusMm) && radiusMm > 0 && Number.isFinite(radiusNormalized) && radiusNormalized > 0)) {
      throw new Error(`supportPaint.strokes[${index}] radius is invalid`);
    }
    const normalCosineThreshold = Number(stroke.normalCosineThreshold);
    if (!(Number.isFinite(normalCosineThreshold) && normalCosineThreshold >= -1 && normalCosineThreshold <= 1)) {
      throw new Error(`supportPaint.strokes[${index}].normalCosineThreshold is invalid`);
    }
    if (typeof stroke.paintBackfaces !== "boolean") throw new Error(`supportPaint.strokes[${index}].paintBackfaces must be boolean`);
    return {
      order,
      mode: stroke.mode,
      centerNormalized: finitePoint(stroke.centerNormalized, `supportPaint.strokes[${index}].centerNormalized`),
      radiusMm,
      radiusNormalized,
      surfaceNormal: unitNormal(finitePoint(stroke.surfaceNormal, `supportPaint.strokes[${index}].surfaceNormal`), `supportPaint.strokes[${index}].surfaceNormal`),
      normalCosineThreshold,
      paintBackfaces: stroke.paintBackfaces,
    };
  });
  return { schema: SUPPORT_PAINT_SCHEMA, coordinateSpace: SUPPORT_PAINT_COORDINATE_SPACE, sourceLongestMm, strokes };
}

export function buildSupportPaintFrame(surfacePositionsMm: Float32Array | readonly number[]): SupportPaintFrame {
  if (surfacePositionsMm.length < 3 || surfacePositionsMm.length % 3 !== 0) throw new Error("supportPaint frame requires support-free Surface positions");
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let offset = 0; offset < surfacePositionsMm.length; offset += 3) {
    const x = Number(surfacePositionsMm[offset]);
    const y = Number(surfacePositionsMm[offset + 1]);
    const z = Number(surfacePositionsMm[offset + 2]);
    if (![x, y, z].every(Number.isFinite)) throw new Error("supportPaint frame received non-finite Surface coordinates");
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  const longestMm = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (!(longestMm > 0)) throw new Error("supportPaint frame requires a non-zero Surface extent");
  return { centerMm: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }, longestMm };
}

export function normalizeSupportPaintPoint(pointMm: { xMm: number; yMm: number; zMm: number }, frame: SupportPaintFrame): SupportPaintPoint3 {
  return {
    x: (pointMm.xMm - frame.centerMm.x) / frame.longestMm,
    y: (pointMm.yMm - frame.centerMm.y) / frame.longestMm,
    z: (pointMm.zMm - frame.centerMm.z) / frame.longestMm,
  };
}

export function createSupportPaintStroke(input: {
  order: number;
  mode: SupportPaintMode;
  centerMm: { xMm: number; yMm: number; zMm: number };
  radiusMm: number;
  surfaceNormal: { xMm: number; yMm: number; zMm: number };
  frame: SupportPaintFrame;
  paintBackfaces: boolean;
  normalCosineThreshold?: number;
}): SupportPaintStrokeV1 {
  if (!Number.isInteger(input.order) || input.order < 0) throw new Error("supportPaint stroke order is invalid");
  if (!(Number.isFinite(input.radiusMm) && input.radiusMm > 0)) throw new Error("supportPaint brush radius must be positive");
  const normal = unitNormal({ x: input.surfaceNormal.xMm, y: input.surfaceNormal.yMm, z: input.surfaceNormal.zMm }, "supportPaint surface normal");
  return {
    order: input.order,
    mode: input.mode,
    centerNormalized: normalizeSupportPaintPoint(input.centerMm, input.frame),
    radiusMm: input.radiusMm,
    radiusNormalized: input.radiusMm / input.frame.longestMm,
    surfaceNormal: normal,
    normalCosineThreshold: input.normalCosineThreshold ?? SUPPORT_PAINT_NORMAL_COSINE_THRESHOLD,
    paintBackfaces: input.paintBackfaces,
  };
}

export function supportPaintSampleSpacingMm(radiusMm: number): number {
  if (!(Number.isFinite(radiusMm) && radiusMm > 0)) throw new Error("supportPaint brush radius must be positive");
  return Math.max(0.35, radiusMm * 0.35);
}

export function shouldSampleSupportPaintPoint(
  previous: { xMm: number; yMm: number; zMm: number } | null,
  next: { xMm: number; yMm: number; zMm: number },
  radiusMm: number,
): boolean {
  if (!previous) return true;
  return Math.hypot(
    next.xMm - previous.xMm,
    next.yMm - previous.yMm,
    next.zMm - previous.zMm,
  ) >= supportPaintSampleSpacingMm(radiusMm);
}

export function appendSupportPaintStroke(paint: SupportPaintV1, stroke: SupportPaintStrokeV1): SupportPaintV1 {
  const current = validateSupportPaint(paint);
  const expectedOrder = current.strokes.length === 0 ? 0 : current.strokes[current.strokes.length - 1].order + 1;
  return validateSupportPaint({ ...current, strokes: [...current.strokes, { ...stroke, order: expectedOrder }] });
}

function asUnitSiteNormal(normal: SupportPaintSite["normal"]): SupportPaintPoint3 | null {
  if (!normal || ![normal.xMm, normal.yMm, normal.zMm].every(Number.isFinite)) return null;
  const length = Math.hypot(normal.xMm, normal.yMm, normal.zMm);
  return length > 1e-9 ? { x: normal.xMm / length, y: normal.yMm / length, z: normal.zMm / length } : null;
}

function classCounts(sites: readonly SupportPaintSite[], useAutomatic: boolean): SupportPaintClassCounts {
  const counts: SupportPaintClassCounts = { inside: 0, outside: 0, unresolved: 0 };
  for (const site of sites) {
    const classification = useAutomatic ? site.automaticClassification ?? site.classification : site.classification;
    counts[classification]++;
  }
  return counts;
}

export function applySupportPaintOverrides(input: {
  sites: readonly SupportPaintSite[];
  supportSurfacePositionsMm: Float32Array | readonly number[];
  supportPaint?: SupportPaintV1 | null;
}): { sites: SupportPaintSite[]; facts: SupportPaintApplicationFacts; frame: SupportPaintFrame } {
  const frame = buildSupportPaintFrame(input.supportSurfacePositionsMm);
  const paint = input.supportPaint ? validateSupportPaint(input.supportPaint) : emptySupportPaint(frame.longestMm);
  const sites = input.sites.map((source): SupportPaintSite => {
    const automaticClassification = source.automaticClassification ?? source.classification;
    return {
      ...source,
      automaticClassification,
      classification: automaticClassification,
      supportPaintStrokeOrder: undefined,
      supportPaintMode: undefined,
      manuallyPainted: false,
      manuallyOverridden: false,
    };
  });

  // Build one normalized object-coordinate grid, then visit only the cells
  // touched by each sampled brush dab. The previous site-major loop compared
  // every support site against every stroke.
  if (paint.strokes.length > 0) {
    const eligibleSiteIndices: number[] = [];
    const normalizedPoints: number[] = [];
    for (let siteIndex = 0; siteIndex < sites.length; siteIndex++) {
      const site = sites[siteIndex];
      if (site.automaticClassification === "unresolved" || !site.positionMm || !asUnitSiteNormal(site.normal)) continue;
      const normalized = normalizeSupportPaintPoint(site.positionMm, frame);
      eligibleSiteIndices.push(siteIndex);
      normalizedPoints.push(normalized.x, normalized.y, normalized.z);
    }
    if (eligibleSiteIndices.length > 0) {
      const gridCellSize = Math.max(...paint.strokes.map((stroke) => stroke.radiusNormalized));
      const grid = buildUniformSpatialGrid3(new Float32Array(normalizedPoints), gridCellSize);
      for (const stroke of paint.strokes) {
        const candidates = queryUniformSpatialGridSphere(grid, stroke.centerNormalized, stroke.radiusNormalized);
        for (const candidateIndex of candidates) {
          const site = sites[eligibleSiteIndices[candidateIndex]];
          const siteNormal = asUnitSiteNormal(site.normal);
          if (!siteNormal) continue;
          const normalDot = siteNormal.x * stroke.surfaceNormal.x
            + siteNormal.y * stroke.surfaceNormal.y
            + siteNormal.z * stroke.surfaceNormal.z;
          if (normalDot < stroke.normalCosineThreshold) continue;
          const automaticClassification = site.automaticClassification ?? site.classification;
          site.supportPaintStrokeOrder = stroke.order;
          site.supportPaintMode = stroke.mode;
          if (stroke.mode === "auto") {
            site.classification = automaticClassification;
            site.manuallyPainted = false;
            site.manuallyOverridden = false;
          } else {
            site.classification = stroke.mode;
            site.manuallyPainted = true;
            site.manuallyOverridden = stroke.mode !== automaticClassification;
          }
        }
      }
    }
  }

  return {
    sites,
    frame,
    facts: {
      strokeCount: paint.strokes.length,
      automaticCounts: classCounts(sites, true),
      paintedSupportSiteCount: sites.filter((site) => site.manuallyPainted).length,
      manualOverrideSupportSiteCount: sites.filter((site) => site.manuallyOverridden).length,
      autoResetSupportSiteCount: sites.filter((site) => site.supportPaintMode === "auto").length,
      finalCounts: classCounts(sites, false),
    },
  };
}

export function createSupportPaintHistory(initial = emptySupportPaint()): SupportPaintHistory {
  return { past: [], present: clonePaint(validateSupportPaint(initial)), future: [] };
}

export function commitSupportPaint(history: SupportPaintHistory, next: SupportPaintV1): SupportPaintHistory {
  return { past: [...history.past, clonePaint(history.present)], present: clonePaint(validateSupportPaint(next)), future: [] };
}

export function undoSupportPaint(history: SupportPaintHistory): SupportPaintHistory {
  if (history.past.length === 0) return history;
  const present = history.past[history.past.length - 1];
  return { past: history.past.slice(0, -1), present: clonePaint(present), future: [clonePaint(history.present), ...history.future] };
}

export function redoSupportPaint(history: SupportPaintHistory): SupportPaintHistory {
  if (history.future.length === 0) return history;
  const [present, ...future] = history.future;
  return { past: [...history.past, clonePaint(history.present)], present: clonePaint(present), future };
}

export function resetSupportPaint(history: SupportPaintHistory, sourceLongestMm = history.present.sourceLongestMm): SupportPaintHistory {
  if (history.present.strokes.length === 0) return history;
  return commitSupportPaint(history, emptySupportPaint(sourceLongestMm));
}

export function createSupportPaintSession(initial = emptySupportPaint()): SupportPaintSession {
  return { revision: 0, history: createSupportPaintHistory(initial), activeStroke: null };
}

export function supportPaintSessionDocument(session: SupportPaintSession, includeActive = false): SupportPaintV1 {
  if (!includeActive || !session.activeStroke || session.activeStroke.samples.length === 0) return clonePaint(session.history.present);
  return validateSupportPaint({
    ...session.history.present,
    strokes: [...session.history.present.strokes, ...session.activeStroke.samples],
  });
}

export function beginSupportPaintStroke(session: SupportPaintSession, initial?: SupportPaintV1): SupportPaintSession {
  if (session.activeStroke) throw new Error("supportPaint stroke is already active");
  const history = initial ? createSupportPaintHistory(initial) : session.history;
  const revision = session.revision + 1;
  return { revision, history, activeStroke: { startedAtRevision: revision, samples: [] } };
}

export function appendActiveSupportPaintSample(session: SupportPaintSession, stroke: SupportPaintStrokeV1): SupportPaintSession {
  if (!session.activeStroke) throw new Error("supportPaint stroke is not active");
  const activeSamples = session.activeStroke.samples;
  const committedStrokes = session.history.present.strokes;
  const previous = activeSamples[activeSamples.length - 1] ?? committedStrokes[committedStrokes.length - 1];
  const expectedOrder = previous ? previous.order + 1 : 0;
  const sample = validateSupportPaint({
    schema: SUPPORT_PAINT_SCHEMA,
    coordinateSpace: SUPPORT_PAINT_COORDINATE_SPACE,
    sourceLongestMm: session.history.present.sourceLongestMm,
    strokes: [{ ...stroke, order: 0 }],
  }).strokes[0];
  sample.order = expectedOrder;
  // Active samples are ephemeral and have no undo identity until pointerup.
  // Appending in place avoids copying the growing drag path on every dab.
  session.activeStroke.samples.push(sample);
  return {
    revision: session.revision + 1,
    history: session.history,
    activeStroke: session.activeStroke,
  };
}

export function finishActiveSupportPaintStroke(session: SupportPaintSession, commit: boolean): SupportPaintSession {
  if (!session.activeStroke) return session;
  const nextHistory = commit && session.activeStroke.samples.length > 0
    ? commitSupportPaint(session.history, supportPaintSessionDocument(session, true))
    : session.history;
  return { revision: session.revision + 1, history: nextHistory, activeStroke: null };
}

export function reviseSupportPaintSession(
  session: SupportPaintSession,
  history: SupportPaintHistory = session.history,
): SupportPaintSession {
  return { revision: session.revision + 1, history, activeStroke: null };
}

export function supportPaintWorkerRevisionIsCurrent(session: SupportPaintSession, workerRevision: number): boolean {
  return !session.activeStroke && workerRevision === session.revision;
}

export function buildSupportPaintBrushRing(input: {
  center: SupportPaintPoint3;
  normal: SupportPaintPoint3;
  radius: number;
  segments?: number;
}): Float32Array {
  if (!(Number.isFinite(input.radius) && input.radius > 0)) throw new Error("supportPaint brush radius must be positive");
  const normal = unitNormal(input.normal, "supportPaint brush normal");
  const helper = Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const tangentLength = Math.hypot(
    normal.y * helper.z - normal.z * helper.y,
    normal.z * helper.x - normal.x * helper.z,
    normal.x * helper.y - normal.y * helper.x,
  );
  const tangent = {
    x: (normal.y * helper.z - normal.z * helper.y) / tangentLength,
    y: (normal.z * helper.x - normal.x * helper.z) / tangentLength,
    z: (normal.x * helper.y - normal.y * helper.x) / tangentLength,
  };
  const bitangent = {
    x: normal.y * tangent.z - normal.z * tangent.y,
    y: normal.z * tangent.x - normal.x * tangent.z,
    z: normal.x * tangent.y - normal.y * tangent.x,
  };
  const segments = Math.max(12, Math.round(input.segments ?? 64));
  const positions = new Float32Array(segments * 3);
  for (let index = 0; index < segments; index++) {
    const angle = index / segments * Math.PI * 2;
    const cos = Math.cos(angle) * input.radius;
    const sin = Math.sin(angle) * input.radius;
    positions[index * 3] = input.center.x + tangent.x * cos + bitangent.x * sin;
    positions[index * 3 + 1] = input.center.y + tangent.y * cos + bitangent.y * sin;
    positions[index * 3 + 2] = input.center.z + tangent.z * cos + bitangent.z * sin;
  }
  return positions;
}

export function supportPaintEquals(a: SupportPaintV1 | null | undefined, b: SupportPaintV1 | null | undefined): boolean {
  const left = a ? JSON.stringify(validateSupportPaint(a)) : "";
  const right = b ? JSON.stringify(validateSupportPaint(b)) : "";
  return left === right;
}

export function supportPaintVisibilityAllows(back: boolean, paintBackfaces: boolean): boolean {
  return !back || paintBackfaces;
}
