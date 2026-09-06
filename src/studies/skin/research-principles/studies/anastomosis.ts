import {
  clamp,
  drawCurve,
  drawGlowPoint,
  interpolatePoint,
  normalizedToCanvas,
  type StudyDefinition,
  type StudyView,
} from "../runtime/studyTypes.ts";

export interface AnastomosisState {
  kind: "anastomosis";
  seed: number;
  elapsedSeconds: number;
  families: readonly (readonly { x: number; y: number }[])[];
  growthProgress: number;
  reconnectPoint: { x: number; y: number } | null;
  connected: boolean;
  connectedComponents: number;
  reconnectElapsed: number | null;
  pulseSpeed: number;
}

export interface AnastomosisParams {
  growthSpeed: number;
  reconnectDistance: number;
  pulseSpeed: number;
}

const DEFAULT_PARAMS: AnastomosisParams = { growthSpeed: 1, reconnectDistance: 0.065, pulseSpeed: 0.6 };

function createFamilies(): readonly (readonly { x: number; y: number }[])[] {
  return [
    [
      { x: 0.12, y: 0.28 },
      { x: 0.22, y: 0.31 },
      { x: 0.31, y: 0.37 },
      { x: 0.4, y: 0.44 },
      { x: 0.49, y: 0.5 },
    ],
    [
      { x: 0.88, y: 0.72 },
      { x: 0.78, y: 0.68 },
      { x: 0.68, y: 0.62 },
      { x: 0.58, y: 0.56 },
      { x: 0.51, y: 0.5 },
    ],
    [
      { x: 0.82, y: 0.18 },
      { x: 0.75, y: 0.27 },
      { x: 0.68, y: 0.36 },
      { x: 0.6, y: 0.43 },
      { x: 0.52, y: 0.5 },
    ],
  ];
}

export function createAnastomosisState(seed: number): AnastomosisState {
  return {
    kind: "anastomosis",
    seed,
    elapsedSeconds: 0,
    families: createFamilies(),
    growthProgress: 0,
    reconnectPoint: null,
    connected: false,
    connectedComponents: 3,
    reconnectElapsed: null,
    pulseSpeed: DEFAULT_PARAMS.pulseSpeed,
  };
}

export function advanceAnastomosis(
  state: AnastomosisState,
  deltaSeconds: number,
  params: Partial<AnastomosisParams> = {},
): AnastomosisState {
  const options = { ...DEFAULT_PARAMS, ...params };
  const nextElapsed = state.elapsedSeconds + Math.max(0, deltaSeconds);
  const growthProgress = clamp(nextElapsed * options.growthSpeed / 10, 0, 1);
  const tips = state.families.map((family) => interpolatePoint(family, growthProgress));
  const candidateA = tips[0];
  const candidateB = tips[1];
  const distance = Math.hypot(candidateA.x - candidateB.x, candidateA.y - candidateB.y);
  const shouldReconnect = !state.connected && growthProgress > 0.55 && distance <= options.reconnectDistance;
  if (!shouldReconnect) return { ...state, elapsedSeconds: nextElapsed, growthProgress, pulseSpeed: options.pulseSpeed };
  return {
    ...state,
    elapsedSeconds: nextElapsed,
    growthProgress,
    reconnectPoint: { x: (candidateA.x + candidateB.x) * 0.5, y: (candidateA.y + candidateB.y) * 0.5 },
    connected: true,
    connectedComponents: 1,
    reconnectElapsed: nextElapsed,
    pulseSpeed: options.pulseSpeed,
  };
}

