export interface HanaRuntimeProvenance {
  gitSha: string;
  version: string;
  loadedAt: string;
}

function normalizedGitSha(value: unknown): string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value)
    ? value.toLowerCase()
    : "unknown";
}

function normalizedVersion(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

export function createHanaRuntimeProvenance(
  gitSha: unknown,
  version: unknown,
  loadedAt = new Date().toISOString(),
): HanaRuntimeProvenance {
  return {
    gitSha: normalizedGitSha(gitSha),
    version: normalizedVersion(version),
    loadedAt,
  };
}

export function hanaRuntimeShortLabel(runtime: HanaRuntimeProvenance): string {
  return `Runtime · ${runtime.gitSha === "unknown" ? "unknown" : runtime.gitSha.slice(0, 7)}`;
}

export function hanaRuntimeDiagnosticText(runtime: HanaRuntimeProvenance): string {
  return `${hanaRuntimeShortLabel(runtime)} · HANA ${runtime.version} · loaded ${runtime.loadedAt}`;
}
