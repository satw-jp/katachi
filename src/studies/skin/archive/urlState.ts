import type { ArchiveFilters } from "./filters.ts";
import { EMPTY_FILTERS } from "./filters.ts";
import type { ArchiveGeneration, SkinArtGenre, SourceLogic, SpatialMode, TemporalMode, VisualPrimitive } from "./types.ts";

export type ArchiveView = "all" | "genre" | "generation" | "similarity";

export interface ArchiveUrlState extends ArchiveFilters {
  readonly view: ArchiveView;
  readonly item: string;
}

const VIEW_VALUES: readonly ArchiveView[] = ["all", "genre", "generation", "similarity"];
const GENERATIONS: readonly ArchiveGeneration[] = ["works", "studies", "v1", "v2", "v3", "v4"];

function oneOf<T extends string>(value: string | null, values: readonly T[]): T | "" {
  return value && values.includes(value as T) ? value as T : "";
}

export function parseArchiveUrl(search: string): ArchiveUrlState {
  const params = new URLSearchParams(search);
  return {
    ...EMPTY_FILTERS,
    view: oneOf(params.get("view"), VIEW_VALUES) || "all",
    item: params.get("item") ?? "",
    query: params.get("q") ?? "",
    generation: oneOf(params.get("generation"), GENERATIONS),
    genre: (params.get("genre") ?? "") as SkinArtGenre | "",
    source: (params.get("source") ?? "") as SourceLogic | "",
    primitive: (params.get("primitive") ?? "") as VisualPrimitive | "",
    time: (params.get("time") ?? "") as TemporalMode | "",
    space: (params.get("space") ?? "") as SpatialMode | "",
  };
}

export function serializeArchiveUrl(baseUrl: string, state: ArchiveUrlState): string {
  const url = new URL(baseUrl);
  const setOrDelete = (key: string, value: string): void => { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); };
  setOrDelete("view", state.view === "all" ? "" : state.view);
  setOrDelete("item", state.item);
  setOrDelete("q", state.query);
  setOrDelete("generation", state.generation);
  setOrDelete("genre", state.genre);
  setOrDelete("source", state.source);
  setOrDelete("primitive", state.primitive);
  setOrDelete("time", state.time);
  setOrDelete("space", state.space);
  return url.toString();
}
