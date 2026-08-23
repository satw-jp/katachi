import {
  computeConnectedComponentsWithKey,
  type MeshBuildResult,
  type Triangle,
} from "../cloud-sculpt/meshExport.ts";
import type { Vec3 } from "../flower-packing-spike/packing.ts";
import { cross, dot, length, normalize, scale, sub, type CoreEdge, type CoreNetworkParams } from "./model.ts";
import type { NetworkField } from "./field.ts";

export interface LayerSupportEstimate {
  unsupportedStarts: number;
  unsupportedCells: number;
  maximumUnsupportedSpanMm: number;
  sampledLayerMm: number;
}

export interface CoreNetworkDiagnostics {
  graphComponents: number;
  meshComponents: number;
  edgeCount: number;
  cycleRank: number;
  minimumDegree: number;
  maximumEdgeLengthMm: number;
  materialVolumeMm3: number;
  minimumConnectorDiameterMm: number;
  watertight: boolean;
  openEdges: number;
  nonManifoldEdges: number;
  riskyDownFacingAreaMm2: number;
  support: LayerSupportEstimate;
  printGeometryReady: boolean;
  reasons: string[];
}

function graphStats(nodeIds: readonly number[], edges: readonly CoreEdge[]): {
  components: number;
  minimumDegree: number;
  cycleRank: number;
} {
  const indexById = new Map(nodeIds.map((id, index) => [id, index]));
  const parent = nodeIds.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const degree = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of edges) {
    const ia = indexById.get(edge.a);
    const ib = indexById.get(edge.b);
    if (ia === undefined || ib === undefined) continue;
    const ra = find(ia);
    const rb = find(ib);
    if (ra !== rb) parent[ra] = rb;
    degree.set(edge.a, degree.get(edge.a)! + 1);
    degree.set(edge.b, degree.get(edge.b)! + 1);
  }
  const components = new Set(nodeIds.map((_, index) => find(index))).size;
  return {
    components,
    minimumDegree: Math.min(...degree.values()),
    cycleRank: Math.max(0, edges.length - nodeIds.length + components),
  };
}

function triangleNormalAndArea(triangle: Triangle): { normal: Vec3; area: number } {
  const ab = sub(triangle.b, triangle.a);
  const ac = sub(triangle.c, triangle.a);
  const vector = cross(ab, ac);
  const magnitude = length(vector);
  return { normal: magnitude > 1e-12 ? scale(vector, 1 / magnitude) : { x: 0, y: 1, z: 0 }, area: magnitude * 0.5 };
}

function signedVolume(triangles: readonly Triangle[]): number {
  let volume = 0;
  for (const triangle of triangles) {
    volume += dot(triangle.a, cross(triangle.b, triangle.c)) / 6;
  }
  return Math.abs(volume);
}

