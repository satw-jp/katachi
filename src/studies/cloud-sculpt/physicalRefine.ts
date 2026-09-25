import type { Ball } from "./field.ts";
import type { CameraSnapshot } from "./renderer.ts";
import type { OpticalScene, PhysicalScale, Rgb, Vec3 } from "./opticalScene.ts";
import {
  HIKARI_MITSUBA_OPERATION,
  HikariMitsubaBridgeError,
  HikariMitsubaClient,
  type HikariMitsubaCapabilities,
  type HikariMitsubaRenderMetadata,
  type HikariMitsubaRequest,
  type HikariMitsubaRenderResult,
  type RenderPurpose,
} from "../../../tools/hikari-mitsuba-bridge/client.ts";

export type PhysicalRefineStatus =
  | "OFFLINE"
  | "READY"
  | "RENDERING"
  | "CURRENT"
  | "STALE"
  | "ERROR"
  | "CANCELLED";

export interface PhysicalRefineIdentity {
  shapeSource: {
    kind: "balls-smooth-union";
    balls: readonly { center: Vec3; radius: number }[];
    smoothness: number;
  };
  physicalScale: PhysicalScale;
  camera: {
    positionMm: Vec3;
    targetMm: Vec3;
    up: Vec3;
    fovDeg: number;
    aspect: number;
  };
  hostMaterial: {
    id: string;
    ior: number;
    absorptionPerMm: Rgb;
    roughness: number;
  };
  light: {
    directionPropagation: Vec3;
    radiance: Rgb;
    angularDiameterDeg: number;
  };
  receiver: {
    positionMm: Vec3;
    normal: Vec3;
    extentMm: { x: number; z: number };
    reflectance: number;
  };
  environment: { radiance: Rgb };
  /** Kept in the identity so a physical result cannot silently outlive an
   * optical setting that the fixed bridge does not yet transfer. */
  opticalContract: {
    boundaryEpsilon: number;
    inclusions: unknown;
  };
}

export interface PhysicalRefineScene extends PhysicalRefineIdentity {
  caseId: string;
  caseLabel: string;
  sourceCommit: string;
  sourceRef: string;
  canonicalMesh: Uint8Array;
}

export interface PhysicalRefineLastResult {
  purpose: RenderPurpose;
  fingerprint: string;
  metadata: HikariMitsubaRenderMetadata;
  artifact: Uint8Array;
}

export interface PhysicalRefineState {
  status: PhysicalRefineStatus;
  capabilities: HikariMitsubaCapabilities | null;
  currentFingerprint: string | null;
  lastResult: PhysicalRefineLastResult | null;
  error: string | null;
}

export interface PhysicalRefineClient {
  capabilities(signal?: AbortSignal): Promise<HikariMitsubaCapabilities>;
  render(
    request: HikariMitsubaRequest,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<HikariMitsubaRenderResult>;
  cancel(requestId: string, provenanceFingerprint: string): Promise<{ cancelled: boolean; status: string }>;
}

export interface PhysicalRefineControllerOptions {
  client?: PhysicalRefineClient;
  onStateChange?: (state: PhysicalRefineState) => void;
}

export const PHYSICAL_REFINE_RENDER = Object.freeze({
  width: 384,
  height: 384,
  spp: 32,
});

export function physicalRefineIdentityFromCurrentScene(input: {
  balls: readonly Ball[];
  smoothness: number;
  camera: CameraSnapshot;
  opticalScene: OpticalScene;
  receiverReflectance: number;
  receiverExtentMm?: { x: number; z: number };
  environmentRadiance: Rgb;
}): PhysicalRefineIdentity {
  const scale = input.opticalScene.physicalScale.mmPerShapeUnit;
  const toMm = (value: Vec3): Vec3 => ({
    x: value.x * scale,
    y: value.y * scale,
    z: value.z * scale,
  });
  const receiverExtentMm = input.receiverExtentMm ?? { x: 240, z: 240 };
  const receiver = input.opticalScene.receiver;
  const light = input.opticalScene.light;
  return {
    shapeSource: {
      kind: "balls-smooth-union",
      balls: input.balls.map((ball) => ({
        center: { x: ball.x, y: ball.y, z: ball.z },
        radius: ball.r,
      })),
      smoothness: input.smoothness,
    },
    physicalScale: { ...input.opticalScene.physicalScale },
    camera: {
      positionMm: toMm({ x: input.camera.position[0], y: input.camera.position[1], z: input.camera.position[2] }),
      targetMm: toMm({ x: input.camera.target[0], y: input.camera.target[1], z: input.camera.target[2] }),
      up: { x: 0, y: 1, z: 0 },
      fovDeg: input.camera.fov,
      aspect: input.camera.aspect ?? 1,
    },
    hostMaterial: {
      id: input.opticalScene.host.material.id,
      ior: input.opticalScene.host.material.ior,
      absorptionPerMm: { ...input.opticalScene.host.material.absorptionPerMm },
      roughness: input.opticalScene.host.material.roughness,
    },
    light: {
      directionPropagation: { ...light.direction },
      radiance: { ...light.radiance },
      angularDiameterDeg: 0.53,
    },
    receiver: {
      positionMm: toMm(receiver.pose.position),
      normal: { ...receiver.normal },
      extentMm: { ...receiverExtentMm },
      reflectance: clamp01(input.receiverReflectance),
    },
    environment: { radiance: { ...input.environmentRadiance } },
    opticalContract: {
      boundaryEpsilon: input.opticalScene.boundaryEpsilon,
      inclusions: input.opticalScene.inclusions,
    },
  };
}

export function withPhysicalRefineLightSize(
  identity: PhysicalRefineIdentity,
  angularDiameterDeg: number,
): PhysicalRefineIdentity {
  return {
    ...identity,
    light: { ...identity.light, angularDiameterDeg },
  };
}

export function physicalRefineIdentityKey(identity: PhysicalRefineIdentity): string {
  return JSON.stringify(canonicalize({
    shapeSource: identity.shapeSource,
    physicalScale: identity.physicalScale,
    camera: identity.camera,
    hostMaterial: identity.hostMaterial,
    light: identity.light,
    receiver: identity.receiver,
    environment: identity.environment,
    opticalContract: identity.opticalContract,
  }));
}

export function physicalRefineErrorMessage(error: unknown): string {
  if (error instanceof HikariMitsubaBridgeError) return error.message;
  if (error instanceof Error) return error.message;
  return "Mitsuba Bridgeで予期しないエラーが発生しました";
}

export class PhysicalRefineController {
  private readonly client: PhysicalRefineClient;
  private readonly onStateChange?: (state: PhysicalRefineState) => void;
  private state: PhysicalRefineState = {
    status: "OFFLINE",
    capabilities: null,
    currentFingerprint: null,
    lastResult: null,
    error: null,
  };
  private active: {
    sequence: number;
    requestId: string;
    fingerprint: string;
    abort: AbortController;
  } | null = null;
  private sequence = 0;
  private probeSequence = 0;

