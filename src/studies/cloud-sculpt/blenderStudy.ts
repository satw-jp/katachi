import type { HikariCase } from "./hikariCase.ts";
import type {
  DirectionalLight,
  Medium,
  OpticalMaterial,
  OpticalScene,
  PhysicalScale,
  PlaneReceiver,
  RigidPose,
  ShapeSource,
} from "./opticalScene.ts";
import { validateOpticalScene } from "./opticalGeometry.ts";

/** Blender receives geometry separately; this JSON preserves the study intent around it. */
export interface BlenderMeshAsset {
  filename: string;
  format: "obj" | "stl" | "ply" | "glb";
  sha256?: string;
  role: "host" | "inclusion" | "receiver";
  mediumId: string;
  purpose: "primary" | "check";
  space: "medium-local" | "hikari-world";
}

export interface BlenderMeshExportMetadata {
  assets: BlenderMeshAsset[];
  resolution?: number;
  triangleCount?: number;
  watertight?: boolean;
  scaleMmPerUnit?: number;
}

export interface BlenderEnvironmentAssumptions {
  world: string;
  exposure: number;
  viewTransform: string;
  renderer: "cycles" | "eevee" | "unspecified";
  notes: string[];
}

export interface BlenderStudySidecar {
  format: "hikari-blender-study";
  formatVersion: 2;
  case: { caseId: string; appVersion: string; commit: string; createdAt: string };
  units: { length: "millimetres"; physicalScale: PhysicalScale };
  coordinateSystem: {
    source: "hikari-right-handed-y-up";
    target: "blender-right-handed-z-up";
    /** Row-major matrix: Hikari (x,y,z) -> Blender (x,-z,y). */
    sourceToTarget3x3: readonly [number, number, number, number, number, number, number, number, number];
    policy: "root-transform";
  };
  geometry: {
    host: Medium;
    inclusions: Medium[];
    meshes: BlenderMeshExportMetadata;
  };
  optics: {
    hostMaterial: OpticalMaterial;
    inclusionMaterials: OpticalMaterial[];
    light: DirectionalLight;
    receiver: PlaneReceiver;
    boundaryEpsilonShapeUnits: number;
    sunAngularDiameterDeg: number;
  };
  camera: {
    position: HikariCase["camera"]["position"];
    target: HikariCase["camera"]["target"];
    fov: number;
    aspect: number;
  };
  environment: BlenderEnvironmentAssumptions;
  unsupported: string[];
  approximations: string[];
}

export interface BuildBlenderStudyInput {
  hikariCase: HikariCase;
  opticalScene: OpticalScene;
  mesh?: Partial<BlenderMeshExportMetadata>;
  environment?: Partial<BlenderEnvironmentAssumptions>;
  unsupported?: string[];
  approximations?: string[];
  sunAngularDiameterDeg?: number;
}

const DEFAULT_UNSUPPORTED = [
  "Hikari's realtime renderer and Blender do not share an identical integrator.",
  "Cloud Sculpt's procedural shape recipe is not executable in Blender; Blender uses the exported mesh.",
];

const DEFAULT_APPROXIMATIONS = [
  "Directional light, RGB radiance, and source angular diameter are transferred, but they are not calibrated photometric measurements.",
  "RGB absorption coefficients are transferred in inverse millimetres, but Blender node mapping must be recorded separately.",
];

