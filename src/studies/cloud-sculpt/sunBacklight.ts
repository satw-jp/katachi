export interface Point3 {
  x: number;
  y: number;
  z: number;
}

function normalized(value: Point3): Point3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!(length > 1e-9) || !Number.isFinite(length)) {
    throw new RangeError("Sun alignment needs a finite non-zero direction");
  }
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

/** Angular separation between the camera centre ray and the sun centre. */
export function cameraSunAngleDeg(
  camera: Point3,
  target: Point3,
  directionToSun: Point3,
): number {
  const centreRay = normalized({
    x: target.x - camera.x,
    y: target.y - camera.y,
    z: target.z - camera.z,
  });
  const sun = normalized(directionToSun);
  const cosine = Math.max(-1, Math.min(1,
    centreRay.x * sun.x + centreRay.y * sun.y + centreRay.z * sun.z,
  ));
  return Math.acos(cosine) * 180 / Math.PI;
}

/** Preserve target and camera distance while placing the sun behind the target. */
export function cameraPositionForSunBacklight(
  camera: Point3,
  target: Point3,
  directionToSun: Point3,
): Point3 {
  const distance = Math.hypot(
    camera.x - target.x,
    camera.y - target.y,
    camera.z - target.z,
  );
  if (!(distance > 1e-9) || !Number.isFinite(distance)) {
    throw new RangeError("Sun alignment needs a finite camera distance");
  }
  const sun = normalized(directionToSun);
  return {
    x: target.x - sun.x * distance,
    y: target.y - sun.y * distance,
    z: target.z - sun.z * distance,
  };
}
