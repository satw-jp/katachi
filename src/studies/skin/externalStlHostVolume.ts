import {
  characterizeHostMesh,
  type HostBoundaryLoopDiagnostic,
  type HostMeshDiagnostics,
} from "./externalStlHostDiagnostics.ts";
import type {
  HostSurfaceQuery,
  HostVec3,
  ImportedHostSourceIdentity,
  ParsedHostMesh,
} from "./externalStlHost.ts";

export type HostCapabilityAvailability = "AVAILABLE" | "UNAVAILABLE";

export type HostCapabilityReason =
  | "NO_VALID_TRIANGLES"
  | "OPEN_BOUNDARY"
  | "NON_MANIFOLD"
  | "DEGENERATE_TRIANGLES"
  | "ORIENTATION_INCONSISTENT"
  | "DISCONNECTED_COMPONENTS";

export interface HostCapabilityStatus {
  readonly availability: HostCapabilityAvailability;
  readonly reason?: HostCapabilityReason;
}

export interface HostCapabilities {
  readonly surfaceCapability: HostCapabilityStatus;
  readonly signedVolumeCapability: HostCapabilityStatus;
}

export type HostSelfIntersectionStatus = "NOT_PROVEN";
export type HostVolumeValidationStatus = "TOPOLOGICALLY_CLOSED" | "NOT_CLOSED";

export interface HostVolumePreflight {
  readonly diagnostics: HostMeshDiagnostics;
  readonly boundaryLoops: readonly HostBoundaryLoopDiagnostic[];
  readonly orientationConsistent: boolean;
  readonly connectedComponentCount: number;
  readonly selfIntersection: HostSelfIntersectionStatus;
  readonly validationStatus: HostVolumeValidationStatus;
  readonly surfaceCapability: HostCapabilityStatus;
  readonly signedVolumeCapability: HostCapabilityStatus;
}

export type HostInsideOutside = "inside" | "outside" | "surface" | "unknown";

export interface HostSignedVolumeQuery {
  insideOutside(point: HostVec3): HostInsideOutside;
  /** Negative inside, zero at the surface, positive outside. */
  signedDistance(point: HostVec3): number;
}

export interface HostRepairProvenance {
  readonly originalSourceSha256: string;
  readonly repairPolicyVersion: string;
  readonly repairParameters: Readonly<Record<string, string | number | boolean | readonly number[]>>;
  readonly derivedMeshFingerprint: string;
}

export interface HostDerivedRepairArtifact {
  readonly mesh: ParsedHostMesh;
  readonly provenance: HostRepairProvenance;
}

export interface HostRepairProposal {
  readonly status: "NONE" | "PROPOSED";
  readonly originalSourceSha256: string;
  readonly repairPolicyVersion: string;
  readonly boundaryLoopIndices: readonly number[];
  readonly active: false;
}

function longestDimension(mesh: ParsedHostMesh): number {
  return Math.max(
    mesh.bounds.max.x - mesh.bounds.min.x,
    mesh.bounds.max.y - mesh.bounds.min.y,
    mesh.bounds.max.z - mesh.bounds.min.z,
  );
}

function clonePoint(point: HostVec3): HostVec3 {
  return { x: point.x, y: point.y, z: point.z };
}

function capabilityReason(diagnostics: HostMeshDiagnostics): HostCapabilityReason | undefined {
  const topology = diagnostics.topology;
  if (topology.validTriangleCount === 0) return "NO_VALID_TRIANGLES";
  if (topology.boundaryEdgeCount > 0) return "OPEN_BOUNDARY";
  if (topology.nonManifoldEdgeCount > 0) return "NON_MANIFOLD";
  if (topology.degenerateTriangleCount > 0) return "DEGENERATE_TRIANGLES";
  if (topology.orientationInconsistencyEdgeCount > 0) return "ORIENTATION_INCONSISTENT";
  if (topology.connectedComponentCount !== 1) return "DISCONNECTED_COMPONENTS";
  return undefined;
}

export function preflightHostVolume(mesh: ParsedHostMesh): HostVolumePreflight {
  const diagnostics = characterizeHostMesh(mesh);
  const reason = capabilityReason(diagnostics);
  const surfaceCapability: HostCapabilityStatus = diagnostics.topology.validTriangleCount > 0
    ? { availability: "AVAILABLE" }
    : { availability: "UNAVAILABLE", reason: "NO_VALID_TRIANGLES" };
  const signedVolumeCapability: HostCapabilityStatus = reason === undefined
    ? { availability: "AVAILABLE" }
    : { availability: "UNAVAILABLE", reason };
  return Object.freeze({
    diagnostics,
    boundaryLoops: diagnostics.boundaryLoops,
    orientationConsistent: diagnostics.topology.orientationInconsistencyEdgeCount === 0,
    connectedComponentCount: diagnostics.topology.connectedComponentCount,
    selfIntersection: "NOT_PROVEN" as const,
    validationStatus: signedVolumeCapability.availability === "AVAILABLE" ? "TOPOLOGICALLY_CLOSED" as const : "NOT_CLOSED" as const,
    surfaceCapability,
    signedVolumeCapability,
  });
}

