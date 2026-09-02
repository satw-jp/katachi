export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FabricationProfile {
  readonly nozzleDiameterMm: number;
  readonly filamentDiameterMm: number;
  readonly layerHeightMm: number;
  readonly lineWidthMm: number;
}

export interface FabricationSpanIntent {
  readonly id: string;
  readonly anchorA: Point3;
  readonly anchorB: Point3;
  readonly feedRateMmPerMin: number;
  readonly extrusion: {
    readonly mode: "relative";
    readonly filamentMm: number;
    readonly multiplier: number;
  };
  readonly role: "material-span";
}

export interface FeedPreset {
  readonly id: string;
  readonly label: string;
  readonly feedRateMmPerMin: number;
}

export interface ExtrusionPreset {
  readonly id: string;
  readonly label: string;
  readonly multiplier: number;
}

export interface FabricationFixture {
  /** Anchor-to-anchor spacing, in millimetres. */
  readonly spanLengthMm: number;
  /** Distance between neighbouring coupon rows, in millimetres. */
  readonly rowSpacingMm: number;
  /** Rail size along the span axis, in millimetres. */
  readonly railWidthMm: number;
  /** Rail size across the coupon rows, in millimetres. */
  readonly railDepthMm: number;
  /** Planned top Z of the rail, in millimetres. */
  readonly railHeightMm: number;
}

export interface FabricationSpanCouponConfig {
  readonly profile: FabricationProfile;
  readonly fixture: FabricationFixture;
  readonly feedPresets: readonly FeedPreset[];
  readonly extrusionPresets: readonly ExtrusionPreset[];
}

export interface PlannedTrajectory {
  readonly geometry: "straight";
  readonly start: Point3;
  readonly end: Point3;
  readonly pathLengthMm: number;
}

export interface ToolpathMove {
  readonly kind: "travel" | "extrusion";
  readonly start: Point3;
  readonly end: Point3;
  readonly feedRateMmPerMin: number;
  readonly extrusionMm?: number;
}

export interface SpanToolpath {
  readonly index: number;
  readonly intent: FabricationSpanIntent;
  readonly trajectory: PlannedTrajectory;
  readonly travelMove: ToolpathMove;
  readonly extrusionMove: ToolpathMove;
}

export interface FabricationSpanCoupon {
  readonly profile: FabricationProfile;
  readonly fixture: FabricationFixture;
  readonly spans: readonly SpanToolpath[];
  readonly moves: readonly ToolpathMove[];
  readonly travelOrigin: Point3;
  readonly dimensionsMm: {
    readonly width: number;
    readonly height: number;
  };
}

export const DEFAULT_FABRICATION_PROFILE: FabricationProfile = {
  // These are explicit research assumptions, not a copied or verified
  // Bambu Studio machine profile.
  nozzleDiameterMm: 0.8,
  filamentDiameterMm: 1.75,
  layerHeightMm: 0.4,
  lineWidthMm: 0.96,
};

export const DEFAULT_FABRICATION_FIXTURE: FabricationFixture = {
  spanLengthMm: 40,
  rowSpacingMm: 6,
  railWidthMm: 6,
  railDepthMm: 8,
  railHeightMm: 3,
};

export const DEFAULT_FEED_PRESETS: readonly FeedPreset[] = [
  { id: "F1", label: "low", feedRateMmPerMin: 600 },
  { id: "F2", label: "medium", feedRateMmPerMin: 900 },
  { id: "F3", label: "high", feedRateMmPerMin: 1200 },
];

export const DEFAULT_EXTRUSION_PRESETS: readonly ExtrusionPreset[] = [
  { id: "E1", label: "low", multiplier: 0.85 },
  { id: "E2", label: "medium", multiplier: 1.0 },
  { id: "E3", label: "high", multiplier: 1.15 },
];

const AXES = ["x", "y", "z"] as const;

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPositiveFinite(value: number, label: string): void {
  assertFiniteNumber(value, label);
  if (value <= 0) throw new Error(`${label} must be greater than zero`);
}

function validatePoint(point: Point3, label: string): void {
  if (!point || typeof point !== "object") throw new Error(`${label} is required`);
  for (const axis of AXES) assertFiniteNumber(point[axis], `${label}.${axis}`);
}

