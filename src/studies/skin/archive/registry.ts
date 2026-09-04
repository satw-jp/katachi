import { NETWORK_FORMATION_ARTWORK_ORDER, networkFormationVariant } from "../rebuild/networkFormation.ts";
import { CONCEPT_MOVIES } from "../concept-movies/catalog.ts";
import { CONCEPT_MOVIES_V2 } from "../concept-movies-v2/catalog.ts";
import { CONCEPT_MOVIE_V3 } from "../concept-movies-v3/catalog.ts";
import { VISUAL_STUDIES } from "../visual-studies/catalog.ts";
import { CONCEPT_DEFINITIONS } from "../concept-lab-v4/conceptRegistry.ts";
import type { ArchiveVersion, SkinArtArchiveItem, SkinArtGenre, ArchiveGeneration, ArchiveKind, SourceLogic, VisualPrimitive, TemporalMode, SpatialMode } from "./types.ts";

const version = (id: string, label: string, url: string, status: ArchiveVersion["status"], commit?: string): ArchiveVersion => ({ id, label, url, status, ...(commit ? { commit } : {}) });
const route = (generation: ArchiveGeneration, id: string): ArchiveVersion => {
  if (generation === "works") return version("original", "ORIGINAL WORK", `/skin-rebuild.html?work=${encodeURIComponent(id)}`, "archive");
  if (generation === "studies") return version("study", "VISUAL STUDY", `/skin-art/studies/?study=${encodeURIComponent(id)}`, "reference");
  if (generation === "v1") return version("v1", "CONCEPT V1", `/skin-art/concepts/?movie=${encodeURIComponent(id)}`, "reference");
  if (generation === "v2") return version("v2", "CONCEPT V2", `/skin-art/concepts-v2/?movie=${encodeURIComponent(id)}`, "reference");
  if (generation === "v3") return version("v3", "CONCEPT V3", `/skin-art/concepts-v3/?palette=rich`, "reference");
  return version("current", "V4 CAMERA / CURRENT", `/skin-art/concepts-v4/?concept=${encodeURIComponent(id)}&panel=0`, "current");
};

function item(
  id: string,
  title: string,
  description: string,
  generation: ArchiveGeneration,
  kind: ArchiveKind,
  primaryGenre: SkinArtGenre,
  sourceLogic: readonly SourceLogic[],
  primitives: readonly VisualPrimitive[],
  temporalModes: readonly TemporalMode[],
  spatialModes: readonly SpatialMode[],
  tags: readonly string[],
  versions: readonly ArchiveVersion[],
  lineage: Pick<SkinArtArchiveItem, "family" | "derivedFrom" | "influencedBy"> = {},
): SkinArtArchiveItem {
  return { id, title, description, generation, kind, primaryGenre, sourceLogic, primitives, temporalModes, spatialModes, tags, versions, ...lineage };
}

const formationItems: readonly SkinArtArchiveItem[] = NETWORK_FORMATION_ARTWORK_ORDER.map((workId) => {
  const choice = networkFormationVariant(workId);
  return item(
    `work-${workId}`,
    choice.label,
    choice.description,
    "works",
    "traversal",
    "formation",
    ["GRAPH", "LOCAL METRIC"],
    ["LINE", "HAIRLINE"],
    ["TRAVERSAL", "SEQUENCE"],
    ["OBJECT", "FIELD"],
    ["NETWORK FORMATION", "COMPLETED GRAPH", workId.toUpperCase()],
    [route("works", workId)],
    { family: "NETWORK FORMATION" },
  );
});

