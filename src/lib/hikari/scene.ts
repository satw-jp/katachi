import type { ShapeAsset, Vec3 } from "./shape.ts";

export type Rgb = [number, number, number];
export type Quaternion = [number, number, number, number];

export interface RigidTransform {
  translation: Vec3;
  rotation: Quaternion;
  uniformScale: number;
}

export interface OpticalMaterialRecord {
  id: string;
  ior: number;
  absorptionPerMm: Rgb;
  roughness: number;
}

export type OpticalRegionRole = "boundary" | "void" | "surface-trace" | "material-density";

export interface OpticalRegionBinding {
  regionId: string;
  opticalRole: OpticalRegionRole;
}

export interface OpticalMedium {
  id: string;
  shapeAssetId: string;
  transform: RigidTransform;
  material: OpticalMaterialRecord;
  regionBindings: OpticalRegionBinding[];
}

export interface PhysicalScale {
  mmPerShapeUnit: number;
  mode: "same-material" | "match-appearance";
  referenceMmPerShapeUnit?: number;
}

export interface ReceiverPlane {
  origin: Vec3;
  normal: Vec3;
  up: Vec3;
  widthShapeUnits: number;
  heightShapeUnits: number;
}

export interface DirectionalLightRecord {
  kind: "directional";
  direction: Vec3;
  color: Rgb;
  intensity: number;
  angularDiameterDeg: number;
}

export interface CameraRecord {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fovYDeg: number;
  near: number;
  far: number;
}

export interface OpticalScene {
  formatVersion: 1;
  physicalScale: PhysicalScale;
  objectPose: RigidTransform;
  host: OpticalMedium;
  inclusions: OpticalMedium[];
  receiver: ReceiverPlane;
  light: DirectionalLightRecord;
  camera: CameraRecord;
  approximations: string[];
}

/** Static contract checks. Geometric containment is a later RuntimeShape check. */
export function validateOpticalScene(scene: OpticalScene, assets: readonly ShapeAsset[]): void {
  if (scene.formatVersion !== 1) throw new Error("Unsupported OpticalScene formatVersion");
  requirePositive(scene.physicalScale.mmPerShapeUnit, "physicalScale.mmPerShapeUnit");
  if (scene.physicalScale.mode !== "same-material" && scene.physicalScale.mode !== "match-appearance") {
    throw new Error("physicalScale.mode is invalid");
  }
  if (scene.physicalScale.referenceMmPerShapeUnit !== undefined) {
    requirePositive(scene.physicalScale.referenceMmPerShapeUnit, "physicalScale.referenceMmPerShapeUnit");
  }
  validateTransform(scene.objectPose, "objectPose");
  validateVector(scene.receiver.origin, "receiver.origin");
  validateUnitVectorCandidate(scene.receiver.normal, "receiver.normal");
  validateUnitVectorCandidate(scene.receiver.up, "receiver.up");
  requirePositive(scene.receiver.widthShapeUnits, "receiver.widthShapeUnits");
  requirePositive(scene.receiver.heightShapeUnits, "receiver.heightShapeUnits");
  if (scene.light.kind !== "directional") throw new Error("Only directional light is supported in OpticalScene v1");
  validateUnitVectorCandidate(scene.light.direction, "light.direction");
  validateRgb(scene.light.color, "light.color");
  requireNonNegative(scene.light.intensity, "light.intensity");
  requirePositive(scene.light.angularDiameterDeg, "light.angularDiameterDeg");
  validateCamera(scene.camera);
  validateStringArray(scene.approximations, "scene.approximations");

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  if (assetsById.size !== assets.length) throw new Error("ShapeAsset ids must be unique within a scene");
  const media = [scene.host, ...scene.inclusions];
  const mediumIds = new Set<string>();
  for (const [index, medium] of media.entries()) {
    const path = index === 0 ? "host" : `inclusions[${index - 1}]`;
    requireNonEmpty(medium.id, `${path}.id`);
    if (mediumIds.has(medium.id)) throw new Error(`Duplicate optical medium id: ${medium.id}`);
    mediumIds.add(medium.id);
    const asset = assetsById.get(medium.shapeAssetId);
    if (!asset) throw new Error(`${path} refers to missing ShapeAsset: ${medium.shapeAssetId}`);
    validateTransform(medium.transform, `${path}.transform`);
    validateMaterial(medium.material, `${path}.material`);
    const regionIds = new Set(asset.regions.map((region) => region.id));
    const boundRegions = new Set<string>();
    for (const [bindingIndex, binding] of medium.regionBindings.entries()) {
      if (!regionIds.has(binding.regionId)) {
        throw new Error(`${path}.regionBindings[${bindingIndex}] refers to an unknown region`);
      }
      if (!OPTICAL_REGION_ROLES.has(binding.opticalRole)) {
        throw new Error(`${path}.regionBindings[${bindingIndex}].opticalRole is invalid`);
      }
      if (boundRegions.has(binding.regionId)) {
        throw new Error(`${path} binds region ${binding.regionId} more than once`);
      }
      boundRegions.add(binding.regionId);
    }
  }
}

