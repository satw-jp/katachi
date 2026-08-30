export type Stage6MeshProgressPhase =
  | "preparing"
  | "sampling"
  | "assembling"
  | "topology"
  | "components"
  | "repair"
  | "saved-topology"
  | "printability"
  | "encoding"
  | "support"
  | "complete";

function fraction(completed: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(1, completed / total));
}

/** Actual phase-weighted progress. No time-based smoothing is used: if a
 * topology phase takes time, the UI keeps naming that exact phase instead
 * of pretending sampling is stuck at 90/99%. */
export function stage6MeshProgressPercent(
  phase: Stage6MeshProgressPhase,
  completed = 0,
  total = 1,
): number {
  switch (phase) {
    case "preparing": return 2;
    case "sampling": return 4 + fraction(completed, total) * 66;
    case "assembling": return 74;
    case "topology": return 80;
    case "components": return 84;
    case "repair": return 88;
    case "saved-topology": return 92;
    case "printability": return 96;
    case "encoding": return 98;
    case "support": return 99;
    case "complete": return 100;
  }
}
