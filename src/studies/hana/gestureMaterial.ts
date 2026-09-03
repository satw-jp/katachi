import type { HanaViewportStroke } from "./gesture.ts";
import type {
  HanaMaterialMappingMode,
  HanaMaterialSettings,
} from "./authoringDocument.ts";

export interface HanaGestureChannelSample {
  arcLength: number;
  normalizedT: number;
  pressure: number;
  speed: number;
  time: number;
  sourcePointStart: number;
  sourcePointEnd: number;
}

export interface HanaMaterialProfileProvenance {
  sourceGestureId: string;
  sourcePointStart: number;
  sourcePointEnd: number;
  sourceT: number;
}

export interface HanaMaterialProfileSample {
  arcLength: number;
  radius: number;
  sourceGestureSample: HanaMaterialProfileProvenance;
}

export interface HanaGestureChannelOptions {
  smoothingWindow?: number;
  maxSpeed?: number;
}

export interface HanaMaterialProfileOptions extends HanaGestureChannelOptions {
  sampleCount?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function arcLengths(stroke: HanaViewportStroke): number[] {
  const cumulative = [0];
  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    cumulative.push(cumulative[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y));
  }
  return cumulative;
}

function robustSpeedLimit(speeds: readonly number[]): number {
  const ordered = speeds.filter((speed) => Number.isFinite(speed) && speed > 0).sort((a, b) => a - b);
  if (ordered.length === 0) return 1;
  const p95 = ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * 0.95))];
  return Math.max(Number.EPSILON, p95 * 2);
}

