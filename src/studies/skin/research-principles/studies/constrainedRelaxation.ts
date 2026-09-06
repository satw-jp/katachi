import {
  drawGlowPoint,
  normalizedToCanvas,
  type StudyDefinition,
  type StudyView,
} from "../runtime/studyTypes.ts";
import { createCellState, deformedCells, relationPoints, type CellState } from "./cellFixture.ts";

export interface ConstrainedRelaxationParams {
  deformation: number;
  relaxRate: number;
  speed: number;
}

const DEFAULT_PARAMS: ConstrainedRelaxationParams = { deformation: 1, relaxRate: 0.72, speed: 1 };

export function createConstrainedRelaxationState(seed: number): CellState {
  return createCellState(seed);
}

export function advanceConstrainedRelaxation(
  state: CellState,
  deltaSeconds: number,
  params: Partial<ConstrainedRelaxationParams> = {},
): CellState {
  const options = { ...DEFAULT_PARAMS, ...params };
  const elapsedSeconds = state.elapsedSeconds + Math.max(0, deltaSeconds) * options.speed;
  return {
    ...state,
    elapsedSeconds,
    cells: deformedCells(state.cells, elapsedSeconds, options.deformation, options.relaxRate),
    adjacency: [...state.initialAdjacency],
    shortEdgeMetric: 0.28,
    eventState: "continuous",
    eventElapsed: null,
  };
}

function renderConstrainedRelaxation(context: CanvasRenderingContext2D, rawState: unknown, view: StudyView): void {
  const state = rawState as CellState;
  context.save();
  for (const relation of state.adjacency) {
    const points = relationPoints(state, relation, view);
    if (!points) continue;
    context.strokeStyle = "#9da9bb";
    context.globalAlpha = 0.13;
    context.lineWidth = 0.55;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.stroke();
  }
  context.restore();
  state.cells.forEach((cell) => {
    const center = normalizedToCanvas(cell, view);
    context.save();
    context.translate(center.x, center.y);
    context.rotate(Math.sin(state.elapsedSeconds * 0.3 + cell.id) * 0.16);
    context.strokeStyle = "#b6c0d0";
    context.globalAlpha = 0.15;
    context.lineWidth = 0.7;
    context.fillStyle = `rgba(${80 + cell.id * 5}, ${105 + cell.id * 3}, 150, 0.045)`;
    context.beginPath();
    for (let corner = 0; corner < 7; corner += 1) {
      const angle = corner / 7 * Math.PI * 2;
      const radius = cell.radius * (0.82 + 0.1 * Math.sin(corner * 2.1 + cell.id));
      const x = Math.cos(angle) * radius * (view.width - 84);
      const y = Math.sin(angle) * radius * (view.height - 84);
      if (corner === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
    drawGlowPoint(context, center.x, center.y, 1.7, "#d8e5f7", 0.58);
  });
}

export const constrainedRelaxationDefinition: StudyDefinition = {
  key: "constrained-relaxation",
  studyId: "rps03",
  title: "CONSTRAINED RELAXATION",
  artTitle: "RELAX WITHOUT REWIRING",
  principle: "Geometry moves continuously; adjacency stays fixed.",
  controls: [
    { key: "deformation", label: "DEFORMATION", min: 0.25, max: 1.8, step: 0.01, value: DEFAULT_PARAMS.deformation },
    { key: "relaxRate", label: "RELAX RATE", min: 0.25, max: 1.5, step: 0.01, value: DEFAULT_PARAMS.relaxRate },
  ],
  documentation: {
    scientificCore: "A constrained continuous deformation changes cell geometry while preserving the declared adjacency relation.",
    artTranslation: "Soft territories shear and breathe, but their identity points and neighbor lines remain the same.",
    whatChanged: "Position and boundary shape change through time; the adjacency list never changes.",
    notClaimed: "This is not a physical soap-foam solver and does not claim a 120-degree equilibrium geometry.",
  },
  createState: (seed) => createConstrainedRelaxationState(seed),
  advanceState: (state, deltaSeconds, params) => advanceConstrainedRelaxation(state as CellState, deltaSeconds, params),
  render: renderConstrainedRelaxation,
  readouts: (rawState) => {
    const state = rawState as CellState;
    return [`CELLS ${state.cells.length}`, `ADJACENCY ${state.adjacency.length} RELATIONS`, "TOPOLOGY FIXED"];
  },
  manifest: (rawState, params) => {
    const state = rawState as CellState;
    return { studyId: "rps03", principle: "CONSTRAINED RELAXATION", seed: state.seed, parameters: params, elapsedSeconds: Number(state.elapsedSeconds.toFixed(3)), phase: state.elapsedSeconds < 5 ? "BEFORE" : state.elapsedSeconds < 11 ? "CHANGE" : "AFTER" };
  },
};
