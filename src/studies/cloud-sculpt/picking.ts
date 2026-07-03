// ---------------------------------------------------------------------------
// CPU-side ray/field intersection for mouse interaction (click-to-add,
// click-to-select, drag-to-move). Uses the exact same fieldSdf as the
// shader (field.ts) so what you click is what you see.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import type { Ball } from "./field.ts";
import { ballSdf, fieldSdf } from "./field.ts";

export interface RaymarchHit {
  point: THREE.Vector3;
  /** Index into `balls` of the nearest ball at the hit point (for selection). */
  ballIndex: number;
}

/** Sphere-trace the field SDF; returns the first surface hit, or null if none within range. */
export function raymarchField(
  balls: Ball[],
  k: number,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist = 50,
): RaymarchHit | null {
  if (balls.length === 0) return null;
  let t = 0;
  for (let i = 0; i < 128; i++) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const d = fieldSdf(balls, k, x, y, z);
    if (d < 0.001) {
      let best = Infinity;
      let bestI = -1;
      for (let bi = 0; bi < balls.length; bi++) {
        const bd = ballSdf(balls[bi], x, y, z);
        if (bd < best) {
          best = bd;
          bestI = bi;
        }
      }
      return { point: new THREE.Vector3(x, y, z), ballIndex: bestI };
    }
    t += d;
    if (t > maxDist) break;
  }
  return null;
}
