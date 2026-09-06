import {
  clamp,
  drawGlowPoint,
  normalizedToCanvas,
  type StudyDefinition,
  type StudyView,
} from "../runtime/studyTypes.ts";
import {
  createCellState,
  deformedCells,
  relationPoints,
  type CellState,
  EXCHANGED_ADJACENCY,
  INITIAL_ADJACENCY,
} from "./cellFixture.ts";

export interface NeighborExchangeParams {
  deformation: number;
  exchangeThreshold: number;
  speed: number;
}

const DEFAULT_PARAMS: NeighborExchangeParams = { deformation: 1, exchangeThreshold: 0.12, speed: 1 };

export function createNeighborExchangeState(seed: number): CellState {
  return createCellState(seed);
}

export function advanceNeighborExchange(
  state: CellState,
  deltaSeconds: number,
  params: Partial<NeighborExchangeParams> = {},
): CellState {
  const options = { ...DEFAULT_PARAMS, ...params };
  const elapsedSeconds = state.elapsedSeconds + Math.max(0, deltaSeconds) * options.speed;
  const shortEdgeMetric = Math.max(0.02, 0.28 - Math.max(0, elapsedSeconds - 4.5) * 0.032);
  const shouldExchange = state.eventElapsed === null && shortEdgeMetric <= options.exchangeThreshold;
  if (!shouldExchange) {
    return {
      ...state,
      elapsedSeconds,
      cells: deformedCells(state.cells, elapsedSeconds, options.deformation, 0.72),
      shortEdgeMetric,
      eventState: state.eventElapsed === null ? "continuous" : elapsedSeconds - state.eventElapsed < 1.6 ? "event" : "after",
    };
  }
  return {
    ...state,
    elapsedSeconds,
    cells: deformedCells(state.cells, elapsedSeconds, options.deformation, 0.72),
    adjacency: [...EXCHANGED_ADJACENCY],
    shortEdgeMetric,
    eventState: "event",
    eventElapsed: elapsedSeconds,
  };
}

function drawRelation(context: CanvasRenderingContext2D, state: CellState, view: StudyView, relation: string, alpha: number, color: string, width: number): void {
  const points = relationPoints(state, relation, view);
  if (!points) return;
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.shadowBlur = width > 1 ? 7 : 0;
  context.shadowColor = color;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  context.lineTo(points[1].x, points[1].y);
  context.stroke();
  context.restore();
}

function renderNeighborExchange(context: CanvasRenderingContext2D, rawState: unknown, view: StudyView): void {
  const state = rawState as CellState;
  const eventProgress = state.eventElapsed === null ? 0 : clamp((state.elapsedSeconds - state.eventElapsed) / 1.6, 0, 1);
  for (const relation of state.adjacency) drawRelation(context, state, view, relation, 0.13, "#9da9bb", 0.55);
  if (state.eventElapsed !== null && eventProgress < 1) {
    drawRelation(context, state, view, "4-5", 0.38 * (1 - eventProgress), "#f0c7ac", 1.2);
    drawRelation(context, state, view, "3-8", 0.78 * eventProgress, "#c5dfff", 1.25);
  }
  state.cells.forEach((cell) => {
    const center = normalizedToCanvas(cell, view);
    drawGlowPoint(context, center.x, center.y, state.eventState === "event" ? 2.4 : 1.7, state.eventState === "event" ? "#fff1dc" : "#d8e5f7", state.eventState === "event" ? 0.9 : 0.58);
  });
}

export const neighborExchangeDefinition: StudyDefinition = {
  key: "neighbor-exchange",
  studyId: "rps04",
  title: "NEIGHBOR EXCHANGE / T1",
  artTitle: "REWIRE EVENT",
  principle: "Continuous deformation can contain one discrete topology event.",
  controls: [
    { key: "deformation", label: "DEFORMATION", min: 0.25, max: 1.8, step: 0.01, value: DEFAULT_PARAMS.deformation },
    { key: "exchangeThreshold", label: "EXCHANGE THRESHOLD", min: 0.05, max: 0.24, step: 0.005, value: DEFAULT_PARAMS.exchangeThreshold },
  ],
  documentation: {
    scientificCore: "A continuously deforming cell field performs one T1-like neighbor exchange when a short-edge threshold is crossed.",
    artTranslation: "The old relation fades while a new relation appears; cell identities remain visible through the event.",
    whatChanged: "Geometry moves before and after the event, but the adjacency list changes only at the discrete exchange.",
    notClaimed: "This is not a full foam simulation; it isolates a topology event from the surrounding continuous relaxation.",
  },
  createState: (seed) => createNeighborExchangeState(seed),
  advanceState: (state, deltaSeconds, params) => advanceNeighborExchange(state as CellState, deltaSeconds, params),
  render: renderNeighborExchange,
  readouts: (rawState) => {
    const state = rawState as CellState;
    return [`CELLS ${state.cells.length}`, `ADJACENCY ${state.adjacency.length} RELATIONS`, state.eventState === "continuous" ? "CONTINUOUS" : state.eventState === "event" ? "T1-LIKE EVENT" : "TOPOLOGY REWIRED"];
  },
  manifest: (rawState, params) => {
    const state = rawState as CellState;
    return { studyId: "rps04", principle: "NEIGHBOR EXCHANGE / T1", seed: state.seed, parameters: params, elapsedSeconds: Number(state.elapsedSeconds.toFixed(3)), phase: state.elapsedSeconds < 5 ? "BEFORE" : state.elapsedSeconds < 11 ? "CHANGE" : "AFTER" };
  },
};

export function adjacencyChangesOnlyAtExchange(before: CellState, after: CellState): boolean {
  if (before.eventElapsed === null && after.eventElapsed === null) return before.adjacency.join(",") === after.adjacency.join(",");
  return after.eventElapsed !== null && after.adjacency.join(",") === EXCHANGED_ADJACENCY.join(",") && before.initialAdjacency.join(",") === INITIAL_ADJACENCY.join(",");
}
