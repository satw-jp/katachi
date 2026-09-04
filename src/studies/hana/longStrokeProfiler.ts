export const HANA_LIVE_ISOLATION_MODES = [
  "raw-only",
  "raw-control",
  "raw-control-smooth",
  "raw-control-smooth-proxy",
  "full",
] as const;

export type HanaLiveIsolationMode = typeof HANA_LIVE_ISOLATION_MODES[number];

export const HANA_LONG_STROKE_CHECKPOINTS = [
  50,
  100,
  200,
  400,
  800,
  1600,
  3200,
  5000,
  10000,
] as const;

export const HANA_LONG_STROKE_LIVE_PROXY_CAP = 192;

export interface HanaLongStrokeStageTimings {
  pointerCallback: number;
  rawAppend: number;
  control: number;
  smooth: number;
  material: number;
  proxy: number;
  buffer: number;
  render: number;
  total: number;
}

export interface HanaLongStrokeCheckpoint {
  threshold: number;
  rawCount: number;
  liveSampleCount: number;
  liveProxySegmentCount: number;
  processedRawPrefixLength: number;
  stages: HanaLongStrokeStageTimings;
}

export interface HanaLongStrokeGap {
  fromTimestamp: number;
  toTimestamp: number;
  deltaMilliseconds: number;
  precedingStages: HanaLongStrokeStageTimings | null;
}

export interface HanaLongStrokeProfileSummary {
  mode: HanaLiveIsolationMode;
  eventCount: number;
  frameCount: number;
  maxEventLoopLag: number;
  eventLoopLagOver50: number;
  eventLoopLagOver100: number;
  largestRawGap: HanaLongStrokeGap | null;
  checkpoints: readonly HanaLongStrokeCheckpoint[];
}

interface EventRecord {
  timestamp: number;
  rawCount: number;
  stages: HanaLongStrokeStageTimings;
}

function finite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function copyStages(stages: Partial<HanaLongStrokeStageTimings> = {}): HanaLongStrokeStageTimings {
  return {
    pointerCallback: finite(stages.pointerCallback ?? 0),
    rawAppend: finite(stages.rawAppend ?? 0),
    control: finite(stages.control ?? 0),
    smooth: finite(stages.smooth ?? 0),
    material: finite(stages.material ?? 0),
    proxy: finite(stages.proxy ?? 0),
    buffer: finite(stages.buffer ?? 0),
    render: finite(stages.render ?? 0),
    total: finite(stages.total ?? 0),
  };
}

/**
 * HANA-local long-stroke profiler. It stores timings only; Raw Gesture remains
 * owned by the authoring document and is never copied by this class.
 */
export class HanaLongStrokeProfiler {
  private mode: HanaLiveIsolationMode = "full";
  private eventCount = 0;
  private frameCount = 0;
  private lastEventTimestamp: number | null = null;
  private lastFrameStages: HanaLongStrokeStageTimings | null = null;
  private largestRawGap: HanaLongStrokeGap | null = null;
  private maxEventLoopLag = 0;
  private eventLoopLagOver50 = 0;
  private eventLoopLagOver100 = 0;
  private readonly events: EventRecord[] = [];
  private readonly checkpoints = new Map<number, HanaLongStrokeCheckpoint>();

  start(mode: HanaLiveIsolationMode): void {
    this.reset();
    this.mode = mode;
  }

  reset(): void {
    this.eventCount = 0;
    this.frameCount = 0;
    this.lastEventTimestamp = null;
    this.lastFrameStages = null;
    this.largestRawGap = null;
    this.maxEventLoopLag = 0;
    this.eventLoopLagOver50 = 0;
    this.eventLoopLagOver100 = 0;
    this.events.length = 0;
    this.checkpoints.clear();
  }

