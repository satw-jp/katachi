import type { WorldDirection } from "./solarPosition.ts";

/**
 * Renderer-independent daylight-room geometry.
 *
 * Coordinates match Hikari solar geometry: +X east, +Y up, and -Z north.
 * The room is axis-aligned, centred at X=Z=0, with its floor at Y=0.
 * `horizontalCenter` increases toward +X on north/south walls and toward +Z
 * on east/west walls. This world-axis convention deliberately does not flip
 * when a wall is viewed from inside the room.
 */

export interface DaylightVec3 { x: number; y: number; z: number; }

export type RoomWall = "N" | "E" | "S" | "W";

export interface RectangularWindow {
  id: string;
  wall: RoomWall;
  horizontalCenter: number;
  sillHeight: number;
  width: number;
  height: number;
}

export interface DaylightRoom {
  width: number;
  depth: number;
  ceilingHeight: number;
  objectPosition: DaylightVec3;
  windows: readonly RectangularWindow[];
}

export interface WindowApertureBasis {
  center: DaylightVec3;
  /** Unit vector along `horizontalCenter` and window width. */
  horizontal: DaylightVec3;
  /** Always world up. */
  vertical: DaylightVec3;
  /** Unit normal pointing from the wall into the room. */
  inwardNormal: DaylightVec3;
  halfWidth: number;
  halfHeight: number;
}

export interface ClippedEntryRay {
  entry: DaylightVec3;
  exit: DaylightVec3;
  direction: DaylightVec3;
  length: number;
}

export interface AdmittedWindow {
  windowId: string;
  wall: RoomWall;
  aperture: WindowApertureBasis;
  /** Centre ray clipped to the closed room volume. */
  centerRay: ClippedEntryRay;
  /** Where the backwards ray from the object meets this wall. */
  objectRayEntry: DaylightVec3 | null;
  /** True when that entry point lies inside this exact rectangular aperture. */
  directlyLightsObject: boolean;
  incidenceCosine: number;
}

export interface DaylightAdmission {
  /** Normalized copy of the supplied sun-to-room propagation direction. */
  propagationDirection: DaylightVec3;
  admittedWindows: readonly AdmittedWindow[];
  directlyLitByWindowIds: readonly string[];
}

const EPSILON = 1e-9;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function inside(value: number, lower: number, upper: number): boolean {
  return value >= lower - EPSILON && value <= upper + EPSILON;
}

export function validateDaylightRoom(room: DaylightRoom): string[] {
  const issues: string[] = [];
  for (const key of ["width", "depth", "ceilingHeight"] as const) {
    if (!finite(room[key]) || room[key] <= 0) issues.push(`room.${key} must be finite and positive.`);
  }
  const p = room.objectPosition;
  if (!p || !finite(p.x) || !finite(p.y) || !finite(p.z)) {
    issues.push("room.objectPosition must contain finite x, y, and z values.");
  } else if (finite(room.width) && finite(room.depth) && finite(room.ceilingHeight)
    && (!inside(p.x, -room.width / 2, room.width / 2)
      || !inside(p.y, 0, room.ceilingHeight)
      || !inside(p.z, -room.depth / 2, room.depth / 2))) {
    issues.push("room.objectPosition must be contained in the closed room volume.");
  }

  if (!Array.isArray(room.windows)) {
    issues.push("room.windows must be an array.");
    return issues;
  }
  const ids = new Set<string>();
  for (const [index, window] of room.windows.entries()) {
    const prefix = `room.windows[${index}]`;
    if (!window || typeof window !== "object") {
      issues.push(`${prefix} must be an object.`);
      continue;
    }
    if (typeof window.id !== "string" || !window.id.trim()) issues.push(`${prefix}.id must be non-empty.`);
    else if (ids.has(window.id)) issues.push(`${prefix}.id must be unique.`);
    else ids.add(window.id);
    if (!(window.wall === "N" || window.wall === "E" || window.wall === "S" || window.wall === "W")) {
      issues.push(`${prefix}.wall must be N, E, S, or W.`);
    }
    if (!finite(window.horizontalCenter)) issues.push(`${prefix}.horizontalCenter must be finite.`);
    if (!finite(window.sillHeight) || window.sillHeight < 0) issues.push(`${prefix}.sillHeight must be finite and non-negative.`);
    if (!finite(window.width) || window.width <= 0) issues.push(`${prefix}.width must be finite and positive.`);
    if (!finite(window.height) || window.height <= 0) issues.push(`${prefix}.height must be finite and positive.`);

    const wallSpan = window.wall === "N" || window.wall === "S" ? room.width : room.depth;
    if (finite(wallSpan) && wallSpan > 0 && finite(window.horizontalCenter) && finite(window.width)
      && window.width > 0 && Math.abs(window.horizontalCenter) + window.width / 2 > wallSpan / 2 + EPSILON) {
      issues.push(`${prefix} must fit horizontally inside its wall.`);
    }
    if (finite(room.ceilingHeight) && room.ceilingHeight > 0 && finite(window.sillHeight)
      && finite(window.height) && window.sillHeight >= 0 && window.height > 0
      && window.sillHeight + window.height > room.ceilingHeight + EPSILON) {
      issues.push(`${prefix} must fit between the floor and ceiling.`);
    }
  }
  return issues;
}

