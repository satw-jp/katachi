import type { ReceiverTransportField } from "./receiverTransport.ts";

export const OPTICAL_IMPRINT_QUERY_KEY = "opticalImprint";

export type OpticalDissolvePresetId = "solid" | "half" | "drawing";

export interface OpticalDissolveSettings {
  retention: number;
  strokeHalfWidth: number;
  causticErosion: number;
  trailReach: number;
}

/**
 * Named display presets for the query-gated Optical Dissolve Drawing
 * checkpoint. These values are presentation-only: they never alter the SDF,
 * material, receiver transport, history, persistence, or export.
 */
export const OPTICAL_DISSOLVE_PRESETS = Object.freeze({
  solid: Object.freeze({ retention: 1, strokeHalfWidth: 0, causticErosion: 0, trailReach: 0 }),
  half: Object.freeze({ retention: 0.52, strokeHalfWidth: 1.6, causticErosion: 0.45, trailReach: 5 }),
  drawing: Object.freeze({ retention: 0.18, strokeHalfWidth: 1.05, causticErosion: 0.8, trailReach: 9 }),
} satisfies Record<OpticalDissolvePresetId, Readonly<OpticalDissolveSettings>>);

export interface OpticalDissolveKeepInput {
  preset: OpticalDissolvePresetId;
  settings: OpticalDissolveSettings;
  travelled: number;
  facing: number;
  junction: number;
  caustic: number;
  stroke: number;
  angleVisibility: number;
  projectionMask: number;
}

/** Clamps only authorable drawing values. SOLID bypasses threshold math. */
export function normalizeOpticalDissolveSettings(
  settings: Partial<OpticalDissolveSettings>,
): OpticalDissolveSettings {
  return Object.freeze({
    retention: clamp(settings.retention ?? OPTICAL_DISSOLVE_PRESETS.half.retention, 0.15, 0.9),
    strokeHalfWidth: clamp(
      settings.strokeHalfWidth ?? OPTICAL_DISSOLVE_PRESETS.half.strokeHalfWidth,
      0.75,
      2.5,
    ),
    causticErosion: clamp(
      settings.causticErosion ?? OPTICAL_DISSOLVE_PRESETS.half.causticErosion,
      0,
      1,
    ),
    trailReach: clamp(settings.trailReach ?? OPTICAL_DISSOLVE_PRESETS.half.trailReach, 0, 12),
  });
}

/**
 * Deterministic scalar reference for the resolved transmitted-body mask. The
 * shader supplies its fixed receiver-coordinate stroke sample; this helper is
 * deliberately pure so the authored thresholds remain regression-testable.
 */
export function evaluateOpticalDissolveKeep(input: OpticalDissolveKeepInput): number {
  if (input.preset === "solid") return 1;
  const settings = normalizeOpticalDissolveSettings(input.settings);
  const T = smoothstep(0.35, 3.2, input.travelled);
  const E = Math.pow(1 - clamp(input.facing, 0, 1), 2.2);
  const J = clamp(input.junction, 0, 1);
  const C = clamp(input.caustic, 0, 1);
  const V = clamp(0.55 * (1 - T) + 0.2 * E + 0.15 * J + 0.1 * settings.causticErosion * C, 0, 1);
  const fill = 1 - smoothstep(settings.retention - 0.025, settings.retention + 0.025, V);
  const coreThreshold = mix(0.88, 0.48, settings.retention);
  const core = smoothstep(coreThreshold, coreThreshold + 0.1, T);
  const keepRaw = Math.max(
    core,
    fill,
    clamp(input.stroke, 0, 1) * (0.25 + 0.75 * Math.max(E, J, C)),
    0.18 * E,
  );
  return mix(1, clamp(keepRaw, 0, 1), clamp(input.angleVisibility, 0, 1) * clamp(input.projectionMask, 0, 1));
}

export interface OpticalImprintTextureData {
  width: number;
  height: number;
  /** RGBA8: redistribution direction XY, shadow, caustic concentration. */
  structure: Uint8Array;
  /** RGBA8: delivered light RGB and redistribution strength. */
  light: Uint8Array;
  /** Normalized receiver crop containing meaningful optical support. */
  supportUv: readonly [number, number, number, number];
  diagnostics: {
    coveredTexels: number;
    litTexels: number;
    causticTexels: number;
    coverageDisplayScale: number;
    lightDisplayScale: number;
    causticDisplayScale: number;
    integratedDeliveredFlux: number;
  };
}

export interface OpticalImprintViewAnchor {
  forward: readonly [number, number, number];
  right: readonly [number, number, number];
  up: readonly [number, number, number];
}

export interface OpticalImprintViewRelation {
  offset: readonly [number, number];
  alignment: number;
}

