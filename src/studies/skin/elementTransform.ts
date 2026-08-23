import type { Ball } from "../cloud-sculpt/field.ts";
import { projectToSurface, type MotifPlacement, type Patch, type PatchPoint, type Projected } from "./field.ts";

export type PatchEditIntent =
  | { kind: "scale"; factor: number }
  | { kind: "rotate"; degrees: number }
  | { kind: "nudge"; u: number; v: number }
  | { kind: "placement"; placement: MotifPlacement };

export type PatchTransformResult = { ok: true; patch: Patch } | { ok: false; reason: string };

export interface PatchSurfaceFrame {
  anchor: { x: number; y: number; z: number };
  normal: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
}

export interface PointerRay {
  origin: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
}

const RADIUS_FIELDS = ["r", "baseR", "fusionBaseR", "fusionR", "meshJoinR", "contactR"] as const;
type RadiusField = (typeof RADIUS_FIELDS)[number];

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPoint(point: PatchPoint): boolean {
  if (!finite(point.x) || !finite(point.y) || !finite(point.z)) return false;
  return RADIUS_FIELDS.every((field) => {
    const value = point[field];
    return value === undefined || (finite(value) && value >= 0);
  });
}

function validPatch(patch: Patch): boolean {
  return Number.isFinite(patch.id) && patch.points.length > 0 && patch.points.every(validPoint);
}

/** A fixed choice of "up" removes arbitrary tangent-frame rotation. */
function tangentBasis(normal: Projected): { u: [number, number, number]; v: [number, number, number] } | null {
  const length = Math.hypot(normal.nx, normal.ny, normal.nz);
  if (!finite(length) || length === 0) return null;
  const nx = normal.nx / length;
  const ny = normal.ny / length;
  const nz = normal.nz / length;
  const up: [number, number, number] = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const ux = ny * up[2] - nz * up[1];
  const uy = nz * up[0] - nx * up[2];
  const uz = nx * up[1] - ny * up[0];
  const uLength = Math.hypot(ux, uy, uz);
  if (!finite(uLength) || uLength === 0) return null;
  const u: [number, number, number] = [ux / uLength, uy / uLength, uz / uLength];
  return {
    u,
    v: [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]],
  };
}

function dot(x: number, y: number, z: number, basis: [number, number, number]): number {
  return x * basis[0] + y * basis[1] + z * basis[2];
}

function nonConnection(point: PatchPoint): boolean {
  return point.role !== "bridge" && point.role !== "surfaceConnector";
}

/** The same stable surface frame used by transformPatch, exposed so direct
 * manipulation can translate a screen-space drag into an exact saved nudge. */
export function derivePatchSurfaceFrame(
  patch: Patch,
  host: readonly Ball[],
  hostK: number,
): PatchSurfaceFrame | null {
  if (!finite(hostK) || !validPatch(patch) || host.some((ball) => !finite(ball.x) || !finite(ball.y) || !finite(ball.z) || !finite(ball.r))) return null;
  const carriers = patch.points
    .filter(nonConnection)
    .map((point) => projectToSurface(host as Ball[], hostK, point.x, point.y, point.z));
  if (carriers.length === 0 || carriers.some((carrier) => carrier === null)) return null;
  const projected = carriers as Projected[];
  const average = projected.reduce(
    (sum, carrier) => ({ x: sum.x + carrier.x, y: sum.y + carrier.y, z: sum.z + carrier.z }),
    { x: 0, y: 0, z: 0 },
  );
  const anchor = projectToSurface(
    host as Ball[], hostK,
    average.x / projected.length,
    average.y / projected.length,
    average.z / projected.length,
  );
  if (!anchor) return null;
  const basis = tangentBasis(anchor);
  if (!basis) return null;
  const normalLength = Math.hypot(anchor.nx, anchor.ny, anchor.nz);
  if (!finite(normalLength) || normalLength === 0) return null;
  return {
    anchor: { x: anchor.x, y: anchor.y, z: anchor.z },
    normal: [anchor.nx / normalLength, anchor.ny / normalLength, anchor.nz / normalLength],
    u: basis.u,
    v: basis.v,
  };
}

function rayPlanePoint(ray: PointerRay, frame: PatchSurfaceFrame): [number, number, number] | null {
  const denominator = ray.dir.x * frame.normal[0] + ray.dir.y * frame.normal[1] + ray.dir.z * frame.normal[2];
  if (!finite(denominator) || Math.abs(denominator) < 1e-6) return null;
  const t = (
    (frame.anchor.x - ray.origin.x) * frame.normal[0] +
    (frame.anchor.y - ray.origin.y) * frame.normal[1] +
    (frame.anchor.z - ray.origin.z) * frame.normal[2]
  ) / denominator;
  if (!finite(t) || t <= 0) return null;
  return [ray.origin.x + ray.dir.x * t, ray.origin.y + ray.dir.y * t, ray.origin.z + ray.dir.z * t];
}