export function buildBlenderStudySidecar(input: BuildBlenderStudyInput): BlenderStudySidecar {
  const sceneIssues = validateOpticalScene(input.opticalScene);
  if (sceneIssues.length) throw new Error(`Invalid OpticalScene: ${sceneIssues.join("; ")}`);

  const meshes: BlenderMeshExportMetadata = {
    assets: (input.mesh?.assets ?? []).map((asset) => ({ ...asset })),
    ...(input.mesh?.resolution === undefined ? {} : { resolution: input.mesh.resolution }),
    ...(input.mesh?.triangleCount === undefined ? {} : { triangleCount: input.mesh.triangleCount }),
    ...(input.mesh?.watertight === undefined ? {} : { watertight: input.mesh.watertight }),
    ...(input.mesh?.scaleMmPerUnit === undefined ? {} : { scaleMmPerUnit: input.mesh.scaleMmPerUnit }),
  };
  const environment: BlenderEnvironmentAssumptions = {
    world: input.environment?.world ?? "unspecified neutral world",
    exposure: input.environment?.exposure ?? 0,
    viewTransform: input.environment?.viewTransform ?? "unspecified",
    renderer: input.environment?.renderer ?? "unspecified",
    notes: [...(input.environment?.notes ?? [])],
  };
  const sidecar: BlenderStudySidecar = {
    format: "hikari-blender-study",
    formatVersion: 2,
    case: {
      caseId: input.hikariCase.caseId,
      appVersion: input.hikariCase.appVersion,
      commit: input.hikariCase.commit,
      createdAt: input.hikariCase.createdAt,
    },
    units: {
      length: "millimetres",
      physicalScale: { ...input.opticalScene.physicalScale },
    },
    coordinateSystem: {
      source: "hikari-right-handed-y-up",
      target: "blender-right-handed-z-up",
      sourceToTarget3x3: [1, 0, 0, 0, 0, -1, 0, 1, 0],
      policy: "root-transform",
    },
    geometry: {
      host: cloneMedium(input.opticalScene.host),
      inclusions: input.opticalScene.inclusions.map(cloneMedium),
      meshes,
    },
    optics: {
      hostMaterial: cloneMaterial(input.opticalScene.host.material),
      inclusionMaterials: input.opticalScene.inclusions.map((medium) => cloneMaterial(medium.material)),
      light: cloneLight(input.opticalScene.light),
      receiver: cloneReceiver(input.opticalScene.receiver),
      boundaryEpsilonShapeUnits: input.opticalScene.boundaryEpsilon,
      sunAngularDiameterDeg: input.sunAngularDiameterDeg ?? 0.53,
    },
    camera: {
      position: [...input.hikariCase.camera.position],
      target: [...input.hikariCase.camera.target],
      fov: input.hikariCase.camera.fov,
      aspect: input.hikariCase.camera.aspect ?? 4 / 3,
    },
    environment,
    unsupported: [...DEFAULT_UNSUPPORTED, ...(input.unsupported ?? [])],
    approximations: [
      ...DEFAULT_APPROXIMATIONS,
      ...(input.opticalScene.physicalScale.source === "assumed"
        ? ["Physical scale is assumed rather than measured; Blender dimensions are provisional."]
        : []),
      ...(meshes.scaleMmPerUnit !== undefined && meshes.scaleMmPerUnit !== input.opticalScene.physicalScale.mmPerShapeUnit
        ? [`Mesh export scale (${meshes.scaleMmPerUnit} mm/unit) differs from the optical scene scale (${input.opticalScene.physicalScale.mmPerShapeUnit} mm/unit).`]
        : []),
      ...(input.approximations ?? []),
    ],
  };
  validateBlenderStudySidecar(sidecar);
  return sidecar;
}

export function serializeBlenderStudySidecar(value: BlenderStudySidecar): string {
  validateBlenderStudySidecar(value);
  return JSON.stringify(value, null, 2);
}

export function parseBlenderStudySidecar(text: string): BlenderStudySidecar {
  const value: unknown = JSON.parse(text);
  validateBlenderStudySidecar(value);
  return value;
}