function clonePoint(point: Point3): Point3 {
  return { x: point.x, y: point.y, z: point.z };
}

export function validateFabricationProfile(profile: FabricationProfile): void {
  if (!profile || typeof profile !== "object") throw new Error("fabrication profile is required");
  assertPositiveFinite(profile.nozzleDiameterMm, "nozzle diameter");
  assertPositiveFinite(profile.filamentDiameterMm, "filament diameter");
  assertPositiveFinite(profile.layerHeightMm, "layer height");
  assertPositiveFinite(profile.lineWidthMm, "line width");
}

export function validateFabricationSpanIntent(intent: FabricationSpanIntent): void {
  if (!intent || typeof intent !== "object") throw new Error("fabrication span intent is required");
  if (typeof intent.id !== "string" || intent.id.trim().length === 0) throw new Error("span id is required");
  if (intent.role !== "material-span") throw new Error("span role must be material-span");
  if (intent.extrusion?.mode !== "relative") throw new Error("extrusion mode must be relative");
  validatePoint(intent.anchorA, "anchor A");
  validatePoint(intent.anchorB, "anchor B");
  if (intent.anchorA.x === intent.anchorB.x && intent.anchorA.y === intent.anchorB.y && intent.anchorA.z === intent.anchorB.z) {
    throw new Error("anchor A and anchor B must be different");
  }
  assertPositiveFinite(intent.feedRateMmPerMin, "feed rate");
  assertPositiveFinite(intent.extrusion.filamentMm, "filament extrusion");
  assertPositiveFinite(intent.extrusion.multiplier, "extrusion multiplier");
}

export function validateFabricationFixture(fixture: FabricationFixture): void {
  if (!fixture || typeof fixture !== "object") throw new Error("fabrication fixture is required");
  assertPositiveFinite(fixture.spanLengthMm, "span length");
  assertPositiveFinite(fixture.rowSpacingMm, "row spacing");
  assertPositiveFinite(fixture.railWidthMm, "rail width");
  assertPositiveFinite(fixture.railDepthMm, "rail depth");
  assertPositiveFinite(fixture.railHeightMm, "rail height");
}

export function calculatePathLengthMm(start: Point3, end: Point3): number {
  validatePoint(start, "path start");
  validatePoint(end, "path end");
  const length = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
  assertFiniteNumber(length, "path length");
  return length;
}

export function calculateExtrudedVolumeMm3(
  pathLengthMm: number,
  profile: FabricationProfile,
  extrusionMultiplier: number,
): number {
  assertPositiveFinite(pathLengthMm, "path length");
  validateFabricationProfile(profile);
  assertPositiveFinite(extrusionMultiplier, "extrusion multiplier");
  const volume = pathLengthMm * profile.lineWidthMm * profile.layerHeightMm * extrusionMultiplier;
  assertFiniteNumber(volume, "extruded volume");
  return volume;
}

export function calculateFilamentLengthMm(
  pathLengthMm: number,
  profile: FabricationProfile,
  extrusionMultiplier: number,
): number {
  const volume = calculateExtrudedVolumeMm3(pathLengthMm, profile, extrusionMultiplier);
  const filamentRadiusMm = profile.filamentDiameterMm / 2;
  const filamentCrossSectionMm2 = Math.PI * filamentRadiusMm * filamentRadiusMm;
  assertPositiveFinite(filamentCrossSectionMm2, "filament cross-sectional area");
  const filamentLengthMm = volume / filamentCrossSectionMm2;
  assertFiniteNumber(filamentLengthMm, "filament length");
  return filamentLengthMm;
}

export function createFabricationSpanIntent(input: {
  readonly id: string;
  readonly anchorA: Point3;
  readonly anchorB: Point3;
  readonly feedRateMmPerMin: number;
  readonly profile: FabricationProfile;
  readonly extrusionMultiplier: number;
}): FabricationSpanIntent {
  validateFabricationProfile(input.profile);
  const pathLengthMm = calculatePathLengthMm(input.anchorA, input.anchorB);
  const intent: FabricationSpanIntent = {
    id: input.id,
    anchorA: clonePoint(input.anchorA),
    anchorB: clonePoint(input.anchorB),
    feedRateMmPerMin: input.feedRateMmPerMin,
    extrusion: {
      mode: "relative",
      filamentMm: calculateFilamentLengthMm(pathLengthMm, input.profile, input.extrusionMultiplier),
      multiplier: input.extrusionMultiplier,
    },
    role: "material-span",
  };
  validateFabricationSpanIntent(intent);
  return intent;
}

