/**
 * Phase 1 optical contracts. These are intentionally runtime-independent:
 * the current Hikari renderer still owns its legacy scalar absorption setting.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Vec3 { x: number; y: number; z: number; }
export interface Quaternion { x: number; y: number; z: number; w: number; }

/** Rotation plus one uniform scale only; non-uniform scale would invalidate distance/absorption units. */
export interface RigidPose {
  position: Vec3;
  rotation: Quaternion;
  uniformScale: number;
}

export interface ShapeBall { center: Vec3; radius: number; }
/** The existing Cloud Sculpt primitive: balls joined by the same polynomial smooth union. */
export interface BallSdfShape {
  kind: "balls-smooth-union";
  balls: readonly ShapeBall[];
  smoothness: number;
}
export type ShapeSource = BallSdfShape;

export interface Medium {
  /** Identity remains meaningful when two media have the same IOR. */
  id: string;
  material: OpticalMaterial;
  shape: ShapeSource;
  pose: RigidPose;
}

export interface PlaneReceiver {
  id: string;
  pose: RigidPose;
  /** Local plane normal; contract requires a normalized vector. */
  normal: Vec3;
}

export interface DirectionalLight {
  /** World-space propagation direction, normalized by the geometry helpers. */
  direction: Vec3;
  radiance: Rgb;
}

/** Multiple contained media are saved here; individual transports declare their own limits. */
export interface OpticalScene {
  host: Medium;
  inclusions: readonly Medium[];
  receiver: PlaneReceiver;
  light: DirectionalLight;
  physicalScale: PhysicalScale;
  /** Boundary points are classified deterministically as air, not an arbitrary material. */
  boundaryEpsilon: number;
}

export const IDENTITY_QUATERNION: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
export const IDENTITY_POSE: RigidPose = { position: { x: 0, y: 0, z: 0 }, rotation: IDENTITY_QUATERNION, uniformScale: 1 };
export const AIR_MATERIAL: OpticalMaterial = {
  id: "air", label: "Air", ior: 1, absorptionPerMm: { r: 0, g: 0, b: 0 }, roughness: 0,
};

export interface OpticalMaterial {
  /** Stable identifier for saved studies; not a claim about a commercial resin. */
  id: string;
  label: string;
  ior: number;
  /** Beer-Lambert attenuation coefficient in inverse millimetres. */
  absorptionPerMm: Rgb;
  roughness: number;
}

export type OpticalMaterialPresetId = "neutral" | "amber" | "dark";

export interface PhysicalScale {
  /** Millimetres represented by one Cloud Sculpt shape unit. */
  mmPerShapeUnit: number;
  /** `assumed` is explicitly non-measured; never present it as a physical fact. */
  source: "assumed" | "derived-from-mesh" | "author";
}

export const NEUTRAL_MATERIAL: OpticalMaterial = {
  id: "neutral", label: "Neutral clear", ior: 1.5, absorptionPerMm: { r: 0.002, g: 0.002, b: 0.002 }, roughness: 0.05,
};
export const AMBER_MATERIAL: OpticalMaterial = {
  id: "amber", label: "Amber tint", ior: 1.5, absorptionPerMm: { r: 0.004, g: 0.012, b: 0.035 }, roughness: 0.08,
};
export const DARK_MATERIAL: OpticalMaterial = {
  id: "dark", label: "Dark translucent", ior: 1.5, absorptionPerMm: { r: 0.04, g: 0.055, b: 0.075 }, roughness: 0.12,
};
export const OPTICAL_MATERIAL_PRESETS: Readonly<Record<OpticalMaterialPresetId, OpticalMaterial>> = {
  neutral: NEUTRAL_MATERIAL,
  amber: AMBER_MATERIAL,
  dark: DARK_MATERIAL,
};

