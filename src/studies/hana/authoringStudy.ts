import {
  cloneHanaAuthoringDocument,
  createDefaultHanaEditorState,
  createHanaAuthoringDocument,
  defaultHanaMaterialSettings,
  stroke3DFromHanaStroke,
  updateHanaStroke,
  type HanaAuthoringDocument,
  type HanaMaterialSettings,
} from "./authoringDocument.ts";
import {
  addAuthoringNode,
  connectAuthoringNodes,
  createAuthoringGraph,
  type HanaAuthoringGraph,
} from "./authoringGraph.ts";
import { applyArcLengthSoftEditToStroke } from "./arcLengthSoftEdit.ts";
import {
  attachHanaFlowerToStem,
  createHanaFlowerFromSelection,
  materializeHanaFlower,
  type HanaFlower,
} from "./flowerAuthoring.ts";
import {
  createMaterialObject,
  type HanaMaterialObject,
} from "./materialObjects.ts";
import {
  mapGestureToMaterialProfile,
  type HanaMaterialProfileSample,
} from "./gestureMaterial.ts";
import { sampleMaterialSamples, type HanaMaterialSample } from "./materialField.ts";
import { sampleSmoothCenterline } from "./smoothCenterline.ts";
import {
  deriveStroke3D,
  type HanaVector3,
} from "./stroke3d.ts";
import { HanaUndoRedo } from "./undoRedo.ts";
import {
  exportHanaSkinBridge,
  parseHanaSkinBridge,
  serializeHanaSkinBridge,
  validateHanaSkinBridge,
  type HanaSkinBridgeDocument,
} from "./skinBridge.ts";
import type { HanaStrokePoint, HanaViewportStroke } from "./gesture.ts";

export interface HanaStudyStrokeRuntime {
  strokeId: string;
  rawGestureId: string;
  smoothCount: number;
  materialSamples: HanaMaterialSample[];
  materialProfile: HanaMaterialProfileSample[];
  materialObject: HanaMaterialObject;
}

export interface HanaAuthoringStudy {
  document: HanaAuthoringDocument;
  reloadedDocument: HanaAuthoringDocument;
  flowers: HanaFlower[];
  graph: HanaAuthoringGraph;
  runtime: HanaStudyStrokeRuntime[];
  materialObjects: HanaMaterialObject[];
  serializedDocument: string;
  bridge: HanaSkinBridgeDocument;
  reloadedBridge: HanaSkinBridgeDocument;
  serializedBridge: string;
  bridgeValidation: ReturnType<typeof validateHanaSkinBridge>;
  undoRedo: {
    editedRevision: number;
    undoRestored: boolean;
    redoRestored: boolean;
  };
}

function point(x: number, y: number, pressure: number, time: number): HanaStrokePoint {
  return { x, y, pressure, time };
}

function makeRawStroke(
  id: string,
  points: HanaStrokePoint[],
): HanaViewportStroke {
  return {
    id,
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 1024, height: 768 },
    points,
  };
}

function petalRaw(id: string, angle: number, length: number): HanaViewportStroke {
  const points = Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    const bend = Math.sin(t * Math.PI) * 0.35;
    const radial = 0.45 + length * t;
    return point(
      Math.cos(angle) * radial - Math.sin(angle) * bend,
      Math.sin(angle) * radial + Math.cos(angle) * bend,
      0.25 + 0.55 * t,
      index * 40,
    );
  });
  return makeRawStroke(id, points);
}

function coreRaw(id: string): HanaViewportStroke {
  const points = Array.from({ length: 13 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 12;
    return point(Math.cos(angle) * 0.45, Math.sin(angle) * 0.45, 0.55, index * 35);
  });
  return makeRawStroke(id, points);
}

function stemRaw(id: string): HanaViewportStroke {
  return makeRawStroke(id, Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    return point(Math.sin(t * Math.PI) * 0.08, -3.2 + t * 3.2, 0.3 + 0.35 * t, index * 45);
  }));
}

function toWorld(pointValue: HanaStrokePoint): HanaVector3 {
  return { x: pointValue.x, y: 0, z: pointValue.y };
}

