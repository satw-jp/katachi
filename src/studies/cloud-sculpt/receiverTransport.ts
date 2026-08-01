/**
 * Pure fixed-domain receiver accumulation for Hikari's CPU reference path.
 *
 * `depositedFluxRgb` stores flux per texel, not irradiance. Its channel sums
 * therefore remain comparable across texture resolutions. The renderer may
 * derive irradiance by dividing by `texelArea`, but display exposure and tone
 * mapping must stay outside this transport module.
 */

export interface FluxRgb {
  r: number;
  g: number;
  b: number;
}

export interface ReceiverFieldSpec {
  receiverId: string;
  sceneRevision: string;
  lightRevision: string;
  width: number;
  height: number;
  minU: number;
  minV: number;
  sizeU: number;
  sizeV: number;
}

export interface ReceiverTransportField extends ReceiverFieldSpec {
  texelArea: number;
  geometricCoverage: Float32Array;
  straightThroughputRgb: Float32Array;
  depositedFluxRgb: Float32Array;
}

export interface ReceiverFieldSummary {
  receiverId: string;
  sceneRevision: string;
  lightRevision: string;
  width: number;
  height: number;
  bounds: { minU: number; minV: number; sizeU: number; sizeV: number };
  integratedFluxRgb: FluxRgb;
  peakIrradianceRgb: FluxRgb;
  nonzeroTexels: number;
  fluxCentroid: { u: number; v: number } | null;
}

export interface FluxSplatResult {
  depositedRgb: FluxRgb;
  escapedRgb: FluxRgb;
}

export interface ShadowContainedResult {
  field: ReceiverTransportField;
  supportMask: Uint8Array;
  rejectedFluxRgb: FluxRgb;
}

export interface SupportLeakage {
  totalFluxRgb: FluxRgb;
  outsideFluxRgb: FluxRgb;
  ratio: number;
}

export interface EnergyLedgerInput {
  incidentRgb: FluxRgb;
  depositedRgb?: FluxRgb;
  absorbedRgb?: FluxRgb;
  reflectedRgb?: FluxRgb;
  escapedRgb?: FluxRgb;
  supportRejectedRgb?: FluxRgb;
}

export interface EnergyLedger {
  incidentRgb: FluxRgb;
  depositedRgb: FluxRgb;
  absorbedRgb: FluxRgb;
  reflectedRgb: FluxRgb;
  escapedRgb: FluxRgb;
  supportRejectedRgb: FluxRgb;
  accountedRgb: FluxRgb;
  residualRgb: FluxRgb;
  relativeResidual: number;
}

const ZERO_RGB: Readonly<FluxRgb> = { r: 0, g: 0, b: 0 };

export function createReceiverTransportField(spec: ReceiverFieldSpec): ReceiverTransportField {
  validateSpec(spec);
  const texelCount = spec.width * spec.height;
  return {
    ...spec,
    texelArea: (spec.sizeU / spec.width) * (spec.sizeV / spec.height),
    geometricCoverage: new Float32Array(texelCount),
    straightThroughputRgb: new Float32Array(texelCount * 3),
    depositedFluxRgb: new Float32Array(texelCount * 3),
  };
}

/**
 * Deposits one receiver-space sample with bilinear weights. A point inside the
 * declared domain always preserves its flux, including on the outer edge. A
 * point outside the fixed domain is classified as escaped and never reframes
 * or rescales the field.
 */