function rayTriangleDistance(point: HostVec3, direction: HostVec3, mesh: ParsedHostMesh, triangle: number): number | null {
  const offset = triangle * 9;
  const ax = mesh.positions[offset]; const ay = mesh.positions[offset + 1]; const az = mesh.positions[offset + 2];
  const bx = mesh.positions[offset + 3]; const by = mesh.positions[offset + 4]; const bz = mesh.positions[offset + 5];
  const cx = mesh.positions[offset + 6]; const cy = mesh.positions[offset + 7]; const cz = mesh.positions[offset + 8];
  const e1x = bx - ax; const e1y = by - ay; const e1z = bz - az;
  const e2x = cx - ax; const e2y = cy - ay; const e2z = cz - az;
  const px = direction.y * e2z - direction.z * e2y;
  const py = direction.z * e2x - direction.x * e2z;
  const pz = direction.x * e2y - direction.y * e2x;
  const determinant = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(determinant) <= 1e-12) return null;
  const inverse = 1 / determinant;
  const tx = point.x - ax; const ty = point.y - ay; const tz = point.z - az;
  const u = (tx * px + ty * py + tz * pz) * inverse;
  if (u <= 1e-10 || u >= 1 - 1e-10) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (direction.x * qx + direction.y * qy + direction.z * qz) * inverse;
  if (v <= 1e-10 || u + v >= 1 - 1e-10) return null;
  const distance = (e2x * qx + e2y * qy + e2z * qz) * inverse;
  return distance > 1e-10 ? distance : null;
}

const PARITY_DIRECTIONS: readonly HostVec3[] = [
  { x: 1, y: 0.3713906763541037, z: 0.1592616652453654 },
  { x: 0.271, y: 1, z: 0.517 },
  { x: 0.413, y: 0.227, z: 1 },
];

function normalized(point: HostVec3): HostVec3 {
  const length = Math.hypot(point.x, point.y, point.z);
  return { x: point.x / length, y: point.y / length, z: point.z / length };
}

function parityInside(point: HostVec3, direction: HostVec3, mesh: ParsedHostMesh): boolean {
  const rayDirection = normalized(direction);
  let crossings = 0;
  for (const triangle of mesh.validTriangleIndices) {
    if (rayTriangleDistance(point, rayDirection, mesh, triangle) !== null) crossings += 1;
  }
  return crossings % 2 === 1;
}

export function createSignedVolumeQuery(
  mesh: ParsedHostMesh,
  surfaceQuery: HostSurfaceQuery,
  preflight: HostVolumePreflight = preflightHostVolume(mesh),
): HostSignedVolumeQuery | null {
  if (preflight.signedVolumeCapability.availability !== "AVAILABLE") return null;
  const surfaceTolerance = Math.max(longestDimension(mesh) * 1e-9, 1e-9);
  return {
    insideOutside(pointInput: HostVec3): HostInsideOutside {
      const point = clonePoint(pointInput);
      const surface = surfaceQuery.closestSurface(point);
      if (!surface) throw new Error("Signed volume query has no closest surface result");
      if (surface.distance <= surfaceTolerance) return "surface";
      const votes = PARITY_DIRECTIONS.map((direction) => parityInside(point, direction, mesh));
      if (votes.every((value) => value === votes[0])) return votes[0] ? "inside" : "outside";
      return "unknown";
    },
    signedDistance(pointInput: HostVec3): number {
      const point = clonePoint(pointInput);
      const surface = surfaceQuery.closestSurface(point);
      if (!surface) throw new Error("Signed volume query has no closest surface result");
      if (surface.distance <= surfaceTolerance) return 0;
      const relation = this.insideOutside(point);
      if (relation === "inside") return -surface.distance;
      if (relation === "outside") return surface.distance;
      throw new Error(`Signed volume classification is ${relation}; refusing an untrusted sign`);
    },
  };
}

export function proposeBoundaryRepair(
  sourceIdentity: ImportedHostSourceIdentity,
  preflight: HostVolumePreflight,
): HostRepairProposal {
  const candidates = preflight.boundaryLoops
    .filter((loop) => loop.fillability === "PLAUSIBLE_LOCAL" && loop.localMinimal === "YES")
    .map((loop) => loop.loopIndex);
  return Object.freeze({
    status: candidates.length > 0 ? "PROPOSED" : "NONE",
    originalSourceSha256: sourceIdentity.sha256,
    repairPolicyVersion: "stl-host-boundary-fill-v0",
    boundaryLoopIndices: Object.freeze(candidates),
    active: false,
  });
}

/**
 * Wraps an explicitly supplied derived mesh without changing the original source.
 * No caller in Phase 4 invokes this automatically; repair approval remains an
 * explicit author decision and the original source hash stays in provenance.
 */
export function createDerivedRepairArtifact(
  mesh: ParsedHostMesh,
  provenance: HostRepairProvenance,
): HostDerivedRepairArtifact {
  if (provenance.originalSourceSha256.length === 0) throw new Error("Repair provenance requires the original source hash");
  if (provenance.repairPolicyVersion.length === 0) throw new Error("Repair provenance requires a policy version");
  if (provenance.derivedMeshFingerprint.length === 0) throw new Error("Repair provenance requires a derived mesh fingerprint");
  return Object.freeze({ mesh, provenance: Object.freeze({
    ...provenance,
    repairParameters: Object.freeze({ ...provenance.repairParameters }),
  }) });
}