function movingAverage(values: readonly number[], index: number, window: number): number {
  const radius = Math.floor(window / 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(values.length - 1, index + radius);
  let total = 0;
  for (let cursor = start; cursor <= end; cursor += 1) total += values[cursor];
  return total / Math.max(1, end - start + 1);
}

/** Derive deterministic, arc-length-addressable body channels without mutating Raw Gesture. */
export function buildGestureChannel(
  stroke: HanaViewportStroke,
  options: HanaGestureChannelOptions = {},
): HanaGestureChannelSample[] {
  if (stroke.points.length === 0) return [];
  const cumulative = arcLengths(stroke);
  const totalLength = cumulative[cumulative.length - 1];
  const rawSpeeds = stroke.points.map((_, index) => {
    if (stroke.points.length < 2) return 0;
    const neighbor = index === 0 ? 1 : index;
    const from = stroke.points[neighbor - 1];
    const to = stroke.points[neighbor];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const deltaTime = Math.max(0, to.time - from.time);
    return distance / Math.max(0.001, deltaTime / 1000);
  });
  const speedLimit = Math.max(
    Number.EPSILON,
    finite(options.maxSpeed ?? robustSpeedLimit(rawSpeeds), robustSpeedLimit(rawSpeeds)),
  );
  const window = Math.max(1, Math.trunc(options.smoothingWindow ?? 3));
  const speeds = rawSpeeds.map((_, index) => movingAverage(rawSpeeds, index, window))
    .map((speed) => clamp(finite(speed, 0), 0, speedLimit));
  return stroke.points.map((point, index) => ({
    arcLength: cumulative[index],
    normalizedT: totalLength > Number.EPSILON
      ? cumulative[index] / totalLength
      : index / Math.max(1, stroke.points.length - 1),
    pressure: clamp(finite(point.pressure, 0), 0, 1),
    speed: speeds[index],
    time: finite(point.time, 0),
    sourcePointStart: index,
    sourcePointEnd: index,
  }));
}

function channelAtArcLength(
  channel: readonly HanaGestureChannelSample[],
  arcLength: number,
): HanaGestureChannelSample {
  if (channel.length === 1) return { ...channel[0] };
  const target = clamp(arcLength, 0, channel[channel.length - 1].arcLength);
  let end = 1;
  while (end < channel.length - 1 && channel[end].arcLength < target) end += 1;
  const start = end - 1;
  const span = channel[end].arcLength - channel[start].arcLength;
  const amount = span > Number.EPSILON
    ? (target - channel[start].arcLength) / span
    : 0;
  const from = channel[start];
  const to = channel[end];
  return {
    arcLength: target,
    normalizedT: from.normalizedT + (to.normalizedT - from.normalizedT) * amount,
    pressure: from.pressure + (to.pressure - from.pressure) * amount,
    speed: from.speed + (to.speed - from.speed) * amount,
    time: from.time + (to.time - from.time) * amount,
    sourcePointStart: from.sourcePointStart,
    sourcePointEnd: to.sourcePointEnd,
  };
}

function normalizedChannelValue(value: number, values: readonly number[]): number {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return maximum - minimum > Number.EPSILON ? (value - minimum) / (maximum - minimum) : 0.5;
}

function normalizedSettings(settings: HanaMaterialSettings): HanaMaterialSettings {
  const minRadius = Math.max(Number.EPSILON, finite(settings.minRadius, 0.05));
  const maxRadius = Math.max(minRadius, finite(settings.maxRadius, 0.5));
  return {
    ...settings,
    mapping: settings.mapping,
    baseRadius: clamp(finite(settings.baseRadius, 0.18), minRadius, maxRadius),
    minRadius,
    maxRadius,
    pressureInfluence: clamp(finite(settings.pressureInfluence, 0), 0, 1),
    speedInfluence: clamp(finite(settings.speedInfluence, 0), 0, 1),
  };
}

function mappedRadius(
  sample: HanaGestureChannelSample,
  channel: readonly HanaGestureChannelSample[],
  settings: HanaMaterialSettings,
): number {
  const normalized = normalizedSettings(settings);
  if (normalized.mapping === "uniform") return normalized.baseRadius;
  const pressure = normalizedChannelValue(sample.pressure, channel.map((item) => item.pressure));
  const speed = normalizedChannelValue(sample.speed, channel.map((item) => item.speed));
  let mappedValue = 0.5;
  let influence = 0;
  if (normalized.mapping === "pressure") {
    mappedValue = pressure;
    influence = normalized.pressureInfluence;
  } else if (normalized.mapping === "speed") {
    mappedValue = speed;
    influence = normalized.speedInfluence;
  } else {
    const weight = normalized.pressureInfluence + normalized.speedInfluence;
    mappedValue = weight > Number.EPSILON
      ? (pressure * normalized.pressureInfluence + speed * normalized.speedInfluence) / weight
      : 0.5;
    influence = clamp(weight / 2, 0, 1);
  }
  const target = normalized.minRadius + (normalized.maxRadius - normalized.minRadius) * mappedValue;
  return normalized.baseRadius + (target - normalized.baseRadius) * influence;
}

/** Map Raw pressure/speed channels to derived radius samples. */
export function mapGestureToMaterialProfile(
  stroke: HanaViewportStroke,
  settings: HanaMaterialSettings,
  options: HanaMaterialProfileOptions = {},
): HanaMaterialProfileSample[] {
  const channel = buildGestureChannel(stroke, options);
  if (channel.length === 0) return [];
  const totalLength = channel[channel.length - 1].arcLength;
  const requestedCount = Math.trunc(options.sampleCount ?? channel.length);
  const count = Math.max(1, Math.min(4096, requestedCount));
  return Array.from({ length: count }, (_, index) => {
    const arcLength = count === 1 ? 0 : totalLength * index / (count - 1);
    const sample = channelAtArcLength(channel, arcLength);
    return {
      arcLength,
      radius: mappedRadius(sample, channel, settings),
      sourceGestureSample: {
        sourceGestureId: stroke.id,
        sourcePointStart: sample.sourcePointStart,
        sourcePointEnd: sample.sourcePointEnd,
        sourceT: sample.normalizedT,
      },
    };
  });
}

export function boundedMaterialProfile(
  stroke: HanaViewportStroke,
  settings: HanaMaterialSettings,
  maxSamples = 256,
): HanaMaterialProfileSample[] {
  const channel = buildGestureChannel(stroke);
  return mapGestureToMaterialProfile(stroke, settings, {
    sampleCount: Math.min(Math.max(1, maxSamples), Math.max(1, channel.length)),
  });
}

export type { HanaMaterialMappingMode };