function settingsForStroke(strokeId: string): HanaMaterialSettings {
  if (strokeId === "petal-1") {
    return {
      ...defaultHanaMaterialSettings(0.18),
      mapping: "pressure",
      minRadius: 0.12,
      maxRadius: 0.28,
      pressureInfluence: 0.8,
    };
  }
  return defaultHanaMaterialSettings(strokeId === "stem-1" ? 0.22 : 0.18);
}

function createStudyDocument(): HanaAuthoringDocument {
  const rawGestures = [
    stemRaw("gesture-stem"),
    ...Array.from({ length: 5 }, (_, index) => petalRaw(
      `gesture-petal-${index + 1}`,
      (Math.PI * 2 * index) / 5,
      1.65 + index * 0.08,
    )),
    coreRaw("gesture-core"),
  ];
  const strokeIds = ["stem-1", "petal-1", "petal-2", "petal-3", "petal-4", "petal-5", "core-1"];
  const stroke3D = rawGestures.map((rawGesture, index) => {
    const derived = deriveStroke3D(rawGesture, toWorld, 32);
    return { ...derived, id: strokeIds[index] };
  });
  let document = createHanaAuthoringDocument(rawGestures, stroke3D, {
    documentId: "hana-authoring-study-v0",
    editorState: createDefaultHanaEditorState(),
  });
  document = document.strokes.reduce(
    (current, stroke) => updateHanaStroke(current, stroke.id, (source) => ({
      ...source,
      role: source.id === "stem-1"
        ? "stem"
        : source.id === "core-1" ? "core" : "petal",
      materialSettings: settingsForStroke(source.id),
    })),
    document,
  );
  const flowerResult = createHanaFlowerFromSelection(
    "flower-1",
    document.strokes,
    ["petal-1", "petal-2", "petal-3", "petal-4", "petal-5", "core-1"],
    { coreStrokeIds: ["core-1"], center: { x: 0, y: 0, z: 0 } },
  );
  document = {
    ...cloneHanaAuthoringDocument(document),
    strokes: flowerResult.updatedStrokes,
    revision: document.revision + 1,
  };
  return document;
}

function buildRuntime(document: HanaAuthoringDocument): HanaStudyStrokeRuntime[] {
  return document.strokes.map((stroke) => {
    const raw = document.rawGestures.strokes.find((gesture) => gesture.id === stroke.rawGestureId);
    if (!raw) throw new Error(`Study Stroke is missing Raw Gesture: ${stroke.id}`);
    const smooth = sampleSmoothCenterline(stroke3DFromHanaStroke(stroke));
    const materialSamples = sampleMaterialSamples(smooth, stroke.materialSettings.baseRadius);
    const materialProfile = mapGestureToMaterialProfile(raw, stroke.materialSettings, { sampleCount: raw.points.length });
    return {
      strokeId: stroke.id,
      rawGestureId: raw.id,
      smoothCount: smooth.length,
      materialSamples,
      materialProfile,
      materialObject: createMaterialObject(stroke.id, "stroke", [stroke.id], materialSamples, stroke.revision),
    };
  });
}

