import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import type { Patch } from "./field.ts";
import { projectToSurface } from "./field.ts";
import { createEmptyState, record, replay, type SkinHistoryEntry } from "./history.ts";
import { derivePatchSurfaceFrame, editEligibility, nudgeFromPointerDrag, transformPatch } from "./elementTransform.ts";
import { pickPatchBySpheres } from "./picking.ts";

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const hostK = 0;
const radiusFields = ["r", "baseR", "fusionBaseR", "fusionR", "meshJoinR", "contactR"] as const;

function ringPatch(id = 7): Patch {
  return {
    id,
    shape: "ring3d",
    quadCellId: 4,
    surfaceCellId: 9,
    surfaceCellKind: "quad",
    points: [
      { x: 0, y: 0, z: 1.25, r: 0.1, baseR: 0.09, fusionBaseR: 0.08, fusionR: 0.07, meshJoinR: 0.06, contactR: 0.05, role: "motif" },
      { x: 0.35, y: 0, z: 1.18, r: 0.12, baseR: 0.11, fusionBaseR: 0.1, fusionR: 0.09, meshJoinR: 0.08, contactR: 0.07, role: "motif" },
      { x: -0.08, y: 0.28, z: 1.21, r: 0.08, baseR: 0.07, fusionBaseR: 0.06, fusionR: 0.05, meshJoinR: 0.04, contactR: 0.03, role: "motif" },
    ],
  };
}

function lift(point: Patch["points"][number]): number {
  const carrier = projectToSurface(host, hostK, point.x, point.y, point.z);
  assert.ok(carrier, "fixture must project");
  return (point.x - carrier.x) * carrier.nx + (point.y - carrier.y) * carrier.ny + (point.z - carrier.z) * carrier.nz;
}