  constructor(options: PhysicalRefineControllerOptions) {
    this.client = options.client ?? new HikariMitsubaClient();
    this.onStateChange = options.onStateChange;
  }

  getState(): PhysicalRefineState {
    return this.state;
  }

  observe(identity: PhysicalRefineIdentity): void {
    const fingerprint = physicalRefineIdentityKey(identity);
    this.state.currentFingerprint = fingerprint;
    if (!this.state.lastResult) {
      this.publish({ currentFingerprint: fingerprint });
      return;
    }
    if (this.state.lastResult.fingerprint === fingerprint) {
      if (this.state.status === "STALE") this.publish({ status: "CURRENT", error: null });
      return;
    }
    if (this.state.status !== "RENDERING") {
      this.publish({ status: "STALE", error: null });
    }
  }

  markStale(): void {
    if (this.active) {
      this.publish({ currentFingerprint: null });
      return;
    }
    if (this.state.lastResult) this.publish({ status: "STALE", currentFingerprint: null, error: null });
  }

  async probe(): Promise<HikariMitsubaCapabilities | null> {
    const probeSequence = ++this.probeSequence;
    this.publish({ status: "OFFLINE", error: null });
    try {
      const capabilities = await this.client.capabilities();
      if (probeSequence !== this.probeSequence) return null;
      if (!capabilities.workerReady || capabilities.selectedVariant === null) {
        throw new HikariMitsubaBridgeError("offline", "Mitsuba Bridgeは起動していますがworkerが準備できていません");
      }
      const status = !this.state.lastResult
        ? "READY"
        : this.state.lastResult.fingerprint === this.state.currentFingerprint
          ? "CURRENT"
          : "STALE";
      this.publish({ status, capabilities, error: null });
      return capabilities;
    } catch (error) {
      if (probeSequence !== this.probeSequence) return null;
      const code = error instanceof HikariMitsubaBridgeError ? error.code : "offline";
      this.publish({
        status: code === "offline" || code === "timeout" ? "OFFLINE" : "ERROR",
        error: physicalRefineErrorMessage(error),
      });
      return null;
    }
  }