const studyMetadata: Record<string, Omit<SkinArtArchiveItem, "id" | "title" | "generation" | "kind" | "versions">> = {
  field: { description: "A shared field makes the completed bouquet legible beyond its edges.", primaryGenre: "field-particle", sourceLogic: ["FIELD", "GRAPH"], primitives: ["VOLUME", "FOG", "MIXED"], temporalModes: ["CONTINUOUS", "OSCILLATION"], spatialModes: ["FIELD", "SCREEN-FILLING"], tags: ["FIELD", "DENSITY", "DIFFUSION" ] },
  dust: { description: "Points and particles hold a relation before it becomes a line.", primaryGenre: "field-particle", sourceLogic: ["FIELD", "GRAPH"], primitives: ["POINT", "PARTICLE", "MIXED"], temporalModes: ["PROPAGATION", "EVENT"], spatialModes: ["FIELD", "SCREEN-FILLING"], tags: ["DUST", "PARTICLE", "PROPAGATION"] },
  growth: { description: "Flowers remain while the supports between them become visible.", primaryGenre: "support-relation", sourceLogic: ["GRAPH", "MOTIF", "LOCAL METRIC"], primitives: ["LINE", "RIBBON", "MIXED"], temporalModes: ["GROWTH", "SEQUENCE", "PHYSICS"], spatialModes: ["OBJECT", "FIELD"], tags: ["SUPPORT", "GROWTH", "RELATION"] },
  volume: { description: "The bouquet occupies the air between its parts as a changing density.", primaryGenre: "field-particle", sourceLogic: ["FIELD", "MOTIF"], primitives: ["VOLUME", "FOG", "GAUSSIAN"], temporalModes: ["CONTINUOUS", "OSCILLATION"], spatialModes: ["FIELD", "ROOM"], tags: ["VOLUME", "FOG", "BREATH"] },
  shadow: { description: "A permanent structure changes the room through light and projection.", primaryGenre: "light-atmosphere", sourceLogic: ["SHADOW OCCLUDER", "LIGHT", "GRAPH"], primitives: ["SHADOW", "FOG", "MIXED"], temporalModes: ["CONTINUOUS", "EVENT"], spatialModes: ["ROOM", "FIELD"], tags: ["SHADOW", "LIGHT", "ENVIRONMENT"] },
  scan: { description: "One moving encounter tests what can be known about the whole.", primaryGenre: "field-particle", sourceLogic: ["GRAPH", "LOCAL METRIC"], primitives: ["LINE", "MESH", "MIXED"], temporalModes: ["TRAVERSAL", "CONTINUOUS"], spatialModes: ["OBJECT", "CAMERA JOURNEY"], tags: ["SCAN", "SECTION", "ENCOUNTER"] },
  residue: { description: "A completed graph keeps the trace of hesitation that preceded it.", primaryGenre: "hand-trace-time", sourceLogic: ["GESTURE PROXY", "GRAPH"], primitives: ["HAIRLINE", "LINE", "MIXED"], temporalModes: ["SEQUENCE", "EVENT", "PHYSICS"], spatialModes: ["OBJECT", "FIELD"], tags: ["HAND", "TRACE", "RESIDUE", "HESITATION"] },
  matter: { description: "Support and flower lose their boundary as material settles into form.", primaryGenre: "support-relation", sourceLogic: ["MATERIAL PROXY", "GRAPH"], primitives: ["RIBBON", "VOLUME", "MIXED"], temporalModes: ["GROWTH", "PHYSICS", "ACCUMULATION"], spatialModes: ["OBJECT", "FIELD"], tags: ["SUPPORT", "MATERIAL", "FORM"] },
  gaussian: { description: "A bouquet is read as luminous density left in the air.", primaryGenre: "light-atmosphere", sourceLogic: ["LIGHT", "MOTIF", "FIELD"], primitives: ["GAUSSIAN", "POINT", "FOG"], temporalModes: ["ACCUMULATION", "CONTINUOUS", "EVENT"], spatialModes: ["FIELD", "ROOM", "SCREEN-FILLING"], tags: ["GAUSSIAN", "GS", "LIGHT", "DOF"] },
};

const studiesItems: readonly SkinArtArchiveItem[] = VISUAL_STUDIES.map((study) => {
  const metadata = studyMetadata[study.id]!;
  return item(`study-${study.id}`, study.title, metadata.description, "studies", "visual-study", metadata.primaryGenre, metadata.sourceLogic, metadata.primitives, metadata.temporalModes, metadata.spatialModes, metadata.tags, [route("studies", study.id)]);
});

