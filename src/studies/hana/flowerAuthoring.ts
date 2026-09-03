import type { HanaStroke } from "./authoringDocument.ts";
import {
  createMaterialObject,
  type HanaMaterialObject,
  type HanaMaterialObjectKind,
} from "./materialObjects.ts";
import type { HanaMaterialSample } from "./materialField.ts";
import type { HanaVector3 } from "./stroke3d.ts";

export interface HanaLocalFrame {
  origin: HanaVector3;
  xAxis: HanaVector3;
  yAxis: HanaVector3;
  zAxis: HanaVector3;
}

export interface HanaQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface HanaAttachmentPoint {
  id: string;
  sourceStrokeId: string;
  normalizedT: number;
  position: HanaVector3;
}

export interface HanaFlowerProvenance {
  sourceStrokeIds: string[];
  sourceGestureIds: string[];
}

export interface HanaFlower {
  id: string;
  center: HanaVector3;
  localFrame: HanaLocalFrame;
  petalStrokeIds: string[];
  coreStrokeIds: string[];
  stemAttachment: HanaAttachmentPoint | null;
  orientation: HanaQuaternion;
  revision: number;
  provenance: HanaFlowerProvenance;
}

export interface HanaFlowerCreationResult {
  flower: HanaFlower;
  updatedStrokes: HanaStroke[];
}

function cloneVector(value: HanaVector3): HanaVector3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneFrame(frame: HanaLocalFrame): HanaLocalFrame {
  return {
    origin: cloneVector(frame.origin),
    xAxis: cloneVector(frame.xAxis),
    yAxis: cloneVector(frame.yAxis),
    zAxis: cloneVector(frame.zAxis),
  };
}

function cloneFlower(flower: HanaFlower): HanaFlower {
  return {
    ...flower,
    center: cloneVector(flower.center),
    localFrame: cloneFrame(flower.localFrame),
    petalStrokeIds: [...flower.petalStrokeIds],
    coreStrokeIds: [...flower.coreStrokeIds],
    stemAttachment: flower.stemAttachment
      ? { ...flower.stemAttachment, position: cloneVector(flower.stemAttachment.position) }
      : null,
    orientation: { ...flower.orientation },
    provenance: {
      sourceStrokeIds: [...flower.provenance.sourceStrokeIds],
      sourceGestureIds: [...flower.provenance.sourceGestureIds],
    },
  };
}

function defaultFrame(center: HanaVector3): HanaLocalFrame {
  return {
    origin: cloneVector(center),
    xAxis: { x: 1, y: 0, z: 0 },
    yAxis: { x: 0, y: 1, z: 0 },
    zAxis: { x: 0, y: 0, z: 1 },
  };
}

export const HANA_IDENTITY_QUATERNION: HanaQuaternion = { x: 0, y: 0, z: 0, w: 1 };

export function createHanaFlowerFromSelection(
  id: string,
  strokes: readonly HanaStroke[],
  selectedStrokeIds: readonly string[],
  options: {
    center?: HanaVector3;
    coreStrokeIds?: readonly string[];
    localFrame?: HanaLocalFrame;
  } = {},
): HanaFlowerCreationResult {
  const selected = [...new Set(selectedStrokeIds)];
  if (selected.length === 0) throw new Error("A Flower requires at least one selected Stroke");
  const byId = new Map(strokes.map((stroke) => [stroke.id, stroke]));
  if (selected.some((strokeId) => !byId.has(strokeId))) throw new Error("Flower selection contains an unknown Stroke");
  const coreStrokeIds = [...new Set(options.coreStrokeIds ?? [])];
  if (coreStrokeIds.some((strokeId) => !byId.has(strokeId))) throw new Error("Flower core contains an unknown Stroke");
  const petalStrokeIds = selected.filter((strokeId) => !coreStrokeIds.includes(strokeId));
  const center = cloneVector(options.center ?? { x: 0, y: 0, z: 0 });
  const sourceStrokes = [...petalStrokeIds, ...coreStrokeIds].map((strokeId) => byId.get(strokeId) as HanaStroke);
  const flower: HanaFlower = {
    id,
    center,
    localFrame: cloneFrame(options.localFrame ?? defaultFrame(center)),
    petalStrokeIds,
    coreStrokeIds,
    stemAttachment: null,
    orientation: { ...HANA_IDENTITY_QUATERNION },
    revision: 0,
    provenance: {
      sourceStrokeIds: sourceStrokes.map((stroke) => stroke.id),
      sourceGestureIds: sourceStrokes.map((stroke) => stroke.rawGestureId),
    },
  };
  const updatedStrokes = strokes.map((stroke) => {
    if (petalStrokeIds.includes(stroke.id)) return { ...stroke, role: "petal" as const };
    if (coreStrokeIds.includes(stroke.id)) return { ...stroke, role: "core" as const };
    return { ...stroke, controlPoints: stroke.controlPoints.map((point) => ({ ...point, position: { ...point.position }, provenance: { ...point.provenance } })) };
  });
  return { flower, updatedStrokes };
}

export function moveHanaFlower(flower: HanaFlower, center: HanaVector3): HanaFlower {
  const next = cloneFlower(flower);
  next.center = cloneVector(center);
  next.localFrame.origin = cloneVector(center);
  next.revision += 1;
  return next;
}

export function rotateHanaFlower(flower: HanaFlower, orientation: HanaQuaternion): HanaFlower {
  const next = cloneFlower(flower);
  next.orientation = { ...orientation };
  next.revision += 1;
  return next;
}

export function attachHanaFlowerToStem(
  flower: HanaFlower,
  attachment: HanaAttachmentPoint | null,
): HanaFlower {
  const next = cloneFlower(flower);
  next.stemAttachment = attachment
    ? { ...attachment, position: cloneVector(attachment.position) }
    : null;
  next.revision += 1;
  return next;
}

export function addFlowerCoreStroke(flower: HanaFlower, stroke: HanaStroke): HanaFlower {
  if (flower.coreStrokeIds.includes(stroke.id)) return cloneFlower(flower);
  const next = cloneFlower(flower);
  next.coreStrokeIds.push(stroke.id);
  next.provenance.sourceStrokeIds.push(stroke.id);
  next.provenance.sourceGestureIds.push(stroke.rawGestureId);
  next.revision += 1;
  return next;
}

export function materializeHanaFlower(
  flower: HanaFlower,
  sourceObjects: readonly HanaMaterialObject[],
  kind: HanaMaterialObjectKind = "flower",
): HanaMaterialObject {
  const sourceIds = [...flower.petalStrokeIds, ...flower.coreStrokeIds];
  const sources = sourceObjects.filter((object) => sourceIds.includes(object.id));
  const samples: HanaMaterialSample[] = sources.flatMap((object) => object.materialSamples);
  return createMaterialObject(flower.id, kind, sourceIds, samples, flower.revision);
}

export function cloneHanaFlower(flower: HanaFlower): HanaFlower {
  return cloneFlower(flower);
}
