export const SKIN_WORKFLOW_GUIDE_PHASES = [
  { id: "base", title: "Base", targetId: "skin-stage-1" },
  { id: "surface-pattern", title: "Surface Pattern", targetId: "skin-stage-2" },
  { id: "inside-outside", title: "Inside / Outside", targetId: "skin-stage-3" },
  { id: "overhang", title: "Overhang", targetId: "skin-stage-4" },
  { id: "permanent-reinforcement", title: "Permanent Reinforcement", targetId: "skin-stage-5" },
  { id: "final-mesh", title: "Final Mesh", targetId: "skin-stage-6" },
  { id: "final-diagnosis", title: "Final Diagnosis", targetId: "skin-stage-7" },
  { id: "support-export", title: "Removable Support / Export", targetId: "skin-stage-8" },
] as const;

export type SkinWorkflowGuidePhaseId = typeof SKIN_WORKFLOW_GUIDE_PHASES[number]["id"];
export type SkinWorkflowGuidePhaseStatus = "complete" | "current" | "future" | "needs-verification";
export type SkinWorkflowGuideAction =
  | "create-base"
  | "generate-surface-pattern"
  | "diagnose-inside-outside"
  | "diagnose-overhang"
  | "verify-artwork-interior"
  | "generate-reinforcement"
  | "regenerate-reinforcement"
  | "build-final-mesh"
  | "verify-final-mesh"
  | "run-final-diagnosis"
  | "prepare-generate-support"
  | "generate-sparse-support"
  | "confirm-support-mode"
  | "approve-unresolved-support"
  | "approve-thin-strut"
  | "export-3mf";

export type SkinWorkflowGuideFinalMeshState = "missing" | "stale" | "current";
export type SkinWorkflowGuideFinalDiagnosisState = "missing" | "stale" | "current";
export type SkinWorkflowGuideSupportExportState =
  | "not-ready"
  | "needs-interior-verification"
  | "needs-generation"
  | "needs-confirmation"
  | "unresolved-approval"
  | "thin-strut-approval"
  | "ready";
export type SkinWorkflowGuideRestoreState =
  | "none"
  | "missing-downstream-evidence"
  | "snapshot-restored"
  | "snapshot-stale";

export interface SkinWorkflowGuideBlocker {
  phase: "permanent-reinforcement" | "final-mesh" | "final-diagnosis" | "support-export";
  reason: string;
  action: SkinWorkflowGuideAction;
}

export interface SkinWorkflowGuideInput {
  baseReady: boolean;
  surfacePatternReady: boolean;
  insideOutsideCurrent: boolean;
  overhangCurrent: boolean;
  permanentReinforcementCurrent: boolean;
  reinforcementRequired: boolean;
  finalMeshState: SkinWorkflowGuideFinalMeshState;
  finalDiagnosisState: SkinWorkflowGuideFinalDiagnosisState;
  finalDiagnosisBlocker: SkinWorkflowGuideBlocker | null;
  supportExportState: SkinWorkflowGuideSupportExportState;
  supportExportBlocker: string | null;
  restoreState: SkinWorkflowGuideRestoreState;
}

export interface SkinWorkflowGuideProgressItem {
  index: number;
  id: SkinWorkflowGuidePhaseId;
  title: string;
  targetId: string;
  status: SkinWorkflowGuidePhaseStatus;
}

export interface SkinWorkflowGuideResult {
  phase: SkinWorkflowGuidePhaseId;
  phaseIndex: number;
  phaseTitle: string;
  phaseStatus: SkinWorkflowGuidePhaseStatus;
  progressText: string;
  blocker: string | null;
  primaryAction: SkinWorkflowGuideAction;
  primaryActionLabel: string;
  detailsTargetId: string;
  context: string | null;
  progress: readonly SkinWorkflowGuideProgressItem[];
}

const ACTION_LABELS: Record<SkinWorkflowGuideAction, string> = {
  "create-base": "Create Base",
  "generate-surface-pattern": "Generate Surface Pattern",
  "diagnose-inside-outside": "Diagnose Inside / Outside",
  "diagnose-overhang": "Diagnose Overhang",
  "verify-artwork-interior": "Verify Artwork Interior",
  "generate-reinforcement": "Generate Reinforcement",
  "regenerate-reinforcement": "Regenerate Reinforcement",
  "build-final-mesh": "Build Final Mesh",
  "verify-final-mesh": "Build / Verify Final Mesh",
  "run-final-diagnosis": "Run Final Diagnosis",
  "prepare-generate-support": "Prepare & Generate Support",
  "generate-sparse-support": "Generate Sparse Support",
  "confirm-support-mode": "Confirm Support Mode",
  "approve-unresolved-support": "Approve Unresolved Support",
  "approve-thin-strut": "Approve Thin Strut",
  "export-3mf": "Export 3MF",
};

function current(
  phase: SkinWorkflowGuidePhaseId,
  action: SkinWorkflowGuideAction,
  blocker: string | null,
): Pick<SkinWorkflowGuideResult, "phase" | "primaryAction" | "blocker"> {
  return { phase, primaryAction: action, blocker };
}

