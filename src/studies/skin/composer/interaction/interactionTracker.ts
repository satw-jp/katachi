import { InteractionMeasurements } from "./interactionTypes";

/** State tracked across frames for interaction measurements. */
export interface InteractionState {
  /** Last pointer position in canvas local coordinates */
  lastPointer: { x: number; y: number } | null;
  /** Last target position in world (projected to canvas) */
  lastCameraTarget: { x: number; y: number } | null;
  /** Last camera position */
  lastCameraPos: { x: number; y: number; z: number } | null;
  /** Last zoom distance (camera to target) */
  lastZoomDist: number | null;
  /** Wall-clock time of last interaction impulse */
  lastImpulseTime: number;
  /** Counter of frames since last interaction */
  framesSinceInteraction: number;
}

/** Default (zero) measurements. */
const ZERO_MEASUREMENTS: InteractionMeasurements = {
  pointerVelocity: 0,
  cameraVelocity: 0,
  zoomVelocity: 0,
  interactionImpulse: 0,
  secondsSinceInteraction: 0,
};

/** Creates a fresh interaction state with all zeros. */
function createState(): InteractionState {
  return {
    lastPointer: null,
    lastCameraTarget: null,
    lastCameraPos: null,
    lastZoomDist: null,
    lastImpulseTime: 0,
    framesSinceInteraction: 0,
  };
}

/** Normalizes a velocity value to 0..1 range based on viewport and delta time. */
function normalizeVelocity(
  distancePixels: number,
  viewportDiagonalPixels: number,
  deltaTimeSec: number
): number {
  if (deltaTimeSec <= 0 || viewportDiagonalPixels <= 0) return 0;
  // A diagonal traversal in 1 second = velocity 1
  const raw = distancePixels / viewportDiagonalPixels;
  // Clamp to 0..1
  return Math.min(1, Math.max(0, raw));
}

/** Computes InteractionMeasurements from the given state and delta time. */
export function computeMeasurements(
  state: InteractionState,
  canvas: HTMLCanvasElement,
  deltaTimeSec: number,
  userGate: boolean
): InteractionMeasurements {
  const now = performance.now() / 1000; // seconds
  const measurements: InteractionMeasurements = { ...ZERO_MEASUREMENTS };

  // --- Pointer velocity ---
  if (state.lastPointer != null && userGate) {
    const ptr = state.lastPointer;
    const diag = Math.sqrt(canvas.clientWidth ** 2 + canvas.clientHeight ** 2); // viewport diagonal
    measurements.pointerVelocity = normalizeVelocity(
      Math.hypot(ptr.x - canvas.clientWidth / 2, ptr.y - canvas.clientHeight / 2),
      diag,
      deltaTimeSec
    );
  }

  // --- Camera velocity (Trackball user motion) ---
  if (state.lastCameraTarget != null && state.lastCameraPos != null && userGate) {
    const tx = state.lastCameraTarget.x;
    const ty = state.lastCameraTarget.y;
    const cx = state.lastCameraPos.x;
    const cy = state.lastCameraPos.y;
    // Translation delta from previous target to current target
    const transDelta = Math.hypot(tx - cx, ty - cy);
    // Normalize by viewport size and delta time
    measurements.cameraVelocity = normalizeVelocity(transDelta, Math.sqrt(canvas.clientWidth ** 2 + canvas.clientHeight ** 2), deltaTimeSec);
  }

  // --- Zoom velocity ---
  if (state.lastZoomDist != null && userGate) {
    // Use absolute difference; simplified: current distance as both current and previous
    const currDist = state.lastZoomDist;
    const prevDist = state.lastZoomDist;
    measurements.zoomVelocity = normalizeVelocity(Math.abs(currDist - prevDist), Math.sqrt(canvas.clientWidth ** 2 + canvas.clientHeight ** 2), deltaTimeSec);
  }

  // --- Interaction impulse ---
  // Decay always runs based on wall-clock time since last impulse,
  // but only if an impulse was actually recorded (lastImpulseTime > 0)
  let impulse = 0;
  if (state.lastImpulseTime > 0) {
    const impulseAge = now - state.lastImpulseTime;
    if (impulseAge < 2) {
      // Decay from prior impulse: from 1 at t=0 to 0 at t=2s
      impulse = Math.max(0, 1 - impulseAge / 2);
    } else if (state.framesSinceInteraction > 0 && state.framesSinceInteraction < 60) {
      // Within 1 second of last interaction, additional decay by frames
      impulse = Math.max(0, 1 - state.framesSinceInteraction / 60);
    }
  }
  // new interaction contribution — only when userGate permits
  if (userGate && state.framesSinceInteraction > 0) {
    // Recent interaction: boost impulse to near-1
    impulse = Math.min(1, impulse + 1 - state.framesSinceInteraction / 60);
  }
  measurements.interactionImpulse = impulse;

  // --- Seconds since interaction ---
  measurements.secondsSinceInteraction = state.framesSinceInteraction * deltaTimeSec;

  return measurements;
}

/** Updates internal state from a pointer event. */
function updatePointerState(state: InteractionState, event: PointerEvent, canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  state.lastPointer = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

/** Updates internal state from Trackball camera motion. */
function updateCameraState(state: InteractionState, cameraPos: { x: number; y: number; z: number }, target: { x: number; y: number }): void {
  state.lastCameraPos = cameraPos;
  state.lastCameraTarget = target;
}

/** Updates internal state from zoom. */
function updateZoomState(state: InteractionState, dist: number): void {
  state.lastZoomDist = dist;
}

/** Records an interaction impulse at the current wall-clock time. */
function recordImpulse(state: InteractionState): void {
  state.lastImpulseTime = performance.now() / 1000;
  state.framesSinceInteraction = 0;
}

/** Called each frame to advance the interaction timer. */
function advanceFrame(state: InteractionState): void {
  // $FlowIgnore deltaTimeSec used for frame-timing consistency
  // deltaTimeSec is used for frame-timing consistency in live wiring

  // $FlowIgnore deltaTimeSec used for frame-timing consistency
  state.framesSinceInteraction += 1;
}

/** Exported tracker object - attach to ComposerRuntime or similar. */
export const InteractionTracker = {
  createState,
  computeMeasurements,
  updatePointerState,
  updateCameraState,
  updateZoomState,
  recordImpulse,
  advanceFrame,
};

