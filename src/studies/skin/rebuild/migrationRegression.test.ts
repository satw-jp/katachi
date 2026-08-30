import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  computeMeshVolume,
  computeSignedMeshVolume,
  inspectSavedStlTopology,
  roundVertexToF32,
  type Bounds,
  type MeshBuildResult,
} from "../../cloud-sculpt/meshExport.ts";
import {
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
} from "./fkei.ts";
import {
  buildSkinRebuildFinalMesh,
  skinRebuildDisconnectedPatternIds,
  type SkinRebuildProject,
} from "./model.ts";

const BASELINE_SHA256 = "4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf";

export interface MigrationProjectInvariantSnapshot {
  algorithmVersion: string;
  hostCount: number;
  patternCount: number;
  insideClassificationCount: number;
  dryWebNodeCount: number;
  dryWebEdgeCount: number;
  spiderNodeCount: number;
  spiderEdgeCount: number;
  disconnectedPatternCount: number;
  supportTargetCount: number;
  supportedTargetCount: number;
  unsupportedTargetCount: number;
  latticeConnectionCount: number;
  printSupportNodeCount: number;
  printSupportEdgeCount: number;
  finalGraphKind: string;
  finalGraphNodeCount: number;
  finalGraphEdgeCount: number;
  finalGraphInputPoints: number;
  finalGraphCandidateEdges: number;
  finalGraphRequestedTargets: number;
  finalGraphConnectedTargets: number;
  finalGraphGridNodeCount: number;
  finalGraphGridEdgeCount: number;
}

export interface GeometryResultContract {
  contract: "skin-rebuild-migration-geometry-result-v1";
  producer: {
    backend: string;
    implementationVersion: string;
  };
  resolution: number;
  triangleCount: number;
  uniqueSavedVertexCount: number;
  boundsMm: Bounds;
  volumeMm3: number;
  signedVolumeMm3: number;
  topology: {
    watertight: boolean;
    closed: boolean;
    windingConsistent: boolean;
    degenerateFree: boolean;
    connectedComponents: number;
    openEdges: number;
    nonManifoldEdges: number;
    windingInconsistentEdges: number;
    degenerateTriangleCount: number;
    nonFiniteTriangleCount: number;
    totalEdges: number;
  };
  repair: {
    removedSavedDegenerateTriangleCount: number;
    repairedSavedTriangleHoleCount: number;
  };
}

export interface ScalarTolerance {
  absolute: number;
  relative: number;
}

export interface GeometryComparisonTolerances {
  boundsMm: ScalarTolerance;
  volumeMm3: ScalarTolerance;
  triangleCountAbsolute: number;
  uniqueVertexCountAbsolute: number;
  topologyEdgeCountAbsolute: number;
}

export interface GeometryComparisonResult {
  ok: boolean;
  differences: string[];
}

/**
 * Strict for the current reference tessellator's discrete output, tolerant
 * only for scalar floating-point diagnostics. A future CUDA comparison can
 * pass an explicitly reviewed tolerance set without changing the result
 * contract or weakening this frozen Web-reference replay.
 */
export const REFERENCE_REPLAY_TOLERANCES: GeometryComparisonTolerances = {
  boundsMm: { absolute: 1e-6, relative: 1e-9 },
  volumeMm3: { absolute: 0.1, relative: 1e-5 },
  triangleCountAbsolute: 0,
  uniqueVertexCountAbsolute: 0,
  topologyEdgeCountAbsolute: 0,
};

export const EXPECTED_PROJECT_INVARIANTS: MigrationProjectInvariantSnapshot = {
  algorithmVersion: "skin-rebuild-first-print-v1",
  hostCount: 12,
  patternCount: 38,
  insideClassificationCount: 38,
  dryWebNodeCount: 0,
  dryWebEdgeCount: 0,
  spiderNodeCount: 251,
  spiderEdgeCount: 270,
  disconnectedPatternCount: 0,
  supportTargetCount: 20,
  supportedTargetCount: 20,
  unsupportedTargetCount: 0,
  latticeConnectionCount: 20,
  printSupportNodeCount: 134,
  printSupportEdgeCount: 67,
  finalGraphKind: "targetedGrid",
  finalGraphNodeCount: 251,
  finalGraphEdgeCount: 270,
  finalGraphInputPoints: 251,
  finalGraphCandidateEdges: 270,
  finalGraphRequestedTargets: 20,
  finalGraphConnectedTargets: 20,
  finalGraphGridNodeCount: 251,
  finalGraphGridEdgeCount: 270,
};

