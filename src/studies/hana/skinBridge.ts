import type {
  HanaAuthoringDocument,
  HanaMaterialSettings,
  HanaStroke,
} from "./authoringDocument.ts";
import {
  cloneAuthoringGraph,
  validateAuthoringGraph,
  type HanaAuthoringGraph,
  type HanaGraphValidationIssue,
} from "./authoringGraph.ts";
import { cloneHanaFlower, type HanaFlower } from "./flowerAuthoring.ts";
import type { HanaStroke3DControlPoint } from "./stroke3d.ts";

export const HANA_SKIN_BRIDGE_FORMAT = "katachi.hana-skin-bridge.v0" as const;
export const HANA_SKIN_BRIDGE_UNITS = "object" as const;

export interface HanaSkinBridgeControlPoint {
  position: { x: number; y: number; z: number };
  provenance: HanaStroke3DControlPoint["provenance"];
  pressure: number;
  time: number;
}

export interface HanaSkinBridgeStroke {
  id: string;
  rawGestureId: string;
  role: HanaStroke["role"];
  revision: number;
  controlPoints: HanaSkinBridgeControlPoint[];
  material: HanaMaterialSettings;
}

export interface HanaSkinBridgeMaterialIntent {
  strokeId: string;
  mapping: HanaMaterialSettings["mapping"];
  baseRadius: number;
  minRadius: number;
  maxRadius: number;
  pressureInfluence: number;
  speedInfluence: number;
}

export interface HanaSkinBridgeDocument {
  format: typeof HANA_SKIN_BRIDGE_FORMAT;
  bridgeVersion: 0;
  units: typeof HANA_SKIN_BRIDGE_UNITS;
  sourceDocumentId: string;
  sourceDocumentFormat: HanaAuthoringDocument["format"];
  sourceRevision: number;
  strokes: HanaSkinBridgeStroke[];
  flowers: HanaFlower[];
  graph: HanaAuthoringGraph;
  materialIntents: HanaSkinBridgeMaterialIntent[];
  protectedFeatures: string[];
}

export interface HanaSemanticAuthoringState {
  document: HanaAuthoringDocument;
  flowers: readonly HanaFlower[];
  graph: HanaAuthoringGraph;
}

export interface HanaSkinBridgeValidationResult {
  valid: boolean;
  issues: HanaGraphValidationIssue[] | Array<{ code: string; message: string; entityId?: string }>;
}

function clonePoint(point: HanaStroke3DControlPoint): HanaSkinBridgeControlPoint {
  return {
    position: { ...point.position },
    provenance: { ...point.provenance },
    pressure: point.provenance.pressure,
    time: point.provenance.time,
  };
}

function cloneMaterialSettings(settings: HanaMaterialSettings): HanaMaterialSettings {
  return { ...settings };
}

function exportStroke(stroke: HanaStroke): HanaSkinBridgeStroke {
  return {
    id: stroke.id,
    rawGestureId: stroke.rawGestureId,
    role: stroke.role,
    revision: stroke.revision,
    controlPoints: stroke.controlPoints.map(clonePoint),
    material: cloneMaterialSettings(stroke.materialSettings),
  };
}

function exportMaterialIntent(stroke: HanaStroke): HanaSkinBridgeMaterialIntent {
  return {
    strokeId: stroke.id,
    ...cloneMaterialSettings(stroke.materialSettings),
  };
}

export function exportHanaSkinBridge(
  state: HanaSemanticAuthoringState,
): HanaSkinBridgeDocument {
  return {
    format: HANA_SKIN_BRIDGE_FORMAT,
    bridgeVersion: 0,
    units: HANA_SKIN_BRIDGE_UNITS,
    sourceDocumentId: state.document.documentId,
    sourceDocumentFormat: state.document.format,
    sourceRevision: state.document.revision,
    strokes: state.document.strokes.map(exportStroke),
    flowers: state.flowers.map(cloneHanaFlower),
    graph: cloneAuthoringGraph(state.graph),
    materialIntents: state.document.strokes.map(exportMaterialIntent),
    protectedFeatures: [
      "raw-gesture",
      "control-stroke",
      "provenance",
      "graph-topology",
    ],
  };
}

function bridgeIssue(
  code: string,
  message: string,
  entityId?: string,
): { code: string; message: string; entityId?: string } {
  return entityId ? { code, message, entityId } : { code, message };
}

