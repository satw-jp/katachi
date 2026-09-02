import assert from "node:assert/strict";
import { CONCEPT_MOVIE_V3, resolveConceptMovieV3Palette } from "./catalog.ts";

assert.equal(CONCEPT_MOVIE_V3.id, "bouquet-weather");
assert.equal(CONCEPT_MOVIE_V3.title, "BOUQUET WEATHER");
assert.equal(CONCEPT_MOVIE_V3.duration, 42_000);
assert.equal(resolveConceptMovieV3Palette("red"), "red");
assert.equal(resolveConceptMovieV3Palette("unknown"), "rich");
console.log("skin concept movies v3 catalog tests passed");
