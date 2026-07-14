// ---------------------------------------------------------------------------
// GPU-resident MLS-MPM: owns the storage buffers and compute pipelines for
// one live particle set + grid, and runs whole batches of substeps with a
// single command-buffer submit (no CPU round-trip between substeps -- T2e
// §"作るもの"/§4 "計算は速いが表示で食われた"を黙って出さない: the compute
// path itself does zero readback; readback is an explicit, separately-timed
// operation the caller (main.ts) asks for only when it needs pixels or a
// full-state sync -- see readBackPositions()/readBackFull() below and their
// call sites in main.ts for the "measured before deciding" split between
// per-frame (positions only) and on-demand (full state) readback).
//
// Physics: shaders.ts's WGSL is a line-for-line port of sim.ts's substep()
// -- see that file and shaders.ts's header for the citations, the
// constitutive law, and the fixed-point atomics rationale. This class is
// "just" plumbing: buffers, bind groups, dispatch, readback.
// ---------------------------------------------------------------------------

import { BOUND, DOMAIN_HALF, DOMAIN_SIZE } from "../sim.ts";
import type { MpmParticle } from "../particle.ts";
import type { MpmParams } from "../params.ts";
import { CLEAR_GRID_WGSL, G2P_WGSL, GRID_UPDATE_WGSL, P2G_WGSL, WORKGROUP_SIZE } from "./shaders.ts";

/**
 * Fixed-point scale for the P2G atomic accumulators (shaders.ts's header).
 * Tuned to this Study's sketch-scale magnitudes (masses/momenta of order
 * 1e-3..1e2): value*SCALE must stay well inside i32 range (+-2.147e9) even
 * after ~27-cell-neighborhood accumulation from many particles sharing a
 * cell. Not derived from a general formula -- same "tuned, not universal"
 * honesty pattern as sim.ts's other sketch-scale constants. If a future
 * revisit pushes particle density or stiffness far higher, this may need
 * revisiting (documented as a known limit in README, not silently clamped).
 */
export const MASS_FIXED_SCALE = 1e6;
export const MOM_FIXED_SCALE = 1e6;

function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b);
}

interface FullReadback {
  pos: Float32Array;
  vel: Float32Array;
  F: Float32Array;
  C: Float32Array;
}

export class GpuMpmSim {
  private readonly device: GPUDevice;

  private readonly clearPipeline: GPUComputePipeline;
  private readonly p2gPipeline: GPUComputePipeline;
  private readonly gridUpdatePipeline: GPUComputePipeline;
  private readonly g2pPipeline: GPUComputePipeline;

  private gridN = 0;
  private gridMassFixed!: GPUBuffer;
  private gridVelFixed!: GPUBuffer;
  private gridVelOut!: GPUBuffer;
  private clearBindGroup!: GPUBindGroup;
  private gridUpdateBindGroup!: GPUBindGroup;

  private particleCount = 0;
  private posBuf!: GPUBuffer;
  private velBuf!: GPUBuffer;
  private FBuf!: GPUBuffer;
  private CBuf!: GPUBuffer;
  private massBuf!: GPUBuffer;
  private vol0Buf!: GPUBuffer;
  private p2gBindGroup!: GPUBindGroup;
  private g2pBindGroup!: GPUBindGroup;

  private paramsBuf: GPUBuffer;

  private posStaging!: GPUBuffer;
  private velStaging!: GPUBuffer;
  private FStaging!: GPUBuffer;
  private CStaging!: GPUBuffer;

