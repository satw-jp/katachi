export interface LightDrawingField {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
}

export interface LightDrawingSample {
  x: number;
  z: number;
  energy: number;
  color: [number, number, number];
}

export interface LightDrawingDomain {
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
}

export interface BuildLightDrawingFieldOptions {
  domain: LightDrawingDomain;
  emittedRayCount: number;
  width?: number;
  height?: number;
  /** A one-pass reconstruction filter, not an authored blur or source-size model. */
  reconstructionRadius?: number;
  exposure?: number;
}

/**
 * Build a deterministic receiver field in one fixed world-space domain.
 *
 * The conversion deliberately avoids per-frame percentile framing, maximum
 * normalization, and thresholding. Doubling the same ray set together with
 * `emittedRayCount` therefore preserves the image instead of changing its
 * contrast merely because more samples were requested.
 */
export function buildLightDrawingField(
  samples: readonly LightDrawingSample[],
  options: BuildLightDrawingFieldOptions,
): LightDrawingField {
  const width = positiveInteger(options.width ?? 256, "width");
  const height = positiveInteger(options.height ?? 256, "height");
  const domain = validateDomain(options.domain);
  const emittedRayCount = Math.max(1, positiveInteger(options.emittedRayCount, "emittedRayCount"));
  const reconstructionRadius = Math.max(
    0,
    Math.min(4, Math.round(options.reconstructionRadius ?? 1)),
  );
  const exposure = finiteNonNegative(options.exposure ?? 0.7, "exposure");

  let red = new Float32Array(width * height);
  let green = new Float32Array(width * height);
  let blue = new Float32Array(width * height);
  const fields = [red, green, blue];

  for (const sample of samples) {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.z)) continue;
    if (!Number.isFinite(sample.energy) || sample.energy <= 0) continue;
    const u = (sample.x - domain.minX) / domain.sizeX;
    const v = (sample.z - domain.minZ) / domain.sizeZ;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const x = u * (width - 1);
    const y = v * (height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    for (let channel = 0; channel < 3; channel++) {
      const channelEnergy = sample.energy * Math.max(0, sample.color[channel]);
      fields[channel][y0 * width + x0] += channelEnergy * (1 - fx) * (1 - fy);
      fields[channel][y0 * width + x1] += channelEnergy * fx * (1 - fy);
      fields[channel][y1 * width + x0] += channelEnergy * (1 - fx) * fy;
      fields[channel][y1 * width + x1] += channelEnergy * fx * fy;
    }
  }

  if (reconstructionRadius > 0) {
    red = blurScalarField(red, width, height, reconstructionRadius);
    green = blurScalarField(green, width, height, reconstructionRadius);
    blue = blurScalarField(blue, width, height, reconstructionRadius);
  }

  // Fixed energy relation: more samples improve convergence without silently
  // re-exposing every frame. Pixel area compensates for resolution changes.
  const sampleExposure = exposure * (width * height) / emittedRayCount;
  const toDisplay = (value: number): number => 1 - Math.exp(-Math.max(0, value) * sampleExposure);
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < red.length; index++) {
    const offset = index * 4;
    data[offset] = Math.round(toDisplay(red[index]) * 255);
    data[offset + 1] = Math.round(toDisplay(green[index]) * 255);
    data[offset + 2] = Math.round(toDisplay(blue[index]) * 255);
    data[offset + 3] = 255;
  }

  return {
    data,
    width,
    height,
    minX: domain.minX,
    minZ: domain.minZ,
    sizeX: domain.sizeX,
    sizeZ: domain.sizeZ,
  };
}

function blurScalarField(
  source: Float32Array<ArrayBuffer>,
  width: number,
  height: number,
  radius: number,
): Float32Array<ArrayBuffer> {
  const horizontal = new Float32Array(source.length);
  const output = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weight = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sampleX = Math.max(0, Math.min(width - 1, x + offset));
        const sampleWeight = radius + 1 - Math.abs(offset);
        sum += source[y * width + sampleX] * sampleWeight;
        weight += sampleWeight;
      }
      horizontal[y * width + x] = sum / weight;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weight = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sampleY = Math.max(0, Math.min(height - 1, y + offset));
        const sampleWeight = radius + 1 - Math.abs(offset);
        sum += horizontal[sampleY * width + x] * sampleWeight;
        weight += sampleWeight;
      }
      output[y * width + x] = sum / weight;
    }
  }
  return output;
}

function validateDomain(value: LightDrawingDomain): LightDrawingDomain {
  if (!Number.isFinite(value.minX) || !Number.isFinite(value.minZ)) {
    throw new Error("light-drawing domain origin must be finite");
  }
  if (!Number.isFinite(value.sizeX) || value.sizeX <= 0) {
    throw new Error("light-drawing domain sizeX must be positive");
  }
  if (!Number.isFinite(value.sizeZ) || value.sizeZ <= 0) {
    throw new Error("light-drawing domain sizeZ must be positive");
  }
  return { ...value };
}

function positiveInteger(value: number, path: string): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value;
}

function finiteNonNegative(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${path} must be non-negative`);
  return value;
}