/** A reference conversion only. Its `assumed` source means it is not an asserted object size. */
export const DEFAULT_ASSUMED_PHYSICAL_SCALE: PhysicalScale = {
  mmPerShapeUnit: 1,
  source: "assumed",
};

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isPresetId(value: unknown): value is OpticalMaterialPresetId {
  return value === "neutral" || value === "amber" || value === "dark";
}

export function normalizeRgb(value: Partial<Rgb> | undefined, fallback: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  return {
    r: finiteNonNegative(value?.r, fallback.r),
    g: finiteNonNegative(value?.g, fallback.g),
    b: finiteNonNegative(value?.b, fallback.b),
  };
}

export function normalizePhysicalScale(
  value: Partial<PhysicalScale> | undefined,
  fallback: PhysicalScale = DEFAULT_ASSUMED_PHYSICAL_SCALE,
): PhysicalScale {
  const mmPerShapeUnit = typeof value?.mmPerShapeUnit === "number" && Number.isFinite(value.mmPerShapeUnit) && value.mmPerShapeUnit > 0
    ? value.mmPerShapeUnit
    : fallback.mmPerShapeUnit;
  const source = value?.source === "derived-from-mesh" || value?.source === "author" || value?.source === "assumed"
    ? value.source
    : fallback.source;
  return { mmPerShapeUnit, source };
}

export function normalizeOpticalMaterial(
  value: Partial<OpticalMaterial> | undefined,
  fallback: OpticalMaterial = NEUTRAL_MATERIAL,
): OpticalMaterial {
  const preset = isPresetId(value?.id) ? OPTICAL_MATERIAL_PRESETS[value.id] : undefined;
  const base = preset ?? fallback;
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id.trim() : base.id,
    label: typeof value?.label === "string" && value.label.trim() ? value.label : base.label,
    ior: typeof value?.ior === "number" && Number.isFinite(value.ior) && value.ior > 1 ? value.ior : base.ior,
    absorptionPerMm: normalizeRgb(value?.absorptionPerMm, base.absorptionPerMm),
    roughness:
      typeof value?.roughness === "number"
      && Number.isFinite(value.roughness)
      && value.roughness >= 0
      && value.roughness <= 1
        ? value.roughness
        : base.roughness,
  };
}

/** Converts the current scalar (per shape unit) into an explicitly physical RGB coefficient. */
export function legacyScalarAbsorptionToPerMm(
  absorptionPerShapeUnit: number,
  physicalScale: PhysicalScale = DEFAULT_ASSUMED_PHYSICAL_SCALE,
): Rgb {
  const scalar = finiteNonNegative(absorptionPerShapeUnit, 0);
  const scale = normalizePhysicalScale(physicalScale);
  const coefficient = scalar / scale.mmPerShapeUnit;
  return { r: coefficient, g: coefficient, b: coefficient };
}

export function opticalDepthForShapePath(
  pathLengthShapeUnits: number,
  material: Pick<OpticalMaterial, "absorptionPerMm">,
  physicalScale: PhysicalScale = DEFAULT_ASSUMED_PHYSICAL_SCALE,
): Rgb {
  const lengthMm = finiteNonNegative(pathLengthShapeUnits, 0) * normalizePhysicalScale(physicalScale).mmPerShapeUnit;
  const absorption = normalizeRgb(material.absorptionPerMm);
  return { r: absorption.r * lengthMm, g: absorption.g * lengthMm, b: absorption.b * lengthMm };
}

export function transmissionFromOpticalDepth(depth: Rgb): Rgb {
  const safeDepth = normalizeRgb(depth);
  return { r: Math.exp(-safeDepth.r), g: Math.exp(-safeDepth.g), b: Math.exp(-safeDepth.b) };
}

export function transmissionForShapePath(
  pathLengthShapeUnits: number,
  material: Pick<OpticalMaterial, "absorptionPerMm">,
  physicalScale: PhysicalScale = DEFAULT_ASSUMED_PHYSICAL_SCALE,
): Rgb {
  return transmissionFromOpticalDepth(opticalDepthForShapePath(pathLengthShapeUnits, material, physicalScale));
}
