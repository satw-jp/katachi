import { validateOpticalScene, type OpticalScene } from "./scene.ts";
import {
  validateJsonValue,
  validateShapeAsset,
  type JsonValue,
  type ShapeAsset,
} from "./shape.ts";

export interface HikariCase {
  formatVersion: 1;
  id: string;
  capturedAtUtc: string;
  appVersion: string;
  gitCommit: string | null;
  assets: ShapeAsset[];
  scene: OpticalScene;
  renderer: {
    backend: "cpu" | "webgl" | "webgpu";
    sampleCount: number;
  };
  /** Exact author-facing control values needed to reopen the observed state. */
  controls: Record<string, JsonValue>;
  observation: {
    observed: string[];
    interpretation: string[];
    decision: string[];
  };
  approximations: string[];
}

export function serializeHikariCase(value: HikariCase): string {
  validateHikariCase(value);
  return JSON.stringify(value, null, 2);
}

export function parseHikariCase(text: string): HikariCase {
  const value: unknown = JSON.parse(text);
  validateHikariCase(value);
  return value;
}

export function validateHikariCase(value: unknown): asserts value is HikariCase {
  if (!isRecord(value)) throw new Error("HikariCase must be an object");
  if (value.formatVersion !== 1) throw new Error("Unsupported HikariCase formatVersion");
  requireNonEmpty(value.id, "HikariCase.id");
  requireNonEmpty(value.capturedAtUtc, "HikariCase.capturedAtUtc");
  if (!value.capturedAtUtc.endsWith("Z") || !Number.isFinite(Date.parse(value.capturedAtUtc))) {
    throw new Error("HikariCase.capturedAtUtc must be a valid UTC ISO timestamp");
  }
  requireNonEmpty(value.appVersion, "HikariCase.appVersion");
  if (value.gitCommit !== null) requireNonEmpty(value.gitCommit, "HikariCase.gitCommit");
  if (!Array.isArray(value.assets) || value.assets.length === 0) {
    throw new Error("HikariCase.assets must contain at least one ShapeAsset");
  }
  for (const asset of value.assets) validateShapeAsset(asset);
  if (!isRecord(value.scene)) throw new Error("HikariCase.scene must be an object");
  validateOpticalScene(value.scene as unknown as OpticalScene, value.assets);
  if (!isRecord(value.renderer)) throw new Error("HikariCase.renderer must be an object");
  if (!new Set(["cpu", "webgl", "webgpu"]).has(String(value.renderer.backend))) {
    throw new Error("HikariCase.renderer.backend is invalid");
  }
  if (!Number.isInteger(value.renderer.sampleCount) || (value.renderer.sampleCount as number) < 0) {
    throw new Error("HikariCase.renderer.sampleCount must be a non-negative integer");
  }
  if (!isRecord(value.controls)) throw new Error("HikariCase.controls must be an object");
  validateJsonValue(value.controls, "HikariCase.controls");
  if (!isRecord(value.observation)) throw new Error("HikariCase.observation must be an object");
  validateStringArray(value.observation.observed, "HikariCase.observation.observed");
  validateStringArray(value.observation.interpretation, "HikariCase.observation.interpretation");
  validateStringArray(value.observation.decision, "HikariCase.observation.decision");
  validateStringArray(value.approximations, "HikariCase.approximations");
}

function validateStringArray(value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  for (const [index, item] of value.entries()) requireNonEmpty(item, `${path}[${index}]`);
}

function requireNonEmpty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${path} must be a non-empty string`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
