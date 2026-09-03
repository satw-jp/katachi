import type { HanaViewDirection } from "./gesture.ts";
import type { HanaVector3 } from "./stroke3d.ts";

export const HANA_SILHOUETTE_SECTION_FORMAT = "katachi.hana-silhouette-section.v0" as const;
export type HanaProjectedViewDirection = Exclude<HanaViewDirection, "axome">;

export interface HanaPlane {
  origin: HanaVector3;
  normal: HanaVector3;
}

export interface HanaContourPoint {
  x: number;
  y: number;
}

export interface HanaContourProvenance {
  sourceSurfaceId: string | null;
  sourceGestureId: string | null;
  sourcePointStart: number;
  sourcePointEnd: number;
  sourceT: number;
  order: number;
}

export interface HanaSilhouetteRecord {
  id: string;
  surfaceId: string | null;
  silhouettePlane: HanaPlane;
  viewDirection: HanaProjectedViewDirection;
  contour: HanaContourPoint[];
  provenance: HanaContourProvenance[];
  revision: number;
}

export interface HanaSectionRecord {
  id: string;
  surfaceId: string | null;
  sectionPlane: HanaPlane;
  sectionCurve: HanaContourPoint[];
  provenance: HanaContourProvenance[];
  revision: number;
}

export interface HanaSilhouetteSectionDocument {
  format: typeof HANA_SILHOUETTE_SECTION_FORMAT;
  silhouettes: HanaSilhouetteRecord[];
  sections: HanaSectionRecord[];
}

export interface HanaSilhouetteSectionValidationResult {
  valid: boolean;
  issues: string[];
}

function cloneVector(value: HanaVector3): HanaVector3 {
  return { x: value.x, y: value.y, z: value.z };
}

function clonePlane(value: HanaPlane): HanaPlane {
  return { origin: cloneVector(value.origin), normal: cloneVector(value.normal) };
}

function cloneProvenance(value: HanaContourProvenance): HanaContourProvenance {
  return { ...value };
}

function cloneContour(value: readonly HanaContourPoint[]): HanaContourPoint[] {
  return value.map((point) => ({ ...point }));
}

function cloneSilhouette(value: HanaSilhouetteRecord): HanaSilhouetteRecord {
  return {
    ...value,
    silhouettePlane: clonePlane(value.silhouettePlane),
    contour: cloneContour(value.contour),
    provenance: value.provenance.map(cloneProvenance),
  };
}

function cloneSection(value: HanaSectionRecord): HanaSectionRecord {
  return {
    ...value,
    sectionPlane: clonePlane(value.sectionPlane),
    sectionCurve: cloneContour(value.sectionCurve),
    provenance: value.provenance.map(cloneProvenance),
  };
}

function cloneDocument(value: HanaSilhouetteSectionDocument): HanaSilhouetteSectionDocument {
  return {
    format: value.format,
    silhouettes: value.silhouettes.map(cloneSilhouette),
    sections: value.sections.map(cloneSection),
  };
}

export function createSilhouetteSectionDocument(): HanaSilhouetteSectionDocument {
  return { format: HANA_SILHOUETTE_SECTION_FORMAT, silhouettes: [], sections: [] };
}

export function addSilhouetteRecord(
  document: HanaSilhouetteSectionDocument,
  record: HanaSilhouetteRecord,
): HanaSilhouetteSectionDocument {
  const next = cloneDocument(document);
  if (next.silhouettes.some((candidate) => candidate.id === record.id)) throw new Error(`Duplicate silhouette: ${record.id}`);
  next.silhouettes.push(cloneSilhouette(record));
  return next;
}

export function addSectionRecord(
  document: HanaSilhouetteSectionDocument,
  record: HanaSectionRecord,
): HanaSilhouetteSectionDocument {
  const next = cloneDocument(document);
  if (next.sections.some((candidate) => candidate.id === record.id)) throw new Error(`Duplicate section: ${record.id}`);
  next.sections.push(cloneSection(record));
  return next;
}

function validatePlane(plane: HanaPlane, label: string, issues: string[]): void {
  const values = [plane.origin.x, plane.origin.y, plane.origin.z, plane.normal.x, plane.normal.y, plane.normal.z];
  if (!values.every(Number.isFinite)) issues.push(`non-finite ${label}`);
}

function validateContour(
  contour: readonly HanaContourPoint[],
  provenance: readonly HanaContourProvenance[],
  label: string,
  issues: string[],
): void {
  if (contour.length < 2) issues.push(`${label} requires at least two points`);
  if (contour.length !== provenance.length) issues.push(`${label} provenance length mismatch`);
  contour.forEach((point, index) => {
    if (![point.x, point.y].every(Number.isFinite)) issues.push(`non-finite ${label} point ${index}`);
  });
  provenance.forEach((source, index) => {
    if (![source.sourcePointStart, source.sourcePointEnd, source.sourceT, source.order].every(Number.isFinite)) {
      issues.push(`non-finite ${label} provenance ${index}`);
    }
  });
}

export function validateSilhouetteSectionDocument(
  document: HanaSilhouetteSectionDocument,
): HanaSilhouetteSectionValidationResult {
  const issues: string[] = [];
  if (document.format !== HANA_SILHOUETTE_SECTION_FORMAT) issues.push("invalid silhouette/section format");
  const ids = new Set<string>();
  for (const silhouette of document.silhouettes) {
    if (ids.has(silhouette.id)) issues.push(`duplicate record: ${silhouette.id}`);
    ids.add(silhouette.id);
    validatePlane(silhouette.silhouettePlane, "silhouette plane", issues);
    validateContour(silhouette.contour, silhouette.provenance, "silhouette contour", issues);
  }
  for (const section of document.sections) {
    if (ids.has(section.id)) issues.push(`duplicate record: ${section.id}`);
    ids.add(section.id);
    validatePlane(section.sectionPlane, "section plane", issues);
    validateContour(section.sectionCurve, section.provenance, "section curve", issues);
  }
  return { valid: issues.length === 0, issues };
}

export function serializeSilhouetteSectionDocument(
  document: HanaSilhouetteSectionDocument,
): string {
  return JSON.stringify(cloneDocument(document), null, 2);
}

export function parseSilhouetteSectionDocument(
  serialized: string,
): HanaSilhouetteSectionDocument {
  const document = JSON.parse(serialized) as HanaSilhouetteSectionDocument;
  const validation = validateSilhouetteSectionDocument(document);
  if (!validation.valid) throw new Error(`Invalid silhouette/section document: ${validation.issues.join("; ")}`);
  return cloneDocument(document);
}