export function isOpticalImprintQueryEnabled(search: string): boolean {
  return new URLSearchParams(search).get(OPTICAL_IMPRINT_QUERY_KEY) === "1";
}

/**
 * Builds an artistic display texture from the existing physical receiver field.
 * It does not retrace rays and does not claim that its display normalization is
 * physical energy. Spatial support, redistribution, delivered colour and
 * local caustic concentration all come from the shared receiver result.
 */
export function deriveOpticalImprint(
  field: ReceiverTransportField,
): OpticalImprintTextureData {
  validateReceiverField(field);
  const pixelCount = field.width * field.height;
  const inverseTexelArea = 1 / Math.max(1e-12, field.texelArea);
  const coverage = new Float64Array(pixelCount);
  const delivered = new Float64Array(pixelCount);
  const redistribution = new Float64Array(pixelCount);
  const causticRaw = new Float64Array(pixelCount);
  let integratedDeliveredFlux = 0;
  let coveredTexels = 0;
  let litTexels = 0;

  for (let index = 0; index < pixelCount; index++) {
    const rgb = index * 3;
    coverage[index] = Math.max(0, field.geometricCoverage[index]) * inverseTexelArea;
    const deliveredLuma = luma(
      field.depositedFluxRgb[rgb],
      field.depositedFluxRgb[rgb + 1],
      field.depositedFluxRgb[rgb + 2],
    ) * inverseTexelArea;
    const straightLuma = luma(
      field.straightThroughputRgb[rgb],
      field.straightThroughputRgb[rgb + 1],
      field.straightThroughputRgb[rgb + 2],
    ) * inverseTexelArea;
    delivered[index] = Math.max(0, deliveredLuma);
    redistribution[index] = deliveredLuma - straightLuma;
    integratedDeliveredFlux += Math.max(
      0,
      field.depositedFluxRgb[rgb]
        + field.depositedFluxRgb[rgb + 1]
        + field.depositedFluxRgb[rgb + 2],
    );
    if (coverage[index] > 0) coveredTexels++;
    if (delivered[index] > 0) litTexels++;
  }

  // Robust display scales keep isolated hot texels from flattening the image.
  // These are presentation scales only; the integrated flux is retained above.
  const coverageDisplayScale = positivePercentile(coverage, 0.98);
  const lightDisplayScale = positivePercentile(delivered, 0.99);
  const redistributionDisplayScale = positivePercentile(
    Float64Array.from(redistribution, (value) => Math.abs(value)),
    0.98,
  );
  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) {
      let localSum = 0;
      let localCount = 0;
      for (let offsetY = -2; offsetY <= 2; offsetY++) {
        const sampleY = Math.min(field.height - 1, Math.max(0, y + offsetY));
        for (let offsetX = -2; offsetX <= 2; offsetX++) {
          const sampleX = Math.min(field.width - 1, Math.max(0, x + offsetX));
          localSum += delivered[sampleY * field.width + sampleX];
          localCount++;
        }
      }
      const index = y * field.width + x;
      const localMean = localSum / Math.max(1, localCount);
      // Caustics are local concentrations above the surrounding delivered
      // field, not simply every transmitted texel.
      causticRaw[index] = Math.max(0, delivered[index] - localMean);
    }
  }
  const caustic = blurScalarField(causticRaw, field.width, field.height, 3);
  const causticDisplayScale = positivePercentile(caustic, 0.985);
  const supportUv = deriveSupportUv(
    coverage,
    delivered,
    field.width,
    field.height,
    coverageDisplayScale,
    lightDisplayScale,
  );
  const structure = new Uint8Array(pixelCount * 4);
  const light = new Uint8Array(pixelCount * 4);
  let causticTexels = 0;

  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) {
      const index = y * field.width + x;
      const target = index * 4;
      const left = redistribution[y * field.width + Math.max(0, x - 1)];
      const right = redistribution[y * field.width + Math.min(field.width - 1, x + 1)];
      const down = redistribution[Math.max(0, y - 1) * field.width + x];
      const up = redistribution[Math.min(field.height - 1, y + 1) * field.width + x];
      const gradientX = right - left;
      const gradientY = up - down;
      const gradientLength = Math.hypot(gradientX, gradientY);
      const directionX = gradientLength > 1e-12 ? gradientX / gradientLength : 0;
      const directionY = gradientLength > 1e-12 ? gradientY / gradientLength : 0;
      const redistributionStrength = tone(
        Math.abs(redistribution[index]) / redistributionDisplayScale,
      );
      const shadow = tone(coverage[index] / coverageDisplayScale);
      const causticStrength = tone(caustic[index] / causticDisplayScale);
      if (caustic[index] > causticDisplayScale * 0.1) causticTexels++;

      structure[target] = byte(0.5 + 0.5 * directionX);
      structure[target + 1] = byte(0.5 + 0.5 * directionY);
      structure[target + 2] = byte(shadow);
      structure[target + 3] = byte(causticStrength);

      const source = index * 3;
      light[target] = byte(tone(
        Math.max(0, field.depositedFluxRgb[source]) * inverseTexelArea / lightDisplayScale,
      ));
      light[target + 1] = byte(tone(
        Math.max(0, field.depositedFluxRgb[source + 1]) * inverseTexelArea / lightDisplayScale,
      ));
      light[target + 2] = byte(tone(
        Math.max(0, field.depositedFluxRgb[source + 2]) * inverseTexelArea / lightDisplayScale,
      ));
      light[target + 3] = byte(redistributionStrength);
    }
  }

  return {
    width: field.width,
    height: field.height,
    structure,
    light,
    supportUv,
    diagnostics: {
      coveredTexels,
      litTexels,
      causticTexels,
      coverageDisplayScale,
      lightDisplayScale,
      causticDisplayScale,
      integratedDeliveredFlux,
    },
  };
}

