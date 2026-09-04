import assert from "node:assert/strict";
import test from "node:test";

import {
  addHanaStroke,
  createDefaultHanaEditorState,
  createHanaAuthoringDocument,
  stroke3DFromHanaStroke,
  updateHanaStroke,
  type HanaAuthoringDocument,
} from "./authoringDocument.ts";
import { createAuthoringGraph } from "./authoringGraph.ts";
import { HanaAuthoringHistory, type HanaAuthoringHistorySnapshot } from "./authoringHistory.ts";
import type { HanaViewportStroke } from "./gesture.ts";
import {
  buildPointField,
  buildPointFieldMesh,
  sampleMaterialSamples,
  type HanaPreviewSurface,
} from "./materialField.ts";
import { sampleSmoothCenterline } from "./smoothCenterline.ts";
import type { HanaStroke3D } from "./stroke3d.ts";
import {
  resolveHanaRestoredSelection,
  resolveHanaSurfaceTarget,
} from "./surfaceTarget.ts";

const THICKNESS = 0.18;
const MESH_RESOLUTION = 24;

function raw(id: string): HanaViewportStroke {
  return {
    id,
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: [
      { x: 0, y: 0, pressure: 0.3, time: 0 },
      { x: 10, y: 2, pressure: 0.5, time: 12 },
      { x: 20, y: 6, pressure: 0.6, time: 24 },
    ],
  };
}

function stroke(id: string, rawId: string): HanaStroke3D {
  return {
    id,
    sourceGestureId: rawId,
    sourceViewportId: "viewport-front",
    sourceViewDirection: "front",
    initialPlaneValue: 0,
    curve: { type: "catmull-rom", parameterization: "centripetal", alpha: 0.5, samplesPerSegment: 8, smoothness: 0 },
    controlPoints: [0, 1, 2, 3, 4, 5].map((index) => ({
      id: `${id}-control-${index}`,
      position: { x: index * 0.5, y: 0, z: Math.sin(index * 0.6) * 0.5 },
      provenance: { sourceStroke: rawId, sourceT: index / 5, sourcePointStart: index, sourcePointEnd: index, pressure: 0.5, time: index },
    })),
  };
}

function emptyDocument(documentId: string): HanaAuthoringDocument {
  return createHanaAuthoringDocument([], [], { documentId, editorState: createDefaultHanaEditorState() });
}

function snapshotFor(document: HanaAuthoringDocument): HanaAuthoringHistorySnapshot {
  return structuredClone({
    document,
    flowers: [],
    graph: createAuthoringGraph(),
    activeFlowerId: null,
  });
}

interface RestoredSurface {
  targetId: string | null;
  triangles: number;
  controlX: number;
  revision: number;
  rawPoints: number;
}

/** Mirror the live pipeline: resolve target → derive → field → mesh. */
function restoreSurface(document: HanaAuthoringDocument, liveSelected: string[], liveActive: string | null): RestoredSurface {
  const restoredIds = document.strokes.map((item) => item.id);
  const selection = resolveHanaRestoredSelection({
    liveSelectedStrokeIds: liveSelected,
    liveActiveStrokeId: liveActive,
    restoredStrokeIds: restoredIds,
  });
  const activeId = selection.activeStrokeId;
  const active = document.strokes.find((item) => item.id === activeId) ?? null;
  const centerline = active ? sampleSmoothCenterline(stroke3DFromHanaStroke(active)) : [];
  const samples = active ? sampleMaterialSamples(centerline, THICKNESS) : [];
  const targetId = resolveHanaSurfaceTarget({
    showSurface: true,
    strokeIds: restoredIds,
    activeStrokeId: activeId,
    materialSampleCount: samples.length,
  });
  let surface: HanaPreviewSurface | null = null;
  if (targetId !== null && active?.id === targetId && samples.length > 0) {
    const field = buildPointField(samples, THICKNESS);
    surface = buildPointFieldMesh(field, MESH_RESOLUTION);
  }
  return {
    targetId,
    triangles: surface?.triangles.length ?? 0,
    controlX: active?.controlPoints[2]?.position.x ?? Number.NaN,
    revision: active?.revision ?? -1,
    rawPoints: document.rawGestures.strokes[0]?.points.length ?? 0,
  };
}

test("Edit Undo Redo restores a buildable Surface target across repeated cycles", () => {
  let document = emptyDocument("hana-restore-cycle");
  document = addHanaStroke(document, raw("gesture-1"), stroke("stroke-1", "gesture-1"));
  const history = new HanaAuthoringHistory(snapshotFor(emptyDocument("hana-restore-cycle")));
  history.commit(snapshotFor(document), "Draw Stroke");

  const edited = updateHanaStroke(document, "stroke-1", (item) => ({
    ...item,
    controlPoints: item.controlPoints.map((point, index) => (
      index === 2 ? { ...point, position: { ...point.position, x: point.position.x + 2 } } : point
    )),
  }));
  history.commit(snapshotFor(edited), "Edit Stroke");

  const drawnX = document.strokes[0].controlPoints[2].position.x;
  const editedX = edited.strokes[0].controlPoints[2].position.x;
  assert.notEqual(drawnX, editedX);

  let liveSelected = ["stroke-1"];
  let liveActive: string | null = "stroke-1";
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const undone = history.undo();
    assert.ok(undone);
    const restoredA = restoreSurface(undone.document, liveSelected, liveActive);
    assert.equal(restoredA.targetId, "stroke-1");
    assert.ok(restoredA.triangles > 0, `Undo cycle ${cycle} must rebuild a Surface`);
    assert.equal(restoredA.controlX, drawnX);
    assert.equal(restoredA.revision, 0);
    assert.equal(restoredA.rawPoints, 3);
    liveSelected = ["stroke-1"];
    liveActive = "stroke-1";

    const redone = history.redo();
    assert.ok(redone);
    const restoredB = restoreSurface(redone.document, liveSelected, liveActive);
    assert.equal(restoredB.targetId, "stroke-1");
    assert.ok(restoredB.triangles > 0, `Redo cycle ${cycle} must rebuild a Surface`);
    assert.equal(restoredB.controlX, editedX);
    assert.equal(restoredB.revision, 1);
    assert.equal(restoredB.rawPoints, 3);
  }
});
