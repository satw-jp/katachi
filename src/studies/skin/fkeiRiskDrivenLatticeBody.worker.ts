import { rebuildFkeiRiskDrivenLatticeBody } from "./fkeiRiskDrivenLatticeBody.ts";
import type { FkeiCanonicalDryWebArtifact, FkeiRiskDrivenLatticeArtifact } from "./fkeiRiskDrivenLattice.ts";
import type { SkinState } from "./history.ts";

type Request = { type: "rebuild"; generation: number; state: SkinState; canonical: FkeiCanonicalDryWebArtifact; lattice: FkeiRiskDrivenLatticeArtifact };
type Result = { type: "result"; generation: number; stl: ArrayBuffer; triangleCount: number; closed: boolean; components: number; savedDiameterMm: number; stlSha256: string } | { type: "error"; generation: number; message: string };

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type !== "rebuild") return;
  try {
    const body = await rebuildFkeiRiskDrivenLatticeBody(request.state, request.canonical, request.lattice);
    const result: Result = { type: "result", generation: request.generation, stl: body.stl, triangleCount: body.triangleCount, closed: body.topology.closed, components: body.topology.connectedComponents, savedDiameterMm: body.savedDiameterMm, stlSha256: body.stlSha256 };
    (self as unknown as Worker).postMessage(result, [body.stl]);
  } catch (error) {
    const result: Result = { type: "error", generation: request.generation, message: error instanceof Error ? error.message : String(error) };
    (self as unknown as Worker).postMessage(result);
  }
};
