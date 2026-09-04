import { DEFAULT_COMPOSER_STATE, mergeComposerState, type ComposerState, type ComposerStatePatch } from "./state.ts";

function finite(value: unknown, fallback: number): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function normalizedState(value: ComposerStatePatch): ComposerState {
  const state = mergeComposerState(DEFAULT_COMPOSER_STATE, value);
  const mode = (state.camera.mode as string) === "STILL" ? "MANUAL" : state.camera.mode;
  return { ...state, seed: Math.round(finite(state.seed, DEFAULT_COMPOSER_STATE.seed)), camera: { ...state.camera, mode } };
}

export function parseComposerState(search: string): ComposerState {
  const params = new URLSearchParams(search);
  const raw = params.get("state");
  const seedRaw = params.get("seed");
  const seedValue = seedRaw === null ? Number.NaN : Number(seedRaw);
  const seedPatch = Number.isFinite(seedValue) ? { seed: Math.round(seedValue) } : {};
  if (!raw) return normalizedState(seedPatch);
  try { return normalizedState({ ...(JSON.parse(raw) as ComposerStatePatch), ...seedPatch }); } catch { return normalizedState(seedPatch); }
}

export function serializeComposerState(baseUrl: string, state: ComposerState): string {
  const url = new URL(baseUrl);
  url.searchParams.set("state", JSON.stringify(state));
  return url.toString();
}
