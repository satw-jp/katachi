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

const HISTORY_OPS = new Set([
  "grow",
  "setParam",
  "addBall",
  "removeBall",
  "moveBall",
  "setBallRadius",
  "clear",
]);

export function validateHikariCase(value: unknown): asserts value is HikariCase {
  if (!isObject(value) || value.formatVersion !== 1) throw new Error("対応していない Hikari case 形式です");
  for (const key of ["caseId", "createdAt", "appVersion", "commit", "observation"] as const) {
    if (typeof value[key] !== "string") throw new Error(`Hikari case の ${key} が不正です`);
  }
  if (!isObject(value.shape) || value.shape.studyId !== "cloud-sculpt" || !Array.isArray(value.shape.recipeEntries)) {
    throw new Error("Hikari case の形状レシピが不正です");
  }
  for (const entry of value.shape.recipeEntries) {
    if (
      !isObject(entry)
      || typeof entry.t !== "number"
      || !Number.isFinite(entry.t)
      || typeof entry.op !== "string"
      || !HISTORY_OPS.has(entry.op)
      || !isObject(entry.args)
    ) {
      throw new Error("Hikari case の操作履歴が不正です");
    }
  }
  if (!isObject(value.hikariSettings)) throw new Error("Hikari case の設定が不正です");
  if (!isObject(value.camera) || !finiteTuple(value.camera.position, 3) || !finiteTuple(value.camera.target, 3) || typeof value.camera.fov !== "number" || !Number.isFinite(value.camera.fov) || value.camera.fov <= 0 || value.camera.fov >= 180) {
    throw new Error("Hikari case のカメラが不正です");
  }
  if (
    !isObject(value.compatibility)
    || !["auto", "forced", "disabled"].includes(String(value.compatibility.safeModeQuery))
    || typeof value.compatibility.compatibilityMode !== "boolean"
  ) {
    throw new Error("Hikari case の互換性情報が不正です");
  }
  if (!isObject(value.backend) || typeof value.backend.kind !== "string" || typeof value.backend.text !== "string" || typeof value.backend.requestedSampleCount !== "number") {
    throw new Error("Hikari case の計算情報が不正です");
  }
}
