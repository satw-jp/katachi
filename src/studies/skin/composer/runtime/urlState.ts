import { DEFAULT_COMPOSER_STATE, mergeComposerState, type ComposerState, type ComposerStatePatch } from "./state.ts";

function finite(value: unknown, fallback: number): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function normalizedState(value: ComposerStatePatch): ComposerState {
  const state = mergeComposerState(DEFAULT_COMPOSER_STATE, value);
  return { ...state, seed: Math.round(finite(state.seed, DEFAULT_COMPOSER_STATE.seed)) };
}

export function parseComposerState(search: string): ComposerState {
  const raw = new URLSearchParams(search).get("state");
  if (!raw) return DEFAULT_COMPOSER_STATE;
  try { return normalizedState(JSON.parse(raw) as ComposerStatePatch); } catch { return DEFAULT_COMPOSER_STATE; }
}

export function serializeComposerState(baseUrl: string, state: ComposerState): string {
  const url = new URL(baseUrl);
  url.searchParams.set("state", JSON.stringify(state));
  return url.toString();
}
