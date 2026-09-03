import type { HanaVector3 } from "./stroke3d.ts";

export const HANA_SURFACE_DRAW_FORMAT = "katachi.hana-surface-draw.v0" as const;

export interface HanaSurfaceBarycentric {
  a: number;
  b: number;
  c: number;
}

export interface HanaSurfaceTangentFrame {
  normal: HanaVector3;
  tangent: HanaVector3;
  bitangent: HanaVector3;
}

export interface HanaSurfaceDrawProvenance {
  sourceGestureId: string;
  sourcePointStart: number;
  sourcePointEnd: number;
  sourceT: number;
  order: number;
}

export interface HanaSurfaceDrawAnchor {
  id: string;
  surfaceId: string;
  hitPosition: HanaVector3;
  localTangentFrame: HanaSurfaceTangentFrame;
  sourceTriangle: number;
  barycentric: HanaSurfaceBarycentric;
  provenance: HanaSurfaceDrawProvenance;
}

export interface HanaSurfaceDrawStroke {
  format: typeof HANA_SURFACE_DRAW_FORMAT;
  id: string;
  sourceGestureId: string;
  anchors: HanaSurfaceDrawAnchor[];
  revision: number;
}

export interface HanaSurfaceDrawValidationResult {
  valid: boolean;
  issues: string[];
}

function cloneVector(value: HanaVector3): HanaVector3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneAnchor(anchor: HanaSurfaceDrawAnchor): HanaSurfaceDrawAnchor {
  return {
    ...anchor,
    hitPosition: cloneVector(anchor.hitPosition),
    localTangentFrame: {
      normal: cloneVector(anchor.localTangentFrame.normal),
      tangent: cloneVector(anchor.localTangentFrame.tangent),
      bitangent: cloneVector(anchor.localTangentFrame.bitangent),
    },
    barycentric: { ...anchor.barycentric },
    provenance: { ...anchor.provenance },
  };
}

function cloneStroke(stroke: HanaSurfaceDrawStroke): HanaSurfaceDrawStroke {
  return { ...stroke, anchors: stroke.anchors.map(cloneAnchor) };
}

export function createSurfaceDrawStroke(
  id: string,
  sourceGestureId: string,
): HanaSurfaceDrawStroke {
  return { format: HANA_SURFACE_DRAW_FORMAT, id, sourceGestureId, anchors: [], revision: 0 };
}

export function appendSurfaceDrawAnchor(
  stroke: HanaSurfaceDrawStroke,
  anchor: HanaSurfaceDrawAnchor,
): HanaSurfaceDrawStroke {
  const next = cloneStroke(stroke);
  next.anchors.push(cloneAnchor(anchor));
  next.revision += 1;
  return next;
}

export function validateSurfaceDrawStroke(
  stroke: HanaSurfaceDrawStroke,
): HanaSurfaceDrawValidationResult {
  const issues: string[] = [];
  if (stroke.format !== HANA_SURFACE_DRAW_FORMAT) issues.push("invalid format");
  if (!stroke.id || !stroke.sourceGestureId) issues.push("missing stroke identity");
  const anchorIds = new Set<string>();
  for (const anchor of stroke.anchors) {
    if (anchorIds.has(anchor.id)) issues.push(`duplicate anchor id: ${anchor.id}`);
    anchorIds.add(anchor.id);
    if (!anchor.surfaceId) issues.push(`missing surface id: ${anchor.id}`);
    if (!Number.isInteger(anchor.sourceTriangle) || anchor.sourceTriangle < 0) issues.push(`invalid source triangle: ${anchor.id}`);
    const barycentricTotal = anchor.barycentric.a + anchor.barycentric.b + anchor.barycentric.c;
    if (![anchor.barycentric.a, anchor.barycentric.b, anchor.barycentric.c].every(Number.isFinite) || Math.abs(barycentricTotal - 1) > 1e-6) {
      issues.push(`invalid barycentric position: ${anchor.id}`);
    }
    const vectors = [anchor.hitPosition, anchor.localTangentFrame.normal, anchor.localTangentFrame.tangent, anchor.localTangentFrame.bitangent];
    if (vectors.some((vector) => ![vector.x, vector.y, vector.z].every(Number.isFinite))) issues.push(`non-finite surface frame: ${anchor.id}`);
    if (!Number.isFinite(anchor.provenance.sourceT) || !Number.isInteger(anchor.provenance.order)) issues.push(`invalid provenance: ${anchor.id}`);
  }
  return { valid: issues.length === 0, issues };
}

export function serializeSurfaceDrawStroke(stroke: HanaSurfaceDrawStroke): string {
  return JSON.stringify(cloneStroke(stroke), null, 2);
}

export function parseSurfaceDrawStroke(serialized: string): HanaSurfaceDrawStroke {
  const stroke = JSON.parse(serialized) as HanaSurfaceDrawStroke;
  const validation = validateSurfaceDrawStroke(stroke);
  if (!validation.valid) throw new Error(`Invalid Surface Draw stroke: ${validation.issues.join("; ")}`);
  return cloneStroke(stroke);
}
