export const CONCEPT_MOVIE_V2_IDS = [
  "luminous-cloud",
  "wave-bloom",
  "garden-in-the-air",
  "gathering-white",
  "weather-of-the-bouquet",
] as const;

export type ConceptMovieV2Id = typeof CONCEPT_MOVIE_V2_IDS[number];
export type ConceptMovieV2Palette = "rich" | "red" | "blue";

export interface ConceptMovieV2Choice {
  readonly id: ConceptMovieV2Id;
  readonly number: string;
  readonly title: string;
  readonly description: string;
  readonly duration: number;
}

export const CONCEPT_MOVIES_V2: readonly ConceptMovieV2Choice[] = [
  {
    id: "luminous-cloud",
    number: "01",
    title: "LUMINOUS CLOUD",
    description: "A bouquet enters the room as point, cloud, and light.",
    duration: 22_000,
  },
  {
    id: "wave-bloom",
    number: "02",
    title: "WAVE BLOOM",
    description: "Relation travels outward and changes the air it crosses.",
    duration: 15_000,
  },
  {
    id: "garden-in-the-air",
    number: "03",
    title: "GARDEN IN THE AIR",
    description: "Near light, distant dust, and colour share one space.",
    duration: 30_000,
  },
  {
    id: "gathering-white",
    number: "04",
    title: "GATHERING WHITE",
    description: "White arrives as the consequence of accumulated light.",
    duration: 20_000,
  },
  {
    id: "weather-of-the-bouquet",
    number: "05",
    title: "WEATHER OF THE BOUQUET",
    description: "A bouquet becomes a changing weather around its source.",
    duration: 25_000,
  },
] as const;

export function conceptMovieV2Choice(id: ConceptMovieV2Id): ConceptMovieV2Choice {
  return CONCEPT_MOVIES_V2.find((choice) => choice.id === id)!;
}

export function resolveConceptMovieV2Id(value: string | null): ConceptMovieV2Id {
  return CONCEPT_MOVIE_V2_IDS.includes(value as ConceptMovieV2Id)
    ? value as ConceptMovieV2Id
    : "luminous-cloud";
}

export function resolveConceptMovieV2Palette(value: string | null): ConceptMovieV2Palette {
  return value === "red" || value === "blue" ? value : "rich";
}

export function adjacentConceptMovieV2(id: ConceptMovieV2Id, direction: -1 | 1): ConceptMovieV2Id {
  const index = CONCEPT_MOVIE_V2_IDS.indexOf(id);
  return CONCEPT_MOVIE_V2_IDS[(index + direction + CONCEPT_MOVIE_V2_IDS.length) % CONCEPT_MOVIE_V2_IDS.length]!;
}
