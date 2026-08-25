import type { SupportPaintRay, SupportPaintSurfaceHit } from "./supportPaintSurfaceIndex.ts";
import type { ViewportClippingState } from "./viewportClipping.ts";

export type SupportPaintRaycastWorkerRequest =
  | { type: "initialize"; generation: number; positions: Float32Array }
  | { type: "raycast"; generation: number; requestId: number; ray: SupportPaintRay; clipping: ViewportClippingState | null };

export type SupportPaintRaycastWorkerMessage =
  | { type: "progress"; generation: number; phase: "building"; triangleCount: number }
  | { type: "ready"; generation: number; triangleCount: number; nodeCount: number; buildMs: number }
  | { type: "hit"; generation: number; requestId: number; hit: SupportPaintSurfaceHit | null; computeMs: number }
  | { type: "error"; generation: number; requestId?: number; message: string };
