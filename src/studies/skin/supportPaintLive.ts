import type {
  OverhangAssignmentEntry,
  OverhangSupportPolicyResult,
} from "./overhangSupportPolicy.ts";
import {
  buildSupportPaintFrame,
  normalizeSupportPaintPoint,
  validateSupportPaint,
  type SupportPaintApplicationFacts,
  type SupportPaintMode,
  type SupportPaintStrokeV1,
  type SupportPaintV1,
} from "./supportPaint.ts";
import { buildUniformSpatialGrid3, queryUniformSpatialGridSphere, type UniformSpatialGrid3 } from "./uniformSpatialGrid.ts";

export interface SupportPaintLiveChange {
  siteIndex: number;
  id: string;
  classification: "inside" | "outside" | "unresolved";
  automaticClassification: "inside" | "outside" | "unresolved";
  supportPaintStrokeOrder: number | undefined;
  supportPaintMode: SupportPaintMode | undefined;
  manuallyPainted: boolean;
  manuallyOverridden: boolean;
}

export interface SupportPaintLiveSnapshot {
  changes: SupportPaintLiveChange[];
  facts: SupportPaintApplicationFacts;
}

interface MutableCounts {
  inside: number;
  outside: number;
  unresolved: number;
  painted: number;
  overridden: number;
  autoReset: number;
}

function unitNormal(entry: OverhangAssignmentEntry): { x: number; y: number; z: number } | null {
  const normal = entry.normal;
  if (!normal) return null;
  const length = Math.hypot(normal.xMm, normal.yMm, normal.zMm);
  return length > 1e-9
    ? { x: normal.xMm / length, y: normal.yMm / length, z: normal.zMm / length }
    : null;
}

function liveChange(siteIndex: number, entry: OverhangAssignmentEntry): SupportPaintLiveChange {
  return {
    siteIndex,
    id: entry.id,
    classification: entry.classification,
    automaticClassification: entry.automaticClassification ?? entry.classification,
    supportPaintStrokeOrder: entry.supportPaintStrokeOrder,
    supportPaintMode: entry.supportPaintMode,
    manuallyPainted: entry.manuallyPainted === true,
    manuallyOverridden: entry.manuallyOverridden === true,
  };
}

function signature(entry: OverhangAssignmentEntry): string {
  return [
    entry.classification,
    entry.supportPaintStrokeOrder ?? "",
    entry.supportPaintMode ?? "",
    entry.manuallyPainted === true ? 1 : 0,
    entry.manuallyOverridden === true ? 1 : 0,
  ].join("|");
}

export class SupportPaintLiveState {
  private readonly entries: OverhangAssignmentEntry[];
  private readonly eligibleSiteIndices: number[] = [];
  private readonly grid: UniformSpatialGrid3 | null;
  private readonly automaticCounts: { inside: number; outside: number; unresolved: number };
  private readonly counts: MutableCounts;
  private strokeCount = 0;

  constructor(
    automaticResult: OverhangSupportPolicyResult,
    supportSurfacePositionsMm: Float32Array,
    initialPaint: SupportPaintV1 | null,
  ) {
    const frame = buildSupportPaintFrame(supportSurfacePositionsMm);
    this.entries = automaticResult.entries.map((source) => {
      const automaticClassification = source.automaticClassification ?? source.classification;
      return {
        ...source,
        automaticClassification,
        classification: automaticClassification,
        supportPaintStrokeOrder: undefined,
        supportPaintMode: undefined,
        manuallyPainted: false,
        manuallyOverridden: false,
      };
    });
    const normalizedPoints: number[] = [];
    for (let index = 0; index < this.entries.length; index++) {
      const entry = this.entries[index];
      if (entry.classification === "unresolved" || !entry.positionMm || !unitNormal(entry)) continue;
      const normalized = normalizeSupportPaintPoint(entry.positionMm, frame);
      this.eligibleSiteIndices.push(index);
      normalizedPoints.push(normalized.x, normalized.y, normalized.z);
    }
    this.grid = normalizedPoints.length > 0 ? buildUniformSpatialGrid3(new Float32Array(normalizedPoints), 1 / 64) : null;
    this.automaticCounts = {
      inside: automaticResult.counts.insideSupportSite,
      outside: automaticResult.counts.outsideSupportSite,
      unresolved: automaticResult.counts.unresolvedSupportSite,
    };
    this.counts = {
      ...this.automaticCounts,
      painted: 0,
      overridden: 0,
      autoReset: 0,
    };
    if (initialPaint) this.replace(initialPaint);
  }

  private adjustBefore(entry: OverhangAssignmentEntry, direction: -1 | 1): void {
    this.counts[entry.classification] += direction;
    if (entry.manuallyPainted) this.counts.painted += direction;
    if (entry.manuallyOverridden) this.counts.overridden += direction;
    if (entry.supportPaintMode === "auto") this.counts.autoReset += direction;
  }

