import type { OpticalDissolvePresetId } from "./opticalImprint.ts";
import type { OpticalFormMotionMode } from "./formObservation/opticalMotion.ts";

export type HikariPublishedStudyId =
  | "form-points"
  | "flow-trails"
  | "orbit"
  | "optical-imprint"
  | "dissolve-drawing";

export interface HikariPublishedStudyPreset {
  bodySource: "form" | "optics";
  placement: "background" | "integrated" | "foreground";
  motionMode: OpticalFormMotionMode;
  trailLength: number;
  speed: number;
  pointMotion: number;
  opticalMapping: number;
  trailDensity: number;
  causticBoost: number;
  blackBackground: boolean;
  dissolvePreset: OpticalDissolvePresetId;
}

const PRESETS: Readonly<Record<HikariPublishedStudyId, HikariPublishedStudyPreset>> = Object.freeze({
  "form-points": Object.freeze({
    bodySource: "form", placement: "integrated", motionMode: "stream",
    trailLength: 0.01, speed: 0.75, pointMotion: 0.12, opticalMapping: 4,
    trailDensity: 0.25, causticBoost: 3.2, blackBackground: false, dissolvePreset: "half",
  }),
  "flow-trails": Object.freeze({
    bodySource: "form", placement: "integrated", motionMode: "flowTrails",
    trailLength: 0.68, speed: 1.4, pointMotion: 0.1, opticalMapping: 5,
    trailDensity: 2, causticBoost: 4.2, blackBackground: false, dissolvePreset: "half",
  }),
  orbit: Object.freeze({
    bodySource: "form", placement: "integrated", motionMode: "orbit",
    trailLength: 0.48, speed: 1.1, pointMotion: 0.08, opticalMapping: 4.5,
    trailDensity: 3, causticBoost: 4.5, blackBackground: false, dissolvePreset: "half",
  }),
  "optical-imprint": Object.freeze({
    bodySource: "form", placement: "background", motionMode: "stream",
    trailLength: 0.08, speed: 0.75, pointMotion: 0.025, opticalMapping: 1,
    trailDensity: 1, causticBoost: 6, blackBackground: false, dissolvePreset: "half",
  }),
  "dissolve-drawing": Object.freeze({
    bodySource: "optics", placement: "integrated", motionMode: "stream",
    trailLength: 0.08, speed: 0.75, pointMotion: 0.025, opticalMapping: 1,
    trailDensity: 1, causticBoost: 5.5, blackBackground: true, dissolvePreset: "drawing",
  }),
});

export function getHikariPublishedStudyPreset(value: string | undefined): HikariPublishedStudyPreset | null {
  if (!value || !(value in PRESETS)) return null;
  return PRESETS[value as HikariPublishedStudyId];
}
