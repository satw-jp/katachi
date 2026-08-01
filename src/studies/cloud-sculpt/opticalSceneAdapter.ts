import type { Ball } from "./field.ts";
import type { OpticalSettings } from "./optics.ts";
import {
  IDENTITY_QUATERNION,
  type OpticalMaterial,
  type OpticalScene,
  type Rgb,
} from "./opticalScene.ts";
import { findInvalidContainment, validateOpticalScene } from "./opticalGeometry.ts";
import { resolveDaylight } from "./daylight.ts";
import { generateInclusions } from "./inclusionGenerator.ts";

/**
 * The current cloud has no authored physical dimension yet. Twenty millimetres
 * per shape unit keeps the legacy visual density in a plausible hand-scale
 * range, but remains explicitly an assumption in saved/analysis data.
 */
export const CURRENT_ASSUMED_MM_PER_SHAPE_UNIT = 20;

export interface CloudOpticalSceneAdapter {
  scene: OpticalScene;
  issues: string[];
  generationIssues: string[];
  inclusionValid: boolean;
  inclusionRequestedCount: number;
  inclusionGeneratedCount: number;
  receiverInclusionSupported: boolean;
  containmentWitness: ReturnType<typeof findInvalidContainment>;
  hostAbsorptionPerShapeUnit: Rgb;
  inclusionAbsorptionPerShapeUnit: Rgb;
}

export function buildCloudOpticalScene(
  balls: readonly Ball[],
  smoothness: number,
  settings: OpticalSettings,
): CloudOpticalSceneAdapter {
  const daylight = resolveDaylight(settings);
  const physicalScale = {
    mmPerShapeUnit: CURRENT_ASSUMED_MM_PER_SHAPE_UNIT,
    source: "assumed" as const,
  };
  const hostAbsorptionPerShapeUnit = hostAbsorption(
    settings.hostPreset,
    settings.hostTransmissionColor,
    settings.absorption,
  );
  const inclusionAbsorptionPerShapeUnit = inclusionAbsorptionFromDisplayColor(
    settings.inclusionTransmissionColor,
    settings.inclusionAbsorption,
  );
  const hostMaterial: OpticalMaterial = {
    id: `host-${settings.hostPreset}`,
    label: `${settings.hostPreset} host (visual baseline)`,
    ior: settings.ior,
    absorptionPerMm: divideRgb(hostAbsorptionPerShapeUnit, physicalScale.mmPerShapeUnit),
    roughness: settings.surfaceRoughness,
  };
  const inclusionMaterial: OpticalMaterial = {
    id: "inclusion-clear",
    label: "Clear inclusion (visual baseline)",
    // Packed inclusions represent low-density pockets in one continuous resin.
    // General multi-boundary refraction is deliberately not approximated.
    ior: settings.inclusionMode === "packed" ? settings.ior : settings.inclusionIor,
    absorptionPerMm: divideRgb(inclusionAbsorptionPerShapeUnit, physicalScale.mmPerShapeUnit),
    roughness: settings.surfaceRoughness,
  };
  const host: OpticalScene["host"] = {
      id: "host",
      material: hostMaterial,
      shape: {
        kind: "balls-smooth-union",
        balls: balls.map((ball) => ({ center: { x: ball.x, y: ball.y, z: ball.z }, radius: ball.r })),
        smoothness,
      },
      pose: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { ...IDENTITY_QUATERNION },
        uniformScale: 1,
      },
    };
  const packed = settings.inclusionEnabled && settings.inclusionMode === "packed"
    ? generateInclusions(host, inclusionMaterial, physicalScale, {
        seed: settings.inclusionSeed,
        count: { min: settings.inclusionCount, max: settings.inclusionCount },
        shapeFamily: settings.inclusionShapeFamily,
        sizeMm: {
          min: Math.min(settings.inclusionSizeMinMm, settings.inclusionSizeMaxMm),
          max: Math.max(settings.inclusionSizeMinMm, settings.inclusionSizeMaxMm),
          distribution: "varied",
        },
        placement: settings.inclusionPlacement,
        minimumHostWallMm: settings.inclusionMinimumWallMm,
        minimumGapMm: settings.inclusionMinimumGapMm,
        allowMerge: false,
      })
    : null;
  const inclusions: OpticalScene["inclusions"] = !settings.inclusionEnabled
    ? []
    : packed
      ? [...packed.inclusions]
      : [{
      id: "inclusion",
      material: inclusionMaterial,
      shape: {
        kind: "balls-smooth-union",
        balls: [{ center: { x: 0, y: 0, z: 0 }, radius: 1 }],
        smoothness: 0,
      },
      pose: {
        position: {
          x: settings.inclusionOffsetX,
          y: settings.inclusionOffsetY,
          z: settings.inclusionOffsetZ,
        },
        rotation: { ...IDENTITY_QUATERNION },
        uniformScale: settings.inclusionRadius,
      },
    }];
  const scene: OpticalScene = {
    host,
    inclusions,
    receiver: {
      id: "legacy-floor",
      pose: {
        position: { x: 0, y: -2.35, z: 0 },
        rotation: { ...IDENTITY_QUATERNION },
        uniformScale: 1,
      },
      normal: { x: 0, y: 1, z: 0 },
    },
    light: {
      direction: daylight.propagationDirection,
      radiance: daylight.aboveHorizon
        ? { r: settings.sunIntensity, g: settings.sunIntensity * 0.94, b: settings.sunIntensity * 0.82 }
        : { r: 0, g: 0, b: 0 },
    },
    physicalScale,
    boundaryEpsilon: 1e-4,
  };
  const issues = validateOpticalScene(scene);
  if (settings.inclusionEnabled && inclusions.length === 0) {
    issues.push("No requested inclusions fit inside the host");
  }
  const containmentWitness = settings.inclusionEnabled ? findInvalidContainment(scene) : null;
  return {
    scene,
    issues,
    generationIssues: packed ? [...packed.issues] : [],
    inclusionValid: settings.inclusionEnabled && issues.length === 0,
    inclusionRequestedCount: settings.inclusionEnabled
      ? settings.inclusionMode === "packed" ? settings.inclusionCount : 1
      : 0,
    inclusionGeneratedCount: inclusions.length,
    receiverInclusionSupported: true,
    containmentWitness,
    hostAbsorptionPerShapeUnit,
    inclusionAbsorptionPerShapeUnit,
  };
}

