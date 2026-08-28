export type DryWebArtworkReadinessOverall = "未確認" | "調整が必要" | "候補条件通過・最終未判定";

export type DryWebArtworkReadinessEvidence =
  | "current-generator-fact"
  | "current-exact-recheck-fact"
  | "configured-only"
  | "configured-unmeasured"
  | "unmeasured";

export type DryWebArtworkReadinessStageState = "missing" | "running" | "stale" | "current";

export interface DryWebArtworkReadinessSurfaceFacts {
  readonly elementCount: number;
  readonly requiredContacts: number;
  readonly passingElementCount: number;
  readonly insufficientElementCount: number;
}

export interface DryWebArtworkReadinessGraphFacts {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly componentCount: number;
  readonly mainComponentSize: number;
}

export interface DryWebArtworkReadinessSeparationFacts {
  readonly tealFaceCount: number;
  readonly orangeFaceCount: number;
  readonly redFaceCount: number;
}

export interface DryWebArtworkReadinessInput {
  readonly stage3: DryWebArtworkReadinessStageState;
  readonly stage4: DryWebArtworkReadinessStageState;
  readonly stage7: DryWebArtworkReadinessStageState;
  /** Existing current Dry Web author/contact facts only. */
  readonly surface: DryWebArtworkReadinessSurfaceFacts | null;
  /** Existing current targetedGrid preview graph/component facts only. */
  readonly graph: DryWebArtworkReadinessGraphFacts | null;
  /** Existing current Stage 7 exact-recheck presentation only. */
  readonly separation: DryWebArtworkReadinessSeparationFacts | null;
  /** Existing UI settings; these are never treated as measurements. */
  readonly configured: {
    readonly requiredContacts: number;
    readonly minimumDiameterMm: number;
    readonly maximumUnreinforcedSpanMm: number;
  };
}

export type DryWebArtworkReadinessRowKey =
  | "surface-elements"
  | "required-contacts"
  | "surface-pass"
  | "surface-insufficient"
  | "graph-nodes"
  | "graph-edges"
  | "graph-components"
  | "graph-main-component"
  | "separation-teal"
  | "separation-orange"
  | "separation-red"
  | "minimum-diameter"
  | "maximum-unreinforced-span";

export interface DryWebArtworkReadinessRow {
  readonly key: DryWebArtworkReadinessRowKey;
  readonly label: string;
  /** `—` means that an old count was deliberately not retained. */
  readonly value: string;
  readonly evidence: DryWebArtworkReadinessEvidence;
}

export interface DryWebArtworkReadinessPresentation {
  readonly overall: DryWebArtworkReadinessOverall;
  readonly overallReason: string;
  readonly action: string;
  readonly rows: readonly DryWebArtworkReadinessRow[];
  readonly unmeasuredNote: string;
}

const UNMEASURED_NOTE =
  "未計測: mesh union / watertightness / actual diameter-span compliance / mechanical strength / printability / slicer result。"
  + "設定した1.6 mm / 12 mm（または現在値）は目標値であり、実測適合ではありません。";

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validSurface(value: DryWebArtworkReadinessSurfaceFacts | null): value is DryWebArtworkReadinessSurfaceFacts {
  return Boolean(value)
    && finiteNonNegative(value!.elementCount)
    && finiteNonNegative(value!.requiredContacts)
    && finiteNonNegative(value!.passingElementCount)
    && finiteNonNegative(value!.insufficientElementCount);
}

function validGraph(value: DryWebArtworkReadinessGraphFacts | null): value is DryWebArtworkReadinessGraphFacts {
  return Boolean(value)
    && finiteNonNegative(value!.nodeCount)
    && finiteNonNegative(value!.edgeCount)
    && Number.isInteger(value!.componentCount)
    && value!.componentCount >= 0
    && finiteNonNegative(value!.mainComponentSize);
}

