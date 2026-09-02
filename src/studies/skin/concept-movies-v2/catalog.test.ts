import assert from "node:assert/strict";
import {
  adjacentConceptMovieV2,
  CONCEPT_MOVIES_V2,
  resolveConceptMovieV2Id,
  resolveConceptMovieV2Palette,
} from "./catalog.ts";

assert.equal(CONCEPT_MOVIES_V2.length, 5);
assert.equal(new Set(CONCEPT_MOVIES_V2.map((movie) => movie.id)).size, 5);
assert.equal(new Set(CONCEPT_MOVIES_V2.map((movie) => movie.duration)).size, 5);
assert.deepEqual(CONCEPT_MOVIES_V2.map((movie) => movie.title), [
  "LUMINOUS CLOUD",
  "WAVE BLOOM",
  "GARDEN IN THE AIR",
  "GATHERING WHITE",
  "WEATHER OF THE BOUQUET",
]);
assert.equal(resolveConceptMovieV2Id("unknown"), "luminous-cloud");
assert.equal(resolveConceptMovieV2Palette("red"), "red");
assert.equal(resolveConceptMovieV2Palette("unknown"), "rich");
assert.equal(adjacentConceptMovieV2("luminous-cloud", -1), "weather-of-the-bouquet");
assert.equal(adjacentConceptMovieV2("weather-of-the-bouquet", 1), "luminous-cloud");
console.log("skin concept movies v2 catalog tests passed");
