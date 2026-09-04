export const HANA_LIVE_PROFILE_CAPACITY = 120;

export const HANA_LIVE_PROFILE_STAGES = [
  "rawAppend",
  "controlUpdate",
  "smoothUpdate",
  "materialUpdate",
  "proxyUpdate",
  "gpuUpload",
  "render",
  "totalUpdate",
] as const;

export type HanaLiveProfileStage = typeof HANA_LIVE_PROFILE_STAGES[number];

export interface HanaLivePathSample {
  kind: "event" | "frame";
  eventTimestamp: number;
  frameTimestamp: number | null;
  eventIntervalMilliseconds: number | null;
  stages: Partial<Record<HanaLiveProfileStage, number>>;
}

export interface HanaLivePathStageSummary {
  min: number;
  median: number;
  p95: number;
  max: number;
}

export interface HanaLivePathSummary {
  sampleCount: number;
  eventCount: number;
  frameCount: number;
  eventsPerSecond: number | null;
  framesPerSecond: number | null;
  eventInterval: HanaLivePathStageSummary | null;
  stages: Record<HanaLiveProfileStage, HanaLivePathStageSummary | null>;
}

function summary(values: readonly number[]): HanaLivePathStageSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    min: sorted[0],
    median: sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle],
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
    max: sorted[sorted.length - 1],
  };
}

function rate(first: number | null, last: number | null, count: number): number | null {
  if (first === null || last === null || last <= first || count < 2) return null;
  return count * 1000 / (last - first);
}

/** Small ring-buffer profiler for the live Pencil path; it never owns authoring data. */
export class HanaLivePathProfiler {
  private samples: HanaLivePathSample[] = [];
  private lastEventTimestamp: number | null = null;
  private readonly capacity: number;

  constructor(capacity = HANA_LIVE_PROFILE_CAPACITY) {
    this.capacity = capacity;
  }

  reset(): void {
    this.samples = [];
    this.lastEventTimestamp = null;
  }

  record(input: {
    kind?: "event" | "frame";
    eventTimestamp: number;
    frameTimestamp?: number | null;
    stages?: Partial<Record<HanaLiveProfileStage, number>>;
  }): HanaLivePathSample {
    const eventTimestamp = Number.isFinite(input.eventTimestamp) ? input.eventTimestamp : 0;
    const kind = input.kind ?? "event";
    const sample: HanaLivePathSample = {
      kind,
      eventTimestamp,
      frameTimestamp: input.frameTimestamp ?? null,
      eventIntervalMilliseconds: kind !== "event" || this.lastEventTimestamp === null
        ? null
        : Math.max(0, eventTimestamp - this.lastEventTimestamp),
      stages: { ...(input.stages ?? {}) },
    };
    if (kind === "event") this.lastEventTimestamp = eventTimestamp;
    const capacity = Math.max(1, Math.trunc(this.capacity));
    this.samples = [...this.samples, sample].slice(-capacity);
    return sample;
  }

  get recentSamples(): readonly HanaLivePathSample[] {
    return this.samples;
  }

  summarize(): HanaLivePathSummary {
    const eventTimestamps = this.samples
      .filter((sample) => sample.kind === "event")
      .map((sample) => sample.eventTimestamp);
    const frameTimestamps = this.samples
      .filter((sample) => sample.frameTimestamp !== null)
      .map((sample) => sample.frameTimestamp as number);
    const stages = {} as Record<HanaLiveProfileStage, HanaLivePathStageSummary | null>;
    for (const stage of HANA_LIVE_PROFILE_STAGES) {
      stages[stage] = summary(this.samples
        .map((sample) => sample.stages[stage])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
    }
    return {
      sampleCount: this.samples.length,
      eventCount: this.samples.filter((sample) => sample.kind === "event").length,
      frameCount: frameTimestamps.length,
      eventsPerSecond: eventTimestamps.length > 1
        ? rate(eventTimestamps[0], eventTimestamps[eventTimestamps.length - 1], eventTimestamps.length)
        : null,
      framesPerSecond: frameTimestamps.length > 1
        ? rate(frameTimestamps[0], frameTimestamps[frameTimestamps.length - 1], frameTimestamps.length)
        : null,
      eventInterval: summary(this.samples
        .map((sample) => sample.eventIntervalMilliseconds)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))),
      stages,
    };
  }
}

export function formatHanaLivePathSummary(summaryValue: HanaLivePathSummary): string {
  const formatStage = (stage: HanaLiveProfileStage): string => {
    const value = summaryValue.stages[stage];
    return value ? `${value.median.toFixed(2)}/${value.p95.toFixed(2)}/${value.max.toFixed(2)}` : "—";
  };
  return [
    `events ${summaryValue.eventsPerSecond === null ? "—" : summaryValue.eventsPerSecond.toFixed(1)}/s`,
    `frames ${summaryValue.framesPerSecond === null ? "—" : summaryValue.framesPerSecond.toFixed(1)}/s`,
    `raw ${formatStage("rawAppend")}`,
    `control ${formatStage("controlUpdate")}`,
    `smooth ${formatStage("smoothUpdate")}`,
    `material ${formatStage("materialUpdate")}`,
    `proxy ${formatStage("proxyUpdate")}`,
    `upload ${formatStage("gpuUpload")}`,
    `render ${formatStage("render")}`,
    `total ${formatStage("totalUpdate")}`,
  ].join(" · ");
}