export function splatBilinearFluxRgb(
  field: ReceiverTransportField,
  u: number,
  v: number,
  flux: FluxRgb,
  sampleWeight = 1,
): FluxSplatResult {
  validateField(field);
  const weighted = scaleRgb(sanitizeRgb(flux), finiteNonNegative(sampleWeight));
  if (!Number.isFinite(u) || !Number.isFinite(v)
    || u < field.minU || u > field.minU + field.sizeU
    || v < field.minV || v > field.minV + field.sizeV) {
    return { depositedRgb: { ...ZERO_RGB }, escapedRgb: weighted };
  }

  const gridX = ((u - field.minU) / field.sizeU) * field.width - 0.5;
  const gridY = ((v - field.minV) / field.sizeV) * field.height - 0.5;
  const x0 = Math.floor(gridX);
  const y0 = Math.floor(gridY);
  const fx = gridX - x0;
  const fy = gridY - y0;
  const candidates = [
    { x: x0, y: y0, weight: (1 - fx) * (1 - fy) },
    { x: x0 + 1, y: y0, weight: fx * (1 - fy) },
    { x: x0, y: y0 + 1, weight: (1 - fx) * fy },
    { x: x0 + 1, y: y0 + 1, weight: fx * fy },
  ];
  let validWeight = 0;
  for (const candidate of candidates) {
    if (candidate.x >= 0 && candidate.x < field.width
      && candidate.y >= 0 && candidate.y < field.height) {
      validWeight += candidate.weight;
    }
  }
  if (!(validWeight > 0)) {
    return { depositedRgb: { ...ZERO_RGB }, escapedRgb: weighted };
  }
  for (const candidate of candidates) {
    if (candidate.x < 0 || candidate.x >= field.width
      || candidate.y < 0 || candidate.y >= field.height) continue;
    const weight = candidate.weight / validWeight;
    const offset = (candidate.y * field.width + candidate.x) * 3;
    field.depositedFluxRgb[offset] += weighted.r * weight;
    field.depositedFluxRgb[offset + 1] += weighted.g * weight;
    field.depositedFluxRgb[offset + 2] += weighted.b * weight;
  }
  return { depositedRgb: weighted, escapedRgb: { ...ZERO_RGB } };
}

/**
 * Applies a separable triangular reconstruction kernel. Distribution is done
 * source-first and renormalized at domain edges, so each source texel retains
 * its integrated flux rather than being duplicated by clamped reads.
 */
export function blurFluxRgbEnergyNormalized(
  field: ReceiverTransportField,
  radius: number,
): ReceiverTransportField {
  validateField(field);
  const safeRadius = Math.max(0, Math.floor(Number.isFinite(radius) ? radius : 0));
  const output = cloneField(field);
  if (safeRadius === 0) return output;
  const horizontal = scatterBlurRgb(
    field.depositedFluxRgb,
    field.width,
    field.height,
    safeRadius,
    true,
  );
  output.depositedFluxRgb = scatterBlurRgb(
    horizontal,
    field.width,
    field.height,
    safeRadius,
    false,
  );
  return output;
}

export function integrateFluxRgb(field: ReceiverTransportField): FluxRgb {
  validateField(field);
  return sumInterleavedRgb(field.depositedFluxRgb);
}

/** Compact, deterministic diagnostics for runtime CPU/GPU comparisons. */
export function summarizeReceiverField(field: ReceiverTransportField): ReceiverFieldSummary {
  validateField(field);
  const integratedFluxRgb = integrateFluxRgb(field);
  const peakIrradianceRgb = { r: 0, g: 0, b: 0 };
  let nonzeroTexels = 0;
  let weightedU = 0;
  let weightedV = 0;
  let totalWeight = 0;
  const texelSizeU = field.sizeU / field.width;
  const texelSizeV = field.sizeV / field.height;
  const inverseTexelArea = 1 / Math.max(field.texelArea, 1e-12);
  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) {
      const offset = (y * field.width + x) * 3;
      const r = field.depositedFluxRgb[offset];
      const g = field.depositedFluxRgb[offset + 1];
      const b = field.depositedFluxRgb[offset + 2];
      const weight = r + g + b;
      if (weight <= 0) continue;
      nonzeroTexels++;
      peakIrradianceRgb.r = Math.max(peakIrradianceRgb.r, r * inverseTexelArea);
      peakIrradianceRgb.g = Math.max(peakIrradianceRgb.g, g * inverseTexelArea);
      peakIrradianceRgb.b = Math.max(peakIrradianceRgb.b, b * inverseTexelArea);
      weightedU += (field.minU + (x + 0.5) * texelSizeU) * weight;
      weightedV += (field.minV + (y + 0.5) * texelSizeV) * weight;
      totalWeight += weight;
    }
  }
  return {
    receiverId: field.receiverId,
    sceneRevision: field.sceneRevision,
    lightRevision: field.lightRevision,
    width: field.width,
    height: field.height,
    bounds: {
      minU: field.minU,
      minV: field.minV,
      sizeU: field.sizeU,
      sizeV: field.sizeV,
    },
    integratedFluxRgb,
    peakIrradianceRgb,
    nonzeroTexels,
    fluxCentroid: totalWeight > 0
      ? { u: weightedU / totalWeight, v: weightedV / totalWeight }
      : null,
  };
}

