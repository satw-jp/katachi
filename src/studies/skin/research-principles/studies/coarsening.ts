import {
  drawGlowPoint,
  hashNoise,
  normalizedToCanvas,
  type StudyDefinition,
  type StudyView,
} from "../runtime/studyTypes.ts";

export interface CoarseningUnit {
  id: number;
  x: number;
  y: number;
  mass: number;
  alive: boolean;
  neighbors: readonly number[];
}

export interface CoarseningState {
  kind: "coarsening";
  seed: number;
  elapsedSeconds: number;
  units: readonly CoarseningUnit[];
  initialMass: number;
  deaths: readonly number[];
}

export interface CoarseningParams {
  transferRate: number;
  deathThreshold: number;
  speed: number;
}

const DEFAULT_PARAMS: CoarseningParams = { transferRate: 0.82, deathThreshold: 0.3, speed: 1 };

function seededRandom(seed: number): () => number {
  let value = (seed >>> 0) || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeNeighbors(index: number, count: number): number[] {
  const neighbors = new Set<number>();
  const candidates = [index + 1, index - 1, index + 7, index - 7, index + 17, index - 17];
  for (const candidate of candidates) {
    const wrapped = (candidate + count) % count;
    if (wrapped !== index) neighbors.add(wrapped);
    if (neighbors.size >= 4) break;
  }
  return [...neighbors].sort((a, b) => a - b);
}

export function createCoarseningState(seed: number): CoarseningState {
  const random = seededRandom(seed);
  const units: CoarseningUnit[] = [];
  for (let id = 0; id < 96; id += 1) {
    const angle = id * 2.39996 + random() * 0.14;
    const radius = Math.sqrt((id + 0.5) / 96) * 0.38;
    units.push({
      id,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      mass: 0.36 + hashNoise(seed + 17, id) * 0.64,
      alive: true,
      neighbors: makeNeighbors(id, 96),
    });
  }
  return { kind: "coarsening", seed, elapsedSeconds: 0, units, initialMass: units.reduce((sum, unit) => sum + unit.mass, 0), deaths: [] };
}

function transferMass(units: CoarseningUnit[], deltaSeconds: number, rate: number): void {
  for (const unit of units) {
    if (!unit.alive) continue;
    for (const neighborId of unit.neighbors) {
      if (unit.id >= neighborId) continue;
      const neighbor = units[neighborId];
      if (!neighbor || !neighbor.alive) continue;
      const small = unit.mass <= neighbor.mass ? unit : neighbor;
      const large = small === unit ? neighbor : unit;
      const transfer = Math.min((large.mass - small.mass) * rate * deltaSeconds * 0.12, small.mass * 0.035);
      if (transfer > 0) {
        small.mass -= transfer;
        large.mass += transfer;
      }
    }
  }
}

function removeSmallestEligible(units: CoarseningUnit[], threshold: number, elapsedSeconds: number, deathCount: number): number | null {
  if (elapsedSeconds < 2.6 || Math.floor((elapsedSeconds - 2.6) / 1.05) <= deathCount) return null;
  const alive = units.filter((unit) => unit.alive).sort((a, b) => a.mass - b.mass || a.id - b.id);
  const candidate = alive[0];
  if (!candidate || candidate.mass > threshold * 1.3) return null;
  const receiver = candidate.neighbors
    .map((id) => units[id])
    .filter((unit): unit is CoarseningUnit => Boolean(unit?.alive && unit.id !== candidate.id))
    .sort((a, b) => b.mass - a.mass || a.id - b.id)[0];
  if (!receiver) return null;
  receiver.mass += candidate.mass;
  candidate.mass = 0;
  candidate.alive = false;
  return candidate.id;
}

export function advanceCoarsening(
  state: CoarseningState,
  deltaSeconds: number,
  params: Partial<CoarseningParams> = {},
): CoarseningState {
  const options = { ...DEFAULT_PARAMS, ...params };
  const step = Math.max(0, deltaSeconds) * options.speed;
  const elapsedSeconds = state.elapsedSeconds + step;
  const units = state.units.map((unit) => ({ ...unit }));
  transferMass(units, step, options.transferRate);
  const newDeath = removeSmallestEligible(units, options.deathThreshold, elapsedSeconds, state.deaths.length);
  return {
    ...state,
    elapsedSeconds,
    units,
    deaths: newDeath === null ? state.deaths : [...state.deaths, newDeath],
  };
}

function renderCoarsening(context: CanvasRenderingContext2D, rawState: unknown, view: StudyView): void {
  const state = rawState as CoarseningState;
  const maxMass = Math.max(...state.units.map((unit) => unit.mass), 1);
  for (const unit of state.units) {
    if (!unit.alive) continue;
    const point = normalizedToCanvas(unit, view);
    const radius = 1.1 + Math.sqrt(unit.mass / maxMass) * 8.6;
    const alpha = 0.26 + 0.48 * Math.sqrt(unit.mass / maxMass);
    drawGlowPoint(context, point.x, point.y, radius, unit.mass > 0.75 ? "#d8e5ff" : "#aab9cd", alpha);
  }
}

export const coarseningDefinition: StudyDefinition = {
  key: "coarsening",
  studyId: "rps05",
  title: "COARSENING",
  artTitle: "SCALE SHIFT",
  principle: "The characteristic scale grows because small identities disappear.",
  controls: [
    { key: "transferRate", label: "TRANSFER RATE", min: 0.2, max: 1.5, step: 0.01, value: DEFAULT_PARAMS.transferRate },
    { key: "deathThreshold", label: "DEATH THRESHOLD", min: 0.15, max: 0.55, step: 0.01, value: DEFAULT_PARAMS.deathThreshold },
  ],
  documentation: {
    scientificCore: "Mass is transferred between fixed neighboring units; units below a threshold can disappear and pass their remaining mass onward.",
    artTranslation: "The camera stays fixed while many small points resolve into fewer, larger soft presences.",
    whatChanged: "Entity count falls and remaining units grow non-uniformly; the total mass is conserved when an identity disappears.",
    notClaimed: "This is an ART abstraction of coarsening, not a physically faithful foam simulation and not camera zoom.",
  },
  createState: (seed) => createCoarseningState(seed),
  advanceState: (state, deltaSeconds, params) => advanceCoarsening(state as CoarseningState, deltaSeconds, params),
  render: renderCoarsening,
  readouts: (rawState) => {
    const state = rawState as CoarseningState;
    return [`UNITS ${state.units.filter((unit) => unit.alive).length}`, `DEATHS ${state.deaths.length}`, `MASS ${state.units.reduce((sum, unit) => sum + unit.mass, 0).toFixed(1)}`];
  },
  manifest: (rawState, params) => {
    const state = rawState as CoarseningState;
    return { studyId: "rps05", principle: "COARSENING", seed: state.seed, parameters: params, elapsedSeconds: Number(state.elapsedSeconds.toFixed(3)), phase: state.elapsedSeconds < 5 ? "BEFORE" : state.elapsedSeconds < 11 ? "CHANGE" : "AFTER" };
  },
};
