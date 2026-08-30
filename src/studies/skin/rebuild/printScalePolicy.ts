/**
 * Physical-size policy for SKIN REBUILD.
 *
 * The first-print reference remains an immutable 80 mm artifact. New SKIN
 * REBUILD sessions start at 120 mm after the author found the printed object
 * too small. A restored FKEI always keeps its explicit saved target instead
 * of being silently migrated to the new default.
 */

export const SKIN_REBUILD_FIRST_PRINT_TARGET_LONGEST_MM = 80;
export const SKIN_REBUILD_AUTHOR_SCALE_FACTOR = 1.5;
export const SKIN_REBUILD_NEW_PROJECT_TARGET_LONGEST_MM =
  SKIN_REBUILD_FIRST_PRINT_TARGET_LONGEST_MM * SKIN_REBUILD_AUTHOR_SCALE_FACTOR;
export const SKIN_REBUILD_FIRST_PRINT_STRUT_DIAMETER_MM = 2.6;
export const SKIN_REBUILD_NEW_PROJECT_STRUT_DIAMETER_MM =
  Math.round(SKIN_REBUILD_FIRST_PRINT_STRUT_DIAMETER_MM * SKIN_REBUILD_AUTHOR_SCALE_FACTOR * 10) / 10;
export const SKIN_REBUILD_FIRST_PRINT_SUPPORT_DIAMETER_MM = 1.6;
export const SKIN_REBUILD_NEW_PROJECT_SUPPORT_DIAMETER_MM =
  SKIN_REBUILD_FIRST_PRINT_SUPPORT_DIAMETER_MM;

export interface SkinRebuildPhysicalSettings {
  targetLongestMm: number;
  strutDiameterMm: number;
  supportDiameterMm: number;
}

function positivePhysicalValueChanged(previous: number, current: number, tolerance: number): boolean {
  if (!(Number.isFinite(previous) && previous > 0)) return true;
  if (!(Number.isFinite(current) && current > 0)) return true;
  return Math.abs(previous - current) > tolerance;
}

export function defaultTargetLongestMmForSkinApp(isSkinRebuildApp: boolean): number {
  return isSkinRebuildApp
    ? SKIN_REBUILD_NEW_PROJECT_TARGET_LONGEST_MM
    : SKIN_REBUILD_FIRST_PRINT_TARGET_LONGEST_MM;
}

export function skinRebuildTargetScaleChanged(
  projectTargetLongestMm: number,
  currentTargetLongestMm: number,
  toleranceMm = 1e-9,
): boolean {
  return positivePhysicalValueChanged(projectTargetLongestMm, currentTargetLongestMm, toleranceMm);
}

export function skinRebuildPhysicalSettingsChanged(
  previous: SkinRebuildPhysicalSettings,
  current: SkinRebuildPhysicalSettings,
  tolerance = 1e-9,
): boolean {
  return positivePhysicalValueChanged(previous.targetLongestMm, current.targetLongestMm, tolerance)
    || positivePhysicalValueChanged(previous.strutDiameterMm, current.strutDiameterMm, tolerance)
    || positivePhysicalValueChanged(previous.supportDiameterMm, current.supportDiameterMm, tolerance);
}
