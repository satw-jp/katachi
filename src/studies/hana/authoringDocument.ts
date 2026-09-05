import type {
  HanaCameraState,
  HanaEditorState,
  HanaSoftEditStrength,
  HanaViewportStroke,
} from "./gesture.ts";
import { HANA_VIEW_DIRECTIONS } from "./gesture.ts";
import {
  HANA_CURVE_SETTINGS,
  type HanaProjectionRedrawIntent,
  type HanaCurveSettings,
  type HanaStroke3D,
  type HanaStroke3DControlPoint,
} from "./stroke3d.ts";

export const HANA_AUTHORING_DOCUMENT_FORMAT = "katachi.hana-document.v2" as const;

export const HANA_STROKE_ROLES = [
  "free",
  "stem",
  "petal",
  "core",
  "connector",
  "surface-strand",
] as const;
export type HanaStrokeRole = typeof HANA_STROKE_ROLES[number];

export const HANA_MATERIAL_MAPPING_MODES = [
  "uniform",
  "pressure",
  "speed",
  "pressure-speed",
] as const;
export type HanaMaterialMappingMode = typeof HANA_MATERIAL_MAPPING_MODES[number];

export interface HanaMaterialSettings {
  mapping: HanaMaterialMappingMode;
  baseRadius: number;
  minRadius: number;
  maxRadius: number;
  pressureInfluence: number;
  speedInfluence: number;
}

export interface HanaStroke {
  id: string;
  rawGestureId: string;
  controlPoints: HanaStroke3DControlPoint[];
  curveSettings: HanaCurveSettings;
  materialSettings: HanaMaterialSettings;
  revision: number;
  role: HanaStrokeRole;
  visible: boolean;
  projectionRedraws?: HanaProjectionRedrawIntent[];
}

export interface HanaAuthoringIdentity {
  nextGestureOrdinal: number;
  nextStrokeOrdinal: number;
}

export type HanaAuthoringIdKind = "gesture" | "stroke";

export interface HanaAuthoringDocument {
  format: typeof HANA_AUTHORING_DOCUMENT_FORMAT;
  documentId: string;
  revision: number;
  rawGestures: { strokes: HanaViewportStroke[] };
  strokes: HanaStroke[];
  identity: HanaAuthoringIdentity;
  activeStrokeId: string | null;
  selectedStrokeIds: string[];
  editorState: HanaEditorState;
}

export interface HanaAuthoringDocumentOptions {
  documentId?: string;
  editorState: HanaEditorState;
  identity?: Partial<HanaAuthoringIdentity>;
}

export interface HanaDerivedCacheState {
  strokeRevision: number;
  dirty: boolean;
  generationId: number;
}

const DEFAULT_CAMERA: HanaCameraState = {
  position: [0, -12, 0],
  up: [0, 0, 1],
  target: [0, 0, 0],
  zoom: 1,
};

function cloneCamera(camera: HanaCameraState): HanaCameraState {
  return {
    position: [...camera.position],
    up: [...camera.up],
    target: [...camera.target],
    zoom: camera.zoom,
  };
}

export function createDefaultHanaEditorState(): HanaEditorState {
  return {
    viewportMode: "four",
    selectedViewportId: "viewport-front",
    split: { x: 0.5, y: 0.5 },
    softEditStrength: "medium",
    viewports: HANA_VIEW_DIRECTIONS.map((viewDirection) => ({
      id: `viewport-${viewDirection}`,
      viewDirection,
      interactionMode: viewDirection === "axome" ? "view" : viewDirection === "front" ? "draw" : "edit",
      camera: cloneCamera({
        ...DEFAULT_CAMERA,
        position: viewDirection === "right" ? [12, 0, 0] : viewDirection === "top" ? [0, 0, 12] : DEFAULT_CAMERA.position,
      }),
    })),
  };
}