  async render(scene: PhysicalRefineScene, purpose: RenderPurpose): Promise<PhysicalRefineLastResult | null> {
    this.cancelSupersededRender();
    const sequence = ++this.sequence;
    const fingerprint = physicalRefineIdentityKey(scene);
    this.state.currentFingerprint = fingerprint;
    const abort = new AbortController();
    const requestId = `refine-${Date.now()}-${sequence}`;
    this.active = { sequence, requestId, fingerprint, abort };
    this.publish({ status: "RENDERING", error: null });

    try {
      const capabilities = this.state.capabilities ?? await this.probe();
      if (!capabilities) {
        if (this.active?.sequence === sequence) this.active = null;
        return null;
      }
      const request = await buildPhysicalRefineRequest(
        scene,
        purpose,
        requestId,
        selectComputeDevice(capabilities),
      );
      const result = await this.client.render(request, { signal: abort.signal });
      if (!this.active || this.active.sequence !== sequence || abort.signal.aborted) return null;
      const lastResult: PhysicalRefineLastResult = {
        purpose,
        fingerprint,
        metadata: result.metadata,
        artifact: new Uint8Array(result.artifact),
      };
      const status = this.state.currentFingerprint === fingerprint ? "CURRENT" : "STALE";
      this.active = null;
      this.publish({ status, lastResult, error: null });
      return lastResult;
    } catch (error) {
      if (!this.active || this.active.sequence !== sequence) return null;
      this.active = null;
      const cancelled = abort.signal.aborted
        || (error instanceof HikariMitsubaBridgeError && error.code === "cancelled");
      const offline = error instanceof HikariMitsubaBridgeError
        && (error.code === "offline" || error.code === "timeout");
      this.publish({
        status: cancelled ? "CANCELLED" : offline ? "OFFLINE" : "ERROR",
        error: cancelled ? null : physicalRefineErrorMessage(error),
      });
      return null;
    }
  }

  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.sequence++;
    this.active = null;
    active.abort.abort();
    void this.client.cancel(active.requestId, active.fingerprint).catch(() => undefined);
    this.publish({ status: "CANCELLED", error: null });
  }

  fail(error: unknown): void {
    if (this.active) {
      this.sequence++;
      this.active.abort.abort();
      this.active = null;
    }
    this.publish({ status: "ERROR", error: physicalRefineErrorMessage(error) });
  }

  private cancelSupersededRender(): void {
    const active = this.active;
    if (!active) return;
    this.sequence++;
    this.active = null;
    active.abort.abort();
    void this.client.cancel(active.requestId, active.fingerprint).catch(() => undefined);
  }

  private publish(patch: Partial<PhysicalRefineState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChange?.(this.state);
  }
}

async function buildPhysicalRefineRequest(
  scene: PhysicalRefineScene,
  purpose: RenderPurpose,
  requestId: string,
  device: "cuda" | "cpu",
): Promise<HikariMitsubaRequest> {
  const meshHash = await sha256Hex(scene.canonicalMesh);
  return {
    requestId,
    operation: HIKARI_MITSUBA_OPERATION,
    case: { id: scene.caseId, label: scene.caseLabel },
    provenance: {
      repository: "satw-jp/katachi",
      sourceCommit: scene.sourceCommit,
      sourceRef: scene.sourceRef,
      shapeSource: scene.shapeSource.kind,
      fingerprint: await sha256Hex(new TextEncoder().encode(physicalRefineIdentityKey(scene))),
    },
    canonicalMesh: {
      format: "obj",
      dataBase64: bytesToBase64(scene.canonicalMesh),
      byteLength: scene.canonicalMesh.byteLength,
      sha256: meshHash,
    },
    physicalScale: { ...scene.physicalScale },
    camera: { ...scene.camera },
    hostMaterial: { ...scene.hostMaterial, absorptionPerMm: { ...scene.hostMaterial.absorptionPerMm } },
    light: { ...scene.light, directionPropagation: { ...scene.light.directionPropagation }, radiance: { ...scene.light.radiance } },
    receiver: { ...scene.receiver, positionMm: { ...scene.receiver.positionMm }, normal: { ...scene.receiver.normal }, extentMm: { ...scene.receiver.extentMm } },
    environment: { radiance: { ...scene.environment.radiance } },
    renderPurpose: purpose,
    compute: { device },
    spp: PHYSICAL_REFINE_RENDER.spp,
    resolution: { width: PHYSICAL_REFINE_RENDER.width, height: PHYSICAL_REFINE_RENDER.height },
  };
}

function selectComputeDevice(capabilities: HikariMitsubaCapabilities): "cuda" | "cpu" {
  if (
    capabilities.cudaAvailable
    && capabilities.selectedVariant === "cuda_ad_rgb"
    && capabilities.supportedDevices.includes("cuda")
  ) return "cuda";
  if (capabilities.selectedVariant === "scalar_rgb" && capabilities.supportedDevices.includes("cpu")) return "cpu";
  throw new HikariMitsubaBridgeError("device_mismatch", "Bridgeの実行variantが固定contractと一致しません");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object).sort().map((key) => [key, canonicalize(object[key])]),
    );
  }
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  if (typeof btoa !== "function") throw new HikariMitsubaBridgeError("encoding_unavailable", "ブラウザのbase64 encoderが利用できません");
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new HikariMitsubaBridgeError("crypto_unavailable", "Web Crypto SHA-256が利用できません");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
