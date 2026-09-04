import type { HanaComputeMode } from "./computeBackend.ts";

/** localStorage key for the author-local compute mode preference. */
export const HANA_COMPUTE_MODE_STORAGE_KEY = "hana-compute-mode-v0";

/**
 * Parse a stored or query compute mode value. Anything outside the internal
 * `local | windows | auto` enum falls back to null (the caller applies the
 * existing Local default). Never throws and never touches Authoring data.
 */
export function parseHanaComputeModePreference(value: unknown): HanaComputeMode | null {
  return value === "local" || value === "windows" || value === "auto" ? value : null;
}

/** Query override wins, then the stored preference, then the Local default. */
export function resolveHanaComputeModePreference(query: unknown, stored: unknown): HanaComputeMode {
  return parseHanaComputeModePreference(query)
    ?? parseHanaComputeModePreference(stored)
    ?? "local";
}

export type HanaComputeModeLabel = "LOCAL" | "REMOTE" | "AUTO";

/**
 * User-facing compute label. The internal `windows` value addresses the
 * remote compute endpoint (`/api/hana-compute/v0`) and is displayed as
 * REMOTE: the endpoint may run on the same machine, a LAN machine, a Windows
 * workstation, or any other compatible host. Internal enum, protocol,
 * serialization, and backend class names are unchanged.
 */
export function hanaComputeModeLabel(mode: HanaComputeMode): HanaComputeModeLabel {
  if (mode === "windows") return "REMOTE";
  if (mode === "auto") return "AUTO";
  return "LOCAL";
}

export function formatHanaComputeStatus(mode: HanaComputeMode, detail: string): string {
  return `${hanaComputeModeLabel(mode)} · ${detail}`;
}

/** AUTO status with the executed choice when the backend decision is known. */
export function formatHanaAutoComputeStatus(
  choice: HanaComputeMode | null,
  detail: string,
): string {
  if (choice === null) return `AUTO · ${detail}`;
  return `AUTO → ${hanaComputeModeLabel(choice)} · ${detail}`;
}
