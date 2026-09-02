import assert from "node:assert/strict";
import { adjacentConceptMovie, CONCEPT_MOVIES, resolveConceptMovieId, resolveConceptPalette } from "./catalog.ts";

assert.equal(CONCEPT_MOVIES.length, 5);
assert.equal(new Set(CONCEPT_MOVIES.map((movie) => movie.id)).size, 5);
assert.equal(new Set(CONCEPT_MOVIES.map((movie) => movie.duration)).size, 3);
assert.deepEqual(CONCEPT_MOVIES.map((movie) => movie.title), [
  "BLOOM SATURATION",
  "BREATHING BOUQUET",
  "DUST TO LIGHT",
  "LIGHT THROUGH GAPS",
  "UNSTABLE BLOOM",
]);
assert.equal(resolveConceptMovieId("unknown"), "bloom-saturation");
assert.equal(resolveConceptPalette("red"), "red");
assert.equal(resolveConceptPalette("unknown"), "rich");
assert.equal(adjacentConceptMovie("bloom-saturation", -1), "unstable-bloom");
assert.equal(adjacentConceptMovie("unstable-bloom", 1), "bloom-saturation");
console.log("skin concept movies catalog tests passed");