function buildFrame(upInput: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = normalize(upInput);
  const helper = Math.abs(z.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const x = normalize(cross(helper, z));
  const y = normalize(cross(z, x));
  return { x, y, z };
}

function fieldCorners(field: NetworkField): Vec3[] {
  const { min, max } = field.bounds;
  return [
    { x: min.x, y: min.y, z: min.z }, { x: max.x, y: min.y, z: min.z },
    { x: min.x, y: max.y, z: min.z }, { x: max.x, y: max.y, z: min.z },
    { x: min.x, y: min.y, z: max.z }, { x: max.x, y: min.y, z: max.z },
    { x: min.x, y: max.y, z: max.z }, { x: max.x, y: max.y, z: max.z },
  ];
}

function connectedMaskComponents(mask: Uint8Array, width: number, height: number): Array<number[]> {
  const visited = new Uint8Array(mask.length);
  const groups: Array<number[]> = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    const group: number[] = [];
    const queue = [start];
    visited[start] = 1;
    while (queue.length) {
      const current = queue.pop()!;
      group.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = nx + ny * width;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

export function estimateLayerSupport(
  field: NetworkField,
  params: CoreNetworkParams,
  resolution = 30,
): LayerSupportEstimate {
  const frame = buildFrame(params.buildDirection);
  const corners = fieldCorners(field);
  const projected = corners.map((point) => ({ x: dot(point, frame.x), y: dot(point, frame.y), z: dot(point, frame.z) }));
  const min = {
    x: Math.min(...projected.map((point) => point.x)),
    y: Math.min(...projected.map((point) => point.y)),
    z: Math.min(...projected.map((point) => point.z)),
  };
  const max = {
    x: Math.max(...projected.map((point) => point.x)),
    y: Math.max(...projected.map((point) => point.y)),
    z: Math.max(...projected.map((point) => point.z)),
  };
  const longest = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  const step = longest / Math.max(18, resolution);
  const width = Math.max(2, Math.ceil((max.x - min.x) / step));
  const height = Math.max(2, Math.ceil((max.y - min.y) / step));
  const layers = Math.max(2, Math.ceil((max.z - min.z) / step));
  let previous = new Uint8Array(width * height);
  let unsupportedStarts = 0;
  let unsupportedCells = 0;
  let maximumSpanCells = 0;
  for (let layer = 0; layer < layers; layer++) {
    const current = new Uint8Array(width * height);
    const localZ = min.z + (layer + 0.5) * step;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const localX = min.x + (x + 0.5) * step;
        const localY = min.y + (y + 0.5) * step;
        const point = {
          x: frame.x.x * localX + frame.y.x * localY + frame.z.x * localZ,
          y: frame.x.y * localX + frame.y.y * localY + frame.z.y * localZ,
          z: frame.x.z * localX + frame.y.z * localY + frame.z.z * localZ,
        };
        if (field.sample(point.x, point.y, point.z) <= 0) current[x + y * width] = 1;
      }
    }
    if (layer > 0) {
      const unsupported = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = x + y * width;
          if (!current[index]) continue;
          let supported = false;
          for (let dy = -1; dy <= 1 && !supported; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const px = x + dx;
              const py = y + dy;
              if (px >= 0 && px < width && py >= 0 && py < height && previous[px + py * width]) {
                supported = true;
                break;
              }
            }
          }
          if (!supported) unsupported[index] = 1;
        }
      }
      const groups = connectedMaskComponents(unsupported, width, height);
      unsupportedStarts += groups.length;
      for (const group of groups) {
        unsupportedCells += group.length;
        const xs = group.map((index) => index % width);
        const ys = group.map((index) => Math.floor(index / width));
        const span = Math.hypot(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1);
        maximumSpanCells = Math.max(maximumSpanCells, span);
      }
    }
    previous = current;
  }
  const mmPerUnit = params.targetLongestMm / field.bounds.longest;
  return {
    unsupportedStarts,
    unsupportedCells,
    maximumUnsupportedSpanMm: maximumSpanCells * step * mmPerUnit,
    sampledLayerMm: step * mmPerUnit,
  };
}

export function inspectCoreNetwork(
  nodeIds: readonly number[],
  edges: readonly CoreEdge[],
  mesh: MeshBuildResult,
  field: NetworkField,
  params: CoreNetworkParams,
  supportResolution = 28,
): CoreNetworkDiagnostics {
  const graph = graphStats(nodeIds, edges);
  const meshComponents = computeConnectedComponentsWithKey(
    mesh.triangles,
    (vertex) => `${Math.round(vertex.x * 1e5)},${Math.round(vertex.y * 1e5)},${Math.round(vertex.z * 1e5)}`,
  );
  const buildUp = normalize(params.buildDirection);
  const riskThreshold = -Math.cos((params.overhangLimitDeg * Math.PI) / 180);
  let riskyAreaSource = 0;
  for (const triangle of mesh.triangles) {
    const { normal, area } = triangleNormalAndArea(triangle);
    if (dot(normal, buildUp) < riskThreshold) riskyAreaSource += area;
  }
  const support = estimateLayerSupport(field, params, supportResolution);
  const reasons: string[] = [];
  if (graph.components !== 1) reasons.push(`接続graphが${graph.components}群です`);
  if (meshComponents !== 1) reasons.push(`保存meshが${meshComponents}成分です`);
  if (!mesh.watertight.ok) reasons.push(`開いた辺${mesh.watertight.openEdges} / 非多様体${mesh.watertight.nonManifoldEdges}`);
  if (params.middleDiameterMm < 0.8) reasons.push("枝中央が観察下限0.8mm未満です");
  return {
    graphComponents: graph.components,
    meshComponents,
    edgeCount: edges.length,
    cycleRank: graph.cycleRank,
    minimumDegree: graph.minimumDegree,
    maximumEdgeLengthMm: Math.max(...edges.map((edge) => edge.length), 0) * mesh.scaleMmPerUnit,
    materialVolumeMm3: signedVolume(mesh.triangles) * Math.pow(mesh.scaleMmPerUnit, 3),
    minimumConnectorDiameterMm: params.middleDiameterMm,
    watertight: mesh.watertight.ok,
    openEdges: mesh.watertight.openEdges,
    nonManifoldEdges: mesh.watertight.nonManifoldEdges,
    riskyDownFacingAreaMm2: riskyAreaSource * Math.pow(mesh.scaleMmPerUnit, 2),
    support,
    printGeometryReady: reasons.length === 0,
    reasons,
  };
}