/** Binary one-texel (Chebyshev) dilation used by the author-facing support contract. */
export function dilateSupport(
  support: ArrayLike<number>,
  width: number,
  height: number,
  radius = 1,
): Uint8Array {
  validateRaster(support, width, height, 1);
  const safeRadius = Math.max(0, Math.floor(Number.isFinite(radius) ? radius : 0));
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let present = false;
      for (let oy = -safeRadius; oy <= safeRadius && !present; oy++) {
        const sampleY = y + oy;
        if (sampleY < 0 || sampleY >= height) continue;
        for (let ox = -safeRadius; ox <= safeRadius; ox++) {
          const sampleX = x + ox;
          if (sampleX < 0 || sampleX >= width) continue;
          if (Number(support[sampleY * width + sampleX]) > 0) {
            present = true;
            break;
          }
        }
      }
      result[y * width + x] = present ? 1 : 0;
    }
  }
  return result;
}

export function applyShadowContainedSupport(
  field: ReceiverTransportField,
  support: ArrayLike<number>,
  expansionTexels = 1,
): ShadowContainedResult {
  validateField(field);
  const supportMask = dilateSupport(support, field.width, field.height, expansionTexels);
  const output = cloneField(field);
  const rejected = { r: 0, g: 0, b: 0 };
  for (let index = 0; index < supportMask.length; index++) {
    if (supportMask[index] !== 0) continue;
    const offset = index * 3;
    rejected.r += output.depositedFluxRgb[offset];
    rejected.g += output.depositedFluxRgb[offset + 1];
    rejected.b += output.depositedFluxRgb[offset + 2];
    output.depositedFluxRgb[offset] = 0;
    output.depositedFluxRgb[offset + 1] = 0;
    output.depositedFluxRgb[offset + 2] = 0;
  }
  return { field: output, supportMask, rejectedFluxRgb: rejected };
}

export function measureSupportLeakage(
  field: ReceiverTransportField,
  support: ArrayLike<number>,
  expansionTexels = 1,
): SupportLeakage {
  validateField(field);
  const supportMask = dilateSupport(support, field.width, field.height, expansionTexels);
  const total = integrateFluxRgb(field);
  const outside = { r: 0, g: 0, b: 0 };
  for (let index = 0; index < supportMask.length; index++) {
    if (supportMask[index] !== 0) continue;
    const offset = index * 3;
    outside.r += field.depositedFluxRgb[offset];
    outside.g += field.depositedFluxRgb[offset + 1];
    outside.b += field.depositedFluxRgb[offset + 2];
  }
  const totalScalar = total.r + total.g + total.b;
  const outsideScalar = outside.r + outside.g + outside.b;
  return {
    totalFluxRgb: total,
    outsideFluxRgb: outside,
    ratio: totalScalar > 0 ? outsideScalar / totalScalar : 0,
  };
}

export function finalizeEnergyLedger(input: EnergyLedgerInput): EnergyLedger {
  const incidentRgb = sanitizeRgb(input.incidentRgb);
  const depositedRgb = sanitizeRgb(input.depositedRgb);
  const absorbedRgb = sanitizeRgb(input.absorbedRgb);
  const reflectedRgb = sanitizeRgb(input.reflectedRgb);
  const escapedRgb = sanitizeRgb(input.escapedRgb);
  const supportRejectedRgb = sanitizeRgb(input.supportRejectedRgb);
  const accountedRgb = addRgb(
    depositedRgb,
    absorbedRgb,
    reflectedRgb,
    escapedRgb,
    supportRejectedRgb,
  );
  const residualRgb = {
    r: incidentRgb.r - accountedRgb.r,
    g: incidentRgb.g - accountedRgb.g,
    b: incidentRgb.b - accountedRgb.b,
  };
  const incidentScale = Math.max(incidentRgb.r, incidentRgb.g, incidentRgb.b, 1e-12);
  const relativeResidual = Math.max(
    Math.abs(residualRgb.r),
    Math.abs(residualRgb.g),
    Math.abs(residualRgb.b),
  ) / incidentScale;
  return {
    incidentRgb,
    depositedRgb,
    absorbedRgb,
    reflectedRgb,
    escapedRgb,
    supportRejectedRgb,
    accountedRgb,
    residualRgb,
    relativeResidual,
  };
}

