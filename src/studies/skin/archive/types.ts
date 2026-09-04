export const ARCHIVE_GENERATIONS = ["works", "studies", "v1", "v2", "v3", "v4"] as const;
export type ArchiveGeneration = typeof ARCHIVE_GENERATIONS[number];

export const ARCHIVE_GENRE_IDS = [
  "formation",
  "field-particle",
  "light-atmosphere",
  "support-relation",
  "hand-trace-time",
  "space-scale",
  "material-fabrication",
] as const;
export type SkinArtGenre = typeof ARCHIVE_GENRE_IDS[number];

export const ARCHIVE_GENRE_LABELS: Record<SkinArtGenre, string> = {
  formation: "FORMATION",
  "field-particle": "FIELD / PARTICLE",
  "light-atmosphere": "LIGHT / ATMOSPHERE",
  "support-relation": "SUPPORT / RELATION",
  "hand-trace-time": "HAND / TRACE / TIME",
  "space-scale": "SPACE / SCALE",
  "material-fabrication": "MATERIAL / FABRICATION",
};

export const SOURCE_LOGIC_IDS = ["GRAPH", "MOTIF", "LOCAL METRIC", "FIELD", "LIGHT", "GESTURE PROXY", "MATERIAL PROXY", "SHADOW OCCLUDER"] as const;
export type SourceLogic = typeof SOURCE_LOGIC_IDS[number];
export const VISUAL_PRIMITIVE_IDS = ["LINE", "HAIRLINE", "POINT", "PARTICLE", "GAUSSIAN", "RIBBON", "VOLUME", "FOG", "SHADOW", "MESH", "MIXED"] as const;
export type VisualPrimitive = typeof VISUAL_PRIMITIVE_IDS[number];
export const TEMPORAL_MODE_IDS = ["TRAVERSAL", "SEQUENCE", "GROWTH", "PROPAGATION", "CONTINUOUS", "EVENT", "PHYSICS", "OSCILLATION", "ACCUMULATION"] as const;
export type TemporalMode = typeof TEMPORAL_MODE_IDS[number];
export const SPATIAL_MODE_IDS = ["OBJECT", "FIELD", "ROOM", "VOID", "INTERIOR", "MULTISCALE", "CAMERA JOURNEY", "SCREEN-FILLING"] as const;
export type SpatialMode = typeof SPATIAL_MODE_IDS[number];

export type ArchiveKind = "traversal" | "visual-study" | "concept-movie" | "concept-system";
export type ArchiveVersionStatus = "current" | "baseline" | "archive" | "reference";

export interface ArchiveVersion {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly status: ArchiveVersionStatus;
  readonly commit?: string;
}

export interface SkinArtArchiveItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly generation: ArchiveGeneration;
  readonly kind: ArchiveKind;
  readonly primaryGenre: SkinArtGenre;
  readonly sourceLogic: readonly SourceLogic[];
  readonly primitives: readonly VisualPrimitive[];
  readonly temporalModes: readonly TemporalMode[];
  readonly spatialModes: readonly SpatialMode[];
  readonly tags: readonly string[];
  readonly versions: readonly ArchiveVersion[];
  readonly family?: string;
  readonly derivedFrom?: readonly string[];
  readonly influencedBy?: readonly string[];
}
