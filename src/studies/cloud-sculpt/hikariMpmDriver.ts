// A deliberately small MPM -> Hikari bridge for artwork previews.
// The simulation remains the existing MPM study; Hikari receives a coarse,
// frozen Ball[] proxy at a low rate so optical rendering never sees thousands
// of moving material points as its boundary.

import type { Ball } from "./field.ts";
import { DEFAULT_MPM_PARAMS, type MpmParams } from "../mpm/params.ts";
import type { MpmParticle } from "../mpm/particle.ts";
import { freezeParticlesToBalls, seedParticlesFromBalls } from "../mpm/seeding.ts";
import { DOMAIN_HALF, DOMAIN_SIZE, makeGrid, marginWorld, runSteps } from "../mpm/sim.ts";

export interface HikariMpmPreviewOptions {
  phase?: number;
  particlesPerUnitVolume?: number;
  gridN?: number;
  gravity?: number;
  fluidViscosityPaS?: number;
  maxBalls?: number;
  maxParticles?: number;
}

export class HikariMpmDriver {
  private readonly params: MpmParams;
  private particles: MpmParticle[] = [];
  private grid = makeGrid(32);
  private yOffset = 0;
  private smoothK = 0.6;
  private maxBalls = 220;
  private maxParticles = 3_000;

  constructor(options: HikariMpmPreviewOptions = {}) {
    this.params = {
      ...DEFAULT_MPM_PARAMS,
      phase: options.phase ?? 0.92,
      particlesPerUnitVolume: options.particlesPerUnitVolume ?? 56,
      gridN: options.gridN ?? 32,
      gravity: options.gravity ?? 4.2,
      fluidViscosityPaS: options.fluidViscosityPaS ?? 10,
      substepsPerRun: 12,
    };
    this.grid = makeGrid(this.params.gridN);
    this.maxBalls = options.maxBalls ?? 220;
    this.maxParticles = options.maxParticles ?? 3_000;
  }

  seed(sourceBalls: readonly Ball[], smoothK: number): void {
    if (sourceBalls.length === 0) throw new Error("MPM preview needs a non-empty Hikari shape");
    this.smoothK = smoothK;
    const minY = Math.min(...sourceBalls.map((ball) => ball.y - ball.r));
    this.yOffset = Math.max(0, marginWorld(this.params.gridN) + 0.18 - minY);
    const lifted = sourceBalls.map((ball) => ({ ...ball, y: ball.y + this.yOffset }));
    this.assertFitsPreviewDomain(lifted);
    const totalVolume = lifted.reduce(
      (sum, ball) => sum + (4 / 3) * Math.PI * ball.r ** 3,
      0,
    );
    const availableForVolume = Math.max(1, this.maxParticles - lifted.length);
    const effectiveDensity = Math.min(
      this.params.particlesPerUnitVolume,
      availableForVolume / Math.max(totalVolume, Number.EPSILON),
    );
    this.particles = seedParticlesFromBalls(
      lifted,
      effectiveDensity,
      this.params.densityKgM3,
      "hikari-mpm-preview",
    );
    if (this.particles.length > this.maxParticles) {
      throw new Error(`MPM preview particle cap exceeded (${this.particles.length} / ${this.maxParticles})`);
    }
  }

  private assertFitsPreviewDomain(balls: readonly Ball[]): void {
    const margin = marginWorld(this.params.gridN) + 0.18;
    const horizontalLimit = DOMAIN_HALF - margin;
    const ceiling = DOMAIN_SIZE - margin;
    const fits = balls.every((ball) =>
      ball.x - ball.r >= -horizontalLimit
      && ball.x + ball.r <= horizontalLimit
      && ball.z - ball.r >= -horizontalLimit
      && ball.z + ball.r <= horizontalLimit
      && ball.y - ball.r >= margin - 1e-6
      && ball.y + ball.r <= ceiling
    );
    if (!fits) {
      throw new Error("形がMPMプレビュー領域を超えています。小さくするか中央へ寄せてください");
    }
  }

  advance(steps = this.params.substepsPerRun): void {
    if (this.particles.length === 0) return;
    runSteps(this.particles, this.grid, this.params, Math.max(1, Math.round(steps)));
  }

  previewBalls(): Ball[] {
    if (this.particles.length === 0) return [];
    const balls = freezeParticlesToBalls(
      this.particles,
      this.params.densityKgM3,
      this.grid.dx * 3,
    );
    return balls
      .map((ball) => ({ ...ball, y: ball.y - this.yOffset }))
      .slice(0, this.maxBalls);
  }

  particleCount(): number {
    return this.particles.length;
  }

  description(): string {
    return `MPM preview · ${this.particles.length.toLocaleString()} particles · phase ${this.params.phase.toFixed(2)} · k ${this.smoothK.toFixed(2)}`;
  }
}
