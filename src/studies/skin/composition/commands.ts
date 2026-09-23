import {
  buildCompositionBranches,
  loadCompositionHost,
  placeCompositionFlowers,
} from "./compositionModel.ts";
import { restoreCompositionProject, serializeCompositionProject } from "./compositionProject.ts";

/** The same named boundary is called by the UI and the verification tests. */
export const compositionCommands = Object.freeze({
  loadHost: loadCompositionHost,
  placeFlowers: placeCompositionFlowers,
  buildBranches: buildCompositionBranches,
  saveComposition: serializeCompositionProject,
  restoreComposition: restoreCompositionProject,
});
