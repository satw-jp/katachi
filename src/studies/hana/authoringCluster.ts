import type { HanaAuthoringDocument } from "./authoringDocument.ts";
import {
  addAuthoringNode,
  connectAuthoringNodes,
  createAuthoringGraph,
  type HanaAuthoringGraph,
} from "./authoringGraph.ts";
import {
  cloneHanaFlower,
  moveHanaFlower,
  materializeHanaFlower,
  type HanaFlower,
} from "./flowerAuthoring.ts";
import {
  HanaMaterialObjectRegistry,
  type HanaMaterialObject,
} from "./materialObjects.ts";
import {
  exportHanaSkinBridge,
  serializeHanaSkinBridge,
  validateHanaSkinBridge,
  type HanaSkinBridgeDocument,
} from "./skinBridge.ts";
import type { HanaVector3 } from "./stroke3d.ts";
import type { HanaAuthoringStudy } from "./authoringStudy.ts";

export const HANA_CLUSTER_FORMAT = "katachi.hana-cluster.v0" as const;

export interface HanaSmallCluster {
  format: typeof HANA_CLUSTER_FORMAT;
  id: string;
  document: HanaAuthoringDocument;
  flowers: HanaFlower[];
  graph: HanaAuthoringGraph;
  selectedObjectIds: string[];
  materialObjects: HanaMaterialObject[];
  registry: HanaMaterialObjectRegistry;
  bridge: HanaSkinBridgeDocument;
  bridgeValidation: ReturnType<typeof validateHanaSkinBridge>;
}

export interface HanaClusterPayload {
  format: typeof HANA_CLUSTER_FORMAT;
  id: string;
  document: HanaAuthoringDocument;
  flowers: HanaFlower[];
  graph: HanaAuthoringGraph;
  selectedObjectIds: string[];
}

function translated(center: HanaVector3, x: number): HanaVector3 {
  return { x: center.x + x, y: center.y, z: center.z };
}

function buildClusterGraph(flowers: readonly HanaFlower[]): HanaAuthoringGraph {
  let graph = createAuthoringGraph();
  graph = addAuthoringNode(graph, {
    id: "cluster-base",
    role: "anchor",
    sourceObjectId: "stem-1",
    position: { x: 0, y: 0, z: -3.2 },
    protected: true,
    provenance: { sourceObjectIds: ["stem-1"], sourceGestureIds: ["gesture-stem"] },
  });
  graph = addAuthoringNode(graph, {
    id: "cluster-junction",
    role: "junction",
    sourceObjectId: null,
    position: { x: 0, y: 0, z: -0.2 },
    protected: false,
    provenance: { sourceObjectIds: ["stem-1"], sourceGestureIds: ["gesture-stem"] },
  });
  graph = connectAuthoringNodes(graph, {
    id: "cluster-stem",
    role: "stem",
    sourceObjectId: "stem-1",
    fromNodeId: "cluster-base",
    toNodeId: "cluster-junction",
    protected: false,
  });
  flowers.forEach((flower, flowerIndex) => {
    const centerId = `${flower.id}-center`;
    graph = addAuthoringNode(graph, {
      id: centerId,
      role: "flower-center",
      sourceObjectId: flower.id,
      position: flower.center,
      protected: true,
      provenance: { sourceObjectIds: [flower.id], sourceGestureIds: flower.provenance.sourceGestureIds },
    });
    graph = connectAuthoringNodes(graph, {
      id: `${flower.id}-branch`,
      role: "connector",
      sourceObjectId: flower.id,
      fromNodeId: "cluster-junction",
      toNodeId: centerId,
      protected: false,
    });
    flower.petalStrokeIds.forEach((strokeId, petalIndex) => {
      const tipId = `${flower.id}-petal-${petalIndex + 1}-tip`;
      const angle = (Math.PI * 2 * petalIndex) / Math.max(1, flower.petalStrokeIds.length) + flowerIndex * 0.25;
      graph = addAuthoringNode(graph, {
        id: tipId,
        role: "free-end",
        sourceObjectId: strokeId,
        position: translated(flower.center, 2.1 * Math.cos(angle)),
        protected: false,
        provenance: { sourceObjectIds: [strokeId], sourceGestureIds: [`gesture-petal-${petalIndex + 1}`] },
      });
      graph = connectAuthoringNodes(graph, {
        id: `${flower.id}-petal-${petalIndex + 1}`,
        role: "petal",
        sourceObjectId: strokeId,
        fromNodeId: centerId,
        toNodeId: tipId,
        protected: false,
      });
    });
  });
  return graph;
}

