import * as THREE from "three";
import type { Ball } from "./field.ts";
import type { OpticalSettings } from "./optics.ts";

const MAX_GPU_BALLS = 256;
const RESULT_FLOATS = 20;
const WORKGROUP_SIZE = 64;

export type OpticsComputeKind = "checking" | "computing" | "webgpu" | "cpu" | "error";

export interface OpticsComputeStatus {
  kind: OpticsComputeKind;
  device: string;
  sampleCount: number;
  elapsedMs: number | null;
  hitCount: number;
  message: string;
}

export interface GpuOpticsResult {
  values: Float32Array;
  sampleCount: number;
  hitCount: number;
  elapsedMs: number;
}

const computeShader = /* wgsl */ `
struct Params {
  config0: vec4f,
  config1: vec4f,
  lightDirection: vec4f,
  basisU: vec4f,
  basisV: vec4f,
  originCenter: vec4f,
  random: vec4f,
};

struct RayResult {
  origin: vec4f,
  entry: vec4f,
  exitPoint: vec4f,
  floorPoint: vec4f,
  resultInfo: vec4f,
};

@group(0) @binding(0) var<storage, read> balls: array<vec4f>;
@group(0) @binding(1) var<storage, read> params: Params;
@group(0) @binding(2) var<storage, read_write> results: array<RayResult>;

fn smoothMin(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) {
    return min(a, b);
  }
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn mapField(point: vec3f) -> f32 {
  let ballCount = min(u32(params.config0.x), ${MAX_GPU_BALLS}u);
  var distance = 1e5;
  for (var index = 0u; index < ${MAX_GPU_BALLS}u; index++) {
    if (index >= ballCount) {
      break;
    }
    let ball = balls[index];
    let ballDistance = length(point - ball.xyz) - ball.w;
    if (index == 0u) {
      distance = ballDistance;
    } else {
      distance = smoothMin(distance, ballDistance, params.config0.y);
    }
  }
  return distance;
}

fn fieldNormal(point: vec3f) -> vec3f {
  let e = 0.006;
  return normalize(vec3f(
    mapField(point + vec3f(e, 0.0, 0.0)) - mapField(point - vec3f(e, 0.0, 0.0)),
    mapField(point + vec3f(0.0, e, 0.0)) - mapField(point - vec3f(0.0, e, 0.0)),
    mapField(point + vec3f(0.0, 0.0, e)) - mapField(point - vec3f(0.0, 0.0, e))
  ));
}

fn random01(index: u32, salt: f32) -> f32 {
  let value = f32(index) * (12.9898 + salt * 3.17) + params.random.x * 78.233 + salt;
  return fract(sin(value) * 43758.5453);
}

fn refractDirection(incident: vec3f, normal: vec3f, eta: f32) -> vec4f {
  let cosine = -clamp(dot(incident, normal), -1.0, 1.0);
  let discriminant = 1.0 - eta * eta * (1.0 - cosine * cosine);
  if (discriminant < 0.0) {
    return vec4f(reflect(incident, normal), 0.0);
  }
  return vec4f(normalize(incident * eta + normal * (eta * cosine - sqrt(discriminant))), 1.0);
}

fn marchToSurface(origin: vec3f, direction: vec3f, maxDistance: f32) -> vec4f {
  var travelled = 0.0;
  for (var iteration = 0; iteration < 128; iteration++) {
    if (travelled >= maxDistance) {
      break;
    }
    let point = origin + direction * travelled;
    let distance = mapField(point);
    if (distance < 0.002) {
      return vec4f(point, 1.0);
    }
    travelled += max(0.004, distance * 0.8);
  }
  return vec4f(0.0);
}

fn marchInside(entry: vec3f, direction: vec3f, maxDistance: f32) -> vec4f {
  var travelled = 0.018;
  for (var iteration = 0; iteration < 160; iteration++) {
    if (travelled >= maxDistance) {
      break;
    }
    let point = entry + direction * travelled;
    let distance = mapField(point);
    if (distance >= -0.002 && travelled > 0.04) {
      return vec4f(point, travelled);
    }
    travelled += max(0.012, abs(distance) * 0.72);
  }
  return vec4f(0.0);
}

fn floorIntersection(origin: vec3f, direction: vec3f, floorY: f32) -> vec4f {
  if (direction.y >= -0.001) {
    return vec4f(0.0);
  }
  let distance = (floorY - origin.y) / direction.y;
  if (distance <= 0.0) {
    return vec4f(0.0);
  }
  return vec4f(origin + direction * distance, 1.0);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn trace(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  let sampleCount = u32(params.config1.x);
  if (index >= sampleCount) {
    return;
  }

  let u = random01(index, 0.13) * 2.0 - 1.0;
  let v = random01(index, 1.71) * 2.0 - 1.0;
  let radialJitter = 0.76 + 0.24 * sqrt(random01(index, 4.11));
  let radius = params.config0.w;
  let width = params.config1.y;
  let origin = params.originCenter.xyz
    + params.basisU.xyz * u * radius * 1.15 * width * radialJitter
    + params.basisV.xyz * v * radius * 1.05 * width * radialJitter;
  let lightDirection = normalize(params.lightDirection.xyz);
  let maxDistance = params.config1.w;
  let entryHit = marchToSurface(origin, lightDirection, maxDistance);

  var result: RayResult;
  result.origin = vec4f(origin, 1.0);
  result.entry = vec4f(0.0);
  result.exitPoint = vec4f(0.0);
  result.floorPoint = floorIntersection(origin, lightDirection, params.config1.z);
  result.resultInfo = vec4f(0.0, 0.0, result.floorPoint.w, 0.0);

  if (entryHit.w < 0.5) {
    results[index] = result;
    return;
  }

  let entry = entryHit.xyz;
  let entryNormal = fieldNormal(entry);
  let insideRefraction = refractDirection(lightDirection, entryNormal, 1.0 / params.config0.z);
  let insideDirection = insideRefraction.xyz;
  let exitHit = marchInside(entry, insideDirection, maxDistance);

  result.entry = vec4f(entry, 1.0);
  result.resultInfo.x = 1.0;
  if (exitHit.w <= 0.0) {
    result.exitPoint = vec4f(entry + insideDirection * radius * 1.6, 0.0);
    result.floorPoint = vec4f(0.0);
    result.resultInfo.z = 0.0;
    results[index] = result;
    return;
  }

  let exitPoint = exitHit.xyz;
  let exitNormal = fieldNormal(exitPoint);
  let outgoingRefraction = refractDirection(insideDirection, -exitNormal, params.config0.z);
  let outgoing = outgoingRefraction.xyz;
  let floorPoint = floorIntersection(exitPoint, outgoing, params.config1.z);
  let bend = 1.0 - min(1.0, distance(outgoing, lightDirection) / 1.5);

  result.exitPoint = vec4f(exitPoint, 1.0);
  result.floorPoint = floorPoint;
  result.resultInfo = vec4f(1.0, 1.0, floorPoint.w, 0.5 + bend * 0.5);
  results[index] = result;
}
`;