function carrierCentroid(patch: Patch): { x: number; y: number; z: number } {
  const carriers = patch.points.map((point) => {
    const carrier = projectToSurface(host, hostK, point.x, point.y, point.z);
    assert.ok(carrier, "fixture must project");
    return carrier;
  });
  return carriers.reduce(
    (sum, carrier) => ({ x: sum.x + carrier.x / carriers.length, y: sum.y + carrier.y / carriers.length, z: sum.z + carrier.z / carriers.length }),
    { x: 0, y: 0, z: 0 },
  );
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function runElementTransformTests(test: (name: string, fn: () => void) => void): void {
  test("element transform: scale clones input, preserves off-surface lift policy, and scales every realized radius", () => {
    const before = ringPatch();
    const snapshot = structuredClone(before);
    const result = transformPatch(before, host, hostK, { kind: "scale", factor: 1.5 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(before, snapshot, "input patch is never mutated");
    assert.equal(result.patch.id, before.id);
    assert.equal(result.patch.shape, before.shape);
    assert.deepEqual(result.patch.points.map((point) => point.role), before.points.map((point) => point.role));
    for (const [index, point] of result.patch.points.entries()) {
      assert.ok(Math.abs(lift(point) - lift(before.points[index]) * 1.5) < 0.012, "signed normal lift scales instead of being flattened");
      for (const field of radiusFields) assert.equal(point[field], before.points[index][field]! * 1.5, `${field} scales`);
    }
  });

  test("element transform: rotate and tangent nudge retain all radii and finite lifted ring points", () => {
    const before = ringPatch();
    for (const intent of [{ kind: "rotate", degrees: 35 } as const, { kind: "nudge", u: 0.1, v: -0.05 } as const]) {
      const result = transformPatch(before, host, hostK, intent);
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      for (const [index, point] of result.patch.points.entries()) {
        assert.ok([point.x, point.y, point.z].every(Number.isFinite));
        assert.ok(Math.abs(lift(point) - lift(before.points[index])) < 0.012, "rotate/nudge preserve signed normal lift");
        for (const field of radiusFields) assert.equal(point[field], before.points[index][field], `${intent.kind} keeps ${field}`);
      }
    }
  });

  test("element transform: one selected motif moves between surface, centered, and inside placements with replayable metadata", () => {
    const before = ringPatch();
    const beforeFrame = derivePatchSurfaceFrame(before, host, hostK);
    assert.ok(beforeFrame);
    const extents = (patch: Patch, frame = beforeFrame) => {
      let min = Infinity;
      let max = -Infinity;
      let centerSum = 0;
      for (const point of patch.points) {
        const signed =
          (point.x - frame.anchor.x) * frame.normal[0] +
          (point.y - frame.anchor.y) * frame.normal[1] +
          (point.z - frame.anchor.z) * frame.normal[2];
        min = Math.min(min, signed - point.r);
        max = Math.max(max, signed + point.r);
        centerSum += signed;
      }
      return { min, max, mean: centerSum / patch.points.length };
    };
    const centered = transformPatch(before, host, hostK, { kind: "placement", placement: "center" });
    assert.equal(centered.ok, true);
    if (!centered.ok) return;
    assert.ok(Math.abs(extents(centered.patch).min + extents(centered.patch).max) < 1e-9);
    assert.equal(centered.patch.motifPlacement, "center");
    const inside = transformPatch(before, host, hostK, { kind: "placement", placement: "inside" });
    assert.equal(inside.ok, true);
    if (!inside.ok) return;
    assert.ok(Math.abs(extents(inside.patch).max) < 1e-9);
    assert.equal(inside.patch.motifPlacement, "inside");
    const insideFrame = derivePatchSurfaceFrame(inside.patch, host, hostK);
    assert.ok(insideFrame);
    const surface = transformPatch(inside.patch, host, hostK, { kind: "placement", placement: "surface" });
    assert.equal(surface.ok, true);
    if (!surface.ok) return;
    assert.ok(Math.abs(extents(surface.patch, insideFrame).mean) < 1e-9);
    assert.equal(surface.patch.motifPlacement, "surface");

    const state = createEmptyState();
    const history: SkinHistoryEntry[] = [];
    record(history, state, "packPatches", { patches: [before], identity: "replace" });
    record(history, state, "editPatch", { patch: inside.patch, intent: { kind: "placement", placement: "inside" } });
    assert.equal(replay(history).patches[0].motifPlacement, "inside");
  });

  test("element transform: pointer drag maps to the same tangent nudge used by replayable edits", () => {
    const before = ringPatch();
    const frame = derivePatchSurfaceFrame(before, host, hostK);
    assert.ok(frame);
    const startOrigin = {
      x: frame.anchor.x + frame.normal[0] * 4,
      y: frame.anchor.y + frame.normal[1] * 4,
      z: frame.anchor.z + frame.normal[2] * 4,
    };
    const startRay = { origin: startOrigin, dir: { x: -frame.normal[0], y: -frame.normal[1], z: -frame.normal[2] } };
    const endRay = {
      origin: {
        x: startOrigin.x + frame.u[0] * 0.12 - frame.v[0] * 0.04,
        y: startOrigin.y + frame.u[1] * 0.12 - frame.v[1] * 0.04,
        z: startOrigin.z + frame.u[2] * 0.12 - frame.v[2] * 0.04,
      },
      dir: startRay.dir,
    };
    const intent = nudgeFromPointerDrag(startRay, endRay, frame);
    assert.ok(intent);
    assert.ok(Math.abs(intent.u - 0.12) < 1e-9);
    assert.ok(Math.abs(intent.v + 0.04) < 1e-9);
    const moved = transformPatch(before, host, hostK, intent);
    assert.equal(moved.ok, true);
  });

  test("element picking: dense direct manipulation chooses the nearest realized sphere", () => {
    const near = ringPatch(10);
    const far = { ...ringPatch(11), points: ringPatch(11).points.map((point) => ({ ...point, z: point.z - 1 })) };
    const picked = pickPatchBySpheres(
      [far, near],
      { x: 0, y: 0, z: 5 },
      { x: 0, y: 0, z: -1 },
    );
    assert.equal(picked, near.id);
  });

  test("element transform: asymmetric ring scale/rotate use the carrier centroid, never point 0, as their pivot", () => {
    const before = ringPatch();
    const beforeCentroid = carrierCentroid(before);
    const beforePointZero = projectToSurface(host, hostK, before.points[0].x, before.points[0].y, before.points[0].z)!;
    for (const intent of [{ kind: "scale", factor: 1.4 } as const, { kind: "rotate", degrees: 42 } as const]) {
      const result = transformPatch(before, host, hostK, intent);
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.ok(distance(carrierCentroid(result.patch), beforeCentroid) < 0.018, "carrier centroid stays at the local anchor within surface curvature tolerance");
      const afterPointZero = projectToSurface(host, hostK, result.patch.points[0].x, result.patch.points[0].y, result.patch.points[0].z)!;
      assert.ok(distance(afterPointZero, beforePointZero) > 0.01, "asymmetric point 0 moves, proving it was not used as the pivot");
    }
  });

  test("element transform: bridge ownership and duplicated surface connectors block local edits", () => {
    const flower: Patch = { ...ringPatch(2), shape: "flower" };
    const bridgeOwner: Patch = { id: 3, shape: "flower", points: [{ x: 0, y: 0, z: 1, r: 0.1, role: "bridge" }] };
    assert.equal(editEligibility([flower, bridgeOwner], flower.id).ok, false, "a bridge anywhere blocks every flower");
    const connector: Patch = { ...ringPatch(4), points: [{ x: 0, y: 0, z: 1, r: 0.1, role: "surfaceConnector" }, { x: 0.1, y: 0, z: 1, r: 0.1, role: "surfaceConnector" }] };
    assert.equal(editEligibility([connector], connector.id).ok, false, "all connector instances block their owner");
  });

  test("editPatch replay: malformed, unknown, or structurally mismatched entries no-op; accepted edit preserves revision/annotation and clears partitions", () => {
    const state = createEmptyState();
    const history: SkinHistoryEntry[] = [];
    const patch = ringPatch();
    record(history, state, "packPatches", { patches: [patch], identity: "replace" });
    const revision = state.patchSetRevision;
    record(history, state, "setAnnotation", { reference: { domain: "surface", setRevision: revision, patchId: patch.id }, value: { keep: true, weakContact: false, largeOpening: false, note: "残す" } });
    state.partition = { groupA: [patch.id], groupB: [], seedIds: [patch.id], adjacencyThreshold: 0.1, confirmedAt: "now" };
    state.nPartition = { groups: [[patch.id]], seedIds: [patch.id], adjacencyThreshold: 0.1, confirmedAt: "now" };
    const changed = transformPatch(patch, host, hostK, { kind: "scale", factor: 1.1 });
    assert.equal(changed.ok, true);
    if (!changed.ok) return;
    record(history, state, "editPatch", { patch: changed.patch, intent: { kind: "scale", factor: 1.1 } });
    assert.equal(state.patchSetRevision, revision);
    assert.equal(state.annotations.length, 1);
    assert.equal(state.partition, null);
    assert.equal(state.nPartition, null);
    const accepted = structuredClone(state.patches);
    const malformed = structuredClone(changed.patch); malformed.points[0].r = Number.NaN;
    record(history, state, "editPatch", { patch: malformed, intent: { kind: "scale", factor: 1.1 } });
    record(history, state, "editPatch", { patch: { ...changed.patch, id: 999 }, intent: { kind: "scale", factor: 1.1 } });
    const provenanceMismatch = { ...structuredClone(changed.patch), quadCellId: 123 };
    record(history, state, "editPatch", { patch: provenanceMismatch, intent: { kind: "scale", factor: 1.1 } });
    const radiusPresenceMismatch = structuredClone(changed.patch); delete radiusPresenceMismatch.points[0].contactR;
    record(history, state, "editPatch", { patch: radiusPresenceMismatch, intent: { kind: "scale", factor: 1.1 } });
    const roleMismatch = structuredClone(changed.patch); roleMismatch.points[0].role = undefined;
    record(history, state, "editPatch", { patch: roleMismatch, intent: { kind: "scale", factor: 1.1 } });
    record(history, state, "editPatch", { patch: changed.patch, intent: { kind: "scale", factor: -1 } as never });
    assert.deepEqual(state.patches, accepted);
    assert.deepEqual(replay(history).patches, accepted, "replay uses the recorded result and keeps rejected entries inert");
  });
}
