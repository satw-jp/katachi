export type SkinRebuildPrintPreparationDiagnosticState = "current" | "stale";
export type SkinRebuildPrintPreparationExportState = "blocked" | "approval-required" | "ready";
export type SkinRebuildPrintPreparationBlockerKind = "hard-block" | "approval-required";

export interface SkinRebuildPrintPreparationReadinessInput {
  fkeiCurrent: boolean;
  stage4Current: boolean;
  stage6Current: boolean;
  componentCount: number;
  selectedComponentCount: number;
  stage7Current: boolean;
  stage75Current: boolean;
  stage8Current: boolean;
  supportMode: "automatic" | "off";
  sparseSupportGenerated: boolean;
  unresolvedSupportCount: number | null;
  acceptedBodyCollisionCount: number | null;
  approvalCurrent: boolean;
}

export interface SkinRebuildPrintPreparationReadiness {
  diagnostics: {
    fkei: SkinRebuildPrintPreparationDiagnosticState;
    stage4: SkinRebuildPrintPreparationDiagnosticState;
    stage6: SkinRebuildPrintPreparationDiagnosticState;
    stage7: SkinRebuildPrintPreparationDiagnosticState;
    stage75: SkinRebuildPrintPreparationDiagnosticState;
    stage8: SkinRebuildPrintPreparationDiagnosticState;
  };
  componentCount: number;
  selectedComponentCount: number;
  sparseSupportGenerated: boolean;
  unresolvedSupportCount: number | null;
  canGenerateSparseSupport: boolean;
  canApproveExperimentalExport: boolean;
  canExport: boolean;
  exportState: SkinRebuildPrintPreparationExportState;
  blocker: {
    kind: SkinRebuildPrintPreparationBlockerKind;
    reason: string;
    nextAction: string;
  } | null;
}

function diagnosticState(current: boolean): SkinRebuildPrintPreparationDiagnosticState {
  return current ? "current" : "stale";
}

function hardBlock(reason: string, nextAction: string) {
  return { kind: "hard-block" as const, reason, nextAction };
}

export function evaluateSkinRebuildPrintPreparation(
  input: SkinRebuildPrintPreparationReadinessInput,
): SkinRebuildPrintPreparationReadiness {
  const diagnostics = {
    fkei: diagnosticState(input.fkeiCurrent),
    stage4: diagnosticState(input.stage4Current),
    stage6: diagnosticState(input.stage6Current),
    stage7: diagnosticState(input.stage7Current),
    stage75: diagnosticState(input.stage75Current),
    stage8: diagnosticState(input.stage8Current),
  };
  const selectedComponentCount = Number.isInteger(input.selectedComponentCount)
    ? Math.max(0, input.selectedComponentCount)
    : 0;
  const componentCount = Number.isInteger(input.componentCount)
    ? Math.max(0, input.componentCount)
    : 0;
  const sparseSupportGenerated = input.supportMode === "automatic" && input.sparseSupportGenerated;
  const canGenerateSparseSupport = input.stage7Current
    && (input.supportMode === "off" || input.stage75Current);

  let blocker: SkinRebuildPrintPreparationReadiness["blocker"] = null;
  if (!input.fkeiCurrent) {
    blocker = hardBlock(
      "SKIN入力がcurrentではありません",
      "最初に通常の「.fkei Open」でSKINを開いてください",
    );
  } else if (!input.stage4Current) {
    blocker = hardBlock(
      "Stage 4診断がstaleです",
      "Stage 4「オーバーハング部を検出」を実行してdiagnosticsをcurrentにしてください",
    );
  } else if (!input.stage6Current) {
    blocker = hardBlock(
      "Stage 6 mesh / Stage 6.4 Component診断がstaleです",
      "Stage 6で作品meshを確定し、Stage 6.4を開いてComponent Colorsを確認してください",
    );
  } else if (componentCount === 0) {
    blocker = hardBlock(
      "BODY component diagnosticsがありません",
      "Stage 6.4 Component Colorsを開き、currentなcomponent診断を確認してください",
    );
  } else if (selectedComponentCount === 0) {
    blocker = hardBlock(
      "KeepされたBODY componentが0件です",
      "Stage 6.4で少なくとも1 componentをKeepしてください",
    );
  } else if (!input.stage7Current) {
    blocker = hardBlock(
      "Stage 7最終診断がstaleです",
      "Stage 7「確定作品を診断して残る赤を表示」を実行してください",
    );
  } else if (!input.stage75Current && input.supportMode === "automatic") {
    blocker = hardBlock(
      "Stage 7.5 Artwork Interior Classificationがstaleです",
      "Stage 7.5で作品の内外を判定し、ambiguous/unclassified 0を確認してください",
    );
  } else if (!input.stage8Current) {
    blocker = hardBlock(
      "Stage 8 Sparse Supportの確認結果がstaleです",
      "Stage 8でSparse Supportを生成・確認してください",
    );
  } else if (input.supportMode === "automatic" && !sparseSupportGenerated) {
    blocker = hardBlock(
      "Sparse Supportが生成されていません",
      "Stage 8「Outside Overhangに印刷サポートを生成」を実行してください",
    );
  } else if (input.supportMode === "automatic"
    && (!Number.isInteger(input.acceptedBodyCollisionCount) || input.acceptedBodyCollisionCount !== 0)) {
    blocker = hardBlock(
      "Accepted Sparse SupportがBODYと衝突しています、または診断が不正です",
      "Stage 8のSparse Support diagnosticsを確認し、BODY衝突が0になる結果だけを使ってください",
    );
  } else if (input.supportMode === "automatic"
    && (!Number.isInteger(input.unresolvedSupportCount) || (input.unresolvedSupportCount ?? -1) < 0)) {
    blocker = hardBlock(
      "Sparse Supportのunresolved diagnosticsがありません",
      "Stage 8を再実行してunresolved support countを確定してください",
    );
  } else if (input.supportMode === "automatic"
    && (input.unresolvedSupportCount ?? 0) > 0
    && !input.approvalCurrent) {
    blocker = {
      kind: "approval-required",
      reason: `${input.unresolvedSupportCount}件のUnsupportedが残っています。Experimental print may fail.`,
      nextAction: "警告を確認し、「Export Experimental Print」を明示承認してください",
    };
  }

  const exportState: SkinRebuildPrintPreparationExportState = blocker?.kind === "hard-block"
    ? "blocked"
    : blocker?.kind === "approval-required"
      ? "approval-required"
      : "ready";
  return {
    diagnostics,
    componentCount,
    selectedComponentCount,
    sparseSupportGenerated,
    unresolvedSupportCount: input.unresolvedSupportCount,
    canGenerateSparseSupport,
    canApproveExperimentalExport: exportState === "approval-required",
    canExport: exportState === "ready",
    exportState,
    blocker,
  };
}
