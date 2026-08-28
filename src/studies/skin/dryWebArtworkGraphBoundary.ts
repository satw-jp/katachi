import { cloneGraphValue } from "./graphCore.ts";
import type { ArtworkGraph } from "./artworkGraph.ts";
import type { Patch } from "./field.ts";

/** The only Stage-3 readiness states that Stage 4 needs to distinguish. */
export type DryWebArtworkGraphBoundaryStatus = "missing" | "stale" | "current";

export interface DryWebArtworkGraphBoundaryInput {
  snapshot: ArtworkGraph | null;
  /** The source key captured when the explicit Stage-3 action ran. */
  snapshotSourceKey: string | null;
  /** The canonical key for the Patch facts currently in the editor. */
  currentSourceKey: string | null;
  currentPatchSetRevision: number;
}

export interface DryWebArtworkGraphBoundaryDecision {
  status: DryWebArtworkGraphBoundaryStatus;
  canStart: boolean;
  reason: string;
}

export const DRY_WEB_ARTWORK_GRAPH_REFRESH_PROMPT =
  "Stage 3の「現在のSurfaceをArtwork Graph化」を実行/更新してください";

function hasSurfacePatchFacts(snapshot: ArtworkGraph): boolean {
  const draft = snapshot.surfaceDraft as unknown as {
    nodes?: unknown;
  };
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
  if (!Array.isArray(draft.nodes)) return false;
  return draft.nodes.every((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const patch = (node as { patch?: unknown }).patch;
    return Object.prototype.hasOwnProperty.call(node, "patch")
      && patch !== null && typeof patch === "object" && !Array.isArray(patch);
  });
}

/**
 * Decide whether Stage 4 may consume the in-memory Stage-3 snapshot.
 *
 * The source keys are deliberately supplied by the caller.  The boundary
 * does not invent a second hash or normalize Patch facts differently from
 * the existing Stage-3 source-key contract.
 */
export function inspectDryWebArtworkGraphBoundary(
  input: DryWebArtworkGraphBoundaryInput,
): DryWebArtworkGraphBoundaryDecision {
  const { snapshot, snapshotSourceKey, currentSourceKey, currentPatchSetRevision } = input;
  if (!snapshot || !snapshotSourceKey) {
    return {
      status: "missing",
      canStart: false,
      reason: `Stage 3 snapshotがありません。${DRY_WEB_ARTWORK_GRAPH_REFRESH_PROMPT}`,
    };
  }

  const matchesCurrentFacts = currentSourceKey !== null
    && snapshotSourceKey === currentSourceKey
    && snapshot.state === "surfaceDraft"
    && hasSurfacePatchFacts(snapshot)
    && snapshot.surfaceDraft.patchSetRevision === currentPatchSetRevision;
  if (!matchesCurrentFacts) {
    return {
      status: "stale",
      canStart: false,
      reason: `Stage 3 snapshotが現在のSurfaceと一致しません。${DRY_WEB_ARTWORK_GRAPH_REFRESH_PROMPT}`,
    };
  }

  return {
    status: "current",
    canStart: true,
    reason: "Stage 3 snapshotは現在のSurface Patch factsと一致しています。",
  };
}

/**
 * Extract Stage 4's Patch payload from the exact Stage-3 node order.
 * `cloneGraphValue` preserves optional graph facts without JSON round-trip
 * loss, and each call returns independent Patch/point containers.
 */
export function cloneDryWebArtworkGraphPatches(snapshot: ArtworkGraph): Patch[] {
  if (snapshot.state !== "surfaceDraft" || !hasSurfacePatchFacts(snapshot)) {
    throw new Error("Stage 3 snapshotにSurface Patch factsがありません");
  }
  return snapshot.surfaceDraft.nodes.map((node, index) => {
    if (!node.patch || typeof node.patch !== "object" || Array.isArray(node.patch)) {
      throw new Error(`Stage 3 snapshotのSurface node ${index}にPatch factsがありません`);
    }
    return cloneGraphValue(node.patch);
  });
}
