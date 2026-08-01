import type { HistoryEntry } from "./history.ts";
import type { HikariSettings } from "./hikari.ts";
import type { CameraSnapshot } from "./renderer.ts";

/** A portable observation baseline. It deliberately stores the recipe, not derived meshes or pixels. */
export interface HikariCase {
  formatVersion: 1;
  caseId: string;
  createdAt: string;
  appVersion: string;
  commit: string;
  observation: string;
  shape: { studyId: "cloud-sculpt"; recipeEntries: HistoryEntry[] };
  hikariSettings: HikariSettings;
  camera: CameraSnapshot;
  compatibility: {
    safeModeQuery: "auto" | "forced" | "disabled";
    compatibilityMode: boolean;
  };
  backend: { kind: string; text: string; requestedSampleCount: number };
}

export type HikariCaseInput = Omit<HikariCase, "formatVersion" | "createdAt"> & {
  createdAt?: string;
};

export function createHikariCase(input: HikariCaseInput): HikariCase {
  return { ...input, formatVersion: 1, createdAt: input.createdAt ?? new Date().toISOString() };
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteTuple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function validateHikariCase(value: unknown): asserts value is HikariCase {
  if (!isObject(value) || value.formatVersion !== 1) throw new Error("対応していない Hikari case 形式です");
  for (const key of ["caseId", "createdAt", "appVersion", "commit", "observation"] as const) {
    if (typeof value[key] !== "string") throw new Error(`Hikari case の ${key} が不正です`);
  }
  if (!isObject(value.shape) || value.shape.studyId !== "cloud-sculpt" || !Array.isArray(value.shape.recipeEntries)) {
    throw new Error("Hikari case の形状レシピが不正です");
  }
  for (const entry of value.shape.recipeEntries) {
    validateHistoryEntry(entry);
  }
  if (!isObject(value.hikariSettings)) throw new Error("Hikari case の設定が不正です");
  if (!isObject(value.camera) || !finiteTuple(value.camera.position, 3) || !finiteTuple(value.camera.target, 3) || typeof value.camera.fov !== "number" || !Number.isFinite(value.camera.fov) || value.camera.fov <= 0 || value.camera.fov >= 180 || (value.camera.aspect !== undefined && (typeof value.camera.aspect !== "number" || !Number.isFinite(value.camera.aspect) || value.camera.aspect <= 0))) {
    throw new Error("Hikari case のカメラが不正です");
  }
  if (
    !isObject(value.compatibility)
    || !["auto", "forced", "disabled"].includes(String(value.compatibility.safeModeQuery))
    || typeof value.compatibility.compatibilityMode !== "boolean"
  ) {
    throw new Error("Hikari case の互換性情報が不正です");
  }
  if (
    !isObject(value.backend)
    || typeof value.backend.kind !== "string"
    || typeof value.backend.text !== "string"
    || !finiteNumber(value.backend.requestedSampleCount, 1, 1_000_000)
  ) {
    throw new Error("Hikari case の計算情報が不正です");
  }
}

function validateHistoryEntry(value: unknown): void {
  if (!isObject(value) || !finiteNumber(value.t, 0) || typeof value.op !== "string" || !isObject(value.args)) {
    throw new Error("Hikari case の操作履歴が不正です");
  }
  const args = value.args;
  switch (value.op) {
    case "grow":
      if (!isObject(args.params)) invalidHistory();
      validateFieldParams(args.params);
      return;
    case "setParam": {
      if (typeof args.key !== "string" || !FIELD_PARAM_KEYS.has(args.key)) invalidHistory();
      const key = args.key as "k" | "count" | "radiusBase" | "radiusSpread" | "seed";
      if (key === "seed") {
        if (typeof args.value !== "string") invalidHistory();
      } else if (!finiteNumber(args.value, FIELD_LIMITS[key][0], FIELD_LIMITS[key][1])) {
        invalidHistory();
      }
      return;
    }
    case "addBall":
      validateBallId(args.id);
      validateCoordinate(args.x);
      validateCoordinate(args.y);
      validateCoordinate(args.z);
      if (!finiteNumber(args.r, 0.000001, 1_000_000)) invalidHistory();
      return;
    case "removeBall":
      validateBallId(args.id);
      return;
    case "moveBall":
      validateBallId(args.id);
      validateCoordinate(args.x);
      validateCoordinate(args.y);
      validateCoordinate(args.z);
      return;
    case "setBallRadius":
      validateBallId(args.id);
      if (!finiteNumber(args.r, 0.000001, 1_000_000)) invalidHistory();
      return;
    case "clear":
      if (Object.keys(args).length !== 0) invalidHistory();
      return;
    default:
      invalidHistory();
  }
}

const FIELD_PARAM_KEYS = new Set(["k", "count", "radiusBase", "radiusSpread", "seed"]);
const FIELD_LIMITS: Record<"k" | "count" | "radiusBase" | "radiusSpread", [number, number]> = {
  k: [0, 10],
  count: [0, 256],
  radiusBase: [0.000001, 1_000_000],
  radiusSpread: [0, 10],
};

function validateFieldParams(value: Record<string, unknown>): void {
  if (
    !finiteNumber(value.k, ...FIELD_LIMITS.k)
    || !finiteNumber(value.count, ...FIELD_LIMITS.count)
    || !finiteNumber(value.radiusBase, ...FIELD_LIMITS.radiusBase)
    || !finiteNumber(value.radiusSpread, ...FIELD_LIMITS.radiusSpread)
    || typeof value.seed !== "string"
  ) {
    invalidHistory();
  }
}

function validateBallId(value: unknown): void {
  if (!Number.isInteger(value) || !finiteNumber(value, 1, Number.MAX_SAFE_INTEGER)) invalidHistory();
}

function validateCoordinate(value: unknown): void {
  if (!finiteNumber(value, -1_000_000, 1_000_000)) invalidHistory();
}

function finiteNumber(value: unknown, min: number, max = Number.POSITIVE_INFINITY): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function invalidHistory(): never {
  throw new Error("Hikari case の操作履歴が不正です");
}