export function validateBlenderStudySidecar(value: unknown): asserts value is BlenderStudySidecar {
  objectWithKeys(value, ["format", "formatVersion", "case", "units", "coordinateSystem", "geometry", "optics", "camera", "environment", "unsupported", "approximations"], "sidecar");
  if (value.format !== "hikari-blender-study" || value.formatVersion !== 2) fail("unsupported format; expected version 2");
  objectWithKeys(value.case, ["caseId", "appVersion", "commit", "createdAt"], "case");
  strings(value.case, ["caseId", "appVersion", "commit", "createdAt"], "case", false);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.case.createdAt as string)
    || !Number.isFinite(Date.parse(value.case.createdAt as string))) fail("case.createdAt must be an ISO UTC date");

  objectWithKeys(value.units, ["length", "physicalScale"], "units");
  if (value.units.length !== "millimetres") fail("invalid unit contract");
  validatePhysicalScale(value.units.physicalScale);

  objectWithKeys(value.coordinateSystem, ["source", "target", "sourceToTarget3x3", "policy"], "coordinateSystem");
  if (value.coordinateSystem.source !== "hikari-right-handed-y-up"
    || value.coordinateSystem.target !== "blender-right-handed-z-up"
    || value.coordinateSystem.policy !== "root-transform") fail("invalid coordinate-system contract");
  tuple(value.coordinateSystem.sourceToTarget3x3, 9, "coordinateSystem.sourceToTarget3x3");
  if (JSON.stringify(value.coordinateSystem.sourceToTarget3x3) !== JSON.stringify([1, 0, 0, 0, 0, -1, 0, 1, 0])) {
    fail("unsupported source-to-target transform");
  }

  objectWithKeys(value.geometry, ["host", "inclusions", "meshes"], "geometry");
  const geometry = value.geometry;
  validateMedium(geometry.host, "geometry.host");
  if (!Array.isArray(geometry.inclusions)) fail("geometry.inclusions must be an array");
  geometry.inclusions.forEach((item, index) => validateMedium(item, `geometry.inclusions[${index}]`));
  validateMeshes(geometry.meshes);

  objectWithKeys(value.optics, ["hostMaterial", "inclusionMaterials", "light", "receiver", "boundaryEpsilonShapeUnits", "sunAngularDiameterDeg"], "optics");
  const optics = value.optics;
  validateMaterial(optics.hostMaterial, "optics.hostMaterial");
  if (!Array.isArray(optics.inclusionMaterials)) fail("optics.inclusionMaterials must be an array");
  const inclusionMaterials = optics.inclusionMaterials;
  inclusionMaterials.forEach((item, index) => validateMaterial(item, `optics.inclusionMaterials[${index}]`));
  if (inclusionMaterials.length !== geometry.inclusions.length) fail("inclusion material count mismatch");
  validateLight(optics.light);
  validateReceiver(optics.receiver);
  finite(optics.boundaryEpsilonShapeUnits, "optics.boundaryEpsilonShapeUnits", true);
  finite(optics.sunAngularDiameterDeg, "optics.sunAngularDiameterDeg", true);
  if (JSON.stringify((geometry.host as Record<string, unknown>).material) !== JSON.stringify(optics.hostMaterial)) fail("host material copies disagree");
  geometry.inclusions.forEach((medium, index) => {
    if (JSON.stringify((medium as Record<string, unknown>).material) !== JSON.stringify(inclusionMaterials[index])) fail(`inclusion material ${index} copies disagree`);
  });

  objectWithKeys(value.camera, ["position", "target", "fov", "aspect"], "camera");
  tuple(value.camera.position, 3, "camera.position"); tuple(value.camera.target, 3, "camera.target");
  finite(value.camera.fov, "camera.fov", true);
  finite(value.camera.aspect, "camera.aspect", true);
  if ((value.camera.fov as number) >= 180) fail("camera.fov must be below 180");

  objectWithKeys(value.environment, ["world", "exposure", "viewTransform", "renderer", "notes"], "environment");
  strings(value.environment, ["world", "viewTransform"], "environment", false);
  finite(value.environment.exposure, "environment.exposure");
  if (!["cycles", "eevee", "unspecified"].includes(String(value.environment.renderer))) fail("invalid environment.renderer");
  stringArray(value.environment.notes, "environment.notes");
  stringArray(value.unsupported, "unsupported", true);
  stringArray(value.approximations, "approximations", true);

  const sceneIssues = validateOpticalScene({
    host: geometry.host as unknown as Medium,
    inclusions: geometry.inclusions as unknown as Medium[],
    receiver: optics.receiver as unknown as PlaneReceiver,
    light: optics.light as unknown as DirectionalLight,
    physicalScale: value.units.physicalScale as unknown as PhysicalScale,
    boundaryEpsilon: optics.boundaryEpsilonShapeUnits as number,
  });
  if (sceneIssues.length) fail(`embedded OpticalScene is invalid: ${sceneIssues.join("; ")}`);
}

