import type { FinishedSkinBodySdfInput } from "../../../src/studies/skin/meshExport.ts";
import { reinforceQuadConnectionsForMesh } from "../../../src/studies/skin/meshExport.ts";
import type { GeometryComputePoint } from "./contracts.ts";
import { encodeFinishedBodySnapshot } from "../finished-body-shadow-transport.mjs";

export const FINISHED_BODY_FIELD_SNAPSHOT_CONTRACT =
  "katachi.skin.finished-body-field-snapshot.v1" as const;
export const FINISHED_BODY_SDF_ALGORITHM =
  "katachi.skin.finished-body-sdf-grid.v1" as const;

export interface FinishedBodySnapshotPoint extends GeometryComputePoint { r: number }
export interface FinishedBodySnapshotCapsule {
  edgeIndex: number;
  start: GeometryComputePoint;
  end: GeometryComputePoint;
  radius: number;
}

/**
 * Immutable transport derivative of the production Finished BODY field.
 * It contains realized primitives only; no FKEI/model state and no removable
 * Support/scaffold primitive can enter this contract.
 */
export interface FinishedBodyFieldSnapshotV1 {
  contract: typeof FINISHED_BODY_FIELD_SNAPSHOT_CONTRACT;
  version: 1;
  algorithmContract: typeof FINISHED_BODY_SDF_ALGORITHM;
  projectFingerprint: `sha256:${string}`;
  geometryFingerprint: `sha256:${string}`;
  coordinateContract: Readonly<{
    frame: "object";
    unitsPerMillimeter: number;
    handedness: "right";
    buildAxis: "+z";
  }>;
  mode: "plate";
  hostK: number;
  thickness: number;
  roundK: number;
  coinBulge: 0;
  coinBulgeBalance: 0;
  quadMeshJoinWidth: 0;
  capsuleBlend: number;
  host: readonly FinishedBodySnapshotPoint[];
  flatPoints: readonly FinishedBodySnapshotPoint[];
  raisedPoints: readonly FinishedBodySnapshotPoint[];
  capsules: readonly FinishedBodySnapshotCapsule[];
  sourceCounts: Readonly<{
    baseBalls: number;
    surfacePatterns: number;
    permanentGraphNodes: number;
    permanentGraphEdges: number;
    reinforcedConnectionPoints: number;
    removableSupportPrimitives: 0;
  }>;
  byteLength: number;
  payload: Buffer;
}

function immutablePoint(point: GeometryComputePoint & { r: number }): FinishedBodySnapshotPoint {
  return Object.freeze({ x: point.x, y: point.y, z: point.z, r: point.r });
}

export function createFinishedBodyFieldSnapshotV1(
  input: FinishedSkinBodySdfInput,
  {
    projectFingerprint,
    unitsPerMillimeter,
  }: { projectFingerprint: `sha256:${string}`; unitsPerMillimeter: number },
): FinishedBodyFieldSnapshotV1 {
  // This first GPU prototype is deliberately exact for the current Print #002
  // recipe, rather than silently approximating the other production branches.
  if (input.mode !== "plate" || input.coinBulge !== 0
    || (input.coinBulgeBalance ?? 0) !== 0 || (input.quadMeshJoinWidth ?? 0) !== 0) {
    throw new Error("Finished BODY CUDA prototype supports plate, coinBulge=0 and quadMeshJoinWidth=0 only");
  }
  if (!/^sha256:[0-9a-f]{64}$/i.test(projectFingerprint)
    || !Number.isFinite(unitsPerMillimeter) || !(unitsPerMillimeter > 0)) {
    throw new Error("Finished BODY snapshot identity/coordinate contract is invalid");
  }
  const reinforced = reinforceQuadConnectionsForMesh(input.patches, 0);
  const flatPoints = reinforced.patches
    .filter((patch) => patch.shape !== "ring3d" && patch.shape !== "flower")
    .flatMap((patch) => patch.points.map(immutablePoint));
  const raisedPoints = reinforced.patches
    .filter((patch) => patch.shape === "ring3d" || patch.shape === "flower")
    .flatMap((patch) => patch.points.map(immutablePoint));
  const graph = input.internalGraph ?? null;
  const capsules: FinishedBodySnapshotCapsule[] = [];
  for (let edgeIndex = 0; edgeIndex < (graph?.edges.length ?? 0); edgeIndex++) {
    const edge = graph!.edges[edgeIndex];
    const start = graph!.nodes[edge.start]?.position;
    const end = graph!.nodes[edge.end]?.position;
    if (!start || !end || !(edge.radius > 0)) continue;
    capsules.push(Object.freeze({
      edgeIndex,
      start: Object.freeze({ x: start.x, y: start.y, z: start.z }),
      end: Object.freeze({ x: end.x, y: end.y, z: end.z }),
      radius: edge.radius,
    }));
  }
  const minimumRadius = capsules.reduce((minimum, capsule) => Math.min(minimum, capsule.radius), Number.POSITIVE_INFINITY);
  const capsuleBlend = capsules.length > 0
    ? Math.min(Math.max(0.005, input.roundK), minimumRadius * 0.75)
    : 0;
  const draft = {
    contract: FINISHED_BODY_FIELD_SNAPSHOT_CONTRACT,
    version: 1 as const,
    algorithmContract: FINISHED_BODY_SDF_ALGORITHM,
    projectFingerprint,
    coordinateContract: Object.freeze({
      frame: "object" as const,
      unitsPerMillimeter,
      handedness: "right" as const,
      buildAxis: "+z" as const,
    }),
    mode: "plate" as const,
    hostK: input.hostK,
    thickness: input.thickness,
    roundK: input.roundK,
    coinBulge: 0 as const,
    coinBulgeBalance: 0 as const,
    quadMeshJoinWidth: 0 as const,
    capsuleBlend,
    host: Object.freeze(input.host.map(immutablePoint)),
    flatPoints: Object.freeze(flatPoints),
    raisedPoints: Object.freeze(raisedPoints),
    capsules: Object.freeze(capsules),
    sourceCounts: Object.freeze({
      baseBalls: input.host.length,
      surfacePatterns: input.patches.length,
      permanentGraphNodes: graph?.nodes.length ?? 0,
      permanentGraphEdges: graph?.edges.length ?? 0,
      reinforcedConnectionPoints: reinforced.reinforcedPointCount,
      removableSupportPrimitives: 0 as const,
    }),
  };
  const encoded = encodeFinishedBodySnapshot(draft);
  return Object.freeze({
    ...draft,
    geometryFingerprint: encoded.geometryFingerprint,
    byteLength: encoded.payload.length,
    payload: encoded.payload,
  });
}