function apertureFor(room: DaylightRoom, window: RectangularWindow): WindowApertureBasis {
  const y = window.sillHeight + window.height / 2;
  switch (window.wall) {
    case "N": return { center: { x: window.horizontalCenter, y, z: -room.depth / 2 }, horizontal: { x: 1, y: 0, z: 0 }, vertical: { x: 0, y: 1, z: 0 }, inwardNormal: { x: 0, y: 0, z: 1 }, halfWidth: window.width / 2, halfHeight: window.height / 2 };
    case "S": return { center: { x: window.horizontalCenter, y, z: room.depth / 2 }, horizontal: { x: 1, y: 0, z: 0 }, vertical: { x: 0, y: 1, z: 0 }, inwardNormal: { x: 0, y: 0, z: -1 }, halfWidth: window.width / 2, halfHeight: window.height / 2 };
    case "E": return { center: { x: room.width / 2, y, z: window.horizontalCenter }, horizontal: { x: 0, y: 0, z: 1 }, vertical: { x: 0, y: 1, z: 0 }, inwardNormal: { x: -1, y: 0, z: 0 }, halfWidth: window.width / 2, halfHeight: window.height / 2 };
    case "W": return { center: { x: -room.width / 2, y, z: window.horizontalCenter }, horizontal: { x: 0, y: 0, z: 1 }, vertical: { x: 0, y: 1, z: 0 }, inwardNormal: { x: 1, y: 0, z: 0 }, halfWidth: window.width / 2, halfHeight: window.height / 2 };
  }
}

function dot(a: DaylightVec3, b: DaylightVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function addScaled(a: DaylightVec3, b: DaylightVec3, scale: number): DaylightVec3 {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale };
}

function centreRayExit(room: DaylightRoom, entry: DaylightVec3, direction: DaylightVec3): ClippedEntryRay {
  let distance = Number.POSITIVE_INFINITY;
  const bounds: readonly [keyof DaylightVec3, number, number][] = [
    ["x", -room.width / 2, room.width / 2],
    ["y", 0, room.ceilingHeight],
    ["z", -room.depth / 2, room.depth / 2],
  ];
  for (const [axis, lower, upper] of bounds) {
    const component = direction[axis];
    if (component > EPSILON) distance = Math.min(distance, (upper - entry[axis]) / component);
    else if (component < -EPSILON) distance = Math.min(distance, (lower - entry[axis]) / component);
  }
  // An admitted ray always has a positive inward horizontal component.
  const safeDistance = Number.isFinite(distance) && distance >= 0 ? distance : 0;
  return { entry, exit: addScaled(entry, direction, safeDistance), direction, length: safeDistance };
}

function objectEntryOnWall(
  object: DaylightVec3,
  direction: DaylightVec3,
  aperture: WindowApertureBasis,
): DaylightVec3 | null {
  const denominator = dot(direction, aperture.inwardNormal);
  if (denominator <= EPSILON) return null;
  const backwardsDistance = dot({
    x: object.x - aperture.center.x,
    y: object.y - aperture.center.y,
    z: object.z - aperture.center.z,
  }, aperture.inwardNormal) / denominator;
  if (backwardsDistance < -EPSILON) return null;
  return addScaled(object, direction, -backwardsDistance);
}

/**
 * Determines the sun-facing apertures and returns geometry a renderer can use
 * to construct parallel beams. Below-horizon policy remains the caller's job;
 * a downward propagation vector (normally solar altitude > 0) is expected.
 */
export function computeDaylightAdmission(
  room: DaylightRoom,
  propagationDirection: WorldDirection,
): DaylightAdmission {
  const issues = validateDaylightRoom(room);
  if (issues.length > 0) throw new RangeError(issues.join(" "));
  if (!finite(propagationDirection.x) || !finite(propagationDirection.y) || !finite(propagationDirection.z)) {
    throw new TypeError("propagationDirection must contain finite x, y, and z values.");
  }
  const magnitude = Math.hypot(propagationDirection.x, propagationDirection.y, propagationDirection.z);
  if (magnitude <= EPSILON) throw new RangeError("propagationDirection must be non-zero.");
  const direction = {
    x: propagationDirection.x / magnitude,
    y: propagationDirection.y / magnitude,
    z: propagationDirection.z / magnitude,
  };

  const admittedWindows: AdmittedWindow[] = [];
  for (const window of room.windows) {
    const aperture = apertureFor(room, window);
    const incidenceCosine = dot(direction, aperture.inwardNormal);
    if (incidenceCosine <= EPSILON) continue;
    const objectRayEntry = objectEntryOnWall(room.objectPosition, direction, aperture);
    const offset = objectRayEntry ? {
      x: objectRayEntry.x - aperture.center.x,
      y: objectRayEntry.y - aperture.center.y,
      z: objectRayEntry.z - aperture.center.z,
    } : null;
    const directlyLightsObject = offset !== null
      && Math.abs(dot(offset, aperture.horizontal)) <= aperture.halfWidth + EPSILON
      && Math.abs(dot(offset, aperture.vertical)) <= aperture.halfHeight + EPSILON;
    admittedWindows.push({
      windowId: window.id,
      wall: window.wall,
      aperture,
      centerRay: centreRayExit(room, aperture.center, direction),
      objectRayEntry,
      directlyLightsObject,
      incidenceCosine,
    });
  }
  return {
    propagationDirection: direction,
    admittedWindows,
    directlyLitByWindowIds: admittedWindows.filter((item) => item.directlyLightsObject).map((item) => item.windowId),
  };
}