export function planStraightTrajectory(intent: FabricationSpanIntent): PlannedTrajectory {
  validateFabricationSpanIntent(intent);
  const pathLengthMm = calculatePathLengthMm(intent.anchorA, intent.anchorB);
  if (pathLengthMm <= 0) throw new Error("straight trajectory must have a positive length");
  return {
    geometry: "straight",
    start: clonePoint(intent.anchorA),
    end: clonePoint(intent.anchorB),
    pathLengthMm,
  };
}

export function buildSpanToolpath(
  intent: FabricationSpanIntent,
  travelStart: Point3,
  index: number,
): SpanToolpath {
  validateFabricationSpanIntent(intent);
  validatePoint(travelStart, "travel start");
  if (!Number.isInteger(index) || index < 0) throw new Error("span index must be a non-negative integer");
  const trajectory = planStraightTrajectory(intent);
  const travelMove: ToolpathMove = {
    kind: "travel",
    start: clonePoint(travelStart),
    end: clonePoint(trajectory.start),
    feedRateMmPerMin: intent.feedRateMmPerMin,
  };
  const extrusionMove: ToolpathMove = {
    kind: "extrusion",
    start: clonePoint(trajectory.start),
    end: clonePoint(trajectory.end),
    feedRateMmPerMin: intent.feedRateMmPerMin,
    extrusionMm: intent.extrusion.filamentMm,
  };
  return { index, intent, trajectory, travelMove, extrusionMove };
}

function validatePresetIds(presets: readonly { readonly id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const preset of presets) {
    if (typeof preset.id !== "string" || preset.id.trim().length === 0) throw new Error(`${label} id is required`);
    if (ids.has(preset.id)) throw new Error(`${label} ids must be unique`);
    ids.add(preset.id);
  }
}

function validateFeedPresets(presets: readonly FeedPreset[]): void {
  if (presets.length === 0) throw new Error("at least one feed preset is required");
  validatePresetIds(presets, "feed preset");
  for (const preset of presets) assertPositiveFinite(preset.feedRateMmPerMin, `feed preset ${preset.id}`);
}

function validateExtrusionPresets(presets: readonly ExtrusionPreset[]): void {
  if (presets.length === 0) throw new Error("at least one extrusion preset is required");
  validatePresetIds(presets, "extrusion preset");
  for (const preset of presets) assertPositiveFinite(preset.multiplier, `extrusion preset ${preset.id}`);
}

export function buildFabricationSpanCoupon(config: FabricationSpanCouponConfig): FabricationSpanCoupon {
  validateFabricationProfile(config.profile);
  validateFabricationFixture(config.fixture);
  validateFeedPresets(config.feedPresets);
  validateExtrusionPresets(config.extrusionPresets);

  const spanCount = config.feedPresets.length * config.extrusionPresets.length;
  const firstY = -((spanCount - 1) * config.fixture.rowSpacingMm) / 2;
  const travelOrigin: Point3 = {
    x: -config.fixture.railWidthMm,
    y: firstY,
    z: config.fixture.railHeightMm,
  };
  let travelStart = travelOrigin;
  const spans: SpanToolpath[] = [];

  for (const [feedIndex, feedPreset] of config.feedPresets.entries()) {
    for (const [extrusionIndex, extrusionPreset] of config.extrusionPresets.entries()) {
      const index = feedIndex * config.extrusionPresets.length + extrusionIndex;
      const y = firstY + index * config.fixture.rowSpacingMm;
      const intent = createFabricationSpanIntent({
        id: `${feedPreset.id}-${extrusionPreset.id}`,
        anchorA: { x: 0, y, z: config.fixture.railHeightMm },
        anchorB: { x: config.fixture.spanLengthMm, y, z: config.fixture.railHeightMm },
        feedRateMmPerMin: feedPreset.feedRateMmPerMin,
        profile: config.profile,
        extrusionMultiplier: extrusionPreset.multiplier,
      });
      const span = buildSpanToolpath(intent, travelStart, index);
      spans.push(span);
      travelStart = span.extrusionMove.end;
    }
  }

  const railHalfDepth = config.fixture.railDepthMm / 2;
  const rowsHalfDepth = ((spanCount - 1) * config.fixture.rowSpacingMm) / 2;
  return {
    profile: { ...config.profile },
    fixture: { ...config.fixture },
    spans,
    moves: spans.flatMap((span) => [span.travelMove, span.extrusionMove]),
    travelOrigin: clonePoint(travelOrigin),
    dimensionsMm: {
      width: config.fixture.spanLengthMm + config.fixture.railWidthMm * 2,
      height: Math.max(config.fixture.railDepthMm, rowsHalfDepth * 2 + railHalfDepth * 2),
    },
  };
}