  recordEvent(input: {
    timestamp: number;
    rawCount: number;
    stages: Partial<HanaLongStrokeStageTimings>;
  }): void {
    const timestamp = finite(input.timestamp);
    const stages = copyStages(input.stages);
    if (this.lastEventTimestamp !== null) {
      const deltaMilliseconds = Math.max(0, timestamp - this.lastEventTimestamp);
      if (!this.largestRawGap || deltaMilliseconds > this.largestRawGap.deltaMilliseconds) {
        this.largestRawGap = {
          fromTimestamp: this.lastEventTimestamp,
          toTimestamp: timestamp,
          deltaMilliseconds,
          precedingStages: this.lastFrameStages ? { ...this.lastFrameStages } : null,
        };
      }
    }
    this.lastEventTimestamp = timestamp;
    this.eventCount += 1;
    this.events.push({ timestamp, rawCount: Math.max(0, Math.trunc(input.rawCount)), stages });
    if (this.events.length > 256) this.events.shift();
  }

  recordFrame(input: {
    rawCount: number;
    liveSampleCount: number;
    liveProxySegmentCount: number;
    processedRawPrefixLength?: number;
    stages: Partial<HanaLongStrokeStageTimings>;
  }): void {
    const stages = copyStages(input.stages);
    this.frameCount += 1;
    this.lastFrameStages = stages;
    const rawCount = Math.max(0, Math.trunc(input.rawCount));
    const liveSampleCount = Math.max(0, Math.trunc(input.liveSampleCount));
    const liveProxySegmentCount = Math.max(0, Math.trunc(input.liveProxySegmentCount));
    const processedRawPrefixLength = Math.max(
      0,
      Math.trunc(input.processedRawPrefixLength ?? liveSampleCount),
    );
    for (const threshold of HANA_LONG_STROKE_CHECKPOINTS) {
      if (rawCount < threshold || this.checkpoints.has(threshold)) continue;
      this.checkpoints.set(threshold, {
        threshold,
        rawCount,
        liveSampleCount,
        liveProxySegmentCount,
        processedRawPrefixLength,
        stages: { ...stages },
      });
    }
  }

  recordEventLoopLag(lagMilliseconds: number): void {
    const lag = finite(lagMilliseconds);
    this.maxEventLoopLag = Math.max(this.maxEventLoopLag, lag);
    if (lag > 50) this.eventLoopLagOver50 += 1;
    if (lag > 100) this.eventLoopLagOver100 += 1;
  }

  summary(): HanaLongStrokeProfileSummary {
    return {
      mode: this.mode,
      eventCount: this.eventCount,
      frameCount: this.frameCount,
      maxEventLoopLag: this.maxEventLoopLag,
      eventLoopLagOver50: this.eventLoopLagOver50,
      eventLoopLagOver100: this.eventLoopLagOver100,
      largestRawGap: this.largestRawGap ? {
        ...this.largestRawGap,
        precedingStages: this.largestRawGap.precedingStages
          ? { ...this.largestRawGap.precedingStages }
          : null,
      } : null,
      checkpoints: HANA_LONG_STROKE_CHECKPOINTS
        .map((threshold) => this.checkpoints.get(threshold))
        .filter((checkpoint): checkpoint is HanaLongStrokeCheckpoint => checkpoint !== undefined),
    };
  }
}

export function liveIsolationModeLabel(mode: HanaLiveIsolationMode): string {
  switch (mode) {
    case "raw-only": return "A RAW ONLY";
    case "raw-control": return "B RAW + CONTROL";
    case "raw-control-smooth": return "C RAW + CONTROL + SMOOTH";
    case "raw-control-smooth-proxy": return "D RAW + CONTROL + SMOOTH + LIVE PROXY";
    case "full": return "E FULL CURRENT LIVE PATH + RENDER";
  }
}

export function formatHanaLongStrokeProfile(summary: HanaLongStrokeProfileSummary): string {
  const gap = summary.largestRawGap;
  const gapText = gap
    ? `gap ${gap.deltaMilliseconds.toFixed(1)}ms`
    : "gap —";
  return [
    liveIsolationModeLabel(summary.mode),
    `events ${summary.eventCount}`,
    `frames ${summary.frameCount}`,
    `loop max ${summary.maxEventLoopLag.toFixed(1)}ms`+
      ` >50/>100 ${summary.eventLoopLagOver50}/${summary.eventLoopLagOver100}`,
    gapText,
    `checkpoints ${summary.checkpoints.length}/${HANA_LONG_STROKE_CHECKPOINTS.length}`,
  ].join(" · ");
}
