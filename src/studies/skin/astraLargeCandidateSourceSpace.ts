import { sha256Hex } from "../../lib/hash.ts";

export const ASTRA_LARGE_CANDIDATE_EXECUTION_FINGERPRINT_VERSION = "astra-candidate-source-space-execution-f32-le-v0";
export const ASTRA_LARGE_CANDIDATE_CANONICALIZATION_VERSION = "astra-candidate-source-f32-exact-zero-v0";
export const ASTRA_LARGE_CANDIDATE_PLACEMENT_RULE = "common-lowest-candidate-point-to-plate-z0";

export interface DeferredPrintPlacement {
  readonly rule: typeof ASTRA_LARGE_CANDIDATE_PLACEMENT_RULE;
  readonly translationMm: { readonly x: number; readonly y: number; readonly z: number };
  readonly sourcePlateZMm: number;
}

export function makeDeferredPrintPlacement(commonTranslationZ: number): DeferredPrintPlacement {
  if (!Number.isFinite(commonTranslationZ)) throw new Error("Common candidate placement must be finite");
  return Object.freeze({
    rule: ASTRA_LARGE_CANDIDATE_PLACEMENT_RULE,
    translationMm: { x: 0, y: 0, z: commonTranslationZ },
    sourcePlateZMm: -commonTranslationZ,
  });
}

export async function makeSourceSpaceExecutionFingerprint(input: {
  sourceSha256: string;
  sourceGeometrySha256: string;
  executionGeometrySha256: string;
  sourceTriangleCount: number;
  executionTriangleCount: number;
  removedExactZeroSourceFaceIndices: readonly number[];
  placement: DeferredPrintPlacement;
  sourceInterpretationVersion: string;
}): Promise<string> {
  return sha256Hex(JSON.stringify({
    version: ASTRA_LARGE_CANDIDATE_EXECUTION_FINGERPRINT_VERSION,
    sourceSha256: input.sourceSha256,
    sourceGeometrySha256: input.sourceGeometrySha256,
    executionGeometrySha256: input.executionGeometrySha256,
    sourceTriangleCount: input.sourceTriangleCount,
    executionTriangleCount: input.executionTriangleCount,
    canonicalizationVersion: ASTRA_LARGE_CANDIDATE_CANONICALIZATION_VERSION,
    removedExactZeroSourceFaceIndices: input.removedExactZeroSourceFaceIndices,
    deferredPlacement: input.placement,
    sourceInterpretationVersion: input.sourceInterpretationVersion,
  }));
}

export function sourceFaceIndexForExecutionFace(executionFaceIndex: number, removed: readonly number[]): number {
  if (!Number.isInteger(executionFaceIndex) || executionFaceIndex < 0) throw new Error("Execution face index must be a non-negative integer");
  let sourceFaceIndex = executionFaceIndex;
  for (const removedFaceIndex of removed) {
    if (removedFaceIndex <= sourceFaceIndex) sourceFaceIndex += 1;
    else break;
  }
  return sourceFaceIndex;
}
