export const DRY_WEB_INSIDE_TARGET_DISPLAY_CAP = 40_000;

export type DryWebInsideTargetPresentationState = "missing" | "running" | "stale" | "current";

export interface DryWebInsideTargetSource {
  readonly assignmentId?: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal?: { readonly x: number; readonly y: number; readonly z: number };
  readonly markerRadius: number;
  readonly basis: "sourceSphere" | "finalMesh";
  /** Optional defensive input marker; the canonical target source has only inside targets. */
  readonly classification?: "inside" | "outside" | "unresolved";
}

export interface DryWebInsideTargetOverlayMarker {
  readonly id: string;
  readonly classification: "inside";
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal?: { readonly x: number; readonly y: number; readonly z: number };
  readonly markerRadius: number;
}

export interface DryWebInsideTargetPresentationInput {
  readonly state: DryWebInsideTargetPresentationState;
  /** Existing targetedSupportSource.targets only; never derive from live faces. */
  readonly targets: readonly DryWebInsideTargetSource[] | null;
  readonly visible: boolean;
}

export interface DryWebInsideTargetPresentation {
  readonly state: DryWebInsideTargetPresentationState;
  readonly available: boolean;
  readonly visible: boolean;
  readonly totalTargetCount: number | null;
  readonly displaySampleCount: number | null;
  readonly stride: number | null;
  readonly markers: readonly DryWebInsideTargetOverlayMarker[];
  readonly reason: string;
  readonly copy: string;
}

const COPY =
  "final Surfaceのinside site由来 · support-derived provisional · Base Shape実体anchorではない · 接続・強度・mesh・printability未判定";

function finitePoint(point: { readonly x: number; readonly y: number; readonly z: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function isCanonicalInsideTarget(
  target: DryWebInsideTargetSource,
): target is DryWebInsideTargetSource & { readonly assignmentId: string } {
  return target.basis === "finalMesh"
    && typeof target.assignmentId === "string"
    && target.assignmentId.length > 0
    && (target.classification === undefined || target.classification === "inside")
    && finitePoint(target.position)
    && (!target.normal || finitePoint(target.normal))
    && Number.isFinite(target.markerRadius)
    && target.markerRadius > 0;
}

function markersForTargets(
  targets: readonly DryWebInsideTargetSource[],
): { targets: Array<DryWebInsideTargetSource & { readonly assignmentId: string }>; stride: number } | null {
  const canonicalEntries = targets.filter((target) => target.basis === "finalMesh" && target.assignmentId !== undefined);
  const insideEntries = canonicalEntries.filter((target) => target.classification === undefined || target.classification === "inside");
  const insideTargets = insideEntries.filter(isCanonicalInsideTarget);
  // A malformed inside entry in the canonical source is not silently counted
  // as a display sample. Explicit outside/unresolved entries are excluded by
  // design; the production targetedSupportSource has only inside entries.
  if (insideEntries.length !== insideTargets.length) return null;
  const stride = Math.max(1, Math.ceil(insideTargets.length / DRY_WEB_INSIDE_TARGET_DISPLAY_CAP));
  return { targets: insideTargets, stride };
}

function copyMarker(target: DryWebInsideTargetSource & { readonly assignmentId: string }): DryWebInsideTargetOverlayMarker {
  return {
    id: target.assignmentId,
    classification: "inside",
    position: { x: target.position.x, y: target.position.y, z: target.position.z },
    ...(target.normal ? { normal: { x: target.normal.x, y: target.normal.y, z: target.normal.z } } : {}),
    markerRadius: target.markerRadius,
  };
}

/**
 * Select only current final-Surface inside sites for a presentation overlay.
 * The helper copies all coordinates, preserves source order, and never
 * changes the supplied target array or its nested values.
 */
export function createDryWebInsideTargetPresentation(
  input: DryWebInsideTargetPresentationInput,
): DryWebInsideTargetPresentation {
  if (input.state !== "current") {
    const reason = input.state === "running"
      ? "Dry Web生成または再診断中です。旧count/overlayは表示しません。"
      : input.state === "stale"
        ? "inside接続候補がstaleです。Stage 4でDry Webを再生成・再診断してください。"
        : "inside接続候補は未確認です。Stage 4のDry Web生成を実行してください。";
    return {
      state: input.state,
      available: false,
      visible: false,
      totalTargetCount: null,
      displaySampleCount: null,
      stride: null,
      markers: [],
      reason,
      copy: COPY,
    };
  }

  const source = input.targets;
  if (!source) {
    return {
      state: "current",
      available: false,
      visible: false,
      totalTargetCount: null,
      displaySampleCount: null,
      stride: null,
      markers: [],
      reason: "currentのinside接続候補sourceがありません。旧count/overlayは表示しません。",
      copy: COPY,
    };
  }
  const selected = markersForTargets(source);
  if (!selected) {
    return {
      state: "current",
      available: false,
      visible: false,
      totalTargetCount: null,
      displaySampleCount: null,
      stride: null,
      markers: [],
      reason: "currentのinside接続候補sourceを安全に読み出せません。旧count/overlayは表示しません。",
      copy: COPY,
    };
  }

  const samples = selected.targets.filter((_, index) => index % selected.stride === 0).map(copyMarker);
  return {
    state: "current",
    available: true,
    visible: input.visible,
    totalTargetCount: selected.targets.length,
    displaySampleCount: samples.length,
    stride: selected.stride,
    markers: input.visible ? samples : [],
    reason: input.visible
      ? `inside接続候補を3D表示中 · total target ${selected.targets.length.toLocaleString()} / display sample ${samples.length.toLocaleString()} / stride ${selected.stride}`
      : `inside接続候補はcurrentです · total target ${selected.targets.length.toLocaleString()} / display sample ${samples.length.toLocaleString()} / stride ${selected.stride} · overlay OFF`,
    copy: COPY,
  };
}