function buildGraph(
  flower: HanaFlower,
): HanaAuthoringGraph {
  let graph = createAuthoringGraph();
  graph = addAuthoringNode(graph, {
    id: "stem-base",
    role: "anchor",
    sourceObjectId: "stem-1",
    position: { x: 0, y: 0, z: -3.2 },
    protected: true,
    provenance: { sourceObjectIds: ["stem-1"], sourceGestureIds: ["gesture-stem"] },
  });
  graph = addAuthoringNode(graph, {
    id: "junction-1",
    role: "junction",
    sourceObjectId: null,
    position: { x: 0, y: 0, z: -0.2 },
    protected: false,
    provenance: { sourceObjectIds: ["stem-1", flower.id], sourceGestureIds: ["gesture-stem", "gesture-core"] },
  });
  graph = addAuthoringNode(graph, {
    id: "flower-center-1",
    role: "flower-center",
    sourceObjectId: flower.id,
    position: flower.center,
    protected: true,
    provenance: { sourceObjectIds: [flower.id], sourceGestureIds: flower.provenance.sourceGestureIds },
  });
  graph = connectAuthoringNodes(graph, {
    id: "stem-attachment-1",
    role: "stem",
    sourceObjectId: "stem-1",
    fromNodeId: "stem-base",
    toNodeId: "junction-1",
    protected: false,
  });
  graph = connectAuthoringNodes(graph, {
    id: "flower-junction-1",
    role: "connector",
    sourceObjectId: flower.id,
    fromNodeId: "junction-1",
    toNodeId: "flower-center-1",
    protected: false,
  });
  flower.petalStrokeIds.forEach((strokeId, index) => {
    graph = addAuthoringNode(graph, {
      id: `petal-tip-${index + 1}`,
      role: "free-end",
      sourceObjectId: strokeId,
      position: { x: Math.cos((Math.PI * 2 * index) / 5) * 2.1, y: 0, z: Math.sin((Math.PI * 2 * index) / 5) * 2.1 },
      protected: false,
      provenance: { sourceObjectIds: [strokeId], sourceGestureIds: [`gesture-petal-${index + 1}`] },
    });
    graph = connectAuthoringNodes(graph, {
      id: `petal-edge-${index + 1}`,
      role: "petal",
      sourceObjectId: strokeId,
      fromNodeId: "flower-center-1",
      toNodeId: `petal-tip-${index + 1}`,
      protected: false,
    });
  });
  return graph;
}

export function createHanaAuthoringStudy(): HanaAuthoringStudy {
  let document = createStudyDocument();
  const flower = attachHanaFlowerToStem(
    createHanaFlowerFromSelection(
      "flower-1",
      document.strokes,
      ["petal-1", "petal-2", "petal-3", "petal-4", "petal-5", "core-1"],
      { coreStrokeIds: ["core-1"], center: { x: 0, y: 0, z: 0 } },
    ).flower,
    {
      id: "stem-attachment-1",
      sourceStrokeId: "stem-1",
      normalizedT: 1,
      position: { x: 0, y: 0, z: 0 },
    },
  );
  const runtime = buildRuntime(document);
  const materialObjects = runtime.map((entry) => entry.materialObject);
  const flowerObject = materializeHanaFlower(flower, materialObjects);
  materialObjects.push(flowerObject);
  const graph = buildGraph(flower);
  const serializedDocument = JSON.stringify(document, null, 2);
  const reloadedDocument = JSON.parse(serializedDocument) as HanaAuthoringDocument;
  const history = new HanaUndoRedo(document);
  const edited = updateHanaStroke(document, "petal-1", (stroke) => applyArcLengthSoftEditToStroke(
    stroke,
    Math.min(16, stroke.controlPoints.length - 1),
    "front",
    { x: stroke.controlPoints[Math.min(16, stroke.controlPoints.length - 1)]!.position.x + 0.1, y: 0, z: stroke.controlPoints[Math.min(16, stroke.controlPoints.length - 1)]!.position.z },
    "low",
  ).authoringStroke);
  history.commit(edited, "study soft edit");
  const undone = history.undo();
  const redone = history.redo();
  const undoRedo = {
    editedRevision: edited.revision,
    undoRestored: undone?.strokes[1]?.revision === document.strokes[1]?.revision,
    redoRestored: redone?.strokes[1]?.revision === edited.strokes[1]?.revision,
  };
  const bridge = exportHanaSkinBridge({ document, flowers: [flower], graph });
  const serializedBridge = serializeHanaSkinBridge(bridge);
  const reloadedBridge = parseHanaSkinBridge(serializedBridge);
  return {
    document,
    reloadedDocument,
    flowers: [flower],
    graph,
    runtime,
    materialObjects,
    serializedDocument,
    bridge,
    reloadedBridge,
    serializedBridge,
    bridgeValidation: validateHanaSkinBridge(bridge),
    undoRedo,
  };
}