function formatGcodeNumber(value: number, decimals = 3): string {
  assertFiniteNumber(value, "G-code number");
  const normalized = Math.abs(value) < 0.0005 ? 0 : value;
  return normalized.toFixed(decimals).replace(/\.?0+$/, "") || "0";
}

function formatPoint(point: Point3): string {
  return `X${formatGcodeNumber(point.x)} Y${formatGcodeNumber(point.y)} Z${formatGcodeNumber(point.z)}`;
}

export function generateFabricationGcode(coupon: FabricationSpanCoupon): string {
  validateFabricationProfile(coupon.profile);
  validateFabricationFixture(coupon.fixture);
  if (coupon.spans.length === 0) throw new Error("cannot generate G-code for an empty coupon");
  const lines = [
    "; SKIN FABRICATION SPAN 0",
    "; RESEARCH ONLY",
    "; NOT PRINT APPROVED",
    "; MACHINE START / END NOT INCLUDED",
    "; machine-specific homing, calibration, purge, AMS and shutdown are intentionally absent",
    "; profile values are explicit research assumptions, not a verified Bambu Studio profile",
    `; nozzle = ${formatGcodeNumber(coupon.profile.nozzleDiameterMm)} mm`,
    `; filament diameter = ${formatGcodeNumber(coupon.profile.filamentDiameterMm)} mm`,
    `; line width = ${formatGcodeNumber(coupon.profile.lineWidthMm)} mm`,
    `; layer height = ${formatGcodeNumber(coupon.profile.layerHeightMm)} mm`,
    `; span count = ${coupon.spans.length}`,
    "; E values are relative; M83 declares that mode for this body",
    "M83",
    "",
  ];

  for (const span of coupon.spans) {
    validateFabricationSpanIntent(span.intent);
    const travel = span.travelMove;
    const extrusion = span.extrusionMove;
    if (travel.kind !== "travel" || extrusion.kind !== "extrusion" || extrusion.extrusionMm === undefined) {
      throw new Error(`span ${span.intent.id} has an invalid move pair`);
    }
    lines.push(
      `; span ${span.index + 1}/${coupon.spans.length}`,
      `; span id = ${span.intent.id}`,
      `; feed = ${formatGcodeNumber(span.intent.feedRateMmPerMin, 2)} mm/min`,
      `; extrusion multiplier = ${formatGcodeNumber(span.intent.extrusion.multiplier, 3)}`,
      `; filament = ${formatGcodeNumber(span.intent.extrusion.filamentMm, 5)} mm`,
      `; anchor A = ${formatPoint(span.trajectory.start)}`,
      `; anchor B = ${formatPoint(span.trajectory.end)}`,
      `; planned trajectory = straight / ${formatGcodeNumber(span.trajectory.pathLengthMm, 3)} mm`,
      "; travel move",
      `G0 ${formatPoint(travel.end)} F${formatGcodeNumber(travel.feedRateMmPerMin, 2)}`,
      "; extrusion move",
      `G1 ${formatPoint(extrusion.end)} E${formatGcodeNumber(extrusion.extrusionMm, 5)} F${formatGcodeNumber(extrusion.feedRateMmPerMin, 2)}`,
      "",
    );
  }
  return lines.join("\n");
}