export const EXPECTED_GEOMETRY_RESULT: GeometryResultContract = {
  contract: "skin-rebuild-migration-geometry-result-v1",
  producer: {
    backend: "web-reference",
    implementationVersion: "skin-rebuild-first-print-v1",
  },
  resolution: 68,
  triangleCount: 59_524,
  uniqueSavedVertexCount: 29_688,
  boundsMm: {
    min: { x: -16.418080158393266, y: -16.41979897472664, z: 0 },
    max: { x: 16.205030611769825, y: 15.915166077607056, z: 80 },
    size: { x: 32.623110770163095, y: 32.33496505233369, z: 80 },
    longest: 80,
  },
  volumeMm3: 14_302.041001524116,
  signedVolumeMm3: 14_302.041001524116,
  topology: {
    watertight: true,
    closed: true,
    windingConsistent: true,
    degenerateFree: true,
    connectedComponents: 1,
    openEdges: 0,
    nonManifoldEdges: 0,
    windingInconsistentEdges: 0,
    degenerateTriangleCount: 0,
    nonFiniteTriangleCount: 0,
    totalEdges: 89_286,
  },
  repair: {
    removedSavedDegenerateTriangleCount: 0,
    repairedSavedTriangleHoleCount: 0,
  },
};

export function captureMigrationProjectInvariants(
  project: SkinRebuildProject,
): MigrationProjectInvariantSnapshot {
  const finalStats = project.finalGraph.stats;
  return {
    algorithmVersion: project.algorithmVersion,
    hostCount: project.base.host.length,
    patternCount: project.patterns.length,
    insideClassificationCount: project.patternSides.filter((side) => side.baseSideIsInside).length,
    dryWebNodeCount: project.dryWeb.nodes.length,
    dryWebEdgeCount: project.dryWeb.edges.length,
    spiderNodeCount: project.lattice.nodes.length,
    spiderEdgeCount: project.lattice.edges.length,
    disconnectedPatternCount: skinRebuildDisconnectedPatternIds(
      project.patternSides,
      project.finalGraph,
    ).length,
    supportTargetCount: project.audit.overhangTargetCount,
    supportedTargetCount: project.audit.supportedTargetCount,
    unsupportedTargetCount: project.audit.unsupportedTargetCount,
    latticeConnectionCount: project.latticeConnections.length,
    printSupportNodeCount: project.printSupport.nodes.length,
    printSupportEdgeCount: project.printSupport.edges.length,
    finalGraphKind: project.finalGraph.kind,
    finalGraphNodeCount: project.finalGraph.nodes.length,
    finalGraphEdgeCount: project.finalGraph.edges.length,
    finalGraphInputPoints: finalStats.inputPoints,
    finalGraphCandidateEdges: finalStats.candidateEdges,
    finalGraphRequestedTargets: finalStats.requestedTargets ?? 0,
    finalGraphConnectedTargets: finalStats.connectedTargets ?? 0,
    finalGraphGridNodeCount: finalStats.gridNodeCount ?? 0,
    finalGraphGridEdgeCount: finalStats.gridEdgeCount ?? 0,
  };
}

function countUniqueSavedVertices(mesh: MeshBuildResult): number {
  const keys = new Set<string>();
  for (const triangle of mesh.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      const saved = roundVertexToF32(point, mesh.scaleMmPerUnit);
      keys.add(`${saved.x},${saved.y},${saved.z}`);
    }
  }
  return keys.size;
}

