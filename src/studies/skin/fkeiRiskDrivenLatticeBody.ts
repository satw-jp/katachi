// Manual developer-level BODY rebuild for a restored checkpoint. It accepts
// only the saved Shape + canonical graph + local lattice semantics; callers
// cannot supply a plan file, STL, request, Worker result, or planner input.
import { encodeBinaryStl, inspectSavedStlTopology, orientMeshForSavedStl } from "../cloud-sculpt/meshExport.ts";
import { buildSkinMesh } from "./meshExport.ts";
import { hydrateFkeiRiskDrivenLatticeArtifact, type FkeiCanonicalDryWebArtifact, type FkeiRiskDrivenLatticeArtifact } from "./fkeiRiskDrivenLattice.ts";
import type { SkinState } from "./history.ts";
import { sha256Hex } from "../../lib/hash.ts";

export interface FkeiRiskDrivenLatticeBodyResult {
  readonly stl: ArrayBuffer;
  readonly triangleCount: number;
  readonly topology: ReturnType<typeof inspectSavedStlTopology>;
  readonly savedDiameterMm: number;
  /** Byte-exact identity of the rebuilt reviewed BODY, including STL layout. */
  readonly stlSha256: string;
}

export async function rebuildFkeiRiskDrivenLatticeBody(
  state: SkinState,
  canonical: FkeiCanonicalDryWebArtifact,
  lattice: FkeiRiskDrivenLatticeArtifact,
): Promise<FkeiRiskDrivenLatticeBodyResult> {
  const hydrated = hydrateFkeiRiskDrivenLatticeArtifact(canonical, lattice);
  const built = buildSkinMesh(state.mode, state.host, state.hostParams.k, state.skinParams.thickness,
    state.patches, state.skinParams.roundK, { resolution: 128, targetLongestMm: 80 },
    state.skinParams.coinBulge, state.skinParams.quadMeshJoinWidth, state.skinParams.coinBulgeBalance,
    hydrated.augmentedGraph);
  const repaired = orientMeshForSavedStl(built);
  const topology = inspectSavedStlTopology(repaired.triangles, repaired.scaleMmPerUnit);
  if (repaired.triangles.length !== lattice.generationFacts.triangleCount
    || !topology.closed || topology.connectedComponents !== 1 || topology.openEdges !== 0
    || topology.nonManifoldEdges !== 0 || topology.degenerateTriangleCount !== 0
    || topology.nonFiniteTriangleCount !== 0 || topology.windingInconsistentEdges !== 0) {
    throw new Error("Restored Risk-driven Lattice BODY parity/topology check failed");
  }
  const savedDiameterMm = lattice.graph.nodes[0]!.radius * 2 * repaired.scaleMmPerUnit;
  if (savedDiameterMm !== lattice.generationFacts.savedDiameterMm) throw new Error("Restored Risk-driven Lattice BODY diameter parity failed");
  // The binary STL header is part of the reviewed bytes.  Keep the original
  // audited filename here even though the browser download is named restored.
  const stl = encodeBinaryStl(repaired, "skin-risk-driven-internal-lattice-v0-res128.stl");
  const stlSha256 = await sha256Hex(stl);
  if (stlSha256 !== lattice.stlSha256) {
    throw new Error("Restored Risk-driven Lattice BODY SHA-256 does not match reviewed geometry");
  }
  return { stl, triangleCount: repaired.triangles.length, topology, savedDiameterMm, stlSha256 };
}
