import {
  validateHikariCase,
  type CameraRecord,
  type HikariCase,
  type JsonValue,
  type OpticalScene,
} from "../../lib/hikari/index.ts";
import type { Ball } from "./field.ts";
import { normalizeHikariSettings, type HikariSettings } from "./hikari.ts";
import {
  parseRecipe,
  replay,
  serializeRecipe,
  type HistoryEntry,
  type SculptState,
} from "./history.ts";
import {
  cloudShapeFingerprint,
  createCloudShapeAsset,
} from "./hikariAdapter.ts";

export interface CreateCloudHikariCaseInput {
  id: string;
  capturedAtUtc?: string;
  appVersion: string;
  gitCommit?: string | null;
  balls: readonly Ball[];
  smoothK: number;
  history: readonly HistoryEntry[];
  settings: HikariSettings;
  camera: CameraRecord;
  rendererBackend: "cpu" | "webgl" | "webgpu";
  /** Omit until a physical-size choice has actually been made. */
  mmPerShapeUnit?: number;
  observation?: HikariCase["observation"];
}

export interface RestoredCloudHikariCase {
  history: HistoryEntry[];
  state: SculptState;
  settings: HikariSettings;
  camera: CameraRecord;
}

export function createCloudHikariCase(input: CreateCloudHikariCaseInput): HikariCase {
  if (input.balls.length === 0) throw new Error("An empty Cloud Sculpt field cannot form a Hikari case");
  const replayed = replay([...input.history]);
  const traceStrength = input.settings.surfaceVariation;
  const liveHash = cloudShapeFingerprint(input.balls, input.smoothK, traceStrength);
  const replayedHash = cloudShapeFingerprint(replayed.balls, replayed.params.k, traceStrength);
  if (liveHash !== replayedHash) {
    throw new Error("The current Cloud field does not match its operation history");
  }
  const recipe = JSON.parse(serializeRecipe([...input.history])) as JsonValue;
  const asset = createCloudShapeAsset(input.balls, input.smoothK, {
    id: `${input.id}-shape`,
    studyVersion: input.appVersion,
    nativeMmPerShapeUnit: input.mmPerShapeUnit ?? null,
    recipe,
    surfaceTraceStrength: traceStrength,
  });
  const bounds = asset.bounds;
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  const radius = Math.max(
    0.1,
    Math.hypot(bounds.max.x - center.x, bounds.max.y - center.y, bounds.max.z - center.z),
  );
  const floorY = bounds.min.y - Math.max(0.45, radius * 0.28);
  const lightDirection = directionFromAngle(input.settings.lightAngle);
  const provisionalScale = input.mmPerShapeUnit === undefined;
  const scale = input.mmPerShapeUnit ?? 1;
  const scene: OpticalScene = {
    formatVersion: 1,
    physicalScale: {
      mmPerShapeUnit: scale,
      mode: provisionalScale ? "match-appearance" : "same-material",
    },
    objectPose: identityTransform(),
    host: {
      id: "host",
      shapeAssetId: asset.id,
      transform: identityTransform(),
      material: {
        id: input.settings.opticalMaterial,
        ior: input.settings.ior,
        absorptionPerMm: [
          input.settings.absorption / scale,
          input.settings.absorption / scale,
          input.settings.absorption / scale,
        ],
        roughness: input.settings.surfaceRoughness,
      },
      regionBindings: [{ regionId: "body", opticalRole: "boundary" }],
    },
    inclusions: [],
    receiver: {
      origin: { x: center.x, y: floorY, z: center.z },
      normal: { x: 0, y: 1, z: 0 },
      up: { x: 0, y: 0, z: -1 },
      widthShapeUnits: radius * 5,
      heightShapeUnits: radius * 5,
    },
    light: {
      kind: "directional",
      direction: lightDirection,
      color: [1, 1, 1],
      intensity: input.settings.sunIntensity,
      angularDiameterDeg: input.settings.sunSize,
    },
    camera: input.camera,
    approximations: [
      "The current scene contains one optical boundary and no nested inclusion.",
      "The saved directional light omits the current procedural sky and ground environment.",
      ...(provisionalScale
        ? ["Physical scale is not calibrated; one shape unit is provisionally recorded as one millimetre."]
        : []),
    ],
  };

  const value: HikariCase = {
    formatVersion: 1,
    id: input.id,
    capturedAtUtc: input.capturedAtUtc ?? new Date().toISOString(),
    appVersion: input.appVersion,
    gitCommit: input.gitCommit ?? null,
    assets: [asset],
    scene,
    renderer: {
      backend: input.rendererBackend,
      sampleCount: Math.max(0, Math.round(input.settings.opticalSampleCount)),
    },
    controls: jsonRecordClone(input.settings),
    observation: input.observation ?? {
      observed: [],
      interpretation: [],
      decision: [],
    },
    approximations: [
      "Current Hikari controls are preserved exactly in controls; OpticalScene records only the stable subset.",
      "Absorption is converted from the current appearance-space control and is not yet physically calibrated.",
    ],
  };
  validateHikariCase(value);
  return value;
}

export function restoreCloudHikariCase(value: HikariCase): RestoredCloudHikariCase {
  validateHikariCase(value);
  const asset = value.assets.find((candidate) => candidate.id === value.scene.host.shapeAssetId);
  if (!asset) throw new Error("The Hikari case host shape is missing");
  if (asset.source.studyId !== "cloud-sculpt" || asset.representation.kind !== "metaballs-v1") {
    throw new Error("This case is not backed by a Cloud Sculpt metaball recipe");
  }
  const history = parseRecipe(JSON.stringify(asset.recipe));
  const state = replay(history);
  const restoredTraceStrength = asset.representation.surfaceTrace?.strength ?? 0;
  const restoredHash = cloudShapeFingerprint(
    state.balls,
    state.params.k,
    restoredTraceStrength,
  );
  if (restoredHash !== asset.sourceHash) {
    throw new Error("The saved Cloud recipe does not reproduce the saved shape hash");
  }
  return {
    history,
    state,
    settings: normalizeHikariSettings(value.controls as Partial<HikariSettings>),
    camera: value.scene.camera,
  };
}

function identityTransform() {
  return {
    translation: { x: 0, y: 0, z: 0 },
    rotation: [0, 0, 0, 1] as [number, number, number, number],
    uniformScale: 1,
  };
}

function directionFromAngle(angleDegrees: number) {
  const angle = (angleDegrees * Math.PI) / 180;
  const direction = {
    x: Math.sin(angle) * 0.72,
    y: -1,
    z: Math.cos(angle) * 0.28,
  };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  return { x: direction.x / length, y: direction.y / length, z: direction.z / length };
}

function jsonRecordClone(value: object): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>;
}
