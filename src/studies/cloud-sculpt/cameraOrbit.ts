export type CameraOrbitDirection = "clockwise" | "counterclockwise";

export interface CameraOrbitSettings {
  running: boolean;
  durationSeconds: number;
  direction: CameraOrbitDirection;
}

export const DEFAULT_CAMERA_ORBIT: CameraOrbitSettings = {
  running: false,
  durationSeconds: 60,
  direction: "clockwise",
};

export function advanceCameraOrbit(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  deltaSeconds: number,
  settings: Pick<CameraOrbitSettings, "durationSeconds" | "direction">,
): [number, number, number] {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError("deltaSeconds must be a finite non-negative number");
  }
  if (!Number.isFinite(settings.durationSeconds) || settings.durationSeconds <= 0) {
    throw new RangeError("durationSeconds must be a finite positive number");
  }

  const direction = settings.direction === "counterclockwise" ? -1 : 1;
  const angle = direction * Math.PI * 2 * deltaSeconds / settings.durationSeconds;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const offsetX = position[0] - target[0];
  const offsetY = position[1] - target[1];
  const offsetZ = position[2] - target[2];

  return [
    target[0] + offsetX * cosine + offsetZ * sine,
    target[1] + offsetY,
    target[2] - offsetX * sine + offsetZ * cosine,
  ];
}