  private facts(): SupportPaintApplicationFacts {
    return {
      strokeCount: this.strokeCount,
      automaticCounts: { ...this.automaticCounts },
      paintedSupportSiteCount: this.counts.painted,
      manualOverrideSupportSiteCount: this.counts.overridden,
      autoResetSupportSiteCount: this.counts.autoReset,
      finalCounts: {
        inside: this.counts.inside,
        outside: this.counts.outside,
        unresolved: this.counts.unresolved,
      },
    };
  }

  applyDab(stroke: SupportPaintStrokeV1): SupportPaintLiveSnapshot {
    const changes: SupportPaintLiveChange[] = [];
    const candidates = this.grid ? queryUniformSpatialGridSphere(this.grid, stroke.centerNormalized, stroke.radiusNormalized) : [];
    for (const candidate of candidates) {
      const siteIndex = this.eligibleSiteIndices[candidate];
      const entry = this.entries[siteIndex];
      const normal = unitNormal(entry);
      if (!normal) continue;
      const normalDot = normal.x * stroke.surfaceNormal.x
        + normal.y * stroke.surfaceNormal.y
        + normal.z * stroke.surfaceNormal.z;
      if (normalDot < stroke.normalCosineThreshold) continue;
      this.adjustBefore(entry, -1);
      const automaticClassification = entry.automaticClassification ?? entry.classification;
      entry.supportPaintStrokeOrder = stroke.order;
      entry.supportPaintMode = stroke.mode;
      if (stroke.mode === "auto") {
        entry.classification = automaticClassification;
        entry.manuallyPainted = false;
        entry.manuallyOverridden = false;
      } else {
        entry.classification = stroke.mode;
        entry.manuallyPainted = true;
        entry.manuallyOverridden = stroke.mode !== automaticClassification;
      }
      this.adjustBefore(entry, 1);
      changes.push(liveChange(siteIndex, entry));
    }
    this.strokeCount = Math.max(this.strokeCount, stroke.order + 1);
    return { changes, facts: this.facts() };
  }

  /** Restore an already-validated drag journal in O(changed sites). This is
   * deliberately separate from replace(), which replays every saved sample. */
  restore(snapshot: SupportPaintLiveSnapshot): SupportPaintLiveSnapshot {
    for (const change of snapshot.changes) {
      const entry = this.entries[change.siteIndex];
      if (!entry || entry.id !== change.id) {
        throw new Error(`Support Paint journal site mismatch: ${change.siteIndex} / ${change.id}`);
      }
      entry.classification = change.classification;
      entry.automaticClassification = change.automaticClassification;
      entry.supportPaintStrokeOrder = change.supportPaintStrokeOrder;
      entry.supportPaintMode = change.supportPaintMode;
      entry.manuallyPainted = change.manuallyPainted;
      entry.manuallyOverridden = change.manuallyOverridden;
    }
    const facts = snapshot.facts;
    this.counts.inside = facts.finalCounts.inside;
    this.counts.outside = facts.finalCounts.outside;
    this.counts.unresolved = facts.finalCounts.unresolved;
    this.counts.painted = facts.paintedSupportSiteCount;
    this.counts.overridden = facts.manualOverrideSupportSiteCount;
    this.counts.autoReset = facts.autoResetSupportSiteCount;
    this.strokeCount = facts.strokeCount;
    return {
      changes: snapshot.changes.map((change) => ({ ...change })),
      facts: this.facts(),
    };
  }

  replace(document: SupportPaintV1): SupportPaintLiveSnapshot {
    const paint = validateSupportPaint(document);
    const previous = this.entries.map(signature);
    this.counts.inside = this.automaticCounts.inside;
    this.counts.outside = this.automaticCounts.outside;
    this.counts.unresolved = this.automaticCounts.unresolved;
    this.counts.painted = 0;
    this.counts.overridden = 0;
    this.counts.autoReset = 0;
    this.strokeCount = 0;
    for (const entry of this.entries) {
      const automaticClassification = entry.automaticClassification ?? entry.classification;
      entry.classification = automaticClassification;
      entry.supportPaintStrokeOrder = undefined;
      entry.supportPaintMode = undefined;
      entry.manuallyPainted = false;
      entry.manuallyOverridden = false;
    }
    for (const stroke of paint.strokes) this.applyDab(stroke);
    this.strokeCount = paint.strokes.length;
    const changes: SupportPaintLiveChange[] = [];
    for (let index = 0; index < this.entries.length; index++) {
      if (signature(this.entries[index]) !== previous[index]) changes.push(liveChange(index, this.entries[index]));
    }
    return { changes, facts: this.facts() };
  }
}