function renderAnastomosis(context: CanvasRenderingContext2D, rawState: unknown, view: StudyView): void {
  const state = rawState as AnastomosisState;
  state.families.forEach((family, familyIndex) => {
    const visiblePointCount = Math.max(2, Math.ceil(state.growthProgress * family.length));
    const visible = family.slice(0, visiblePointCount);
    if (visible.length > 1) drawCurve(context, visible, view, { color: familyIndex === 0 ? "#f7d4b2" : familyIndex === 1 ? "#b8d6ff" : "#c9c1ff", width: 1, alpha: 0.66, glow: 4 });
    const tip = interpolatePoint(family, state.growthProgress);
    const tipCanvas = normalizedToCanvas(tip, view);
    drawGlowPoint(context, tipCanvas.x, tipCanvas.y, 2.5, familyIndex === 0 ? "#ffd4a7" : "#bcd9ff", 0.92);
  });
  if (state.connected && state.reconnectPoint) {
    const junction = normalizedToCanvas(state.reconnectPoint, view);
    const pulse = (state.elapsedSeconds * state.pulseSpeed * 0.19) % 1;
    const pulsePoint = pulse < 0.42
      ? interpolatePoint(state.families[0], pulse / 0.42)
      : pulse < 0.62
        ? state.reconnectPoint
        : interpolatePoint(state.families[1], 1 - ((pulse - 0.62) / 0.38));
    const pulseCanvas = normalizedToCanvas(pulsePoint, view);
    context.save();
    context.strokeStyle = "#f4f8ff";
    context.globalAlpha = 0.42;
    context.lineWidth = 1.4;
    context.shadowBlur = 8;
    context.shadowColor = "#c4dcff";
    context.beginPath();
    const a = normalizedToCanvas(state.families[0][state.families[0].length - 1], view);
    const b = normalizedToCanvas(state.families[1][state.families[1].length - 1], view);
    context.moveTo(a.x, a.y);
    context.lineTo(junction.x, junction.y);
    context.lineTo(b.x, b.y);
    context.stroke();
    context.restore();
    drawGlowPoint(context, junction.x, junction.y, 4.4, "#fff2d0", 0.95);
    drawGlowPoint(context, pulseCanvas.x, pulseCanvas.y, 2.5, "#ffffff", 0.96);
  }
}

export const anastomosisDefinition: StudyDefinition = {
  key: "anastomosis",
  studyId: "rps02",
  title: "ANASTOMOSIS",
  artTitle: "RECONNECT",
  principle: "Crossing is not connection; connection changes propagation.",
  controls: [
    { key: "growthSpeed", label: "GROWTH SPEED", min: 0.5, max: 1.8, step: 0.01, value: DEFAULT_PARAMS.growthSpeed },
    { key: "reconnectDistance", label: "RECONNECT DISTANCE", min: 0.025, max: 0.15, step: 0.005, value: DEFAULT_PARAMS.reconnectDistance },
    { key: "pulseSpeed", label: "PULSE SPEED", min: 0.2, max: 1.4, step: 0.01, value: DEFAULT_PARAMS.pulseSpeed },
  ],
  documentation: {
    scientificCore: "Separate trajectory families can form a new junction when a local distance condition is met.",
    artTranslation: "A pulse that was confined to one family gains a passage into another only after the reconnect event.",
    whatChanged: "One new relation joins previously separate components; the junction is a topology event, not a crossing highlight.",
    notClaimed: "This is not a botanical venation model and does not claim to reproduce biological branch placement.",
  },
  createState: (seed) => createAnastomosisState(seed),
  advanceState: (state, deltaSeconds, params) => advanceAnastomosis(state as AnastomosisState, deltaSeconds, params),
  render: renderAnastomosis,
  readouts: (rawState) => {
    const state = rawState as AnastomosisState;
    return [`COMPONENTS ${state.connectedComponents}`, state.connected ? "RECONNECT EVENT COMPLETE" : "SEPARATE FAMILIES", state.connected ? "PULSE CAN CROSS" : "PULSE CONFINED"];
  },
  manifest: (rawState, params) => {
    const state = rawState as AnastomosisState;
    return { studyId: "rps02", principle: "ANASTOMOSIS", seed: state.seed, parameters: params, elapsedSeconds: Number(state.elapsedSeconds.toFixed(3)), phase: state.elapsedSeconds < 5 ? "BEFORE" : state.elapsedSeconds < 11 ? "CHANGE" : "AFTER" };
  },
};