export class WebGpuOpticsEngine {
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private initializing: Promise<boolean>;
  private status: OpticsComputeStatus = {
    kind: "checking",
    device: "",
    sampleCount: 0,
    elapsedMs: null,
    hitCount: 0,
    message: "GPUを確認中",
  };

  constructor(enabled = true) {
    if (!enabled) {
      this.status = {
        kind: "cpu",
        device: "",
        sampleCount: 0,
        elapsedMs: null,
        hitCount: 0,
        message: "Windows安全モード — CPUプレビュー",
      };
      this.initializing = Promise.resolve(false);
      return;
    }
    this.initializing = this.initialize();
  }

  ready(): Promise<boolean> {
    return this.initializing;
  }

  getStatus(): OpticsComputeStatus {
    return { ...this.status };
  }

  async compute(
    balls: Ball[],
    k: number,
    settings: OpticalSettings,
  ): Promise<GpuOpticsResult | null> {
    const ready = await this.initializing;
    if (!ready || !this.device || !this.pipeline || balls.length === 0) {
      return null;
    }

    const sampleCount = Math.max(1, Math.round(settings.opticalSampleCount));
    this.status = {
      ...this.status,
      kind: "computing",
      sampleCount,
      elapsedMs: null,
      hitCount: 0,
      message: "GPUで光を追跡中",
    };
    const startedAt = performance.now();
    const device = this.device;

    try {
      device.pushErrorScope("validation");
      const bounds = fieldBounds(balls);
      const lightDirection = directionFromAngle(settings.lightAngle);
      const basisU = new THREE.Vector3().crossVectors(
        lightDirection,
        new THREE.Vector3(0, 1, 0),
      );
      if (basisU.lengthSq() < 0.001) basisU.set(1, 0, 0);
      basisU.normalize();
      const basisV = new THREE.Vector3().crossVectors(basisU, lightDirection).normalize();
      const originCenter = bounds.center.clone().addScaledVector(lightDirection, -bounds.radius * 2.6);
      const floorY = bounds.minY - Math.max(0.45, bounds.radius * 0.28);

      const ballValues = new Float32Array(Math.max(1, Math.min(balls.length, MAX_GPU_BALLS)) * 4);
      for (let index = 0; index < Math.min(balls.length, MAX_GPU_BALLS); index++) {
        const ball = balls[index];
        const offset = index * 4;
        ballValues[offset] = ball.x;
        ballValues[offset + 1] = ball.y;
        ballValues[offset + 2] = ball.z;
        ballValues[offset + 3] = ball.r;
      }

      const parameterValues = new Float32Array(28);
      parameterValues.set(
        [
          Math.min(balls.length, MAX_GPU_BALLS),
          k,
          settings.ior,
          bounds.radius,
          sampleCount,
          settings.lightWidth,
          floorY,
          bounds.radius * 5,
          lightDirection.x,
          lightDirection.y,
          lightDirection.z,
          0,
          basisU.x,
          basisU.y,
          basisU.z,
          0,
          basisV.x,
          basisV.y,
          basisV.z,
          0,
          originCenter.x,
          originCenter.y,
          originCenter.z,
          0,
          numericSeed(settings.opticalSeed),
          0,
          0,
          0,
        ],
        0,
      );

      const ballBuffer = createStorageBuffer(device, ballValues);
      const parameterBuffer = createStorageBuffer(device, parameterValues);
      const resultSize = sampleCount * RESULT_FLOATS * Float32Array.BYTES_PER_ELEMENT;
      const resultBuffer = device.createBuffer({
        size: resultSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const readBuffer = device.createBuffer({
        size: resultSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const bindGroup = device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: ballBuffer } },
          { binding: 1, resource: { buffer: parameterBuffer } },
          { binding: 2, resource: { buffer: resultBuffer } },
        ],
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(sampleCount / WORKGROUP_SIZE));
      pass.end();
      encoder.copyBufferToBuffer(resultBuffer, 0, readBuffer, 0, resultSize);
      device.queue.submit([encoder.finish()]);
      await readBuffer.mapAsync(GPUMapMode.READ);
      const validationError = await device.popErrorScope();
      if (validationError) {
        throw new Error(validationError.message);
      }
      const values = new Float32Array(readBuffer.getMappedRange()).slice();
      readBuffer.unmap();

      ballBuffer.destroy();
      parameterBuffer.destroy();
      resultBuffer.destroy();
      readBuffer.destroy();

      const elapsedMs = performance.now() - startedAt;
      let hitCount = 0;
      for (let sample = 0; sample < sampleCount; sample++) {
        if (values[sample * RESULT_FLOATS + 16] > 0.5) hitCount++;
      }
      this.status = {
        ...this.status,
        kind: "webgpu",
        sampleCount,
        elapsedMs,
        hitCount,
        message: "GPU計算",
      };
      return { values, sampleCount, hitCount, elapsedMs };
    } catch (error) {
      this.status = {
        ...this.status,
        kind: "error",
        sampleCount,
        elapsedMs: performance.now() - startedAt,
        hitCount: 0,
        message: `GPU計算失敗: ${(error as Error).message}`,
      };
      return null;
    }
  }

