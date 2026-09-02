export type ConceptMovieV3Palette = "rich" | "red" | "blue";

export const CONCEPT_MOVIE_V3_ID = "bouquet-weather" as const;

export interface ConceptMovieV3Choice {
  readonly id: typeof CONCEPT_MOVIE_V3_ID;
  readonly number: "01";
  readonly title: "BOUQUET WEATHER";
  readonly description: string;
  readonly duration: number;
}

export const CONCEPT_MOVIE_V3: ConceptMovieV3Choice = {
  id: CONCEPT_MOVIE_V3_ID,
  number: "01",
  title: "BOUQUET WEATHER",
  description: "A bouquet persists as weather in the room around it.",
  duration: 42_000,
};

export function resolveConceptMovieV3Palette(value: string | null): ConceptMovieV3Palette {
  return value === "red" || value === "blue" ? value : "rich";
}
