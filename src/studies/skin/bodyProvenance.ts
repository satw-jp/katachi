/** Strict v1 binding between a replayed recipe and a reusable gate BODY STL. */
export const BODY_PROVENANCE_FORMAT = "katachi-skin-body-provenance";
export const BODY_PROVENANCE_ID = "v1";

export interface BodyProvenanceV1 {
  format: typeof BODY_PROVENANCE_FORMAT;
  id: typeof BODY_PROVENANCE_ID;
  recipeSha256: string;
  bodyStlSha256: string;
  targetLongestMm: number;
  resolution: number;
  internalStructure: "targetedGrid" | "voronoiEdge";
  expectedGraphNodes: number;
  expectedGraphEdges: number;
}

const REQUIRED_KEYS = [
  "format", "id", "recipeSha256", "bodyStlSha256", "targetLongestMm", "resolution",
  "internalStructure", "expectedGraphNodes", "expectedGraphEdges",
] as const;

function fail(message: string): never { throw new Error(`Fail closed: BODY provenance ${message}`); }

function requireHash(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(`${field} must be a lowercase SHA-256 hex string`);
  return value;
}

function requirePositiveFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) fail(`${field} must be a positive finite number`);
  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(`${field} must be a non-negative integer`);
  return value;
}

export function parseBodyProvenance(value: unknown): BodyProvenanceV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("must be a JSON object");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...REQUIRED_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail("v1 schema keys do not match exactly");
  if (record.format !== BODY_PROVENANCE_FORMAT || record.id !== BODY_PROVENANCE_ID) fail("format/id is not katachi-skin-body-provenance v1");
  const internalStructure = record.internalStructure;
  if (internalStructure !== "targetedGrid" && internalStructure !== "voronoiEdge") fail("internalStructure is not supported");
  const resolution = requireNonNegativeInteger(record.resolution, "resolution");
  if (resolution < 16) fail("resolution must be at least 16");
  return {
    format: BODY_PROVENANCE_FORMAT,
    id: BODY_PROVENANCE_ID,
    recipeSha256: requireHash(record.recipeSha256, "recipeSha256"),
    bodyStlSha256: requireHash(record.bodyStlSha256, "bodyStlSha256"),
    targetLongestMm: requirePositiveFinite(record.targetLongestMm, "targetLongestMm"),
    resolution,
    internalStructure,
    expectedGraphNodes: requireNonNegativeInteger(record.expectedGraphNodes, "expectedGraphNodes"),
    expectedGraphEdges: requireNonNegativeInteger(record.expectedGraphEdges, "expectedGraphEdges"),
  };
}

export function validateBodyProvenanceInput(
  provenance: BodyProvenanceV1,
  actual: Pick<BodyProvenanceV1, "recipeSha256" | "bodyStlSha256" | "targetLongestMm" | "resolution" | "internalStructure">,
): void {
  for (const key of ["recipeSha256", "bodyStlSha256", "targetLongestMm", "resolution", "internalStructure"] as const) {
    if (provenance[key] !== actual[key]) fail(`${key} does not match the requested reusable BODY input`);
  }
}

export function validateBodyProvenanceGraph(provenance: BodyProvenanceV1, graph: { nodes: { length: number }; edges: { length: number } }): void {
  if (provenance.expectedGraphNodes !== graph.nodes.length || provenance.expectedGraphEdges !== graph.edges.length) {
    fail(`expected graph ${provenance.expectedGraphNodes}/${provenance.expectedGraphEdges} does not match replayed graph ${graph.nodes.length}/${graph.edges.length}`);
  }
}