function restoreContext(state: SkinWorkflowGuideRestoreState): string | null {
  if (state === "snapshot-restored") {
    return "Print Snapshot restore済み · BODY / downstream evidenceを既存stateとして利用中";
  }
  if (state === "missing-downstream-evidence") {
    return "FKEI restore済み · downstream evidenceはNeeds verification";
  }
  if (state === "snapshot-stale") {
    return "Print Snapshotはstale · 既存workflowで再検証が必要です";
  }
  return null;
}

function progressStatuses(
  input: SkinWorkflowGuideInput,
  activePhase: SkinWorkflowGuidePhaseId,
): SkinWorkflowGuideProgressItem[] {
  const activeIndex = SKIN_WORKFLOW_GUIDE_PHASES.findIndex((phase) => phase.id === activePhase);
  return SKIN_WORKFLOW_GUIDE_PHASES.map((phase, index) => ({
    index: index + 1,
    id: phase.id,
    title: phase.title,
    targetId: phase.targetId,
    status: index === activeIndex
      ? (input.restoreState === "missing-downstream-evidence" && phase.id === "final-mesh"
        ? "needs-verification"
        : "current")
      : index < activeIndex
        ? "complete"
        : "future",
  }));
}

export function evaluateSkinWorkflowGuide(input: SkinWorkflowGuideInput): SkinWorkflowGuideResult {
  let selected = current("base", "create-base", "Base Shapeがありません");

  if (!input.baseReady) {
    // Keep the initial Base action selected.
  } else if (!input.surfacePatternReady) {
    selected = current("surface-pattern", "generate-surface-pattern", "Surface Patternがありません");
  } else if (!input.insideOutsideCurrent) {
    selected = current("inside-outside", "diagnose-inside-outside", "Inside / Outsideの判定がcurrentではありません");
  } else if (!input.overhangCurrent) {
    selected = current("overhang", "diagnose-overhang", "Overhang診断がcurrentではありません");
  } else if (input.reinforcementRequired || !input.permanentReinforcementCurrent) {
    selected = current(
      "permanent-reinforcement",
      input.reinforcementRequired ? "regenerate-reinforcement" : "generate-reinforcement",
      input.reinforcementRequired
        ? "Permanent Reinforcementの再生成が必要です"
        : "Permanent Reinforcementがcurrentではありません",
    );
  } else if (input.restoreState === "missing-downstream-evidence") {
    selected = current(
      "final-mesh",
      "verify-final-mesh",
      "FKEIは復元されましたが、Final Mesh以降のdownstream evidenceがありません。Needs verificationです",
    );
  } else if (input.finalDiagnosisBlocker) {
    selected = {
      phase: input.finalDiagnosisBlocker.phase,
      primaryAction: input.finalDiagnosisBlocker.action,
      blocker: input.finalDiagnosisBlocker.reason,
    };
  } else if (input.finalMeshState !== "current") {
    selected = current(
      "final-mesh",
      "build-final-mesh",
      input.finalMeshState === "stale" ? "Final Meshがstaleです" : "Final Meshがまだ確定していません",
    );
  } else if (input.finalDiagnosisState !== "current") {
    selected = current(
      "support-export",
      "prepare-generate-support",
      "Support evidenceが不足しています。準備してから生成してください",
    );
  } else if (input.supportExportState === "needs-interior-verification") {
    selected = current(
      "support-export",
      "prepare-generate-support",
      input.supportExportBlocker ?? "Support evidenceが不足しています。準備してから生成してください",
    );
  } else if (input.supportExportState === "not-ready") {
    selected = current(
      "support-export",
      "prepare-generate-support",
      input.supportExportBlocker ?? "Removable Support / Exportがまだ準備できていません",
    );
  } else if (input.supportExportState === "needs-confirmation") {
    selected = current(
      "support-export",
      "confirm-support-mode",
      input.supportExportBlocker ?? "Support modeの確定が必要です",
    );
  } else if (input.supportExportState === "needs-generation") {
    selected = current(
      "support-export",
      "generate-sparse-support",
      input.supportExportBlocker ?? "Sparse Supportが未生成です",
    );
  } else if (input.supportExportState === "unresolved-approval") {
    selected = current(
      "support-export",
      "approve-unresolved-support",
      input.supportExportBlocker ?? "unresolved supportが残っています。明示承認が必要です",
    );
  } else if (input.supportExportState === "thin-strut-approval") {
    selected = current(
      "support-export",
      "approve-thin-strut",
      input.supportExportBlocker ?? "Thin Strutの明示承認が必要です",
    );
  } else {
    selected = current("support-export", "export-3mf", null);
  }

  const phaseIndex = SKIN_WORKFLOW_GUIDE_PHASES.findIndex((phase) => phase.id === selected.phase);
  const phase = SKIN_WORKFLOW_GUIDE_PHASES[phaseIndex] ?? SKIN_WORKFLOW_GUIDE_PHASES[0];
  const progress = progressStatuses(input, selected.phase);
  const phaseStatus = progress[phaseIndex]?.status ?? "current";
  return {
    phase: selected.phase,
    phaseIndex: phaseIndex + 1,
    phaseTitle: phase.title,
    phaseStatus,
    progressText: `${phaseIndex + 1} / ${SKIN_WORKFLOW_GUIDE_PHASES.length}`,
    blocker: selected.blocker,
    primaryAction: selected.primaryAction,
    primaryActionLabel: ACTION_LABELS[selected.primaryAction],
    detailsTargetId: phase.targetId,
    context: restoreContext(input.restoreState),
    progress,
  };
}
