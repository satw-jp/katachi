export type SkinRebuildArtifactTopBarState = {
  hasProject: boolean;
  bodyCurrent: boolean;
  supportCurrent: boolean;
  supportProvenance: string | null;
  previewCurrent: boolean;
  supportedCount: number | null;
  unresolvedCount: number | null;
  exportAvailable: boolean;
  exportRunning: boolean;
  warningCount: number;
};

export type SkinRebuildArtifactTopBarPresentation = {
  candidateLabel: string;
  statusLabel: string;
  statusState: "current" | "warning" | "unavailable" | "running";
};

/** Keep the project chrome compact while leaving detailed diagnostics in the
 * existing Stage 8 Details area. Every label is derived from the live
 * artifact source; this helper does not create or promote any geometry. */
export function describeSkinRebuildArtifactTopBar(
  state: SkinRebuildArtifactTopBarState,
): SkinRebuildArtifactTopBarPresentation {
  const supportLabel = state.supportCurrent
    ? `Support current · ${state.supportProvenance ?? "Stage 8"}`
    : "Support none · Stage 8 not ready";
  const previewLabel = state.previewCurrent ? "Preview current" : "Preview unavailable";
  const candidateLabel = state.hasProject
    ? `PRINT CANDIDATE · BODY ${state.bodyCurrent ? "current" : "export-only"} · ${supportLabel}`
    : "PRINT CANDIDATE · no current project";
  if (state.exportRunning) {
    return { candidateLabel, statusLabel: "Export running · current snapshot", statusState: "running" };
  }
  if (!state.exportAvailable) {
    return { candidateLabel, statusLabel: "Export unavailable · technical source required", statusState: "unavailable" };
  }
  const supportCounts = state.supportCurrent
    && Number.isInteger(state.supportedCount)
    && Number.isInteger(state.unresolvedCount)
    ? ` · ${state.supportedCount} supported · ${state.unresolvedCount} unresolved`
    : "";
  const warningLabel = state.warningCount > 0 ? " · Readiness warning (Export available)" : "";
  return {
    candidateLabel,
    statusLabel: `BODY ${state.bodyCurrent ? "current" : "available"} · ${supportLabel}${supportCounts} · ${previewLabel} · Export available${warningLabel}`,
    statusState: state.warningCount > 0 ? "warning" : "current",
  };
}