export function captureGeometryResult(
  mesh: MeshBuildResult,
  resolution: number,
  producer: GeometryResultContract["producer"] = {
    backend: "web-reference",
    implementationVersion: "skin-rebuild-first-print-v1",
  },
): GeometryResultContract {
  const topology = inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit);
  return {
    contract: "skin-rebuild-migration-geometry-result-v1",
    producer: { ...producer },
    resolution,
    triangleCount: mesh.triangles.length,
    uniqueSavedVertexCount: countUniqueSavedVertices(mesh),
    boundsMm: structuredClone(mesh.mmBounds),
    volumeMm3: computeMeshVolume(mesh),
    signedVolumeMm3: computeSignedMeshVolume(mesh),
    topology: {
      watertight: topology.ok,
      closed: topology.closed,
      windingConsistent: topology.windingConsistent,
      degenerateFree: topology.degenerateFree,
      connectedComponents: topology.connectedComponents,
      openEdges: topology.openEdges,
      nonManifoldEdges: topology.nonManifoldEdges,
      windingInconsistentEdges: topology.windingInconsistentEdges,
      degenerateTriangleCount: topology.degenerateTriangleCount,
      nonFiniteTriangleCount: topology.nonFiniteTriangleCount,
      totalEdges: topology.totalEdges,
    },
    repair: {
      removedSavedDegenerateTriangleCount: mesh.removedSavedDegenerateTriangleCount ?? 0,
      repairedSavedTriangleHoleCount: mesh.repairedSavedTriangleHoleCount ?? 0,
    },
  };
}

function withinTolerance(
  reference: number,
  candidate: number,
  tolerance: ScalarTolerance,
): boolean {
  return Math.abs(candidate - reference) <= tolerance.absolute
    + Math.abs(reference) * tolerance.relative;
}

function compareScalar(
  differences: string[],
  label: string,
  reference: number,
  candidate: number,
  tolerance: ScalarTolerance,
): void {
  if (!Number.isFinite(reference) || !Number.isFinite(candidate)
    || !withinTolerance(reference, candidate, tolerance)) {
    differences.push(`${label}: reference=${reference}, candidate=${candidate}`);
  }
}

function compareCount(
  differences: string[],
  label: string,
  reference: number,
  candidate: number,
  absoluteTolerance: number,
): void {
  if (!Number.isSafeInteger(reference) || !Number.isSafeInteger(candidate)
    || Math.abs(candidate - reference) > absoluteTolerance) {
    differences.push(`${label}: reference=${reference}, candidate=${candidate}`);
  }
}

/**
 * Backend-neutral comparison entry point. Candidate adapters normalize their
 * output into GeometryResultContract; backend names are evidence and are not
 * compared as shape facts.
 */
