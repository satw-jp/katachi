import { clamp, hashNoise, type StudyView } from "../runtime/studyTypes.ts";

export interface Cell {
  id: number;
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  radius: number;
}

export interface CellState {
  kind: "cells";
  seed: number;
  elapsedSeconds: number;
  cells: readonly Cell[];
  adjacency: readonly string[];
  initialAdjacency: readonly string[];
  shortEdgeMetric: number;
  eventState: "continuous" | "event" | "after";
  eventElapsed: number | null;
}

export const INITIAL_ADJACENCY = [
  "0-1", "1-2", "0-3", "1-4", "2-5", "3-4", "4-5", "3-6", "4-7", "5-8", "6-7", "7-8", "6-9", "7-9", "8-9",
] as const;

export const EXCHANGED_ADJACENCY = [
  "0-1", "1-2", "0-3", "1-4", "2-5", "3-4", "3-6", "4-7", "5-8", "6-7", "7-8", "6-9", "7-9", "8-9", "3-8",
] as const;

const BASE_POINTS = [
  [0.21, 0.23], [0.48, 0.19], [0.76, 0.24],
  [0.18, 0.5], [0.48, 0.47], [0.78, 0.5],
  [0.22, 0.77], [0.49, 0.75], [0.77, 0.78], [0.5, 0.64],
] as const;

export function createCellState(seed: number): CellState {
  const cells = BASE_POINTS.map(([x, y], id) => ({
    id,
    baseX: x,
    baseY: y,
    x,
    y,
    radius: 0.102 + hashNoise(seed, id + 91) * 0.025,
  }));
  return {
    kind: "cells",
    seed,
    elapsedSeconds: 0,
    cells,
    adjacency: [...INITIAL_ADJACENCY],
    initialAdjacency: [...INITIAL_ADJACENCY],
    shortEdgeMetric: 0.28,
    eventState: "continuous",
    eventElapsed: null,
  };
}

export function deformedCells(cells: readonly Cell[], elapsedSeconds: number, amount: number, rate: number): Cell[] {
  const phase = elapsedSeconds * rate;
  return cells.map((cell) => ({
    ...cell,
    x: clamp(cell.baseX + amount * (0.05 * Math.sin(phase * 0.75 + cell.id * 0.63) + 0.035 * Math.sin(phase * 0.31 + cell.baseY * 9)), 0.08, 0.92),
    y: clamp(cell.baseY + amount * (0.045 * Math.cos(phase * 0.61 + cell.id * 0.41) + 0.028 * Math.sin(phase * 0.44 + cell.baseX * 7)), 0.09, 0.9),
  }));
}

export function relationKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

export function relationPoints(state: CellState, relation: string, view: StudyView): [{ x: number; y: number }, { x: number; y: number }] | null {
  const [aText, bText] = relation.split("-");
  const a = state.cells[Number(aText)];
  const b = state.cells[Number(bText)];
  if (!a || !b) return null;
  const pad = 42;
  const width = Math.max(1, view.width - pad * 2);
  const height = Math.max(1, view.height - pad * 2);
  return [
    { x: pad + a.x * width, y: pad + a.y * height },
    { x: pad + b.x * width, y: pad + b.y * height },
  ];
}
