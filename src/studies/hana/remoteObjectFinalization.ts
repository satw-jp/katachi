import type { HanaAuthoringDocument, HanaStroke } from "./authoringDocument.ts";
import {
  createHanaFinalizationSnapshot,
  type HanaFinalizationSnapshotV0,
} from "./finalizationCore.ts";
import type { HanaStroke3D } from "./stroke3d.ts";
import type {
  HanaRemoteObjectJob,
  HanaRemoteObjectPriority,
} from "./remoteObjectCoordinator.ts";

function cloneStroke3D(stroke: HanaStroke): HanaStroke3D {
  return {
    id: stroke.id,
    sourceGestureId: stroke.rawGestureId,
    sourceViewportId: "authoring-document",
    sourceViewDirection: "front",
    initialPlaneValue: stroke.controlPoints[0]?.position.y ?? 0,
    curve: { ...stroke.curveSettings },
    controlPoints: stroke.controlPoints.map((control) => ({
      ...control,
      position: { ...control.position },
      provenance: { ...control.provenance },
    })),
  };
}

export interface HanaRemoteObjectJobOptions {
  generationBase?: number;
  priorityFor?: (stroke: HanaStroke, document: HanaAuthoringDocument) => HanaRemoteObjectPriority;
}

function defaultPriority(stroke: HanaStroke, document: HanaAuthoringDocument): HanaRemoteObjectPriority {
  if (stroke.id === document.activeStrokeId) return "active";
  return stroke.visible ? "visible" : "background";
}

/** Build one stateless Finalization Snapshot per authoring object. */
export function createHanaRemoteObjectJobs(
  document: HanaAuthoringDocument,
  options: HanaRemoteObjectJobOptions = {},
): HanaRemoteObjectJob[] {
  const generationBase = Math.max(1, Math.trunc(options.generationBase ?? document.revision));
  return document.strokes.map((stroke, index) => {
    const generationId = generationBase + Math.max(0, stroke.revision) + index;
    const snapshot: HanaFinalizationSnapshotV0 = createHanaFinalizationSnapshot({
      requestId: `${document.documentId}:${stroke.id}:g${generationId}`,
      documentId: document.documentId,
      documentRevision: document.revision,
      objectRevision: stroke.revision,
      generationId,
      stroke: cloneStroke3D(stroke),
      materialSettings: stroke.materialSettings,
    });
    return {
      objectId: stroke.id,
      snapshot,
      priority: options.priorityFor?.(stroke, document) ?? defaultPriority(stroke, document),
    };
  });
}
