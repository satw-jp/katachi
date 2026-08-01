import type { Ball } from "./field.ts";
import type { OpticalSettings } from "./optics.ts";
import {
  IDENTITY_QUATERNION,
  type OpticalMaterial,
  type OpticalScene,
  type Rgb,
} from "./opticalScene.ts";
import { findInvalidContainment, validateOpticalScene } from "./opticalGeometry.ts";

/**
 * The current cloud has no authored physical dimension yet. Twenty millimetres
 * per shape unit keeps the legacy visual density in a plausible hand-scale
 * range, but remains explicitly an assumption in saved/analysis data.
 */
export const CURRENT_ASSUMED_MM_PER_SHAPE_UNIT = 20;

export interface CloudOpticalSceneAdapter {
  scene: OpticalScene;
  issues: string[];
  inclusionValid: boolean;
  containmentWitness: ReturnType<typeof findInvalidContainment>;
  hostAbsorptionPerShapeUnit: Rgb;
  inclusionAbsorptionPerShapeUnit: Rgb;
}

export function buildCloudOpticalScene(
  balls: readonly Ball[],
  smoothness: number,
  settings: OpticalSettings,
): CloudOpticalSceneAdapter {
  const physicalScale = {
    mmPerShapeUnit: CURRENT_ASSUMED_MM_PER_SHAPE_UNIT,
    source: "assumed" as const,
  };
  const hostAbsorptionPerShapeUnit = hostAbsorption(settings.hostPreset, settings.absorption);
  const inclusionAbsorptionPerShapeUnit = greyAbsorption(settings.inclusionAbsorption);
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
    ior: settings.inclusionIor,
    absorptionPerMm: divideRgb(inclusionAbsorptionPerShapeUnit, physicalScale.mmPerShapeUnit),
    roughness: settings.surfaceRoughness,
  };
  const scene: OpticalScene = {
    host: {
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
    },
    inclusions: settings.inclusionEnabled ? [{
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
    }] : [],
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
      direction: propagationDirection(settings.lightAngle),
      radiance: { r: settings.sunIntensity, g: settings.sunIntensity * 0.94, b: settings.sunIntensity * 0.82 },
    },
    physicalScale,
    boundaryEpsilon: 1e-4,
  };
  const issues = validateOpticalScene(scene);
  const containmentWitness = settings.inclusionEnabled ? findInvalidContainment(scene) : null;
  return {
    scene,
    issues,
    inclusionValid: settings.inclusionEnabled && issues.length === 0,
    containmentWitness,
    hostAbsorptionPerShapeUnit,
    inclusionAbsorptionPerShapeUnit,
  };
}

function hostAbsorption(preset: OpticalSettings["hostPreset"], amount: number): Rgb {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (preset === "amber") return { r: safe * 0.05, g: safe * 0.38, b: safe * 0.92 };
  if (preset === "dark") return { r: safe * 0.72, g: safe * 1.45, b: safe * 0.42 };
  return { r: safe * 0.06, g: safe * 0.04, b: safe * 0.025 };
}

function greyAbsorption(value: number): Rgb {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return { r: safe, g: safe, b: safe };
}

function divideRgb(value: Rgb, divisor: number): Rgb {
  return { r: value.r / divisor, g: value.g / divisor, b: value.b / divisor };
}

function propagationDirection(angleDegrees: number): { x: number; y: number; z: number } {
  const angle = angleDegrees * Math.PI / 180;
  const x = Math.sin(angle) * 0.72;
  const y = -1;
  const z = Math.cos(angle) * 0.28;
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}
