import { sha256Hex } from "../../lib/hash.ts";
import {
  createImportedHostInstanceFromMesh,
  type HostBounds,
  type HostVec3,
  type ImportedHostInstance,
  type ParsedHostMesh,
} from "./externalStlHost.ts";
import {
  type HostDerivedRepairArtifact,
  type HostRepairProvenance,
  type HostVolumePreflight,
} from "./externalStlHostVolume.ts";

export const USAGI_REPAIR_POLICY_VERSION = "stl-host-boundary-fill-v0";
export const APPROVED_USAGI_BOUNDARY_LOOPS: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
export const USAGI_SOURCE_SHA256 = "c4d08af61802561ec2adb280d78a928baa00b0c04443a293237706b02cc5afe8";

export interface ApprovedHostRepairRequest {
  readonly originalSourceSha256: string;
  readonly repairPolicyVersion: string;
  readonly approvedBoundaryLoopIndices: readonly number[];
}

export interface HostRepairMaterialization extends HostDerivedRepairArtifact {
  readonly repairedFingerprint: string;
  readonly removedDegenerateTriangleIndices: readonly number[];
  readonly insertedBoundaryLoopIndices: readonly number[];
  readonly originalPreflight: HostVolumePreflight;
  readonly repairedPreflight: HostVolumePreflight;
}

export interface ApprovedRepairedHost {
  readonly original: ImportedHostInstance;
  readonly repaired: ImportedHostInstance;
  readonly materialization: HostRepairMaterialization;
}

function cross(left: HostVec3, right: HostVec3): HostVec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function triangleNormal(a: HostVec3, b: HostVec3, c: HostVec3): HostVec3 {
  const normal = cross(
    { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
    { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z },
  );
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (!(length > 0) || !Number.isFinite(length)) throw new Error("Approved Host repair produced a degenerate fill");
  return { x: normal.x / length, y: normal.y / length, z: normal.z / length };
}

function boundsFromPositions(positions: Float64Array): HostBounds {
  if (positions.length === 0) throw new Error("Approved Host repair produced no positions");
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  return Object.freeze({
    min: Object.freeze({ x: minX, y: minY, z: minZ }),
    max: Object.freeze({ x: maxX, y: maxY, z: maxZ }),
  });
}

function positionAt(mesh: ParsedHostMesh, triangle: number, vertex: number): HostVec3 {
  const offset = triangle * 9 + vertex * 3;
  return {
    x: mesh.positions[offset],
    y: mesh.positions[offset + 1],
    z: mesh.positions[offset + 2],
  };
}

function appendTriangle(
  positions: number[],
  normals: number[],
  a: HostVec3,
  b: HostVec3,
  c: HostVec3,
): void {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const normal = triangleNormal(a, b, c);
  normals.push(normal.x, normal.y, normal.z);
}

function orderedBoundaryVertices(loop: HostVolumePreflight["boundaryLoops"][number]): readonly number[] {
  if (loop.edgeCount !== 3 || loop.vertexIndices.length !== 3 || loop.directedEdges.length !== 3) {
    throw new Error(`Approved boundary loop ${loop.loopIndex} is not a local triangle`);
  }
  const edges = loop.directedEdges.map(([start, end]) => [start, end] as const);
  const first = edges
    .slice()
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])[0];
  const ordered = [first[0], first[1]];
  const used = new Set<number>([edges.indexOf(first)]);
  while (ordered.length < 3) {
    const nextIndex = edges.findIndex(([start], index) => start === ordered[ordered.length - 1] && !used.has(index));
    if (nextIndex < 0) throw new Error(`Approved boundary loop ${loop.loopIndex} has no deterministic directed cycle`);
    used.add(nextIndex);
    ordered.push(edges[nextIndex][1]);
  }
  if (ordered[ordered.length - 1] !== ordered[0] && !edges.some(([start, end]) => start === ordered[ordered.length - 1] && end === ordered[0])) {
    throw new Error(`Approved boundary loop ${loop.loopIndex} is not closed`);
  }
  const unique = new Set(ordered);
  if (unique.size !== 3) throw new Error(`Approved boundary loop ${loop.loopIndex} repeats a vertex`);
  return Object.freeze(ordered);
}

function loopPosition(loop: HostVolumePreflight["boundaryLoops"][number], vertexIndex: number): HostVec3 {
  const index = loop.vertexIndices.indexOf(vertexIndex);
  if (index < 0) throw new Error(`Approved boundary loop ${loop.loopIndex} is missing vertex ${vertexIndex}`);
  return loop.vertexPositions[index];
}

function canonicalRepairFingerprintInput(
  sourceHash: string,
  policy: string,
  loopIndices: readonly number[],
  fillTriangles: readonly (readonly [HostVec3, HostVec3, HostVec3])[],
  removedTriangles: readonly number[],
): string {
  return JSON.stringify({
    kind: "stl-host-derived-boundary-fill-v0",
    sourceHash,
    policy,
    loopIndices,
    removedTriangles,
    fillTriangles,
  });
}

