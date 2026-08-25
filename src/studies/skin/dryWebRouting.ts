import type { OverhangAssignmentEntry, OverhangDryWebTarget } from "./overhangSupportPolicy.ts";

export interface DryWebRoutingFacts {
  automaticDryWebCount: number;
  blueAddedCount: number;
  orangeExcludedCount: number;
  finalDryWebCount: number;
}

export interface DryWebRoutingResult {
  targets: OverhangDryWebTarget[];
  facts: DryWebRoutingFacts;
}

function unitNormal(normal: OverhangAssignmentEntry["normal"]): OverhangDryWebTarget["normal"] {
  if (!normal) return undefined;
  const length = Math.hypot(normal.xMm, normal.yMm, normal.zMm);
  return length > 1e-9
    ? { x: normal.xMm / length, y: normal.yMm / length, z: normal.zMm / length }
    : undefined;
}

/**
 * Resolve the preview Dry Web ledger without looking at object lift, cradle,
 * retained verticals, or exterior-scaffold settings.
 *
 * The support-free downward-ray classification is the automatic baseline:
 * a BODY-blocked (inside) downward Surface site belongs to Dry Web even when
 * it has never been painted. Blue adds an automatic outside site; orange
 * removes an automatic inside site; Auto restores the automatic baseline.
 */
export function resolveDryWebRouting(
  entries: readonly OverhangAssignmentEntry[],
  scaleMmPerUnit: number,
): DryWebRoutingResult {
  if (!(Number.isFinite(scaleMmPerUnit) && scaleMmPerUnit > 0)) {
    throw new Error("Dry Web routing scale must be positive");
  }
  const facts: DryWebRoutingFacts = {
    automaticDryWebCount: 0,
    blueAddedCount: 0,
    orangeExcludedCount: 0,
    finalDryWebCount: 0,
  };
  const targets: OverhangDryWebTarget[] = [];
  for (const entry of entries) {
    if (entry.duplicateOf || !entry.positionMm || entry.classification === "unresolved") continue;
    const automatic = entry.automaticClassification ?? entry.classification;
    const automaticDryWeb = automatic === "inside";
    const finalDryWeb = entry.classification === "inside";
    if (automaticDryWeb) facts.automaticDryWebCount++;
    if (!automaticDryWeb && finalDryWeb && entry.supportPaintMode === "inside") facts.blueAddedCount++;
    if (automaticDryWeb && !finalDryWeb && entry.supportPaintMode === "outside") facts.orangeExcludedCount++;
    if (!finalDryWeb) continue;
    targets.push({
      assignmentId: entry.id,
      ...(entry.patchId === undefined ? {} : { patchId: entry.patchId }),
      position: {
        x: entry.positionMm.xMm / scaleMmPerUnit,
        y: entry.positionMm.yMm / scaleMmPerUnit,
        z: entry.positionMm.zMm / scaleMmPerUnit,
      },
      ...(unitNormal(entry.normal) ? { normal: unitNormal(entry.normal) } : {}),
      markerRadius: 0.035,
      reachedByInternal: false,
      basis: "finalMesh",
    });
  }
  facts.finalDryWebCount = targets.length;
  return { targets, facts };
}

export function dryWebRoutingFactsText(facts: DryWebRoutingFacts): string {
  return `自動Dry Web ${facts.automaticDryWebCount.toLocaleString()} / `
    + `青追加 ${facts.blueAddedCount.toLocaleString()} / `
    + `橙除外 ${facts.orangeExcludedCount.toLocaleString()} / `
    + `最終 ${facts.finalDryWebCount.toLocaleString()}`;
}
