import { canonicalStringify } from "../graphCore.ts";
import { sha256HexSync } from "../../../lib/hash.ts";
import {
  SKIN_REBUILD_FIRST_PRINT_TARGET_LONGEST_MM,
  SKIN_REBUILD_NEW_PROJECT_TARGET_LONGEST_MM,
  type SkinRebuildPhysicalSettings,
} from "./printScalePolicy.ts";

/**
 * SKIN Golden LUNA — Output Scale / Physical Diameter Separation v0.
 *
 * Shape Scale != Member Diameter. The overall artwork scale (OUTPUT) and the
 * material / structural thickness (STRUCTURE / FABRICATION) are independent
 * physical controls:
 *
 * - AUTHORING SPACE (Base / Motif / Surface Pattern / Graph, relative
 *   placement and proportions) follows the overall Output Size ratio.
 * - `targetLongestMm` (Overall Size, longest dimension in mm) scales the
 *   whole authored geometry by one ratio.
 * - `strutDiameterMm` (Permanent member) and `supportDiameterMm` (Removable
 *   Support) are absolute mm values. Changing Output Size alone never changes
 *   them; only an explicit re-realization rebuilds the mesh at the same mm.
 *
 * This module is pure (no DOM, no workers). UI status text and the export
 * report reuse these helpers so tests can pin the contract.
 */

/** Historical reference sizes. Neither is "the correct size". */
export const OUTPUT_SCALE_PRESET_MM = [
  SKIN_REBUILD_FIRST_PRINT_TARGET_LONGEST_MM,
  SKIN_REBUILD_NEW_PROJECT_TARGET_LONGEST_MM,
] as const;

export type OutputScalePresetLabel = "80 mm" | "120 mm" | "Custom";

export function outputScalePresetLabel(targetLongestMm: number): OutputScalePresetLabel {
  if (targetLongestMm === SKIN_REBUILD_FIRST_PRINT_TARGET_LONGEST_MM) return "80 mm";
  if (targetLongestMm === SKIN_REBUILD_NEW_PROJECT_TARGET_LONGEST_MM) return "120 mm";
  return "Custom";
}

/** Overall artwork scale ratio for an Output Size change (e.g. 80 -> 120 = 1.5). */
export function outputScaleFactor(previousTargetLongestMm: number, currentTargetLongestMm: number): number {
  if (!(previousTargetLongestMm > 0) || !Number.isFinite(previousTargetLongestMm)) {
    throw new Error("previous Output Size must be a positive mm value");
  }
  if (!(currentTargetLongestMm > 0) || !Number.isFinite(currentTargetLongestMm)) {
    throw new Error("current Output Size must be a positive mm value");
  }
  return currentTargetLongestMm / previousTargetLongestMm;
}

/** Expected overall physical extent after an Output Size change. */
export function expectedOverallExtentMm(
  previousExtentMm: number,
  previousTargetLongestMm: number,
  currentTargetLongestMm: number,
): number {
  return previousExtentMm * outputScaleFactor(previousTargetLongestMm, currentTargetLongestMm);
}

/** Stable identity of one physical preparation (output size + diameters). */
export function physicalSettingsFingerprint(settings: SkinRebuildPhysicalSettings): string {
  return sha256HexSync(`output-scale-physical-settings\n${canonicalStringify(settings)}`);
}

export type PhysicalPreparationState = "CURRENT" | "STALE";
export type PhysicalExportState = "AVAILABLE" | "NEEDS PREP";

export interface OutputScalePreparation {
  geometry: PhysicalPreparationState;
  support: PhysicalPreparationState;
  export: PhysicalExportState;
  reasons: string[];
}

/**
 * Stale rule: changing any of targetLongestMm / strutDiameterMm /
 * supportDiameterMm makes the physical preparation STALE. Authoring geometry
 * itself is never marked stale here — only the physical realization.
 *
 * - Output Size change -> geometry STALE and support STALE (a finished 3MF
 *   must never be plainly rescaled, which would also rescale the diameters).
 * - Permanent diameter change -> geometry STALE (re-realize the lattice).
 * - Support diameter change -> support STALE (regenerate Stage 8).
 */
export function evaluateOutputScalePreparation(
  prepared: SkinRebuildPhysicalSettings | null,
  current: SkinRebuildPhysicalSettings,
): OutputScalePreparation {
  if (prepared === null) {
    return {
      geometry: "STALE",
      support: "STALE",
      export: "NEEDS PREP",
      reasons: ["Print geometry has not been prepared yet"],
    };
  }
  const reasons: string[] = [];
  let geometry: PhysicalPreparationState = "CURRENT";
  let support: PhysicalPreparationState = "CURRENT";
  const outputChanged = prepared.targetLongestMm !== current.targetLongestMm;
  const strutChanged = prepared.strutDiameterMm !== current.strutDiameterMm;
  const supportChanged = prepared.supportDiameterMm !== current.supportDiameterMm;
  if (outputChanged) {
    geometry = "STALE";
    support = "STALE";
    reasons.push(
      `Output Size ${prepared.targetLongestMm} → ${current.targetLongestMm} mm · Print geometry needs update · Print geometry must be recalculated.`,
    );
  }
  if (strutChanged) {
    geometry = "STALE";
    reasons.push(
      `Permanent member ${prepared.strutDiameterMm} → ${current.strutDiameterMm} mm · lattice must be re-realized at the specified mm.`,
    );
  }
  if (supportChanged) {
    support = "STALE";
    reasons.push(
      `Removable Support ${prepared.supportDiameterMm} → ${current.supportDiameterMm} mm · Stage 8 support must be regenerated.`,
    );
  }
  if (!outputChanged && !strutChanged && !supportChanged) {
    return { geometry, support, export: "AVAILABLE", reasons };
  }
  return {
    geometry,
    support,
    export: geometry === "CURRENT" && support === "CURRENT" ? "AVAILABLE" : "NEEDS PREP",
    reasons,
  };
}

export interface PhysicalBoundsMmInput {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface PhysicalBoundsMm {
  x: number;
  y: number;
  z: number;
  longest: number;
}

/** Report-oriented physical bounds derived from already-exported mm positions. */
export function toPhysicalBoundsMm(bounds: PhysicalBoundsMmInput | null): PhysicalBoundsMm | null {
  if (!bounds) return null;
  const extent = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  if (![extent.x, extent.y, extent.z].every((value) => Number.isFinite(value) && value >= 0)) return null;
  return { ...extent, longest: Math.max(extent.x, extent.y, extent.z) };
}

/**
 * Source vs physical fingerprint separation: the same authoring geometry at
 * 120 mm and 180 mm shares the source identity but yields different physical
 * artifact fingerprints.
 */
export function physicalArtifactFingerprint(sourceFingerprint: string, settings: SkinRebuildPhysicalSettings): string {
  return sha256HexSync(`output-scale-physical-artifact\n${sourceFingerprint}\n${canonicalStringify(settings)}`);
}