export function defaultHanaMaterialSettings(baseRadius = 0.18): HanaMaterialSettings {
  const normalizedBase = Number.isFinite(baseRadius) && baseRadius > 0 ? baseRadius : 0.18;
  return {
    mapping: "uniform",
    baseRadius: normalizedBase,
    minRadius: 0.05,
    maxRadius: 0.5,
    pressureInfluence: 0,
    speedInfluence: 0,
  };
}

function cloneControlPoint(point: HanaStroke3DControlPoint): HanaStroke3DControlPoint {
  return {
    ...point,
    position: { ...point.position },
    provenance: { ...point.provenance },
  };
}

function cloneCurveSettings(curve: HanaCurveSettings | undefined): HanaCurveSettings {
  return {
    ...HANA_CURVE_SETTINGS,
    ...(curve ?? {}),
    smoothness: Number.isFinite(curve?.smoothness) ? curve?.smoothness : 0,
  };
}

function cloneStroke(stroke: HanaStroke): HanaStroke {
  return {
    ...stroke,
    controlPoints: stroke.controlPoints.map(cloneControlPoint),
    curveSettings: cloneCurveSettings(stroke.curveSettings),
    materialSettings: { ...defaultHanaMaterialSettings(), ...stroke.materialSettings },
    ...(stroke.projectionRedraws
      ? {
        projectionRedraws: stroke.projectionRedraws.map((intent) => ({
          ...intent,
          visibleAxes: [...intent.visibleAxes],
          controlPointIds: [...intent.controlPointIds],
        })),
      }
      : {}),
  };
}

