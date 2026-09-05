export interface InteractionMeasurements {
  /** 0=stationary, 1=fast interaction */
  pointerVelocity: number;
  /** 0=stationary, 1=fast camera movement */
  cameraVelocity: number;
  /** 0=stationary, 1=fast zoom */
  zoomVelocity: number;
  /** Recent interaction impulse, decays over time */
  interactionImpulse: number;
  /** Seconds since last meaningful user interaction */
  secondsSinceInteraction: number;
}