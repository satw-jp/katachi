import { canonicalStringify } from "../graphCore.ts";
import type {
  ArtifactRegistry,
  GraphSummary,
  RegisteredArtifact,
} from "./contracts.ts";
import { GOLDEN_ARTIFACT_IDS, type ArtifactSummaryData, type GoldenAdapterArtifact, type GoldenArtifactId } from "./goldenAdapter.ts";

export interface ShadowArtifactComparison {
  readonly id: string;
  readonly match: boolean;
  readonly differences: readonly string[];
  readonly goldenFingerprint: string | null;
  readonly rebuildFingerprint: string | null;
}
export interface ShadowComparisonResult {
  readonly match: boolean;
  readonly differences: readonly string[];
  readonly artifacts: readonly ShadowArtifactComparison[];
}

interface ComparisonFacts {
  fingerprint: string | null;
  counts: Readonly<Record<string, number>>;
  bounds: ArtifactSummaryData["bounds"] | null;
  graph: GraphSummary | null;
  provenance: RegisteredArtifact<unknown>["provenance"] | null;
}

function dataOf(artifact: RegisteredArtifact<unknown>): ArtifactSummaryData | null {
  if (!artifact.data || typeof artifact.data !== "object") return null;
  return artifact.data as ArtifactSummaryData;
}

function graphOf(artifact: RegisteredArtifact<unknown>): GraphSummary | null {
  const graphArtifact = artifact as RegisteredArtifact<unknown> & { graph?: unknown };
  const data = dataOf(artifact);
  const graph = graphArtifact.graph ?? data?.graph;
  if (!graph || typeof graph !== "object") return null;
  const candidate = graph as Partial<GraphSummary>;
  if (!Number.isFinite(candidate.nodeCount) || !Number.isFinite(candidate.edgeCount)) return null;
  return { nodeCount: candidate.nodeCount!, edgeCount: candidate.edgeCount! };
}

function factsOf(artifact: RegisteredArtifact<unknown> | null): ComparisonFacts {
  const data = artifact ? dataOf(artifact) : null;
  return {
    fingerprint: artifact?.fingerprint ?? null,
    counts: data?.counts ?? {},
    bounds: data?.bounds ?? null,
    graph: artifact ? graphOf(artifact) : null,
    provenance: artifact?.provenance ?? null,
  };
}

function compareFacts(golden: ComparisonFacts, rebuild: ComparisonFacts): string[] {
  const differences: string[] = [];
  if (golden.fingerprint !== rebuild.fingerprint) differences.push("fingerprint");
  if (canonicalStringify(golden.counts) !== canonicalStringify(rebuild.counts)) differences.push("counts");
  if (canonicalStringify(golden.bounds) !== canonicalStringify(rebuild.bounds)) differences.push("bounds");
  if (canonicalStringify(golden.graph) !== canonicalStringify(rebuild.graph)) differences.push("graph nodes / edges");
  if (canonicalStringify(golden.provenance) !== canonicalStringify(rebuild.provenance)) differences.push("provenance");
  return differences;
}

export function compareArtifactRegistries(
  golden: ArtifactRegistry<GoldenAdapterArtifact>,
  rebuild: ArtifactRegistry<GoldenAdapterArtifact>,
  ids: readonly GoldenArtifactId[] = GOLDEN_ARTIFACT_IDS,
): ShadowComparisonResult {
  const artifacts = ids.map((id): ShadowArtifactComparison => {
    const goldenArtifact = golden.get(id);
    const rebuildArtifact = rebuild.get(id);
    const differences = goldenArtifact && rebuildArtifact
      ? compareFacts(factsOf(goldenArtifact), factsOf(rebuildArtifact))
      : [goldenArtifact ? "rebuild artifact missing" : "golden artifact missing"];
    return {
      id,
      match: differences.length === 0,
      differences,
      goldenFingerprint: goldenArtifact?.fingerprint ?? null,
      rebuildFingerprint: rebuildArtifact?.fingerprint ?? null,
    };
  });
  const differences = artifacts.flatMap((artifact) => artifact.differences.map((difference) => `${artifact.id}: ${difference}`));
  return {
    match: differences.length === 0,
    differences,
    artifacts,
  };
}
