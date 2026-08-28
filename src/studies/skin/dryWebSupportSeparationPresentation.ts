import type { OverhangAssignmentEntry } from "./overhangSupportPolicy.ts";

export type DryWebSupportSeparationState = "missing" | "current";

export interface DryWebSupportSeparationInput {
  readonly beforeDangerPositions: Float32Array | null;
  readonly afterDangerPositions: Float32Array | null;
  readonly mitigatedPositions: Float32Array | null;
  readonly entries: readonly OverhangAssignmentEntry[] | null;
}

export interface DryWebSupportSeparationPresentation {
  readonly state: DryWebSupportSeparationState;
  readonly mitigatedPositions: Float32Array;
  readonly outsidePositions: Float32Array;
  /**
   * Source-face ordinals in `beforeDangerPositions`, in the same order as
   * the triangles in `outsidePositions`. This is a runtime presentation fact
   * only; it is deliberately not part of the diagnosis/cache/recipe format.
   */
  readonly outsideSourceFaceIndices: readonly number[];
  readonly unresolvedPositions: Float32Array;
  readonly mitigatedFaceCount: number;
  readonly outsideFaceCount: number;
  readonly unresolvedFaceCount: number;
  readonly totalFaceCount: number;
  readonly reason: string;
}

const EMPTY_POSITIONS = (): Float32Array => new Float32Array(0);
const EMPTY_FACE_INDICES = (): readonly number[] => Object.freeze([] as number[]);
const REQUIRED_DIAGNOSED_FACE_SITE_COUNT = 4;

function isFiniteTriangleBuffer(positions: Float32Array | null): positions is Float32Array {
  if (!positions || positions.length % 9 !== 0) return false;
  for (let index = 0; index < positions.length; index++) {
    if (!Number.isFinite(positions[index])) return false;
  }
  return true;
}

const float32BitsScratch = new Float32Array(1);
const float32BitsScratchUint = new Uint32Array(float32BitsScratch.buffer);

function float32Bits(value: number): string {
  float32BitsScratch[0] = value;
  return float32BitsScratchUint[0].toString(16).padStart(8, "0");
}

/** Preserve exact Float32 value bits, including signed zero, and vertex order. */
export function dryWebSupportSeparationTriangleKey(
  positions: Float32Array,
  offset: number,
): string {
  let key = "";
  for (let index = 0; index < 9; index++) key += float32Bits(positions[offset + index]);
  return key;
}

function emptyPresentation(reason = "Dry Web付加後の支持分離が未確認です"): DryWebSupportSeparationPresentation {
  return {
    state: "missing",
    mitigatedPositions: EMPTY_POSITIONS(),
    outsidePositions: EMPTY_POSITIONS(),
    outsideSourceFaceIndices: EMPTY_FACE_INDICES(),
    unresolvedPositions: EMPTY_POSITIONS(),
    mitigatedFaceCount: 0,
    outsideFaceCount: 0,
    unresolvedFaceCount: 0,
    totalFaceCount: 0,
    reason,
  };
}

function isOutsideOnlyCurrentFace(
  entriesByFace: ReadonlyMap<number, readonly OverhangAssignmentEntry[]>,
  faceIndex: number,
): boolean {
  const entries = entriesByFace.get(faceIndex);
  if (!entries) return false;
  let diagnosedCount = 0;
  let siteMask = 0;
  for (const entry of entries) {
    if (entry.source !== "diagnosed-face") continue;
    diagnosedCount++;
    if (entry.duplicateOf || entry.classification !== "outside") return false;
    if (!Number.isInteger(entry.siteIndex) || entry.siteIndex < 0 || entry.siteIndex > 3) return false;
    const siteBit = 1 << entry.siteIndex;
    if ((siteMask & siteBit) !== 0) return false;
    siteMask |= siteBit;
  }
  return diagnosedCount === REQUIRED_DIAGNOSED_FACE_SITE_COUNT && siteMask === 0b1111;
}