function scatterBlurRgb(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): Float32Array {
  const output = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let validWeight = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const targetX = horizontal ? x + offset : x;
        const targetY = horizontal ? y : y + offset;
        if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
        validWeight += radius + 1 - Math.abs(offset);
      }
      for (let offset = -radius; offset <= radius; offset++) {
        const targetX = horizontal ? x + offset : x;
        const targetY = horizontal ? y : y + offset;
        if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
        const weight = (radius + 1 - Math.abs(offset)) / validWeight;
        const sourceOffset = (y * width + x) * 3;
        const targetOffset = (targetY * width + targetX) * 3;
        output[targetOffset] += source[sourceOffset] * weight;
        output[targetOffset + 1] += source[sourceOffset + 1] * weight;
        output[targetOffset + 2] += source[sourceOffset + 2] * weight;
      }
    }
  }
  return output;
}

function cloneField(field: ReceiverTransportField): ReceiverTransportField {
  return {
    receiverId: field.receiverId,
    sceneRevision: field.sceneRevision,
    lightRevision: field.lightRevision,
    width: field.width,
    height: field.height,
    minU: field.minU,
    minV: field.minV,
    sizeU: field.sizeU,
    sizeV: field.sizeV,
    texelArea: field.texelArea,
    geometricCoverage: field.geometricCoverage.slice(),
    straightThroughputRgb: field.straightThroughputRgb.slice(),
    depositedFluxRgb: field.depositedFluxRgb.slice(),
  };
}

function sumInterleavedRgb(values: Float32Array): FluxRgb {
  const result = { r: 0, g: 0, b: 0 };
  for (let offset = 0; offset < values.length; offset += 3) {
    result.r += values[offset];
    result.g += values[offset + 1];
    result.b += values[offset + 2];
  }
  return result;
}

function addRgb(...values: FluxRgb[]): FluxRgb {
  const result = { r: 0, g: 0, b: 0 };
  for (const value of values) {
    result.r += value.r;
    result.g += value.g;
    result.b += value.b;
  }
  return result;
}

function scaleRgb(value: FluxRgb, scalar: number): FluxRgb {
  return { r: value.r * scalar, g: value.g * scalar, b: value.b * scalar };
}

function sanitizeRgb(value: FluxRgb | undefined): FluxRgb {
  if (!value) return { ...ZERO_RGB };
  return {
    r: finiteNonNegative(value.r),
    g: finiteNonNegative(value.g),
    b: finiteNonNegative(value.b),
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function validateSpec(spec: ReceiverFieldSpec): void {
  if (!spec.receiverId || !spec.sceneRevision || !spec.lightRevision) {
    throw new TypeError("Receiver field identity and revisions must be non-empty");
  }
  if (!Number.isInteger(spec.width) || spec.width <= 0
    || !Number.isInteger(spec.height) || spec.height <= 0) {
    throw new RangeError("Receiver field dimensions must be positive integers");
  }
  if (!Number.isFinite(spec.minU) || !Number.isFinite(spec.minV)
    || !Number.isFinite(spec.sizeU) || spec.sizeU <= 0
    || !Number.isFinite(spec.sizeV) || spec.sizeV <= 0) {
    throw new RangeError("Receiver field domain must be finite with positive extent");
  }
}

function validateField(field: ReceiverTransportField): void {
  validateSpec(field);
  validateRaster(field.geometricCoverage, field.width, field.height, 1);
  validateRaster(field.straightThroughputRgb, field.width, field.height, 3);
  validateRaster(field.depositedFluxRgb, field.width, field.height, 3);
}

function validateRaster(
  raster: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0
    || raster.length !== width * height * channels) {
    throw new RangeError("Raster dimensions do not match its data length");
  }
}