export function compareGeometryResult(
  reference: GeometryResultContract,
  candidate: GeometryResultContract,
  tolerances: GeometryComparisonTolerances,
): GeometryComparisonResult {
  const differences: string[] = [];
  if (reference.contract !== candidate.contract) {
    differences.push(`contract: reference=${reference.contract}, candidate=${candidate.contract}`);
  }
  compareCount(differences, "resolution", reference.resolution, candidate.resolution, 0);
  compareCount(
    differences,
    "triangleCount",
    reference.triangleCount,
    candidate.triangleCount,
    tolerances.triangleCountAbsolute,
  );
  compareCount(
    differences,
    "uniqueSavedVertexCount",
    reference.uniqueSavedVertexCount,
    candidate.uniqueSavedVertexCount,
    tolerances.uniqueVertexCountAbsolute,
  );
  for (const axis of ["x", "y", "z"] as const) {
    compareScalar(
      differences,
      `boundsMm.min.${axis}`,
      reference.boundsMm.min[axis],
      candidate.boundsMm.min[axis],
      tolerances.boundsMm,
    );
    compareScalar(
      differences,
      `boundsMm.max.${axis}`,
      reference.boundsMm.max[axis],
      candidate.boundsMm.max[axis],
      tolerances.boundsMm,
    );
    compareScalar(
      differences,
      `boundsMm.size.${axis}`,
      reference.boundsMm.size[axis],
      candidate.boundsMm.size[axis],
      tolerances.boundsMm,
    );
  }
  compareScalar(
    differences,
    "boundsMm.longest",
    reference.boundsMm.longest,
    candidate.boundsMm.longest,
    tolerances.boundsMm,
  );
  compareScalar(
    differences,
    "volumeMm3",
    reference.volumeMm3,
    candidate.volumeMm3,
    tolerances.volumeMm3,
  );
  compareScalar(
    differences,
    "signedVolumeMm3",
    reference.signedVolumeMm3,
    candidate.signedVolumeMm3,
    tolerances.volumeMm3,
  );

  for (const key of [
    "watertight",
    "closed",
    "windingConsistent",
    "degenerateFree",
  ] as const) {
    if (reference.topology[key] !== candidate.topology[key]) {
      differences.push(`topology.${key}: reference=${reference.topology[key]}, candidate=${candidate.topology[key]}`);
    }
  }
  for (const key of [
    "connectedComponents",
    "openEdges",
    "nonManifoldEdges",
    "windingInconsistentEdges",
    "degenerateTriangleCount",
    "nonFiniteTriangleCount",
  ] as const) {
    compareCount(differences, `topology.${key}`, reference.topology[key], candidate.topology[key], 0);
  }
  compareCount(
    differences,
    "topology.totalEdges",
    reference.topology.totalEdges,
    candidate.topology.totalEdges,
    tolerances.topologyEdgeCountAbsolute,
  );
  compareCount(
    differences,
    "repair.removedSavedDegenerateTriangleCount",
    reference.repair.removedSavedDegenerateTriangleCount,
    candidate.repair.removedSavedDegenerateTriangleCount,
    0,
  );
  compareCount(
    differences,
    "repair.repairedSavedTriangleHoleCount",
    reference.repair.repairedSavedTriangleHoleCount,
    candidate.repair.repairedSavedTriangleHoleCount,
    0,
  );
  return { ok: differences.length === 0, differences };
}

const baselineBytes = readFileSync(new URL(
  "../../../../public/samples/skin-rebuild-first-print.fkei",
  import.meta.url,
));
assert.equal(
  createHash("sha256").update(baselineBytes).digest("hex"),
  BASELINE_SHA256,
  "the migration fixture itself must never change",
);

const document = parseSkinRebuildFkei(baselineBytes.toString("utf8"));
const project = projectFromSkinRebuildFkei(document);
assert.deepEqual(
  captureMigrationProjectInvariants(project),
  EXPECTED_PROJECT_INVARIANTS,
  "parsed/restored first-print project invariants changed",
);

const mesh = buildSkinRebuildFinalMesh(project, document.project.settings.exportResolution);
const actualGeometry = captureGeometryResult(mesh, document.project.settings.exportResolution);
const comparison = compareGeometryResult(
  EXPECTED_GEOMETRY_RESULT,
  actualGeometry,
  REFERENCE_REPLAY_TOLERANCES,
);
assert.deepEqual(comparison.differences, [], "first-print geometry regression:\n" + comparison.differences.join("\n"));

const equivalentCandidate: GeometryResultContract = {
  ...structuredClone(actualGeometry),
  producer: {
    backend: "candidate-contract-smoke-test",
    implementationVersion: "future",
  },
};
assert.equal(
  compareGeometryResult(actualGeometry, equivalentCandidate, REFERENCE_REPLAY_TOLERANCES).ok,
  true,
  "backend provenance must not be mistaken for a geometry difference",
);
const changedCandidate = structuredClone(equivalentCandidate);
changedCandidate.volumeMm3 += 10;
assert.equal(
  compareGeometryResult(actualGeometry, changedCandidate, REFERENCE_REPLAY_TOLERANCES).ok,
  false,
  "the contract comparator must reject an out-of-tolerance candidate",
);

console.log("SKIN REBUILD migration regression passed", JSON.stringify({
  project: EXPECTED_PROJECT_INVARIANTS,
  geometry: EXPECTED_GEOMETRY_RESULT,
}));