export async function applyApprovedBoundaryRepair(
  original: ImportedHostInstance,
  request: ApprovedHostRepairRequest,
): Promise<ApprovedRepairedHost> {
  if (original.source.sourceIdentity.sha256 !== request.originalSourceSha256) {
    throw new Error("Approved repair source hash does not match the retained original source");
  }
  if (request.repairPolicyVersion !== USAGI_REPAIR_POLICY_VERSION) {
    throw new Error("Approved repair policy version is not the reviewed boundary-fill policy");
  }
  const approved = [...request.approvedBoundaryLoopIndices];
  if (approved.length === 0 || new Set(approved).size !== approved.length) {
    throw new Error("Approved repair requires a non-empty unique loop list");
  }
  const loops = original.volumePreflight.boundaryLoops;
  const fillTriangles: Array<readonly [HostVec3, HostVec3, HostVec3]> = [];
  for (const loopIndex of approved) {
    const loop = loops[loopIndex];
    if (!loop || loop.fillability !== "PLAUSIBLE_LOCAL" || loop.localMinimal !== "YES") {
      throw new Error(`Approved repair loop ${loopIndex} is not a plausible local fill candidate`);
    }
    const [first, second, third] = orderedBoundaryVertices(loop);
    const a = loopPosition(loop, first);
    const b = loopPosition(loop, second);
    const c = loopPosition(loop, third);
    const boundaryNormal = triangleNormal(a, b, c);
    const centroid = {
      x: (a.x + b.x + c.x) / 3,
      y: (a.y + b.y + c.y) / 3,
      z: (a.z + b.z + c.z) / 3,
    };
    const edgeLengths = [
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
      Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z),
      Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z),
    ];
    const minimumEdge = Math.min(...edgeLengths);
    const modelScale = Math.max(
      original.mesh.bounds.max.x - original.mesh.bounds.min.x,
      original.mesh.bounds.max.y - original.mesh.bounds.min.y,
      original.mesh.bounds.max.z - original.mesh.bounds.min.z,
    );
    const minimumCross = Math.sqrt(modelScale ** 4 * 1e-24) * 2;
    const height = Math.max(
      original.volumePreflight.diagnostics.topology.weldTolerance * 4,
      minimumCross / Math.max(minimumEdge, 1e-12),
    );
    const center = {
      x: centroid.x + boundaryNormal.x * height,
      y: centroid.y + boundaryNormal.y * height,
      z: centroid.z + boundaryNormal.z * height,
    };
    // Existing boundary directions wind around the missing face. Reverse that
    // cycle so every new boundary edge has the opposite direction to its
    // neighbour. Three fan faces keep the tiny closure above the topology
    // degeneracy threshold without broad remeshing.
    fillTriangles.push([a, c, center], [c, b, center], [b, a, center]);
  }

  const valid = new Set(original.volumePreflight.diagnostics.validTriangleIndices);
  const removedDegenerateTriangleIndices = Array.from(
    { length: original.mesh.triangleCount },
    (_, triangle) => triangle,
  ).filter((triangle) => !valid.has(triangle));
  const positions: number[] = [];
  const normals: number[] = [];
  for (const triangle of original.volumePreflight.diagnostics.validTriangleIndices) {
    appendTriangle(positions, normals, positionAt(original.mesh, triangle, 0), positionAt(original.mesh, triangle, 1), positionAt(original.mesh, triangle, 2));
  }
  for (const [a, b, c] of fillTriangles) appendTriangle(positions, normals, a, b, c);

  const repairedMesh: ParsedHostMesh = Object.freeze({
    positions: Float64Array.from(positions),
    geometricNormals: Float64Array.from(normals),
    triangleCount: positions.length / 9,
    validTriangleIndices: Object.freeze(Array.from({ length: positions.length / 9 }, (_, index) => index)),
    bounds: boundsFromPositions(Float64Array.from(positions)),
    coordinateFrame: original.mesh.coordinateFrame,
  });
  const repaired = createImportedHostInstanceFromMesh(original.source, original.transform, repairedMesh);
  const repairedPreflight = repaired.volumePreflight;
  if (repairedPreflight.diagnostics.topology.boundaryEdgeCount !== 0
    || repairedPreflight.diagnostics.topology.boundaryLoopCount !== 0
    || repairedPreflight.diagnostics.topology.nonManifoldEdgeCount !== 0
    || repairedPreflight.diagnostics.topology.orientationInconsistencyEdgeCount !== 0
    || repairedPreflight.diagnostics.topology.connectedComponentCount !== 1
    || repaired.capabilities.signedVolumeCapability.availability !== "AVAILABLE") {
    throw new Error("Approved rabbit repair did not pass the closed Signed Volume promotion gate");
  }

  const fingerprint = await sha256Hex(canonicalRepairFingerprintInput(
    original.source.sourceIdentity.sha256,
    request.repairPolicyVersion,
    approved,
    fillTriangles,
    removedDegenerateTriangleIndices,
  ));
  const provenance: HostRepairProvenance = Object.freeze({
    originalSourceSha256: original.source.sourceIdentity.sha256,
    repairPolicyVersion: request.repairPolicyVersion,
    repairParameters: Object.freeze({
      approvedBoundaryLoopIndices: Object.freeze(approved),
      removedDegenerateTriangleCount: removedDegenerateTriangleIndices.length,
      insertedTriangleCount: fillTriangles.length,
    }),
    derivedMeshFingerprint: fingerprint,
  });
  const materialization: HostRepairMaterialization = Object.freeze({
    mesh: repairedMesh,
    provenance,
    repairedFingerprint: fingerprint,
    removedDegenerateTriangleIndices: Object.freeze(removedDegenerateTriangleIndices),
    insertedBoundaryLoopIndices: Object.freeze(approved),
    originalPreflight: original.volumePreflight,
    repairedPreflight,
  });
  return Object.freeze({ original, repaired, materialization });
}