function hostAbsorption(
  preset: OpticalSettings["hostPreset"],
  customColor: string,
  amount: number,
): Rgb {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (preset === "amber") return { r: safe * 0.05, g: safe * 0.38, b: safe * 0.92 };
  if (preset === "dark") return { r: safe * 0.72, g: safe * 1.45, b: safe * 0.42 };
  if (preset === "custom") return absorptionFromDisplayColor(customColor, safe);
  return { r: safe * 0.06, g: safe * 0.04, b: safe * 0.025 };
}

/**
 * Convert the author's desired transmitted appearance into relative absorption.
 * Concentration remains separate, so brightness in the picker does not secretly
 * change density. The dominant transmitted channel receives only a small neutral
 * baseline while complementary channels absorb more strongly.
 */
export function absorptionFromDisplayColor(color: string, concentration: number): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  const safeConcentration = Number.isFinite(concentration)
    ? Math.max(0, concentration)
    : 0;
  if (!match || safeConcentration === 0) return { r: 0, g: 0, b: 0 };
  const encoded = Number.parseInt(match[1], 16);
  const srgb = [
    ((encoded >> 16) & 0xff) / 255,
    ((encoded >> 8) & 0xff) / 255,
    (encoded & 0xff) / 255,
  ].map(srgbToLinear);
  const brightest = Math.max(...srgb);
  if (brightest <= 1e-6) {
    const neutral = safeConcentration * 0.04;
    return { r: neutral, g: neutral, b: neutral };
  }
  const minimumRelativeTransmission = 0.02;
  const maximumChromaDepth = -Math.log(minimumRelativeTransmission);
  const depths = srgb.map((channel) =>
    -Math.log(Math.max(minimumRelativeTransmission, channel / brightest))
  );
  const coefficient = (depth: number): number =>
    safeConcentration * (0.04 + Math.min(depth, maximumChromaDepth) / maximumChromaDepth);
  return { r: coefficient(depths[0]), g: coefficient(depths[1]), b: coefficient(depths[2]) };
}

/**
 * Keep the legacy inclusion concentration contract: white at concentration C
 * remains exactly {C,C,C}. Dividing the shared authored-color coefficients by
 * its neutral 0.04 floor preserves the same hue ratios without brightening old
 * `.hkr` scenes that had only `inclusionAbsorption`.
 */
export function inclusionAbsorptionFromDisplayColor(
  color: string,
  concentration: number,
): Rgb {
  const authored = absorptionFromDisplayColor(color, concentration);
  return {
    r: authored.r / 0.04,
    g: authored.g / 0.04,
    b: authored.b / 0.04,
  };
}

function srgbToLinear(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function divideRgb(value: Rgb, divisor: number): Rgb {
  return { r: value.r / divisor, g: value.g / divisor, b: value.b / divisor };
}