/** Convert a pointer drag on the patch tangent plane into transformPatch's
 * local u/v units. Nothing is mutated while the pointer is moving. */
export function nudgeFromPointerDrag(
  startRay: PointerRay,
  endRay: PointerRay,
  frame: PatchSurfaceFrame,
): Extract<PatchEditIntent, { kind: "nudge" }> | null {
  const start = rayPlanePoint(startRay, frame);
  const end = rayPlanePoint(endRay, frame);
  if (!start || !end) return null;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const u = dot(dx, dy, dz, frame.u);
  const v = dot(dx, dy, dz, frame.v);
  if (![u, v].every(finite)) return null;
  return { kind: "nudge", u, v };
}

export function editEligibility(patches: readonly Patch[], targetId: number): { ok: true } | { ok: false; reason: string } {
  const target = patches.find((patch) => patch.id === targetId);
  if (!target) return { ok: false, reason: "選択した要素が見つかりません" };
  if (target.points.some((point) => point.role === "surfaceConnector")) {
    return { ok: false, reason: "表面との接続を含む要素は編集できません" };
  }
  if (target.shape === "flower" && patches.some((patch) => patch.points.some((point) => point.role === "bridge"))) {
    return { ok: false, reason: "花どうしの接続があるため、花は編集できません" };
  }
  return { ok: true };
}

export function isPatchEditIntent(value: unknown): value is PatchEditIntent {
  if (!value || typeof value !== "object") return false;
  const intent = value as Partial<PatchEditIntent>;
  if (intent.kind === "scale") return finite(intent.factor) && intent.factor > 0;
  if (intent.kind === "rotate") return finite(intent.degrees);
  if (intent.kind === "nudge") return finite(intent.u) && finite(intent.v);
  return intent.kind === "placement" && ["surface", "center", "inside"].includes(intent.placement ?? "");
}

/**
 * Move realized geometry relative to the host without regenerating it.  The
 * original patch is not touched; any projection failure rejects the whole
 * edit so a partly transformed authoring result can never be recorded.
 */
