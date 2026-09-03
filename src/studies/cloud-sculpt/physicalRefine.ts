import type { Ball } from "./field.ts";
import type { CameraSnapshot } from "./renderer.ts";

// TEMPORARY D1A DIAGNOSTIC STUB: retain only type-only imports while checking
// whether the Physical Refine module's runtime dependencies are causal.
export type PhysicalRefineTypeOnlyInputs = {
  ball?: Ball;
  camera?: CameraSnapshot;
};

export type PhysicalRefineStatus =
  | "OFFLINE"
  | "READY"
  | "RENDERING"
  | "CURRENT"
  | "STALE"
  | "ERROR"
  | "CANCELLED";

interface PhysicalRefineDiagnosticCapabilities {
  selectedVariant: string | null;
  gpu: { name: string } | null;
  mitsuba: { version: string | null };
}

interface PhysicalRefineDiagnosticLastResult {
  purpose: "body" | "receiver";
  metadata: {
    requestId: string;
    resolution: { width: number; height: number };
    renderMs: number;
  };
  artifact: Uint8Array;
}

export interface PhysicalRefineState {
  status: PhysicalRefineStatus;
  capabilities: PhysicalRefineDiagnosticCapabilities | null;
  currentFingerprint: string | null;
  lastResult: PhysicalRefineDiagnosticLastResult | null;
  error: string | null;
}