  setCpuFallback(sampleCount: number, message = "CPUプレビュー"): void {
    if (this.status.kind === "checking" || this.status.kind === "cpu") {
      this.status = {
        kind: "cpu",
        device: "",
        sampleCount,
        elapsedMs: null,
        hitCount: 0,
        message,
      };
    }
  }

  private async initialize(): Promise<boolean> {
    if (!navigator.gpu) {
      this.status = {
        kind: "cpu",
        device: "",
        sampleCount: 0,
        elapsedMs: null,
        hitCount: 0,
        message: window.isSecureContext
          ? "WebGPU非対応 — CPUプレビュー"
          : "HTTPS / localhost が必要 — CPUプレビュー",
      };
      return false;
    }

    try {
      this.adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!this.adapter) {
        this.status = {
          kind: "cpu",
          device: "",
          sampleCount: 0,
          elapsedMs: null,
          hitCount: 0,
          message: "GPUを取得できません — CPUプレビュー",
        };
        return false;
      }
      this.device = await this.adapter.requestDevice();
      const module = this.device.createShaderModule({ code: computeShader });
      const compilation = await module.getCompilationInfo();
      const shaderErrors = compilation.messages.filter((message) => message.type === "error");
      if (shaderErrors.length > 0) {
        throw new Error(shaderErrors.map((message) => message.message).join("; "));
      }
      this.pipeline = this.device.createComputePipeline({
        layout: "auto",
        compute: { module, entryPoint: "trace" },
      });
      this.status = {
        kind: "webgpu",
        device: adapterLabel(this.adapter),
        sampleCount: 0,
        elapsedMs: null,
        hitCount: 0,
        message: "WebGPU準備完了",
      };
      this.device.lost.then((info) => {
        this.status = {
          kind: "error",
          device: this.status.device,
          sampleCount: 0,
          elapsedMs: null,
          hitCount: 0,
          message: `GPU接続消失: ${info.message || info.reason}`,
        };
      });
      return true;
    } catch (error) {
      this.status = {
        kind: "error",
        device: "",
        sampleCount: 0,
        elapsedMs: null,
        hitCount: 0,
        message: `WebGPU初期化失敗: ${(error as Error).message}`,
      };
      return false;
    }
  }
}

function createStorageBuffer(device: GPUDevice, values: Float32Array): GPUBuffer {
  const buffer = device.createBuffer({
    size: values.byteLength,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(values);
  buffer.unmap();
  return buffer;
}

function adapterLabel(adapter: GPUAdapter): string {
  const info = adapter.info;
  const values = [info.description, info.device, info.architecture, info.vendor]
    .map((value) => value.trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
  return values.join(" / ") || "high-performance adapter";
}

function numericSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function fieldBounds(balls: Ball[]): { center: THREE.Vector3; radius: number; minY: number } {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const ball of balls) {
    min.min(new THREE.Vector3(ball.x - ball.r, ball.y - ball.r, ball.z - ball.r));
    max.max(new THREE.Vector3(ball.x + ball.r, ball.y + ball.r, ball.z + ball.r));
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  return {
    center,
    radius: Math.max(0.1, center.distanceTo(max)),
    minY: min.y,
  };
}

function directionFromAngle(angleDegrees: number): THREE.Vector3 {
  const angle = THREE.MathUtils.degToRad(angleDegrees);
  return new THREE.Vector3(Math.sin(angle) * 0.72, -1, Math.cos(angle) * 0.28).normalize();
}