export function validateHanaSkinBridge(
  bridge: HanaSkinBridgeDocument,
): HanaSkinBridgeValidationResult {
  const issues: Array<{ code: string; message: string; entityId?: string }> = [];
  if (bridge.format !== HANA_SKIN_BRIDGE_FORMAT) {
    issues.push(bridgeIssue("invalid-format", "Unsupported HANA → SKIN bridge format"));
  }
  if (bridge.bridgeVersion !== 0) {
    issues.push(bridgeIssue("invalid-version", "Unsupported HANA → SKIN bridge version"));
  }
  if (bridge.units !== HANA_SKIN_BRIDGE_UNITS) {
    issues.push(bridgeIssue("invalid-units", "Bridge units must be object units"));
  }
  const strokeIds = new Set<string>();
  const gestureIds = new Set<string>();
  for (const stroke of bridge.strokes) {
    if (strokeIds.has(stroke.id)) issues.push(bridgeIssue("duplicate-stroke-id", `Duplicate bridge Stroke: ${stroke.id}`, stroke.id));
    strokeIds.add(stroke.id);
    gestureIds.add(stroke.rawGestureId);
    if (stroke.controlPoints.length === 0) issues.push(bridgeIssue("empty-control-stroke", `Bridge Stroke has no Control Points: ${stroke.id}`, stroke.id));
    for (const point of stroke.controlPoints) {
      if (![point.position.x, point.position.y, point.position.z, point.pressure, point.time].every(Number.isFinite)) {
        issues.push(bridgeIssue("non-finite-control-point", `Bridge Control Point is not finite: ${stroke.id}`, stroke.id));
        break;
      }
    }
  }

  const flowerIds = new Set<string>();
  for (const flower of bridge.flowers) {
    if (flowerIds.has(flower.id)) issues.push(bridgeIssue("duplicate-flower-id", `Duplicate bridge Flower: ${flower.id}`, flower.id));
    flowerIds.add(flower.id);
    const sourceIds = [...flower.petalStrokeIds, ...flower.coreStrokeIds];
    for (const sourceId of sourceIds) {
      if (!strokeIds.has(sourceId)) issues.push(bridgeIssue("stale-flower-stroke", `Flower references missing Stroke: ${sourceId}`, flower.id));
    }
    if (flower.stemAttachment && !strokeIds.has(flower.stemAttachment.sourceStrokeId)) {
      issues.push(bridgeIssue("stale-stem-attachment", `Flower attachment references missing Stroke: ${flower.stemAttachment.sourceStrokeId}`, flower.id));
    }
  }

  const graphResult = validateAuthoringGraph(bridge.graph, [...strokeIds, ...flowerIds]);
  issues.push(...graphResult.issues);
  const materialStrokeIds = new Set<string>();
  for (const intent of bridge.materialIntents) {
    if (materialStrokeIds.has(intent.strokeId)) issues.push(bridgeIssue("duplicate-material-intent", `Duplicate material intent: ${intent.strokeId}`, intent.strokeId));
    materialStrokeIds.add(intent.strokeId);
    if (!strokeIds.has(intent.strokeId)) issues.push(bridgeIssue("stale-material-intent", `Material intent references missing Stroke: ${intent.strokeId}`, intent.strokeId));
  }
  if (!bridge.protectedFeatures.includes("provenance")) {
    issues.push(bridgeIssue("missing-provenance-boundary", "Bridge must declare provenance as protected"));
  }
  if ("surface" in (bridge as unknown as Record<string, unknown>) || "field" in (bridge as unknown as Record<string, unknown>)) {
    issues.push(bridgeIssue("derived-geometry-in-bridge", "Derived Field / Surface data must not be exported"));
  }
  return { valid: issues.length === 0, issues };
}

export function serializeHanaSkinBridge(bridge: HanaSkinBridgeDocument): string {
  return JSON.stringify(bridge, null, 2);
}

export function parseHanaSkinBridge(serialized: string): HanaSkinBridgeDocument {
  const parsed = JSON.parse(serialized) as HanaSkinBridgeDocument;
  const result = validateHanaSkinBridge(parsed);
  if (!result.valid) throw new Error(`Invalid HANA → SKIN bridge: ${result.issues.map((issue) => issue.message).join("; ")}`);
  return parsed;
}