/**
 * Split the exact post-attachment diagnosis into display-only buffers. A
 * before-danger triangle can feed the orange bucket only when its Float32
 * fact occurs exactly once and every current diagnosed site for that face is
 * a unique outside site. Any ambiguity fails closed into red.
 */
export function createDryWebSupportSeparationPresentation(
  input: DryWebSupportSeparationInput | null,
): DryWebSupportSeparationPresentation {
  if (!input
    || !isFiniteTriangleBuffer(input.beforeDangerPositions)
    || !isFiniteTriangleBuffer(input.afterDangerPositions)
    || !isFiniteTriangleBuffer(input.mitigatedPositions)
    || !input.entries) return emptyPresentation();

  const beforeOccurrences = new Map<string, number[]>();
  for (let offset = 0, faceIndex = 0; offset < input.beforeDangerPositions.length; offset += 9, faceIndex++) {
    const key = dryWebSupportSeparationTriangleKey(input.beforeDangerPositions, offset);
    const occurrences = beforeOccurrences.get(key);
    if (occurrences) occurrences.push(faceIndex);
    else beforeOccurrences.set(key, [faceIndex]);
  }
  const entriesByFace = new Map<number, OverhangAssignmentEntry[]>();
  for (const entry of input.entries) {
    if (entry.source !== "diagnosed-face" || !Number.isInteger(entry.faceIndex) || entry.faceIndex! < 0) continue;
    const entries = entriesByFace.get(entry.faceIndex!);
    if (entries) entries.push(entry);
    else entriesByFace.set(entry.faceIndex!, [entry]);
  }

  const usedBeforeFaces = new Set<number>();
  const outside: number[] = [];
  const outsideSourceFaceIndices: number[] = [];
  const unresolved: number[] = [];
  for (let offset = 0; offset < input.afterDangerPositions.length; offset += 9) {
    const key = dryWebSupportSeparationTriangleKey(input.afterDangerPositions, offset);
    const occurrences = beforeOccurrences.get(key);
    const beforeFaceIndex = occurrences && occurrences.length === 1 ? occurrences[0] : undefined;
    const uniqueUnconsumed = beforeFaceIndex !== undefined && !usedBeforeFaces.has(beforeFaceIndex);
    if (uniqueUnconsumed) usedBeforeFaces.add(beforeFaceIndex);
    const target = uniqueUnconsumed && isOutsideOnlyCurrentFace(entriesByFace, beforeFaceIndex!)
      ? outside
      : unresolved;
    if (target === outside) outsideSourceFaceIndices.push(beforeFaceIndex!);
    for (let index = 0; index < 9; index++) target.push(input.afterDangerPositions[offset + index]);
  }

  const mitigatedPositions = input.mitigatedPositions.slice();
  const outsidePositions = new Float32Array(outside);
  const unresolvedPositions = new Float32Array(unresolved);
  const mitigatedFaceCount = mitigatedPositions.length / 9;
  const outsideFaceCount = outsidePositions.length / 9;
  const unresolvedFaceCount = unresolvedPositions.length / 9;
  return {
    state: "current",
    mitigatedPositions,
    outsidePositions,
    outsideSourceFaceIndices: Object.freeze(outsideSourceFaceIndices.slice()),
    unresolvedPositions,
    mitigatedFaceCount,
    outsideFaceCount,
    unresolvedFaceCount,
    totalFaceCount: mitigatedFaceCount + outsideFaceCount + unresolvedFaceCount,
    reason: "青緑=Dry Web到達候補 / 橙=外側・取り外しサポート候補 / 赤=内部/不明・Dry Web調整が必要",
  };
}

export function dryWebSupportSeparationOutputBlockReason(
  internalStructure: string,
  separation: DryWebSupportSeparationPresentation | null,
): string | null {
  if (internalStructure !== "targetedGrid") return null;
  if (!separation || separation.state !== "current") return "Dry Web付加後の支持分離が未確認です";
  if (separation.unresolvedFaceCount > 0) {
    return `内部/不明の未支持面が${separation.unresolvedFaceCount}面残っています。Dry Webを調整して再診断してください`;
  }
  return null;
}
