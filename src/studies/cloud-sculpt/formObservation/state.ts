import type { FormObservationSettings, SupportedPointBudget } from "./contracts.ts";

export const FORM_SETTINGS_KEY = "katachi-cloud-sculpt-form-observation-v1";

export const DEFAULT_FORM_SETTINGS: FormObservationSettings = {
  layout: "quad",
  activePanel: "top",
  pointBudget: 80_000,
  pointSize: 1.35,
  zoom: 1,
  pan: [0, 0],
  pcaBasis: null,
  pcaSourceHash: null,
};

export function isFormQueryEnabled(search: string): boolean {
  return new URLSearchParams(search).get("form") === "1";
}

export function normalizeFormSettings(value: unknown, maxPointBudget: SupportedPointBudget = 160_000): FormObservationSettings {
  const defaults: FormObservationSettings = {
    ...DEFAULT_FORM_SETTINGS,
    pointBudget: DEFAULT_FORM_SETTINGS.pointBudget <= maxPointBudget ? DEFAULT_FORM_SETTINGS.pointBudget : maxPointBudget,
  };
  if (value === null || typeof value !== "object") return defaults;
  const candidate = value as Partial<FormObservationSettings>;
  const budgets: readonly SupportedPointBudget[] = [20_000, 40_000, 80_000, 160_000];
  const requestedBudget = budgets.includes(candidate.pointBudget as SupportedPointBudget)
    ? candidate.pointBudget as SupportedPointBudget
    : defaults.pointBudget;
  const pointBudget = requestedBudget <= maxPointBudget ? requestedBudget : maxPointBudget;
  const pan = Array.isArray(candidate.pan) && candidate.pan.length === 2
    && candidate.pan.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? [candidate.pan[0], candidate.pan[1]] as [number, number]
    : [...DEFAULT_FORM_SETTINGS.pan] as [number, number];
  return {
    layout: candidate.layout === "single" ? "single" : defaults.layout,
    activePanel: ["top", "front", "side", "principal"].includes(candidate.activePanel ?? "")
      ? candidate.activePanel as FormObservationSettings["activePanel"]
      : defaults.activePanel,
    pointBudget,
    pointSize: typeof candidate.pointSize === "number" && Number.isFinite(candidate.pointSize)
      ? Math.max(0.5, Math.min(4, candidate.pointSize)) : defaults.pointSize,
    zoom: typeof candidate.zoom === "number" && Number.isFinite(candidate.zoom)
      ? Math.max(0.25, Math.min(6, candidate.zoom)) : defaults.zoom,
    pan,
    pcaBasis: null,
    pcaSourceHash: null,
  };
}

export function loadFormSettings(storage: Storage, maxPointBudget: SupportedPointBudget = 160_000): FormObservationSettings {
  try { return normalizeFormSettings(JSON.parse(storage.getItem(FORM_SETTINGS_KEY) ?? "null"), maxPointBudget); } catch { return normalizeFormSettings(null, maxPointBudget); }
}

export function persistFormSettings(storage: Storage, settings: FormObservationSettings): void {
  const { pcaBasis: _pcaBasis, pcaSourceHash: _pcaSourceHash, ...serializable } = settings;
  storage.setItem(FORM_SETTINGS_KEY, JSON.stringify(serializable));
}