function blurScalarField(
  input: Float64Array,
  width: number,
  height: number,
  radius: number,
): Float64Array {
  const horizontal = new Float64Array(input.length);
  const output = new Float64Array(input.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const weight = radius + 1 - Math.abs(offset);
        const sampleX = Math.min(width - 1, Math.max(0, x + offset));
        sum += input[y * width + sampleX] * weight;
        weightSum += weight;
      }
      horizontal[y * width + x] = sum / weightSum;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const weight = radius + 1 - Math.abs(offset);
        const sampleY = Math.min(height - 1, Math.max(0, y + offset));
        sum += horizontal[sampleY * width + x] * weight;
        weightSum += weight;
      }
      output[y * width + x] = sum / weightSum;
    }
  }
  return output;
}

function deriveSupportUv(
  coverage: Float64Array,
  delivered: Float64Array,
  width: number,
  height: number,
  coverageScale: number,
  lightScale: number,
): readonly [number, number, number, number] {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (coverage[index] <= coverageScale * 0.02
        && delivered[index] <= lightScale * 0.01) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return [0, 0, 1, 1];
  const padX = Math.max(2, Math.ceil((maxX - minX + 1) * 0.08));
  const padY = Math.max(2, Math.ceil((maxY - minY + 1) * 0.08));
  return [
    Math.max(0, minX - padX) / width,
    Math.max(0, minY - padY) / height,
    Math.min(width, maxX + padX + 1) / width,
    Math.min(height, maxY + padY + 1) / height,
  ];
}

export function opticalImprintViewRelation(
  anchor: OpticalImprintViewAnchor,
  currentForward: readonly [number, number, number],
): OpticalImprintViewRelation {
  const forward = normalize3(currentForward);
  const anchorForward = normalize3(anchor.forward);
  const anchorRight = normalize3(anchor.right);
  const anchorUp = normalize3(anchor.up);
  return {
    offset: [
      clamp(dot3(forward, anchorRight), -1, 1),
      clamp(dot3(forward, anchorUp), -1, 1),
    ],
    alignment: clamp(dot3(forward, anchorForward), 0, 1),
  };
}

function validateReceiverField(field: ReceiverTransportField): void {
  if (!Number.isInteger(field.width) || field.width <= 0
    || !Number.isInteger(field.height) || field.height <= 0) {
    throw new Error("Optical Imprint requires a positive integer receiver resolution");
  }
  if (!Number.isFinite(field.texelArea) || field.texelArea <= 0) {
    throw new Error("Optical Imprint requires a positive finite texel area");
  }
  const pixels = field.width * field.height;
  if (field.geometricCoverage.length !== pixels
    || field.straightThroughputRgb.length !== pixels * 3
    || field.depositedFluxRgb.length !== pixels * 3) {
    throw new Error("Optical Imprint receiver arrays do not match its resolution");
  }
}

function positivePercentile(values: Float64Array, percentile: number): number {
  const positive = Array.from(values).filter((value) => Number.isFinite(value) && value > 0);
  if (positive.length === 0) return 1;
  positive.sort((a, b) => a - b);
  const index = Math.min(
    positive.length - 1,
    Math.max(0, Math.floor((positive.length - 1) * percentile)),
  );
  return Math.max(1e-12, positive[index]);
}

function tone(value: number): number {
  return 1 - Math.exp(-Math.max(0, Number.isFinite(value) ? value : 0));
}

function luma(r: number, g: number, b: number): number {
  return Math.max(0, r) * 0.2126 + Math.max(0, g) * 0.7152 + Math.max(0, b) * 0.0722;
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

function dot3(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3(value: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-12) return [0, 0, -1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