const v1Items: readonly SkinArtArchiveItem[] = CONCEPT_MOVIES.map((movie) => {
  const fieldRoots = movie.id === "dust-to-light" ? ["study-dust", "study-gaussian"] : ["study-field", "study-volume", "study-gaussian"];
  const genre: SkinArtGenre = movie.id === "unstable-bloom" ? "hand-trace-time" : "light-atmosphere";
  return item(`v1-${movie.id}`, movie.title, movie.description, "v1", "concept-movie", genre, movie.id === "dust-to-light" ? ["FIELD", "LIGHT", "GRAPH"] : ["FIELD", "LIGHT", "MOTIF"], movie.id === "dust-to-light" ? ["POINT", "GAUSSIAN", "PARTICLE"] : ["GAUSSIAN", "VOLUME", "FOG"], movie.id === "unstable-bloom" ? ["SEQUENCE", "EVENT", "PROPAGATION"] : ["ACCUMULATION", "CONTINUOUS", "EVENT"], ["FIELD", "ROOM", "SCREEN-FILLING"], [movie.id.toUpperCase(), "CONCEPT MOVIE", "HANA + SKIN"], [route("v1", movie.id)], { derivedFrom: fieldRoots });
});

const v2Items: readonly SkinArtArchiveItem[] = CONCEPT_MOVIES_V2.map((movie) => {
  const metadata = ({
    "luminous-cloud": { genre: "light-atmosphere", source: ["FIELD", "LIGHT", "MOTIF"], primitives: ["POINT", "GAUSSIAN", "VOLUME", "FOG"], time: ["ACCUMULATION", "CONTINUOUS", "EVENT"], space: ["FIELD", "ROOM", "SCREEN-FILLING"], tags: ["CLOUD", "GS", "FOG", "SPACE"] },
    "wave-bloom": { genre: "field-particle", source: ["FIELD", "GRAPH", "LIGHT"], primitives: ["POINT", "PARTICLE", "GAUSSIAN"], time: ["PROPAGATION", "EVENT", "ACCUMULATION"], space: ["FIELD", "SCREEN-FILLING"], tags: ["WAVE", "PROPAGATION", "GS"] },
    "garden-in-the-air": { genre: "space-scale", source: ["MOTIF", "LIGHT", "FIELD"], primitives: ["GAUSSIAN", "POINT", "FOG"], time: ["CONTINUOUS", "ACCUMULATION"], space: ["MULTISCALE", "ROOM", "FIELD"], tags: ["BOUQUET", "DEPTH", "SPACE", "COLOR"] },
    "gathering-white": { genre: "light-atmosphere", source: ["LIGHT", "FIELD", "MOTIF"], primitives: ["GAUSSIAN", "PARTICLE", "FOG"], time: ["ACCUMULATION", "PROPAGATION", "EVENT"], space: ["FIELD", "SCREEN-FILLING", "ROOM"], tags: ["WHITE", "DENSITY", "OVERLAP", "GS"] },
    "weather-of-the-bouquet": { genre: "light-atmosphere", source: ["FIELD", "LIGHT", "MOTIF"], primitives: ["VOLUME", "FOG", "PARTICLE", "GAUSSIAN"], time: ["OSCILLATION", "EVENT", "PROPAGATION"], space: ["ROOM", "FIELD", "SCREEN-FILLING"], tags: ["WEATHER", "CLOUD", "WAVE", "WIND"] },
  }[movie.id]!) as { genre: SkinArtGenre; source: readonly SourceLogic[]; primitives: readonly VisualPrimitive[]; time: readonly TemporalMode[]; space: readonly SpatialMode[]; tags: readonly string[] };
  return item(`v2-${movie.id}`, movie.title, movie.description, "v2", "concept-movie", metadata.genre, metadata.source, metadata.primitives, metadata.time, metadata.space, [...metadata.tags, "CONCEPT MOVIE"], [route("v2", movie.id)], { derivedFrom: ["v1-bloom-saturation", "v1-dust-to-light"] });
});

const v3Item = item("v3-bouquet-weather", CONCEPT_MOVIE_V3.title, CONCEPT_MOVIE_V3.description, "v3", "concept-movie", "light-atmosphere", ["FIELD", "LIGHT", "MOTIF"], ["VOLUME", "GAUSSIAN", "FOG", "MIXED"], ["OSCILLATION", "PROPAGATION", "ACCUMULATION"], ["ROOM", "FIELD", "SCREEN-FILLING"], ["BOUQUET WEATHER", "CLOUD", "WAVE", "DAPPLED LIGHT", "ENVIRONMENT"], [route("v3", CONCEPT_MOVIE_V3.id)], { derivedFrom: ["v2-weather-of-the-bouquet", "v2-luminous-cloud"] });