const OPTICAL_REGION_ROLES = new Set<OpticalRegionRole>([
  "boundary",
  "void",
  "surface-trace",
  "material-density",
]);

function validateTransform(value: RigidTransform, path: string): void {
  validateVector(value.translation, `${path}.translation`);
  if (!Array.isArray(value.rotation) || value.rotation.length !== 4) {
    throw new Error(`${path}.rotation must be a quaternion`);
  }
  for (const [index, component] of value.rotation.entries()) {
    requireFinite(component, `${path}.rotation[${index}]`);
  }
  const length = Math.hypot(...value.rotation);
  if (Math.abs(length - 1) > 1e-4) throw new Error(`${path}.rotation must be normalized`);
  requirePositive(value.uniformScale, `${path}.uniformScale`);
}

function validateMaterial(value: OpticalMaterialRecord, path: string): void {
  requireNonEmpty(value.id, `${path}.id`);
  if (!Number.isFinite(value.ior) || value.ior < 1) throw new Error(`${path}.ior must be >= 1`);
  validateRgb(value.absorptionPerMm, `${path}.absorptionPerMm`);
  if (value.absorptionPerMm.some((channel) => channel < 0)) {
    throw new Error(`${path}.absorptionPerMm must not contain negative values`);
  }
  if (!Number.isFinite(value.roughness) || value.roughness < 0 || value.roughness > 1) {
    throw new Error(`${path}.roughness must be in 0..1`);
  }
}

function validateCamera(value: CameraRecord): void {
  validateVector(value.position, "camera.position");
  validateVector(value.target, "camera.target");
  validateUnitVectorCandidate(value.up, "camera.up");
  if (!Number.isFinite(value.fovYDeg) || value.fovYDeg <= 0 || value.fovYDeg >= 180) {
    throw new Error("camera.fovYDeg must be in 0..180");
  }
  requirePositive(value.near, "camera.near");
  requirePositive(value.far, "camera.far");
  if (value.far <= value.near) throw new Error("camera.far must be greater than camera.near");
}

function validateRgb(value: Rgb, path: string): void {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${path} must contain three channels`);
  for (const [index, channel] of value.entries()) requireFinite(channel, `${path}[${index}]`);
}

function validateUnitVectorCandidate(value: Vec3, path: string): void {
  validateVector(value, path);
  if (Math.hypot(value.x, value.y, value.z) <= 1e-9) throw new Error(`${path} must not be zero`);
}

function validateVector(value: Vec3, path: string): void {
  if (!value || typeof value !== "object") throw new Error(`${path} must be a vector`);
  requireFinite(value.x, `${path}.x`);
  requireFinite(value.y, `${path}.y`);
  requireFinite(value.z, `${path}.z`);
}

function requireFinite(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be finite`);
}

function requirePositive(value: unknown, path: string): asserts value is number {
  requireFinite(value, path);
  if (value <= 0) throw new Error(`${path} must be positive`);
}

function requireNonNegative(value: unknown, path: string): asserts value is number {
  requireFinite(value, path);
  if (value < 0) throw new Error(`${path} must not be negative`);
}

function requireNonEmpty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${path} must be a non-empty string`);
}

function validateStringArray(value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  for (const [index, item] of value.entries()) requireNonEmpty(item, `${path}[${index}]`);
}