function cloneRawGesture(stroke: HanaViewportStroke): HanaViewportStroke {
  return {
    ...stroke,
    viewportSize: { ...stroke.viewportSize },
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function idOrdinal(id: string, prefix: string): number {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  return match ? Math.max(0, Number.parseInt(match[1], 10)) : 0;
}

function nextOrdinal(ids: readonly string[], prefix: string): number {
  return ids.reduce((maximum, id) => Math.max(maximum, idOrdinal(id, prefix)), 0) + 1;
}

function safeNextOrdinal(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.trunc(value), fallback)
    : fallback;
}

export function createHanaAuthoringIdentity(
  rawGestures: readonly Pick<HanaViewportStroke, "id">[] = [],
  strokes: readonly Pick<HanaStroke, "id">[] = [],
  requested: Partial<HanaAuthoringIdentity> = {},
): HanaAuthoringIdentity {
  return {
    nextGestureOrdinal: safeNextOrdinal(
      requested.nextGestureOrdinal,
      nextOrdinal(rawGestures.map((gesture) => gesture.id), "gesture"),
    ),
    nextStrokeOrdinal: safeNextOrdinal(
      requested.nextStrokeOrdinal,
      nextOrdinal(strokes.map((stroke) => stroke.id), "stroke"),
    ),
  };
}

export function cloneHanaAuthoringIdentity(identity: HanaAuthoringIdentity): HanaAuthoringIdentity {
  return {
    nextGestureOrdinal: Math.max(1, Math.trunc(identity.nextGestureOrdinal)),
    nextStrokeOrdinal: Math.max(1, Math.trunc(identity.nextStrokeOrdinal)),
  };
}

export function mergeHanaAuthoringIdentity(
  current: HanaAuthoringIdentity,
  incoming: HanaAuthoringIdentity,
): HanaAuthoringIdentity {
  return {
    nextGestureOrdinal: Math.max(current.nextGestureOrdinal, incoming.nextGestureOrdinal),
    nextStrokeOrdinal: Math.max(current.nextStrokeOrdinal, incoming.nextStrokeOrdinal),
  };
}

/** Allocate a document-local ID without consulting array length or undo state. */
export function allocateHanaAuthoringId(
  identity: HanaAuthoringIdentity,
  kind: HanaAuthoringIdKind,
): string {
  const key = kind === "gesture" ? "nextGestureOrdinal" : "nextStrokeOrdinal";
  const ordinal = Math.max(1, Math.trunc(identity[key]));
  identity[key] = ordinal + 1;
  return `${kind}-${ordinal}`;
}

export interface HanaAuthoringIdentityValidation {
  valid: boolean;
  issues: string[];
}

export function validateHanaAuthoringDocument(
  document: Pick<HanaAuthoringDocument, "rawGestures" | "strokes">,
): HanaAuthoringIdentityValidation {
  const issues: string[] = [];
  const rawIds = new Set<string>();
  for (const gesture of document.rawGestures.strokes) {
    if (rawIds.has(gesture.id)) issues.push(`Duplicate Raw Gesture id: ${gesture.id}`);
    rawIds.add(gesture.id);
  }
  const strokeIds = new Set<string>();
  for (const stroke of document.strokes) {
    if (strokeIds.has(stroke.id)) issues.push(`Duplicate Stroke id: ${stroke.id}`);
    strokeIds.add(stroke.id);
    for (const intent of stroke.projectionRedraws ?? []) {
      if (!rawIds.has(intent.rawGestureId)) {
        issues.push(`Projection Redraw ${intent.id} references missing Raw Gesture: ${intent.rawGestureId}`);
      }
      if (intent.sourceStrokeId !== stroke.id) {
        issues.push(`Projection Redraw ${intent.id} references wrong Stroke: ${intent.sourceStrokeId}`);
      }
      if (intent.controlPointIds.length !== stroke.controlPoints.length) {
        issues.push(`Projection Redraw ${intent.id} control identity count mismatch`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

function cloneEditorState(editorState: HanaEditorState): HanaEditorState {
  return {
    ...editorState,
    split: { ...editorState.split },
    viewports: editorState.viewports.map((viewport) => ({
      ...viewport,
      camera: cloneCamera(viewport.camera),
    })),
  };
}

export function cloneHanaAuthoringDocument(document: HanaAuthoringDocument): HanaAuthoringDocument {
  const identity = createHanaAuthoringIdentity(
    document.rawGestures.strokes,
    document.strokes,
    document.identity,
  );
  return {
    ...document,
    rawGestures: { strokes: document.rawGestures.strokes.map(cloneRawGesture) },
    strokes: document.strokes.map(cloneStroke),
    identity,
    selectedStrokeIds: [...document.selectedStrokeIds],
    editorState: cloneEditorState(document.editorState),
  };
}

export function hanaStrokeFromStroke3D(
  stroke3D: HanaStroke3D,
  role: HanaStrokeRole = "free",
  materialSettings: HanaMaterialSettings = defaultHanaMaterialSettings(),
): HanaStroke {
  return {
    id: stroke3D.id,
    rawGestureId: stroke3D.sourceGestureId,
    controlPoints: stroke3D.controlPoints.map(cloneControlPoint),
    curveSettings: cloneCurveSettings(stroke3D.curve),
    materialSettings: { ...materialSettings },
    revision: 0,
    role,
    visible: true,
    ...(stroke3D.projectionRedraws
      ? {
        projectionRedraws: stroke3D.projectionRedraws.map((intent) => ({
          ...intent,
          visibleAxes: [...intent.visibleAxes],
          controlPointIds: [...intent.controlPointIds],
        })),
      }
      : {}),
  };
}

export function stroke3DFromHanaStroke(stroke: HanaStroke): HanaStroke3D {
  return {
    id: stroke.id,
    sourceGestureId: stroke.rawGestureId,
    sourceViewportId: "authoring",
    sourceViewDirection: "front",
    initialPlaneValue: stroke.controlPoints[0]?.position.y ?? 0,
    curve: cloneCurveSettings(stroke.curveSettings),
    controlPoints: stroke.controlPoints.map(cloneControlPoint),
    ...(stroke.projectionRedraws
      ? {
        projectionRedraws: stroke.projectionRedraws.map((intent) => ({
          ...intent,
          visibleAxes: [...intent.visibleAxes],
          controlPointIds: [...intent.controlPointIds],
        })),
      }
      : {}),
  };
}

export function createHanaAuthoringDocument(
  rawGestures: readonly HanaViewportStroke[],
  strokes3D: readonly HanaStroke3D[],
  options: HanaAuthoringDocumentOptions,
): HanaAuthoringDocument {
  return {
    format: HANA_AUTHORING_DOCUMENT_FORMAT,
    documentId: options.documentId ?? "hana-document-1",
    revision: 0,
    rawGestures: { strokes: rawGestures.map(cloneRawGesture) },
    strokes: strokes3D.map((stroke) => hanaStrokeFromStroke3D(stroke)),
    identity: createHanaAuthoringIdentity(rawGestures, strokes3D, options.identity),
    activeStrokeId: strokes3D.length > 0 ? strokes3D[strokes3D.length - 1].id : null,
    selectedStrokeIds: strokes3D.length > 0 ? [strokes3D[strokes3D.length - 1].id] : [],
    editorState: cloneEditorState(options.editorState),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function migratedEditorState(value: unknown): HanaEditorState {
  const source = asRecord(value);
  const fallback = createDefaultHanaEditorState();
  const viewports = asArray<Record<string, unknown>>(source.viewports).map((viewport, index) => {
    const camera = asRecord(viewport.camera);
    const fallbackViewport = fallback.viewports[index] ?? fallback.viewports[0];
    return {
      id: typeof viewport.id === "string" ? viewport.id : fallbackViewport.id,
      viewDirection: (viewport.viewDirection ?? fallbackViewport.viewDirection) as HanaEditorState["viewports"][number]["viewDirection"],
      interactionMode: (viewport.interactionMode ?? fallbackViewport.interactionMode) as HanaEditorState["viewports"][number]["interactionMode"],
      camera: {
        position: Array.isArray(camera.position) ? [...camera.position] as [number, number, number] : [...fallbackViewport.camera.position],
        up: Array.isArray(camera.up) ? [...camera.up] as [number, number, number] : [...fallbackViewport.camera.up],
        target: Array.isArray(camera.target) ? [...camera.target] as [number, number, number] : [...fallbackViewport.camera.target],
        zoom: typeof camera.zoom === "number" ? camera.zoom : fallbackViewport.camera.zoom,
      },
    };
  });
  return {
    ...fallback,
    ...source,
    split: {
      x: typeof asRecord(source.split).x === "number" ? asRecord(source.split).x as number : fallback.split.x,
      y: typeof asRecord(source.split).y === "number" ? asRecord(source.split).y as number : fallback.split.y,
    },
    viewports: viewports.length > 0 ? viewports : fallback.viewports,
  } as HanaEditorState;
}

function migratedStroke(value: unknown, index: number, rawGestures: readonly HanaViewportStroke[]): HanaStroke | null {
  const source = asRecord(value);
  const rawGestureId = typeof source.rawGestureId === "string"
    ? source.rawGestureId
    : typeof source.sourceGestureId === "string" ? source.sourceGestureId : rawGestures[index]?.id;
  if (!rawGestureId) return null;
  const controlPoints = asArray<HanaStroke3DControlPoint>(source.controlPoints).map(cloneControlPoint);
  if (controlPoints.length === 0) return null;
  const material = asRecord(source.materialSettings);
  const curve = (asRecord(source.curveSettings).type ? source.curveSettings : source.curve) as HanaCurveSettings | undefined;
  const projectionRedraws = asArray<Record<string, unknown>>(source.projectionRedraws)
    .filter((intent) => typeof intent.id === "string" && typeof intent.rawGestureId === "string")
    .map((intent) => ({
      id: intent.id as string,
      sourceStrokeId: typeof intent.sourceStrokeId === "string" ? intent.sourceStrokeId : (typeof source.id === "string" ? source.id : `stroke-${index + 1}`),
      rawGestureId: intent.rawGestureId as string,
      viewDirection: intent.viewDirection as HanaProjectionRedrawIntent["viewDirection"],
      visibleAxes: asArray<string>(intent.visibleAxes).filter((axis): axis is HanaProjectionRedrawIntent["visibleAxes"][number] => axis === "x" || axis === "y" || axis === "z"),
      inheritedAxis: intent.inheritedAxis as HanaProjectionRedrawIntent["inheritedAxis"],
      reversed: intent.reversed === true,
      controlPointIds: asArray<string>(intent.controlPointIds),
    }));
  return {
    id: typeof source.id === "string" ? source.id : `stroke-${index + 1}`,
    rawGestureId,
    controlPoints,
    curveSettings: cloneCurveSettings(curve),
    materialSettings: {
      ...defaultHanaMaterialSettings(),
      ...material,
      mapping: HANA_MATERIAL_MAPPING_MODES.includes(material.mapping as HanaMaterialMappingMode)
        ? material.mapping as HanaMaterialMappingMode
        : "uniform",
    },
    revision: typeof source.revision === "number" ? source.revision : 0,
    role: HANA_STROKE_ROLES.includes(source.role as HanaStrokeRole) ? source.role as HanaStrokeRole : "free",
    visible: source.visible !== false,
    ...(projectionRedraws.length > 0 ? { projectionRedraws } : {}),
  };
}

/** Migrate v1c/HANA-2A and earlier payloads without mutating the input. */
export function migrateHanaDocument(input: unknown): HanaAuthoringDocument {
  const source = asRecord(input);
  const rawContainer = asRecord(source.rawGestures ?? source.rawGesture);
  const rawGestures = asArray<HanaViewportStroke>(rawContainer.strokes).map(cloneRawGesture);
  const sourceStrokes = asArray<unknown>(source.strokes ?? source.strokes3D);
  const strokes = sourceStrokes
    .map((stroke, index) => migratedStroke(stroke, index, rawGestures))
    .filter((stroke): stroke is HanaStroke => stroke !== null);
  const requestedIdentity = asRecord(source.identity);
  const selected = asArray<string>(source.selectedStrokeIds).filter((id) => strokes.some((stroke) => stroke.id === id));
  const activeStrokeId = typeof source.activeStrokeId === "string" && strokes.some((stroke) => stroke.id === source.activeStrokeId)
    ? source.activeStrokeId
    : strokes.length > 0 ? strokes[strokes.length - 1].id : null;
  return {
    format: HANA_AUTHORING_DOCUMENT_FORMAT,
    documentId: typeof source.documentId === "string" ? source.documentId : "hana-document-1",
    revision: typeof source.revision === "number" ? source.revision : 0,
    rawGestures: { strokes: rawGestures },
    strokes,
    identity: createHanaAuthoringIdentity(rawGestures, strokes, requestedIdentity),
    activeStrokeId,
    selectedStrokeIds: selected.length > 0 ? selected : activeStrokeId ? [activeStrokeId] : [],
    editorState: migratedEditorState(source.editorState),
  };
}

/** Serialize only authoring state. Derived Surface, Field, Samples and caches are excluded by construction. */
export function serializeHanaAuthoringDocument(document: HanaAuthoringDocument): string {
  return JSON.stringify(cloneHanaAuthoringDocument(document), null, 2);
}

function nextRevision(document: HanaAuthoringDocument): HanaAuthoringDocument {
  return { ...document, revision: document.revision + 1 };
}

export function addHanaStroke(
  document: HanaAuthoringDocument,
  rawGesture: HanaViewportStroke,
  stroke3D: HanaStroke3D,
  role: HanaStrokeRole = "free",
): HanaAuthoringDocument {
  const next = cloneHanaAuthoringDocument(document);
  if (next.rawGestures.strokes.some((stroke) => stroke.id === rawGesture.id)) throw new Error(`Duplicate Raw Gesture id: ${rawGesture.id}`);
  if (next.strokes.some((stroke) => stroke.id === stroke3D.id)) throw new Error(`Duplicate Stroke id: ${stroke3D.id}`);
  next.rawGestures.strokes.push(cloneRawGesture(rawGesture));
  next.strokes.push(hanaStrokeFromStroke3D(stroke3D, role));
  next.identity = createHanaAuthoringIdentity(next.rawGestures.strokes, next.strokes, next.identity);
  next.activeStrokeId = stroke3D.id;
  next.selectedStrokeIds = [stroke3D.id];
  return nextRevision(next);
}

export function removeHanaStroke(document: HanaAuthoringDocument, strokeId: string): HanaAuthoringDocument {
  return deleteHanaStrokes(document, [strokeId]);
}

/** Delete one or more Strokes while retaining Raw Gestures still referenced by survivors. */
export function deleteHanaStrokes(
  document: HanaAuthoringDocument,
  strokeIds: readonly string[],
): HanaAuthoringDocument {
  const next = cloneHanaAuthoringDocument(document);
  const deleted = new Set(strokeIds);
  const removed = next.strokes.filter((stroke) => deleted.has(stroke.id));
  if (removed.length === 0) return next;
  const removedRawGestureIds = new Set(removed.map((stroke) => stroke.rawGestureId));
  next.strokes = next.strokes.filter((stroke) => !deleted.has(stroke.id));
  const remainingRawGestureIds = new Set(next.strokes.map((stroke) => stroke.rawGestureId));
  next.rawGestures.strokes = next.rawGestures.strokes.filter((gesture) => (
    !removedRawGestureIds.has(gesture.id) || remainingRawGestureIds.has(gesture.id)
  ));
  next.selectedStrokeIds = next.selectedStrokeIds.filter((id) => !deleted.has(id));
  next.activeStrokeId = next.activeStrokeId && !deleted.has(next.activeStrokeId)
    ? next.activeStrokeId
    : next.selectedStrokeIds[next.selectedStrokeIds.length - 1]
      ?? next.strokes[next.strokes.length - 1]?.id
      ?? null;
  return nextRevision(next);
}

export function selectHanaStrokes(document: HanaAuthoringDocument, strokeIds: readonly string[]): HanaAuthoringDocument {
  const next = cloneHanaAuthoringDocument(document);
  next.selectedStrokeIds = [...new Set(strokeIds)].filter((id) => next.strokes.some((stroke) => stroke.id === id));
  next.activeStrokeId = next.selectedStrokeIds.length > 0
    ? next.selectedStrokeIds[next.selectedStrokeIds.length - 1]
    : null;
  return nextRevision(next);
}

export function updateHanaStroke(
  document: HanaAuthoringDocument,
  strokeId: string,
  update: (stroke: HanaStroke) => HanaStroke,
): HanaAuthoringDocument {
  const next = cloneHanaAuthoringDocument(document);
  const index = next.strokes.findIndex((stroke) => stroke.id === strokeId);
  if (index < 0) throw new Error(`Unknown HANA Stroke: ${strokeId}`);
  const updated = cloneStroke(update(next.strokes[index]));
  updated.revision = next.strokes[index].revision + 1;
  next.strokes[index] = updated;
  next.activeStrokeId = strokeId;
  return nextRevision(next);
}

export function setHanaStrokeRole(
  document: HanaAuthoringDocument,
  strokeId: string,
  role: HanaStrokeRole,
): HanaAuthoringDocument {
  return updateHanaStroke(document, strokeId, (stroke) => ({ ...stroke, role }));
}

export function setHanaStrokeMaterialSettings(
  document: HanaAuthoringDocument,
  strokeId: string,
  materialSettings: HanaMaterialSettings,
): HanaAuthoringDocument {
  return updateHanaStroke(document, strokeId, (stroke) => ({
    ...stroke,
    materialSettings: { ...materialSettings },
  }));
}

export function emptyHanaDerivedCache(strokeRevision = 0): HanaDerivedCacheState {
  return { strokeRevision, dirty: true, generationId: 0 };
}

export type { HanaSoftEditStrength };