const v4Genre: Record<string, SkinArtGenre> = { "weight-of-hesitation": "support-relation", "mutual-rescue": "support-relation", "void-bouquet": "space-scale", "inside-out": "support-relation", "one-hand-many-flowers": "hand-trace-time", "craft-strata": "material-fabrication", "shadow-room": "light-atmosphere", "micro-landscape": "space-scale", "visible-mending": "support-relation", "structural-choir": "support-relation" };
const v4Tags: Record<string, readonly string[]> = { "weight-of-hesitation": ["SUPPORT", "HESITATION", "CAMERA JOURNEY"], "mutual-rescue": ["SUPPORT", "RELATION", "CAMERA JOURNEY"], "void-bouquet": ["VOID", "INTERIOR", "CAMERA JOURNEY"], "inside-out": ["SUPPORT", "VOID", "PASS-THROUGH"], "one-hand-many-flowers": ["HAND", "TRACE", "CAMERA JOURNEY"], "craft-strata": ["MATERIAL", "FABRICATION", "MACRO"], "shadow-room": ["SHADOW", "ROOM", "LIGHT"], "micro-landscape": ["MULTISCALE", "PARALLAX", "CAMERA JOURNEY"], "visible-mending": ["REPAIR", "SUPPORT", "CAMERA JOURNEY"], "structural-choir": ["SUPPORT", "DEPTH", "CAMERA JOURNEY"] };

const v4Items: readonly SkinArtArchiveItem[] = CONCEPT_DEFINITIONS.map((concept) => {
  const id = concept.id;
  const versions = [
    version("baseline", "V4 BASELINE", `/skin-art/concepts-v4-baseline/?concept=${encodeURIComponent(id)}&panel=0`, "baseline"),
    version("quality", "V4 QUALITY LIFT", `/skin-art/concepts-v4/?concept=${encodeURIComponent(id)}&panel=0&quality=spatial-north-star`, "reference"),
    route("v4", id),
  ];
  const source: readonly SourceLogic[] = id === "craft-strata" ? ["MATERIAL PROXY", "GRAPH", "MOTIF"] : id === "shadow-room" ? ["SHADOW OCCLUDER", "LIGHT", "GRAPH"] : ["GRAPH", "MOTIF", "LOCAL METRIC"];
  const primitives: readonly VisualPrimitive[] = id === "shadow-room" ? ["SHADOW", "FOG", "GAUSSIAN"] : id === "craft-strata" ? ["RIBBON", "VOLUME", "MIXED"] : id === "micro-landscape" ? ["GAUSSIAN", "POINT", "FOG", "MIXED"] : ["GAUSSIAN", "POINT", "RIBBON", "MIXED"];
  const temporal: readonly TemporalMode[] = id === "shadow-room" ? ["CONTINUOUS", "EVENT", "OSCILLATION"] : id === "craft-strata" ? ["SEQUENCE", "PHYSICS", "ACCUMULATION"] : ["TRAVERSAL", "EVENT", "PROPAGATION", "ACCUMULATION"];
  const spatial: readonly SpatialMode[] = id === "micro-landscape" ? ["MULTISCALE", "INTERIOR", "CAMERA JOURNEY"] : id === "void-bouquet" ? ["VOID", "INTERIOR", "CAMERA JOURNEY"] : id === "shadow-room" ? ["ROOM", "FIELD", "CAMERA JOURNEY"] : ["OBJECT", "FIELD", "CAMERA JOURNEY"];
  const roots = id === "void-bouquet" ? ["study-gaussian", "v2-luminous-cloud"] : id === "craft-strata" ? ["study-matter"] : id === "one-hand-many-flowers" ? ["study-residue", "v1-unstable-bloom"] : ["v3-bouquet-weather", "v2-weather-of-the-bouquet"];
  return item(`v4-${id}`, concept.title, concept.statement, "v4", "concept-system", v4Genre[id]!, source, primitives, temporal, spatial, v4Tags[id]!, versions, { derivedFrom: roots });
});

export const ARCHIVE_ITEMS: readonly SkinArtArchiveItem[] = [...formationItems, ...studiesItems, ...v1Items, ...v2Items, v3Item, ...v4Items];
export const ARCHIVE_TOTAL = ARCHIVE_ITEMS.length;

export function archiveItem(id: string | null | undefined): SkinArtArchiveItem | undefined {
  if (!id) return undefined;
  return ARCHIVE_ITEMS.find((item) => item.id === id || item.id.replace(/^(work|study|v1|v2|v3|v4)-/, "") === id);
}
