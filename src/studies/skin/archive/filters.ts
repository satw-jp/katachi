import { searchArchiveItems } from "./search.ts";
import type { ArchiveGeneration, SkinArtGenre, SkinArtArchiveItem, SourceLogic, SpatialMode, TemporalMode, VisualPrimitive } from "./types.ts";

export interface ArchiveFilters {
  readonly query: string;
  readonly generation: ArchiveGeneration | "";
  readonly genre: SkinArtGenre | "";
  readonly source: SourceLogic | "";
  readonly primitive: VisualPrimitive | "";
  readonly time: TemporalMode | "";
  readonly space: SpatialMode | "";
}

export const EMPTY_FILTERS: ArchiveFilters = { query: "", generation: "", genre: "", source: "", primitive: "", time: "", space: "" };

export function filterArchiveItems(items: readonly SkinArtArchiveItem[], filters: ArchiveFilters): readonly SkinArtArchiveItem[] {
  return searchArchiveItems(items, filters.query).filter((item) => (
    (!filters.generation || item.generation === filters.generation)
    && (!filters.genre || item.primaryGenre === filters.genre)
    && (!filters.source || item.sourceLogic.includes(filters.source))
    && (!filters.primitive || item.primitives.includes(filters.primitive))
    && (!filters.time || item.temporalModes.includes(filters.time))
    && (!filters.space || item.spatialModes.includes(filters.space))
  ));
}