function validateMeshes(value: unknown): void {
  objectWithOptionalKeys(value, ["assets"], ["resolution", "triangleCount", "watertight", "scaleMmPerUnit"], "geometry.meshes");
  if (!Array.isArray(value.assets)) fail("geometry.meshes.assets must be an array");
  value.assets.forEach((asset, index) => {
    objectWithOptionalKeys(asset, ["filename", "format", "role", "mediumId", "purpose", "space"], ["sha256"], `mesh asset ${index}`);
    strings(asset, ["filename", "mediumId"], `mesh asset ${index}`, false);
    if (!["obj", "stl", "ply", "glb"].includes(String(asset.format))) fail(`mesh asset ${index} has invalid format`);
    if (!["host", "inclusion", "receiver"].includes(String(asset.role))) fail(`mesh asset ${index} has invalid role`);
    if (!["primary", "check"].includes(String(asset.purpose))) fail(`mesh asset ${index} has invalid purpose`);
    if (!["medium-local", "hikari-world"].includes(String(asset.space))) fail(`mesh asset ${index} has invalid space`);
    if (asset.sha256 !== undefined && (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(asset.sha256))) fail(`mesh asset ${index} has invalid SHA-256`);
  });
  if (value.resolution !== undefined) integer(value.resolution, "mesh resolution", true);
  if (value.triangleCount !== undefined) integer(value.triangleCount, "mesh triangleCount", false);
  if (value.watertight !== undefined && typeof value.watertight !== "boolean") fail("mesh watertight must be boolean");
  if (value.scaleMmPerUnit !== undefined) finite(value.scaleMmPerUnit, "mesh scaleMmPerUnit", true);
}

function validateMedium(value: unknown, path: string): void {
  objectWithKeys(value, ["id", "material", "shape", "pose"], path);
  strings(value, ["id"], path, false); validateMaterial(value.material, `${path}.material`);
  validateShape(value.shape, `${path}.shape`); validatePose(value.pose, `${path}.pose`);
}

function validateMaterial(value: unknown, path: string): void {
  objectWithKeys(value, ["id", "label", "ior", "absorptionPerMm", "roughness"], path);
  strings(value, ["id", "label"], path, false); finite(value.ior, `${path}.ior`, true);
  validateRgb(value.absorptionPerMm, `${path}.absorptionPerMm`); finite(value.roughness, `${path}.roughness`);
  if ((value.roughness as number) < 0 || (value.roughness as number) > 1) fail(`${path}.roughness outside 0..1`);
}

function validateShape(value: unknown, path: string): void {
  objectWithKeys(value, ["kind", "balls", "smoothness"], path);
  if (value.kind !== "balls-smooth-union" || !Array.isArray(value.balls) || value.balls.length === 0) fail(`${path} is invalid`);
  value.balls.forEach((ball, index) => { objectWithKeys(ball, ["center", "radius"], `${path}.balls[${index}]`); validateVec3(ball.center, `${path}.balls[${index}].center`); finite(ball.radius, `${path}.balls[${index}].radius`, true); });
  finite(value.smoothness, `${path}.smoothness`);
}

function validatePose(value: unknown, path: string): void {
  objectWithKeys(value, ["position", "rotation", "uniformScale"], path); validateVec3(value.position, `${path}.position`);
  objectWithKeys(value.rotation, ["x", "y", "z", "w"], `${path}.rotation`);
  for (const key of ["x", "y", "z", "w"] as const) finite(value.rotation[key], `${path}.rotation.${key}`);
  finite(value.uniformScale, `${path}.uniformScale`, true);
}

