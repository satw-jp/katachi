export const CONCEPT_MOVIE_IDS = [
  "bloom-saturation",
  "breathing-bouquet",
  "dust-to-light",
  "light-through-gaps",
  "unstable-bloom",
] as const;

export type ConceptMovieId = typeof CONCEPT_MOVIE_IDS[number];
export type ConceptPalette = "rich" | "red" | "blue";

export interface ConceptMovieChoice {
  readonly id: ConceptMovieId;
  readonly number: string;
  readonly title: string;
  readonly description: string;
  readonly duration: number;
}

export const CONCEPT_MOVIES: readonly ConceptMovieChoice[] = [
  {
    id: "bloom-saturation",
    number: "01",
    title: "BLOOM SATURATION",
    description: "Colour leaves the bouquet and fills the room.",
    duration: 20_000,
  },
  {
    id: "breathing-bouquet",
    number: "02",
    title: "BREATHING BOUQUET",
    description: "A flower bundle exists as asynchronous density.",
    duration: 30_000,
  },
  {
    id: "dust-to-light",
    number: "03",
    title: "DUST TO LIGHT",
    description: "Particles become light when they find relation.",
    duration: 15_000,
  },
  {
    id: "light-through-gaps",
    number: "04",
    title: "LIGHT THROUGH GAPS",
    description: "The object is inferred from what it lets through.",
    duration: 20_000,
  },
  {
    id: "unstable-bloom",
    number: "05",
    title: "UNSTABLE BLOOM",
    description: "A bouquet keeps becoming, hesitating, and returning.",
    duration: 15_000,
  },
] as const;

export function conceptMovieChoice(id: ConceptMovieId): ConceptMovieChoice {
  return CONCEPT_MOVIES.find((choice) => choice.id === id)!;
}

export function resolveConceptMovieId(value: string | null): ConceptMovieId {
  return CONCEPT_MOVIE_IDS.includes(value as ConceptMovieId)
    ? value as ConceptMovieId
    : "bloom-saturation";
}

export function resolveConceptPalette(value: string | null): ConceptPalette {
  return value === "red" || value === "blue" ? value : "rich";
}

export function adjacentConceptMovie(id: ConceptMovieId, direction: -1 | 1): ConceptMovieId {
  const index = CONCEPT_MOVIE_IDS.indexOf(id);
  return CONCEPT_MOVIE_IDS[(index + direction + CONCEPT_MOVIE_IDS.length) % CONCEPT_MOVIE_IDS.length]!;
}