export function transformPatch(
  patch: Patch,
  host: readonly Ball[],
  hostK: number,
  intent: PatchEditIntent,
): PatchTransformResult {
  if (!isPatchEditIntent(intent) || !finite(hostK) || !validPatch(patch) || host.some((ball) => !finite(ball.x) || !finite(ball.y) || !finite(ball.z) || !finite(ball.r))) {
    return { ok: false, reason: "編集できない値が含まれています" };
  }
  // A ring or flower has no privileged first bead. Derive one stable local
  // frame from the mean of every editable point's host carrier instead.
  const carriers = patch.points.map((point) => {
    if (!nonConnection(point)) return null;
    return projectToSurface(host as Ball[], hostK, point.x, point.y, point.z);
  });
  if (carriers.every((carrier) => carrier === null)) return { ok: false, reason: "編集できる表面点がありません" };
  if (carriers.some((carrier, index) => nonConnection(patch.points[index]) && carrier === null)) {
    return { ok: false, reason: "表面位置を決められないため編集しませんでした" };
  }
  const editableCarriers = carriers.filter((carrier): carrier is Projected => carrier !== null);
  const average = editableCarriers.reduce(
    (sum, carrier) => ({ x: sum.x + carrier.x, y: sum.y + carrier.y, z: sum.z + carrier.z }),
    { x: 0, y: 0, z: 0 },
  );
  const anchor = projectToSurface(
    host as Ball[], hostK,
    average.x / editableCarriers.length,
    average.y / editableCarriers.length,
    average.z / editableCarriers.length,
  );
  if (!anchor) return { ok: false, reason: "表面位置を決められないため編集しませんでした" };
  if (intent.kind === "placement") {
    const normalLength = Math.hypot(anchor.nx, anchor.ny, anchor.nz);
    if (!finite(normalLength) || normalLength === 0) return { ok: false, reason: "表裏の向きを決められません" };
    const normal: [number, number, number] = [anchor.nx / normalLength, anchor.ny / normalLength, anchor.nz / normalLength];
    let minExtent = Infinity;
    let maxExtent = -Infinity;
    let meanCenter = 0;
    let count = 0;
    for (const point of patch.points) {
      if (!nonConnection(point)) continue;
      const signed = dot(point.x - anchor.x, point.y - anchor.y, point.z - anchor.z, normal);
      minExtent = Math.min(minExtent, signed - point.r);
      maxExtent = Math.max(maxExtent, signed + point.r);
      meanCenter += signed;
      count++;
    }
    if (count === 0) return { ok: false, reason: "配置を変えられる点がありません" };
    const shift = intent.placement === "surface"
      ? -(meanCenter / count)
      : intent.placement === "center"
        ? -(minExtent + maxExtent) * 0.5
        : -maxExtent;
    const points = patch.points.map((point) => nonConnection(point) ? {
      ...point,
      x: point.x + normal[0] * shift,
      y: point.y + normal[1] * shift,
      z: point.z + normal[2] * shift,
    } : { ...point });
    if (!points.every(validPoint)) return { ok: false, reason: "配置後の値を保存できません" };
    return { ok: true, patch: { ...patch, motifPlacement: intent.placement, points } };
  }
  const oldBasis = tangentBasis(anchor);
  if (!oldBasis) return { ok: false, reason: "表面の向きを決められないため編集しませんでした" };

  let newAnchor = anchor;
  if (intent.kind === "nudge") {
    const nudgedAnchor = projectToSurface(
      host as Ball[], hostK,
      anchor.x + oldBasis.u[0] * intent.u + oldBasis.v[0] * intent.v,
      anchor.y + oldBasis.u[1] * intent.u + oldBasis.v[1] * intent.v,
      anchor.z + oldBasis.u[2] * intent.u + oldBasis.v[2] * intent.v,
    );
    if (!nudgedAnchor) return { ok: false, reason: "移動先の表面を決められないため編集しませんでした" };
    newAnchor = nudgedAnchor;
  }
  const newBasis = tangentBasis(newAnchor);
  if (!newBasis) return { ok: false, reason: "移動先の表面の向きを決められないため編集しませんでした" };
  const radians = intent.kind === "rotate" ? (intent.degrees * Math.PI) / 180 : 0;
  const scale = intent.kind === "scale" ? intent.factor : 1;
  const centroid = editableCarriers.reduce(
    (sum, carrier) => ({
      u: sum.u + dot(carrier.x - anchor.x, carrier.y - anchor.y, carrier.z - anchor.z, oldBasis.u),
      v: sum.v + dot(carrier.x - anchor.x, carrier.y - anchor.y, carrier.z - anchor.z, oldBasis.v),
    }),
    { u: 0, v: 0 },
  );
  centroid.u /= editableCarriers.length;
  centroid.v /= editableCarriers.length;

  const points: PatchPoint[] = [];
  for (const [index, point] of patch.points.entries()) {
    if (!nonConnection(point)) {
      points.push({ ...point });
      continue;
    }
    const carrier = carriers[index];
    if (!carrier) return { ok: false, reason: "表面位置を決められないため編集しませんでした" };
    const dx = carrier.x - anchor.x;
    const dy = carrier.y - anchor.y;
    const dz = carrier.z - anchor.z;
    let u = dot(dx, dy, dz, oldBasis.u);
    let v = dot(dx, dy, dz, oldBasis.v);
    if (intent.kind === "scale") {
      u = centroid.u + (u - centroid.u) * scale;
      v = centroid.v + (v - centroid.v) * scale;
    } else if (intent.kind === "rotate") {
      const relativeU = u - centroid.u;
      const relativeV = v - centroid.v;
      u = centroid.u + relativeU * Math.cos(radians) - relativeV * Math.sin(radians);
      v = centroid.v + relativeU * Math.sin(radians) + relativeV * Math.cos(radians);
    }
    const carrierNext = projectToSurface(
      host as Ball[], hostK,
      newAnchor.x + newBasis.u[0] * u + newBasis.v[0] * v,
      newAnchor.y + newBasis.u[1] * u + newBasis.v[1] * v,
      newAnchor.z + newBasis.u[2] * u + newBasis.v[2] * v,
    );
    if (!carrierNext) return { ok: false, reason: "表面位置を決められないため編集しませんでした" };
    const lift = dot(point.x - carrier.x, point.y - carrier.y, point.z - carrier.z, [carrier.nx, carrier.ny, carrier.nz]);
    const restoredLift = lift * scale;
    const next: PatchPoint = {
      ...point,
      x: carrierNext.x + carrierNext.nx * restoredLift,
      y: carrierNext.y + carrierNext.ny * restoredLift,
      z: carrierNext.z + carrierNext.nz * restoredLift,
    };
    if (intent.kind === "scale") {
      for (const field of RADIUS_FIELDS) {
        if (next[field] !== undefined) next[field] = next[field]! * scale;
      }
    }
    if (!validPoint(next)) return { ok: false, reason: "編集後の値を保存できません" };
    points.push(next);
  }
  return { ok: true, patch: { ...patch, points } };
}

export function samePatchStructure(current: Patch, replacement: Patch): boolean {
  if (current.id !== replacement.id || current.shape !== replacement.shape || current.quadCellId !== replacement.quadCellId || current.surfaceCellId !== replacement.surfaceCellId || current.surfaceCellKind !== replacement.surfaceCellKind || current.points.length !== replacement.points.length) return false;
  return current.points.every((point, index) => {
    const candidate = replacement.points[index];
    return point.role === candidate.role && RADIUS_FIELDS.every((field: RadiusField) => (point[field] === undefined) === (candidate[field] === undefined));
  });
}

export function isValidReplacementPatch(patch: Patch): boolean {
  return validPatch(patch) && [patch.quadCellId, patch.surfaceCellId].every((value) => value === undefined || finite(value));
}
