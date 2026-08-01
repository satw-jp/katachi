import {
  validateHikariCase,
  type HikariCase,
} from "./hikariCase.ts";

export interface HikariDocumentView {
  viewId: string;
  name: string;
  createdAt: string;
  case: HikariCase;
}

/**
 * Editable Hikari document. `.hkr` is UTF-8 JSON for now so it stays
 * inspectable and migratable; rendered PNGs remain derived exports.
 */
export interface HikariDocument {
  format: "hikari-document";
  formatVersion: 1;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  commit: string;
  activeViewId: string | null;
  views: HikariDocumentView[];
}

export function createHikariDocument(input: {
  documentId: string;
  appVersion: string;
  commit: string;
  activeViewId: string | null;
  views: HikariDocumentView[];
  createdAt?: string;
  updatedAt?: string;
}): HikariDocument {
  const now = new Date().toISOString();
  const value: HikariDocument = {
    format: "hikari-document",
    formatVersion: 1,
    documentId: input.documentId,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    appVersion: input.appVersion,
    commit: input.commit,
    activeViewId: input.activeViewId,
    views: input.views.map((view) => ({ ...view, case: structuredClone(view.case) })),
  };
  validateHikariDocument(value);
  return value;
}

export function serializeHikariDocument(value: HikariDocument): string {
  validateHikariDocument(value);
  return JSON.stringify(value, null, 2);
}

/**
 * Give every downloaded revision a collision-resistant timestamp while keeping
 * a human document id. ISO/UTC matches the existing Progressive PNG names.
 */
export function hikariDocumentFilename(documentId: string, updatedAt: string): string {
  const safeDocumentId = documentId.replace(/[^a-zA-Z0-9_-]+/g, "-") || "hikari";
  const parsed = new Date(updatedAt);
  const isoTimestamp = Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
  const isoDate = isoTimestamp.slice(0, 10);
  const timestamp = isoTimestamp.replace(/[:.]/g, "-");
  const stem = safeDocumentId.endsWith(isoDate)
    ? safeDocumentId.slice(0, -isoDate.length)
    : `${safeDocumentId}-`;
  return `${stem}${timestamp}.hkr`;
}

export function parseHikariDocument(text: string): HikariDocument {
  const value: unknown = JSON.parse(text);
  validateHikariDocument(value);
  return value;
}

export function validateHikariDocument(value: unknown): asserts value is HikariDocument {
  if (!isObject(value) || value.format !== "hikari-document" || value.formatVersion !== 1) {
    throw new Error("対応していない .hkr 形式です");
  }
  for (const key of ["documentId", "createdAt", "updatedAt", "appVersion", "commit"] as const) {
    if (typeof value[key] !== "string") throw new Error(`.hkr の ${key} が不正です`);
  }
  if (!Array.isArray(value.views)) throw new Error(".hkr のビュー一覧が不正です");
  const ids = new Set<string>();
  for (const view of value.views) {
    if (
      !isObject(view)
      || typeof view.viewId !== "string"
      || view.viewId.length === 0
      || typeof view.name !== "string"
      || typeof view.createdAt !== "string"
    ) {
      throw new Error(".hkr のビューが不正です");
    }
    if (ids.has(view.viewId)) throw new Error(`.hkr のビューIDが重複しています: ${view.viewId}`);
    ids.add(view.viewId);
    validateHikariCase(view.case);
  }
  if (value.activeViewId !== null && (typeof value.activeViewId !== "string" || !ids.has(value.activeViewId))) {
    throw new Error(".hkr の選択ビューが不正です");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