function validSeparation(value: DryWebArtworkReadinessSeparationFacts | null): value is DryWebArtworkReadinessSeparationFacts {
  return Boolean(value)
    && finiteNonNegative(value!.tealFaceCount)
    && finiteNonNegative(value!.orangeFaceCount)
    && finiteNonNegative(value!.redFaceCount);
}

function count(value: number): string {
  return Math.round(value).toLocaleString();
}

function configuredMm(value: number): string {
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)} mm` : "—";
}

function factRow(
  key: DryWebArtworkReadinessRowKey,
  label: string,
  value: string | null,
  evidence: DryWebArtworkReadinessEvidence,
): DryWebArtworkReadinessRow {
  return { key, label, value: value ?? "—", evidence };
}

function unmeasuredRow(key: DryWebArtworkReadinessRowKey, label: string): DryWebArtworkReadinessRow {
  return factRow(key, label, null, "unmeasured");
}

function stage3Action(): string {
  return "Stage 3の「現在のSurfaceをArtwork Graph化」を実行/更新してください。";
}

function stage4Action(): string {
  return "Stage 4でDry Webを生成し、必要なら付加後を再診断してください。";
}

function stage7Action(): string {
  return "Stage 7でDry Web付加後の支持分離をexact再確認してください。";
}

function currentRows(
  surface: DryWebArtworkReadinessSurfaceFacts | null,
  graph: DryWebArtworkReadinessGraphFacts | null,
  separation: DryWebArtworkReadinessSeparationFacts | null,
  configured: DryWebArtworkReadinessInput["configured"],
): DryWebArtworkReadinessRow[] {
  const hasSurface = validSurface(surface);
  const hasGraph = validGraph(graph);
  const hasSeparation = validSeparation(separation);
  return [
    hasSurface
      ? factRow("surface-elements", "Surface Pattern 要素数", count(surface.elementCount), "current-generator-fact")
      : unmeasuredRow("surface-elements", "Surface Pattern 要素数"),
    Number.isFinite(configured.requiredContacts)
      ? factRow("required-contacts", "必要接触数（現在設定）", count(configured.requiredContacts), "configured-only")
      : unmeasuredRow("required-contacts", "必要接触数（現在設定）"),
    hasSurface
      ? factRow("surface-pass", "pass 要素数", count(surface.passingElementCount), "current-generator-fact")
      : unmeasuredRow("surface-pass", "pass 要素数"),
    hasSurface
      ? factRow("surface-insufficient", "insufficient 要素数", count(surface.insufficientElementCount), "current-generator-fact")
      : unmeasuredRow("surface-insufficient", "insufficient 要素数"),
    hasGraph
      ? factRow("graph-nodes", "候補 Graph node 数", count(graph.nodeCount), "current-generator-fact")
      : unmeasuredRow("graph-nodes", "候補 Graph node 数"),
    hasGraph
      ? factRow("graph-edges", "候補 Graph edge 数", count(graph.edgeCount), "current-generator-fact")
      : unmeasuredRow("graph-edges", "候補 Graph edge 数"),
    hasGraph
      ? factRow("graph-components", "候補 Graph component 数", count(graph.componentCount), "current-generator-fact")
      : unmeasuredRow("graph-components", "候補 Graph component 数"),
    hasGraph
      ? factRow("graph-main-component", "main component size", count(graph.mainComponentSize), "current-generator-fact")
      : unmeasuredRow("graph-main-component", "main component size"),
    hasSeparation
      ? factRow("separation-teal", "Stage 7 青緑面数", count(separation.tealFaceCount), "current-exact-recheck-fact")
      : unmeasuredRow("separation-teal", "Stage 7 青緑面数"),
    hasSeparation
      ? factRow("separation-orange", "Stage 7 橙面数", count(separation.orangeFaceCount), "current-exact-recheck-fact")
      : unmeasuredRow("separation-orange", "Stage 7 橙面数"),
    hasSeparation
      ? factRow("separation-red", "Stage 7 赤面数", count(separation.redFaceCount), "current-exact-recheck-fact")
      : unmeasuredRow("separation-red", "Stage 7 赤面数"),
    factRow(
      "minimum-diameter",
      "Dry Web 最小径（目標）",
      configuredMm(configured.minimumDiameterMm),
      "configured-unmeasured",
    ),
    factRow(
      "maximum-unreinforced-span",
      "最大無補強 span（目標）",
      configuredMm(configured.maximumUnreinforcedSpanMm),
      "configured-unmeasured",
    ),
  ];
}

/**
 * Present only the already-current Dry Web facts. This helper is intentionally
 * read-only: it never derives contacts, graph components, face classes, or
 * physical compliance from any source other than the supplied presentations.
 */
export function createDryWebArtworkReadinessPresentation(
  input: DryWebArtworkReadinessInput,
): DryWebArtworkReadinessPresentation {
  const surface = input.stage4 === "current" && validSurface(input.surface) ? input.surface : null;
  const graph = input.stage4 === "current" && validGraph(input.graph) ? input.graph : null;
  const separation = input.stage7 === "current" && validSeparation(input.separation) ? input.separation : null;
  const rows = currentRows(surface, graph, separation, input.configured);

  let overall: DryWebArtworkReadinessOverall = "未確認";
  let overallReason = "現行の候補条件に必要な事実がそろっていません。";
  let action = stage3Action();
  if (input.stage3 !== "current") {
    action = stage3Action();
    overallReason = input.stage3 === "running"
      ? "Stage 3のGraph化が実行中です。完了後のcurrent snapshotだけを表示します。"
      : "Stage 3のSurface snapshotがmissing/staleです。旧countは表示しません。";
  } else if (input.stage4 !== "current" || !surface || !graph) {
    action = stage4Action();
    overallReason = input.stage4 === "running"
      ? "Stage 4のDry Web生成または再診断が実行中です。旧countは表示しません。"
      : input.stage4 === "stale"
        ? "Stage 4の旧Dry Web factsはstaleです。旧countは表示しません。"
        : "Stage 4のcurrent Dry Web generator factsがありません。";
  } else if (input.stage7 !== "current" || !separation) {
    action = stage7Action();
    overallReason = input.stage7 === "running"
      ? "Stage 7のexact支持分離を実行中です。旧face countは表示しません。"
      : input.stage7 === "stale"
        ? "Stage 7の旧exact支持分離はstaleです。旧face countは表示しません。"
        : "Stage 7のcurrent exact支持分離がありません。";
  } else if (surface.insufficientElementCount > 0 || graph.componentCount !== 1 || separation.redFaceCount > 0) {
    overall = "調整が必要";
    const reasons: string[] = [];
    if (surface.insufficientElementCount > 0) reasons.push(`insufficient ${count(surface.insufficientElementCount)}要素`);
    if (graph.componentCount !== 1) reasons.push(`component ${count(graph.componentCount)}`);
    if (separation.redFaceCount > 0) reasons.push(`赤 ${count(separation.redFaceCount)}面`);
    overallReason = `現行事実で調整が必要です（${reasons.join(" / ")}）。`;
    action = stage4Action();
  } else {
    overall = "候補条件通過・最終未判定";
    overallReason = "現行generator / exact再診断事実では、insufficient 0・component 1・赤 0です。最終判定ではありません。";
    action = "現行候補を観察し、未計測項目を実物・mesh・slicerで別途確認してください。";
  }

  return {
    overall,
    overallReason,
    action,
    rows,
    unmeasuredNote: UNMEASURED_NOTE,
  };
}

export function dryWebArtworkReadinessEvidenceLabel(evidence: DryWebArtworkReadinessEvidence): string {
  switch (evidence) {
    case "current-generator-fact": return "現行generator fact";
    case "current-exact-recheck-fact": return "現行exact再診断 fact";
    case "configured-only": return "設定値のみ";
    case "configured-unmeasured": return "設定値・実測未判定";
    case "unmeasured": return "未計測";
  }
}