export function createHanaSmallCluster(
  study: HanaAuthoringStudy,
  id = "hana-small-cluster-v0",
): HanaSmallCluster {
  const sourceFlower = study.flowers[0];
  if (!sourceFlower) throw new Error("A cluster requires the end-to-end Flower fixture");
  const flowers = [-2.8, 0, 2.8].map((offset, index) => {
    const clone = cloneHanaFlower(sourceFlower);
    const moved = moveHanaFlower({ ...clone, id: `flower-${index + 1}` }, translated(clone.center, offset));
    return {
      ...moved,
      stemAttachment: moved.stemAttachment
        ? { ...moved.stemAttachment, id: `stem-attachment-${index + 1}` }
        : null,
    };
  });
  const graph = buildClusterGraph(flowers);
  const registry = new HanaMaterialObjectRegistry();
  for (const object of study.materialObjects.filter((candidate) => candidate.kind === "stroke")) registry.upsert(object);
  const strokeObjects = registry.values();
  const flowerObjects = flowers.map((flower) => materializeHanaFlower(flower, strokeObjects));
  flowerObjects.forEach((object) => registry.upsert(object));
  const materialObjects = registry.values();
  const selectedObjectIds = flowers.map((flower) => flower.id);
  const bridge = exportHanaSkinBridge({ document: study.document, flowers, graph });
  const bridgeValidation = validateHanaSkinBridge(bridge);
  return {
    format: HANA_CLUSTER_FORMAT,
    id,
    document: study.document,
    flowers,
    graph,
    selectedObjectIds,
    materialObjects,
    registry,
    bridge,
    bridgeValidation,
  };
}

export function selectHanaClusterObjects(
  cluster: HanaSmallCluster,
  objectIds: readonly string[],
): HanaSmallCluster {
  const available = new Set(cluster.materialObjects.map((object) => object.id));
  return { ...cluster, selectedObjectIds: [...new Set(objectIds)].filter((id) => available.has(id)) };
}

export function regenerateHanaClusterObject(
  cluster: HanaSmallCluster,
  objectId: string,
  materialSamples: HanaMaterialObject["materialSamples"],
  sourceRevision: number,
): HanaMaterialObject | null {
  const object = cluster.registry.get(objectId);
  if (!object) return null;
  const next = object.kind === "stroke"
    ? cluster.registry.upsertStrokeObject(objectId, materialSamples, sourceRevision)
    : (() => {
      const replacement = { ...object, materialSamples: materialSamples.map((sample) => ({ ...sample, position: { ...sample.position } })), sourceRevision, revision: object.revision + 1, dirty: true, meshCache: null };
      cluster.registry.upsert(replacement);
      return replacement;
    })();
  cluster.materialObjects = cluster.registry.values();
  cluster.bridge = exportHanaSkinBridge({ document: cluster.document, flowers: cluster.flowers, graph: cluster.graph });
  cluster.bridgeValidation = validateHanaSkinBridge(cluster.bridge);
  return next;
}

export function serializeHanaCluster(cluster: HanaSmallCluster): string {
  const payload: HanaClusterPayload = {
    format: cluster.format,
    id: cluster.id,
    document: cluster.document,
    flowers: cluster.flowers,
    graph: cluster.graph,
    selectedObjectIds: cluster.selectedObjectIds,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseHanaClusterPayload(serialized: string): HanaClusterPayload {
  const payload = JSON.parse(serialized) as HanaClusterPayload;
  if (payload.format !== HANA_CLUSTER_FORMAT) throw new Error("Unsupported HANA cluster format");
  const bridge = exportHanaSkinBridge({ document: payload.document, flowers: payload.flowers, graph: payload.graph });
  const validation = validateHanaSkinBridge(bridge);
  if (!validation.valid) throw new Error(`Invalid HANA cluster: ${validation.issues.map((issue) => issue.message).join("; ")}`);
  return payload;
}

export function serializeHanaClusterBridge(cluster: HanaSmallCluster): string {
  return serializeHanaSkinBridge(cluster.bridge);
}
