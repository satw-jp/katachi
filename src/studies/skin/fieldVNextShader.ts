/**
 * Shadow FIELD vNext semantic evaluator.
 *
 * The Browser Gate owns the isolated WebGL/DataTexture transport probe. This
 * module owns the pure semantic contract used before any GPU integration:
 * host field, shell band, mode boolean, shape grouping, smooth operations,
 * coinBulge, and coinBulgeBalance are all evaluated from the uncapped payload.
 *
 * Production shaders.ts and renderer.ts are intentionally not imported or
 * modified by this lab path. Spatial culling is also intentionally absent.
 */

import {
  evaluateFieldVNextSemantic,
  type FieldSample,
  type FieldVNextSemanticConfig,
} from "./fieldVNextSemantic.ts";

export type VNextShaderScene = Omit<FieldVNextSemanticConfig, "payload">;

export type VNextShaderEval = {
  /** Signed distance at the sample point. */
  sdf: number;
};

/** Evaluate the full FIELD vNext semantic contract for one sample. */
export function evaluateVNextShader(
  sample: FieldSample,
  payload: FieldVNextSemanticConfig["payload"],
  scene: VNextShaderScene,
): VNextShaderEval {
  return {
    sdf: evaluateFieldVNextSemantic({ ...scene, payload }, sample),
  };
}