  constructor(device: GPUDevice) {
    this.device = device;
    this.clearPipeline = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: CLEAR_GRID_WGSL }), entryPoint: "main" } });
    this.p2gPipeline = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: P2G_WGSL }), entryPoint: "main" } });
    this.gridUpdatePipeline = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: GRID_UPDATE_WGSL }), entryPoint: "main" } });
    this.g2pPipeline = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: G2P_WGSL }), entryPoint: "main" } });
    // A UNIFORM buffer, not storage: P2G alone already touches 8 storage
    // buffers (particle SoA x6 + the two atomic grid accumulators), which is
    // the WebGPU-guaranteed minimum maxStorageBuffersPerShaderStage on every
    // conformant implementation (some allow more, e.g. this dev machine's
    // Metal backend allows 10, but relying on that would break on adapters
    // that only offer the guaranteed 8 -- discovered exactly this way: pipeline
    // creation failed a validation check silently until it was surfaced via
    // an explicit device.pushErrorScope() during a "gridMassFixed reads back
    // all-zero" investigation, see README's Observation). Uniform buffers are
    // a separate binding-count budget, so moving params here fixes P2G's
    // count (8) without touching the shader math.
    this.paramsBuf = device.createBuffer({ size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.ensureGridBuffers(48);
    this.ensureParticleBuffers(0);
  }

  private ensureGridBuffers(gridN: number): void {
    if (gridN === this.gridN) return;
    this.gridN = gridN;
    const n3 = gridN * gridN * gridN;
    this.gridMassFixed?.destroy();
    this.gridVelFixed?.destroy();
    this.gridVelOut?.destroy();
    // COPY_SRC is not needed by the compute passes themselves (only by the
    // debugRead* helpers below, which copy these out for WGSL-vs-sim.ts
    // diagnosis) -- kept on anyway since it's free and avoids a silent
    // "copy validation failed, staging buffer stayed zero" trap like the one
    // hit while diagnosing the params/atomic-access-mode bugs (README).
    const gridUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
    this.gridMassFixed = this.device.createBuffer({ size: Math.max(4, n3 * 4), usage: gridUsage });
    this.gridVelFixed = this.device.createBuffer({ size: Math.max(4, n3 * 3 * 4), usage: gridUsage });
    this.gridVelOut = this.device.createBuffer({ size: Math.max(4, n3 * 3 * 4), usage: gridUsage });

    this.clearBindGroup = this.device.createBindGroup({
      layout: this.clearPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.gridMassFixed } },
        { binding: 1, resource: { buffer: this.gridVelFixed } },
      ],
    });
    this.gridUpdateBindGroup = this.device.createBindGroup({
      layout: this.gridUpdatePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuf } },
        { binding: 1, resource: { buffer: this.gridMassFixed } },
        { binding: 2, resource: { buffer: this.gridVelFixed } },
        { binding: 3, resource: { buffer: this.gridVelOut } },
      ],
    });
    // Grid buffers changed identity -- p2g/g2p bind groups reference them too.
    if (this.particleCount > 0) this.rebuildParticleBindGroups();
  }

  private ensureParticleBuffers(count: number): void {
    if (count === this.particleCount && this.posBuf) return;
    this.particleCount = count;
    this.posBuf?.destroy();
    this.velBuf?.destroy();
    this.FBuf?.destroy();
    this.CBuf?.destroy();
    this.massBuf?.destroy();
    this.vol0Buf?.destroy();
    this.posStaging?.destroy();
    this.velStaging?.destroy();
    this.FStaging?.destroy();
    this.CStaging?.destroy();

    const rw = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.posBuf = this.device.createBuffer({ size: Math.max(4, count * 3 * 4), usage: rw });
    this.velBuf = this.device.createBuffer({ size: Math.max(4, count * 3 * 4), usage: rw });
    this.FBuf = this.device.createBuffer({ size: Math.max(4, count * 9 * 4), usage: rw });
    this.CBuf = this.device.createBuffer({ size: Math.max(4, count * 9 * 4), usage: rw });
    this.massBuf = this.device.createBuffer({ size: Math.max(4, count * 4), usage: rw });
    this.vol0Buf = this.device.createBuffer({ size: Math.max(4, count * 4), usage: rw });

    const stagingUsage = GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST;
    this.posStaging = this.device.createBuffer({ size: Math.max(4, count * 3 * 4), usage: stagingUsage });
    this.velStaging = this.device.createBuffer({ size: Math.max(4, count * 3 * 4), usage: stagingUsage });
    this.FStaging = this.device.createBuffer({ size: Math.max(4, count * 9 * 4), usage: stagingUsage });
    this.CStaging = this.device.createBuffer({ size: Math.max(4, count * 9 * 4), usage: stagingUsage });

    this.rebuildParticleBindGroups();
  }

  private rebuildParticleBindGroups(): void {
    this.p2gBindGroup = this.device.createBindGroup({
      layout: this.p2gPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuf } },
        { binding: 1, resource: { buffer: this.posBuf } },
        { binding: 2, resource: { buffer: this.velBuf } },
        { binding: 3, resource: { buffer: this.FBuf } },
        { binding: 4, resource: { buffer: this.CBuf } },
        { binding: 5, resource: { buffer: this.massBuf } },
        { binding: 6, resource: { buffer: this.vol0Buf } },
        { binding: 7, resource: { buffer: this.gridMassFixed } },
        { binding: 8, resource: { buffer: this.gridVelFixed } },
      ],
    });
    this.g2pBindGroup = this.device.createBindGroup({
      layout: this.g2pPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuf } },
        { binding: 1, resource: { buffer: this.posBuf } },
        { binding: 2, resource: { buffer: this.velBuf } },
        { binding: 3, resource: { buffer: this.FBuf } },
        { binding: 4, resource: { buffer: this.CBuf } },
        { binding: 5, resource: { buffer: this.gridVelOut } },
      ],
    });
  }

  /** Upload a full particle set + set the grid resolution. Recreates buffers only if size actually changed. */
  upload(particles: MpmParticle[], gridN: number): void {
    this.ensureGridBuffers(gridN);
    this.ensureParticleBuffers(particles.length);
    const n = particles.length;
    if (n === 0) return;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const F = new Float32Array(n * 9);
    const C = new Float32Array(n * 9);
    const mass = new Float32Array(n);
    const vol0 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = particles[i];
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      vel[i * 3] = p.vx;
      vel[i * 3 + 1] = p.vy;
      vel[i * 3 + 2] = p.vz;
      for (let k = 0; k < 9; k++) {
        F[i * 9 + k] = p.F[k];
        C[i * 9 + k] = p.C[k];
      }
      mass[i] = p.mass;
      vol0[i] = p.volume0;
    }
    this.device.queue.writeBuffer(this.posBuf, 0, pos);
    this.device.queue.writeBuffer(this.velBuf, 0, vel);
    this.device.queue.writeBuffer(this.FBuf, 0, F);
    this.device.queue.writeBuffer(this.CBuf, 0, C);
    this.device.queue.writeBuffer(this.massBuf, 0, mass);
    this.device.queue.writeBuffer(this.vol0Buf, 0, vol0);
  }

  /** Change grid resolution without touching particle buffers (gridN slider while already seeded). */
  setGridResolution(gridN: number): void {
    this.ensureGridBuffers(gridN);
  }

  getParticleCount(): number {
    return this.particleCount;
  }

  private writeParams(params: MpmParams, dt: number): void {
    const dx = DOMAIN_SIZE / this.gridN;
    const arr = new Float32Array([
      this.gridN,
      dx,
      1 / dx,
      dt,
      DOMAIN_HALF,
      DOMAIN_SIZE,
      BOUND,
      params.phase,
      params.youngsModulusPa,
      params.poissonRatio,
      params.fluidBulkModulusPa,
      params.fluidViscosityPaS,
      params.gravity,
      this.particleCount,
      MASS_FIXED_SCALE,
      MOM_FIXED_SCALE,
    ]);
    this.device.queue.writeBuffer(this.paramsBuf, 0, arr);
  }

  /**
   * Run `steps` substeps entirely on the GPU: one command encoder, one
   * queue.submit(), zero CPU readback in between (T2e §4's "compute stays
   * compute" half of the instruction). params/dt are written once (they're
   * constant for the whole batch -- the UI only changes them between runs,
   * never mid-run). No-op if there are no particles or steps<=0.
   */
  runSteps(params: MpmParams, dt: number, steps: number): void {
    if (this.particleCount === 0 || steps <= 0) return;
    this.writeParams(params, dt);
    const n3 = this.gridN * this.gridN * this.gridN;
    const clearGroups = ceilDiv(n3 * 3, WORKGROUP_SIZE);
    const cellGroups = ceilDiv(n3, WORKGROUP_SIZE);
    const particleGroups = ceilDiv(this.particleCount, WORKGROUP_SIZE);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    for (let s = 0; s < steps; s++) {
      pass.setPipeline(this.clearPipeline);
      pass.setBindGroup(0, this.clearBindGroup);
      pass.dispatchWorkgroups(clearGroups);

      pass.setPipeline(this.p2gPipeline);
      pass.setBindGroup(0, this.p2gBindGroup);
      pass.dispatchWorkgroups(particleGroups);

      pass.setPipeline(this.gridUpdatePipeline);
      pass.setBindGroup(0, this.gridUpdateBindGroup);
      pass.dispatchWorkgroups(cellGroups);

      pass.setPipeline(this.g2pPipeline);
      pass.setBindGroup(0, this.g2pBindGroup);
      pass.dispatchWorkgroups(particleGroups);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * All staging-buffer readbacks are funneled through this promise chain.
   * readBackPositions() (autorun, every frame) and readBackFull() (freeze /
   * backend switch) share the SAME staging buffers — if one mapAsync()es
   * while the other still has the buffer mapped or pending, WebGPU throws
   * "Buffer is already mapped" (observed on the author's RTX3080 pressing
   * 凍らせる during 自動実行, 2026-07-10). Serializing here fixes every
   * caller at once instead of trusting each call site to coordinate.
   */
  private readbackChain: Promise<unknown> = Promise.resolve();
  private serializeReadback<T>(job: () => Promise<T>): Promise<T> {
    const next = this.readbackChain.then(job, job);
    this.readbackChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** Cheap per-frame readback for rendering: positions only (T2e §4 -- measured against readBackFull(), see README's transfer-cost table). */
  readBackPositions(): Promise<Float32Array> {
    return this.serializeReadback(async () => {
      if (this.particleCount === 0) return new Float32Array(0);
      const bytes = this.particleCount * 3 * 4;
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(this.posBuf, 0, this.posStaging, 0, bytes);
      this.device.queue.submit([encoder.finish()]);
      await this.posStaging.mapAsync(GPUMapMode.READ);
      const out = new Float32Array(this.posStaging.getMappedRange(0, bytes).slice(0));
      this.posStaging.unmap();
      return out;
    });
  }

  /** Full-state readback (position, velocity, F, C -- mass/volume0 never change post-seed so the caller keeps its own copy, see main.ts). Used on demand: freeze, backend switch, history export, debug inspection -- never blindly every frame (T2e §4). */
  readBackFull(): Promise<FullReadback> {
    return this.serializeReadback(() => this.readBackFullInner());
  }

  private async readBackFullInner(): Promise<FullReadback> {
    if (this.particleCount === 0) return { pos: new Float32Array(0), vel: new Float32Array(0), F: new Float32Array(0), C: new Float32Array(0) };
    const posBytes = this.particleCount * 3 * 4;
    const matBytes = this.particleCount * 9 * 4;
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.posBuf, 0, this.posStaging, 0, posBytes);
    encoder.copyBufferToBuffer(this.velBuf, 0, this.velStaging, 0, posBytes);
    encoder.copyBufferToBuffer(this.FBuf, 0, this.FStaging, 0, matBytes);
    encoder.copyBufferToBuffer(this.CBuf, 0, this.CStaging, 0, matBytes);
    this.device.queue.submit([encoder.finish()]);
    await Promise.all([
      this.posStaging.mapAsync(GPUMapMode.READ),
      this.velStaging.mapAsync(GPUMapMode.READ),
      this.FStaging.mapAsync(GPUMapMode.READ),
      this.CStaging.mapAsync(GPUMapMode.READ),
    ]);
    const pos = new Float32Array(this.posStaging.getMappedRange(0, posBytes).slice(0));
    const vel = new Float32Array(this.velStaging.getMappedRange(0, posBytes).slice(0));
    const F = new Float32Array(this.FStaging.getMappedRange(0, matBytes).slice(0));
    const C = new Float32Array(this.CStaging.getMappedRange(0, matBytes).slice(0));
    this.posStaging.unmap();
    this.velStaging.unmap();
    this.FStaging.unmap();
    this.CStaging.unmap();
    return { pos, vel, F, C };
  }

  /** Debug-only: read back the raw fixed-point mass grid (pre-decode) to isolate whether P2G's atomicAdd ever wrote anything. */
  async debugReadGridMassFixed(): Promise<Int32Array> {
    const n3 = this.gridN * this.gridN * this.gridN;
    const bytes = n3 * 4;
    const staging = this.device.createBuffer({ size: Math.max(4, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.gridMassFixed, 0, staging, 0, Math.max(4, bytes));
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const out = new Int32Array(staging.getMappedRange(0, Math.max(4, bytes)).slice(0));
    staging.unmap();
    staging.destroy();
    return out;
  }

  /** Debug-only: read back the post-grid-update velocity grid (gridVelOut) raw. Not used by the interactive path -- exists to isolate P2G/gridUpdate from G2P when diagnosing the WGSL port against sim.ts. */
  async debugReadGridVelOut(): Promise<Float32Array> {
    const n3 = this.gridN * this.gridN * this.gridN;
    const bytes = n3 * 3 * 4;
    const staging = this.device.createBuffer({ size: Math.max(4, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.gridVelOut, 0, staging, 0, Math.max(4, bytes));
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(staging.getMappedRange(0, Math.max(4, bytes)).slice(0));
    staging.unmap();
    staging.destroy();
    return out;
  }

  /** Block until all submitted GPU work has actually completed -- used only by the perf-measurement harness (main.ts's benchmark helper) to time compute in isolation from readback. Not called on the interactive path (would force an unnecessary CPU/GPU sync point every run). */
  async waitForCompletion(): Promise<void> {
    await this.device.queue.onSubmittedWorkDone();
  }

  dispose(): void {
    this.gridMassFixed?.destroy();
    this.gridVelFixed?.destroy();
    this.gridVelOut?.destroy();
    this.posBuf?.destroy();
    this.velBuf?.destroy();
    this.FBuf?.destroy();
    this.CBuf?.destroy();
    this.massBuf?.destroy();
    this.vol0Buf?.destroy();
    this.posStaging?.destroy();
    this.velStaging?.destroy();
    this.FStaging?.destroy();
    this.CStaging?.destroy();
    this.paramsBuf?.destroy();
  }
}
