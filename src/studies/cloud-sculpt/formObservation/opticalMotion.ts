export type OpticalFormMotionMode = "stream" | "pulse" | "orbit" | "flowTrails";

export interface OpticalFormMotionSettings {
  mode: OpticalFormMotionMode;
  trailLength: number;
  speed: number;
  pointMotion: number;
  opticalMapping: number;
  trailDensity: number;
}

export const DEFAULT_OPTICAL_FORM_MOTION: Readonly<OpticalFormMotionSettings> = Object.freeze({
  mode: "stream",
  trailLength: 0.075,
  speed: 0.75,
  pointMotion: 0.024,
  opticalMapping: 1,
  trailDensity: 1,
});

export interface OpticalFormMotionSignals {
  /** Normalized distance from the sampled shape centre. */
  shapeReach: number;
  /** Magnitude of receiver redistribution. */
  redistribution: number;
  /** Local delivered-light concentration above its neighbourhood. */
  caustic: number;
  /** Geometric receiver coverage. */
  shadow: number;
}

export interface OpticalFormMotionMapping {
  trailLength: number;
  speed: number;
  pointMotion: number;
  brightness: number;
}

export interface OpticalTrailLifecycle {
  life: number;
  detachment: number;
  opacity: number;
}

export function normalizeOpticalFormMotion(
  value: Partial<OpticalFormMotionSettings>,
): OpticalFormMotionSettings {
  return Object.freeze({
    mode: value.mode === "pulse" || value.mode === "orbit" || value.mode === "flowTrails"
      ? value.mode
      : "stream",
    trailLength: clamp(value.trailLength ?? DEFAULT_OPTICAL_FORM_MOTION.trailLength, 0.01, 1.8),
    speed: clamp(value.speed ?? DEFAULT_OPTICAL_FORM_MOTION.speed, 0.1, 20),
    pointMotion: clamp(value.pointMotion ?? DEFAULT_OPTICAL_FORM_MOTION.pointMotion, 0, 0.8),
    opticalMapping: clamp(value.opticalMapping ?? DEFAULT_OPTICAL_FORM_MOTION.opticalMapping, 0, 20),
    trailDensity: clamp(value.trailDensity ?? DEFAULT_OPTICAL_FORM_MOTION.trailDensity, 0.25, 4),
  });
}

/**
 * CPU reference for the shader mapping. These values are presentation-only:
 * shape reach and receiver optics determine movement, never the other way round.
 */
export function mapOpticalFormMotion(
  signals: OpticalFormMotionSignals,
  value: Partial<OpticalFormMotionSettings>,
): OpticalFormMotionMapping {
  const settings = normalizeOpticalFormMotion(value);
  const shapeReach = clamp(signals.shapeReach, 0, 1);
  const redistribution = clamp(signals.redistribution, 0, 1);
  const caustic = clamp(signals.caustic, 0, 1);
  const shadow = clamp(signals.shadow, 0, 1);
  const optical = clamp(Math.max(redistribution, caustic) * settings.opticalMapping, 0, 1);
  return Object.freeze({
    trailLength: settings.trailLength
      * (0.38 + 0.62 * redistribution + 0.85 * caustic)
      * (0.7 + 0.55 * shapeReach)
      * (0.55 + 0.45 * optical),
    speed: settings.speed * (0.5 + 1.25 * optical) * (1 - 0.35 * shadow),
    // The whole sampled surface receives a shape wave. Optical energy only
    // amplifies it locally, so a quiet outline never becomes motionless.
    pointMotion: settings.pointMotion * (0.6 + 0.4 * optical) * (0.75 + 0.25 * shapeReach),
    brightness: clamp(0.42 + 0.48 * optical + 0.28 * caustic - 0.18 * shadow, 0.12, 1.25),
  });
}

/** Reference for the repeating curve lifecycle used by the vertex shader. */
export function opticalTrailLifecycle(
  phase: number,
  timeSeconds: number,
  speed: number,
  screenRadius: number,
): OpticalTrailLifecycle {
  const rate = 0.035 + 0.025 * Math.min(clamp(speed, 0, 20), 4);
  const life = fract(timeSeconds * rate + fract(phase));
  const escape = smoothstep(0.18, 0.92, life);
  return Object.freeze({
    life,
    detachment: escape * escape,
    opacity: smoothstep(0, 0.08, life)
      * (1 - smoothstep(0.72, 1, life))
      * (1 - smoothstep(0.78, 1.25, Math.max(0, screenRadius))),
  });
}

function clamp(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-12, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
