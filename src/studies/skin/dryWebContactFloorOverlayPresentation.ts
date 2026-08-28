import type { ArtworkGraph } from "./artworkGraph.ts";
import { representativePatchPoint, type ArtworkGraphOverlayPosition } from "./artworkGraphOverlayPresentation.ts";
import {
  type DryWebContactFloorCategory,
  type DryWebContactFloorPresentation,
} from "./dryWebContactFloorPresentation.ts";

export const DRY_WEB_CONTACT_FLOOR_OVERLAY_COPY =
  "中立wire marker · 接触数・強度・printabilityの色ではありません";

export type DryWebContactFloorOverlayState = "off" | "missing" | "running" | "stale" | "current";

export type DryWebContactFloorResidualCategory = Exclude<DryWebContactFloorCategory, "satisfied">;

export interface DryWebContactFloorOverlayMarker {
  patchId: number;
  category: DryWebContactFloorResidualCategory;
  position: ArtworkGraphOverlayPosition;
}

export interface DryWebContactFloorOverlayPresentationInput {
  readonly current: boolean;
  readonly running: boolean;
  readonly stale: boolean;
  readonly surfaceContextVisible: boolean;
  readonly snapshot: ArtworkGraph | null;
  readonly contactFloor: DryWebContactFloorPresentation | null;
  readonly category: DryWebContactFloorCategory | null;
  readonly enabled: boolean;
}

export interface DryWebContactFloorOverlayPresentation {
  state: DryWebContactFloorOverlayState;
  available: boolean;
  enabled: boolean;
  category: DryWebContactFloorResidualCategory | null;
  markers: DryWebContactFloorOverlayMarker[];
  affectedCount: number | null;
  copy: string;
  reason: string;
}

export const DRY_WEB_CONTACT_FLOOR_RESIDUAL_CATEGORIES: readonly DryWebContactFloorResidualCategory[] = [
  "candidateShortage",
  "duplicateContactPositions",
  "outsideMainComponent",
  "plannerUnresolved",
];

function invalidPresentation(
  state: Exclude<DryWebContactFloorOverlayState, "off" | "current">,
  reason: string,
): DryWebContactFloorOverlayPresentation {
  return {
    state,
    available: false,
    enabled: false,
    category: null,
    markers: [],
    affectedCount: null,
    copy: DRY_WEB_CONTACT_FLOOR_OVERLAY_COPY,
    reason,
  };
}

function isResidualCategory(value: unknown): value is DryWebContactFloorResidualCategory {
  return DRY_WEB_CONTACT_FLOOR_RESIDUAL_CATEGORIES.includes(value as DryWebContactFloorResidualCategory);
}

function finitePosition(value: unknown): value is ArtworkGraphOverlayPosition {
  if (typeof value !== "object" || value === null) return false;
  const position = value as ArtworkGraphOverlayPosition;
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

/**
 * Locate residual patches through the current Artwork Graph snapshot only.
 * No live patch or nearest-position lookup is permitted here.
 */
export function createDryWebContactFloorOverlayPresentation(
  input: DryWebContactFloorOverlayPresentationInput,
): DryWebContactFloorOverlayPresentation {
  if (input.running) {
    return invalidPresentation("running", "Dry Web生成または再診断中です。完了後に表示できます。");
  }
  if (!input.current) {
    return input.stale
        ? invalidPresentation("stale", "旧Dry Webです。Stage 3を再Graph化し、Stage 4で再生成してください。")
        : invalidPresentation("missing", "currentの接触不足理由が未確認です。Dry Webを再生成してください。");
  }
  if (!input.surfaceContextVisible) {
    return invalidPresentation("missing", "Surfaceが見えない表示では残理由markerを表示できません。Surface表示へ戻してください。");
  }
  const floor = input.contactFloor;
  const snapshot = input.snapshot;
  const category = input.category;
  if (category === null) {
    return {
      state: "off",
      available: false,
      enabled: false,
      category: null,
      markers: [],
      affectedCount: null,
      copy: DRY_WEB_CONTACT_FLOOR_OVERLAY_COPY,
      reason: floor?.state === "current" && floor.available ? "current / 非表示" : "残理由markerは未確認です。",
    };
  }
  if (!floor || floor.state !== "current" || !floor.available || !snapshot || !isResidualCategory(category)
    || !floor.allCategoryPatchIds || !floor.categoryCounts || floor.categoryCounts[category] <= 0
    || floor.allCategoryPatchIds[category].length !== floor.categoryCounts[category]) {
    return invalidPresentation("missing", "currentの残理由factsまたはStage 3 snapshotが不完全です。古いmarkerを表示しません。再生成してください。");
  }

  const nodesByPatchId = new Map<number, ArtworkGraph["surfaceDraft"]["nodes"][number]>();
  for (const node of snapshot.surfaceDraft.nodes) {
    if (!Number.isSafeInteger(node.patch.id) || nodesByPatchId.has(node.patch.id)) {
      return invalidPresentation("missing", "Stage 3 snapshotのpatch IDが不正または重複しています。再Graph化してください。");
    }
    nodesByPatchId.set(node.patch.id, node);
  }
  const markers: DryWebContactFloorOverlayMarker[] = [];
  for (const patchId of floor.allCategoryPatchIds[category]) {
    const node = nodesByPatchId.get(patchId);
    if (!node) {
      return invalidPresentation("missing", "残理由patch IDをcurrent Stage 3 snapshotへ解決できません。再Graph化してください。");
    }
    const position = representativePatchPoint(node.patch);
    if (!finitePosition(position)) {
      return invalidPresentation("missing", "Stage 3 snapshotの代表点が不正です。再Graph化してください。");
    }
    markers.push({ patchId, category, position: { ...position } });
  }
  const enabled = input.enabled;
  return {
    state: "current",
    available: true,
    enabled,
    category,
    markers: enabled ? markers : [],
    affectedCount: markers.length,
    copy: DRY_WEB_CONTACT_FLOOR_OVERLAY_COPY,
    reason: enabled
      ? `${category} · ${markers.length}要素を表示`
      : "current / 非表示",
  };
}

/** OFF is an explicit presentation state, not a facts invalidation. */
export function disableDryWebContactFloorOverlay(
  presentation: DryWebContactFloorOverlayPresentation,
): DryWebContactFloorOverlayPresentation {
  return presentation.state === "current"
    ? { ...presentation, enabled: false, markers: [], reason: "current / 非表示" }
    : { ...presentation, enabled: false, markers: [] };
}
