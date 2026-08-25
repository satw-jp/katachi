export type SupportSiteClassification = "inside" | "outside" | "unresolved";
export type SupportSiteDepthMode = "front-only" | "show-back";
export type SupportSiteGlyph = "circle" | "triangle" | "cross";

export interface SupportOverlayMarkerInput {
  id?: string;
  position: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  classification: SupportSiteClassification;
  markerRadius: number;
}

export interface SupportOverlayBatch {
  positions: Float32Array;
  normals: Float32Array;
  ids: Array<string | null>;
  classifications: SupportSiteClassification[];
  colors: Float32Array;
  glyphIndices: Float32Array;
  classificationCounts: Record<SupportSiteClassification, number>;
}

export interface SupportOverlayPass {
  kind: "back" | "front";
  depthTest: boolean;
  depthWrite: boolean;
  screenDoorCoverage: number;
}

export const SUPPORT_SITE_PRESENTATION = {
  inside: { colorHex: 0x3185ff, glyph: "circle" },
  outside: { colorHex: 0xff922e, glyph: "triangle" },
  unresolved: { colorHex: 0xff3b30, glyph: "cross" },
} as const satisfies Record<SupportSiteClassification, { colorHex: number; glyph: SupportSiteGlyph }>;

/** 3/16 pixels: perceptually 18.75% translucent without RGB blending. */
export const SUPPORT_BACK_SCREEN_DOOR_COVERAGE = 3 / 16;

export function supportGlyphIndex(glyph: SupportSiteGlyph): number {
  if (glyph === "circle") return 0;
  if (glyph === "triangle") return 1;
  return 2;
}

/**
 * Each glyph owns a disjoint three-rank slice of the 4x4 Bayer matrix.
 * Therefore overlapping blue/orange/red back markers never overwrite the
 * same pixels and cannot change hue when transparent-object order changes.
 */
export function supportBackDitherRanks(glyph: SupportSiteGlyph): readonly number[] {
  const start = supportGlyphIndex(glyph) * 3;
  return [start, start + 1, start + 2];
}

/**
 * One camera-independent geometry for every support site. Classification is
 * carried per vertex rather than split into transparent Three.js objects.
 */
export function buildSupportOverlayBatch(
  markers: readonly SupportOverlayMarkerInput[],
): SupportOverlayBatch | null {
  if (markers.length === 0) return null;
  const positions = new Float32Array(markers.length * 3);
  const normals = new Float32Array(markers.length * 3);
  const colors = new Float32Array(markers.length * 3);
  const glyphIndices = new Float32Array(markers.length);
  const ids: Array<string | null> = new Array(markers.length);
  const classifications: SupportSiteClassification[] = new Array(markers.length);
  const classificationCounts: Record<SupportSiteClassification, number> = {
    inside: 0,
    outside: 0,
    unresolved: 0,
  };
  markers.forEach((marker, index) => {
    const presentation = SUPPORT_SITE_PRESENTATION[marker.classification];
    positions[index * 3] = marker.position.x;
    positions[index * 3 + 1] = marker.position.y;
    positions[index * 3 + 2] = marker.position.z;
    normals[index * 3] = marker.normal?.x ?? 0;
    normals[index * 3 + 1] = marker.normal?.y ?? 0;
    normals[index * 3 + 2] = marker.normal?.z ?? 0;
    colors[index * 3] = ((presentation.colorHex >> 16) & 0xff) / 255;
    colors[index * 3 + 1] = ((presentation.colorHex >> 8) & 0xff) / 255;
    colors[index * 3 + 2] = (presentation.colorHex & 0xff) / 255;
    glyphIndices[index] = supportGlyphIndex(presentation.glyph);
    ids[index] = marker.id ?? null;
    classifications[index] = marker.classification;
    classificationCounts[marker.classification]++;
  });
  return { positions, normals, ids, classifications, colors, glyphIndices, classificationCounts };
}

/** Picking can include a back site only when that same back pass is visible. */
export function supportOverlayPickingIncludesBack(
  mode: SupportSiteDepthMode,
  explicitlyAllowBack: boolean,
): boolean {
  return mode === "show-back" && explicitlyAllowBack;
}

export function supportOverlayPasses(mode: SupportSiteDepthMode): SupportOverlayPass[] {
  const front: SupportOverlayPass = {
    kind: "front",
    depthTest: true,
    depthWrite: true,
    screenDoorCoverage: 1,
  };
  return mode === "front-only"
    ? [front]
    : [
        {
          kind: "back",
          depthTest: false,
          depthWrite: false,
          screenDoorCoverage: SUPPORT_BACK_SCREEN_DOOR_COVERAGE,
        },
        front,
      ];
}