function validateReceiver(value: unknown): void { objectWithKeys(value, ["id", "pose", "normal"], "optics.receiver"); strings(value, ["id"], "receiver", false); validatePose(value.pose, "receiver.pose"); validateVec3(value.normal, "receiver.normal"); }
function validateLight(value: unknown): void { objectWithKeys(value, ["direction", "radiance"], "optics.light"); validateVec3(value.direction, "light.direction"); validateRgb(value.radiance, "light.radiance"); }
function validatePhysicalScale(value: unknown): void { objectWithKeys(value, ["mmPerShapeUnit", "source"], "physicalScale"); finite(value.mmPerShapeUnit, "physicalScale.mmPerShapeUnit", true); if (!["assumed", "derived-from-mesh", "author"].includes(String(value.source))) fail("invalid physical scale source"); }
function validateRgb(value: unknown, path: string): void { objectWithKeys(value, ["r", "g", "b"], path); for (const key of ["r", "g", "b"] as const) { finite(value[key], `${path}.${key}`); if ((value[key] as number) < 0) fail(`${path}.${key} must be non-negative`); } }
function validateVec3(value: unknown, path: string): void { objectWithKeys(value, ["x", "y", "z"], path); for (const key of ["x", "y", "z"] as const) finite(value[key], `${path}.${key}`); }

function cloneMedium(value: Medium): Medium { return { id: value.id, material: cloneMaterial(value.material), shape: cloneShape(value.shape), pose: clonePose(value.pose) }; }
function cloneMaterial(value: OpticalMaterial): OpticalMaterial { return { ...value, absorptionPerMm: { ...value.absorptionPerMm } }; }
function cloneShape(value: ShapeSource): ShapeSource { return { kind: value.kind, balls: value.balls.map((ball) => ({ center: { ...ball.center }, radius: ball.radius })), smoothness: value.smoothness }; }
function clonePose(value: RigidPose): RigidPose { return { position: { ...value.position }, rotation: { ...value.rotation }, uniformScale: value.uniformScale }; }
function cloneReceiver(value: PlaneReceiver): PlaneReceiver { return { id: value.id, pose: clonePose(value.pose), normal: { ...value.normal } }; }
function cloneLight(value: DirectionalLight): DirectionalLight { return { direction: { ...value.direction }, radiance: { ...value.radiance } }; }

type ObjectValue = Record<string, unknown>;
function isObject(value: unknown): value is ObjectValue { return typeof value === "object" && value !== null && !Array.isArray(value); }
function objectWithKeys(value: unknown, keys: readonly string[], path: string): asserts value is ObjectValue { objectWithOptionalKeys(value, keys, [], path); }
function objectWithOptionalKeys(value: unknown, required: readonly string[], optional: readonly string[], path: string): asserts value is ObjectValue {
  if (!isObject(value)) fail(`${path} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) fail(`${path}.${key} is missing`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key} is not supported`);
}
function strings(value: ObjectValue, keys: readonly string[], path: string, allowEmpty: boolean): void { for (const key of keys) if (typeof value[key] !== "string" || (!allowEmpty && !(value[key] as string).trim())) fail(`${path}.${key} must be a string`); }
function stringArray(value: unknown, path: string, requireEntry = false): void { if (!Array.isArray(value) || (requireEntry && value.length === 0) || value.some((item) => typeof item !== "string" || !item.trim())) fail(`${path} must be ${requireEntry ? "a non-empty " : "an "}array of non-empty strings`); }
function tuple(value: unknown, length: number, path: string): void { if (!Array.isArray(value) || value.length !== length || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) fail(`${path} must be a finite ${length}-tuple`); }
function finite(value: unknown, path: string, positive = false): void { if (typeof value !== "number" || !Number.isFinite(value) || (positive && value <= 0)) fail(`${path} must be ${positive ? "positive and " : ""}finite`); }
function integer(value: unknown, path: string, positive: boolean): void { if (!Number.isInteger(value) || (positive ? (value as number) <= 0 : (value as number) < 0)) fail(`${path} must be a${positive ? " positive" : " non-negative"} integer`); }
function fail(message: string): never { throw new Error(`Invalid Hikari Blender study: ${message}`); }
