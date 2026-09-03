import type { ParameterValue } from "./parameterStore.ts";
import { resolveConceptLabSeed } from "./seed.ts";

export interface CameraLinkState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fov: number;
}

export interface ConceptLabUrlState {
  readonly concept: string;
  readonly seed: number;
  readonly fixedSeed: boolean;
  readonly timeMs: number;
  readonly palette: string;
  readonly panel: boolean;
  readonly parameters: Record<string, ParameterValue>;
  readonly camera: CameraLinkState | null;
  readonly quality?: "spatial-north-star";
}

function parseParameters(value: string | null): Record<string, ParameterValue> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, item]) => (
      typeof item === "number" || typeof item === "string" || typeof item === "boolean"
    ))) as Record<string, ParameterValue>;
  } catch { return {}; }
}

function parseCamera(value: string | null): CameraLinkState | null {
  if (!value) return null;
  try {
    const camera = JSON.parse(value) as Partial<CameraLinkState>;
    if ([camera.x, camera.y, camera.z, camera.fov].every((item) => typeof item === "number" && Number.isFinite(item))) {
      return { x: camera.x!, y: camera.y!, z: camera.z!, fov: camera.fov! };
    }
  } catch { /* malformed URLs fall back to the live camera */ }
  return null;
}

export function parseConceptLabUrl(search: string, defaultConcept: string): ConceptLabUrlState {
  const params = new URLSearchParams(search);
  const seed = resolveConceptLabSeed(params.get("seed"));
  const timeValue = Number(params.get("t"));
  return {
    concept: params.get("concept") || defaultConcept,
    seed: seed.seed,
    fixedSeed: seed.fixed,
    timeMs: Number.isFinite(timeValue) && timeValue >= 0 ? timeValue : 0,
    palette: params.get("palette") || "rich",
    panel: params.get("panel") === "1",
    parameters: parseParameters(params.get("p")),
    camera: parseCamera(params.get("cam")),
    quality: params.get("quality") === "spatial-north-star" ? "spatial-north-star" : undefined,
  };
}

export function serializeConceptLabUrl(baseUrl: string, state: Omit<ConceptLabUrlState, "fixedSeed"> & { fixedSeed?: boolean }): string {
  const url = new URL(baseUrl);
  url.searchParams.set("concept", state.concept);
  url.searchParams.set("seed", String(state.seed));
  url.searchParams.set("t", String(Math.max(0, Math.round(state.timeMs))));
  url.searchParams.set("palette", state.palette);
  if (state.panel) url.searchParams.set("panel", "1"); else url.searchParams.delete("panel");
  if (Object.keys(state.parameters).length > 0) url.searchParams.set("p", JSON.stringify(state.parameters));
  if (state.camera) url.searchParams.set("cam", JSON.stringify(state.camera));
  if (state.quality === "spatial-north-star") url.searchParams.set("quality", state.quality);
  return url.toString();
}
