import * as THREE from "three";

export type HitsujiVariant = "original" | "differential-growth" | "phase-separation" | "flow-wool";

export interface DifferentialGrowthParams {
  amount: number;
  patchScale: number;
  contrast: number;
  roughness: number;
}

export interface PhaseSeparationParams {
  voidFraction: number;
  domainScale: number;
  steps: number;
  inflation: number;
  innerDepth: number;
}

export interface FlowWoolParams {
  height: number;
  density: number;
  curl: number;
  sharpness: number;
}

export interface HitsujiParams {
  seed: number;
  differential: DifferentialGrowthParams;
  phase: PhaseSeparationParams;
  flow: FlowWoolParams;
}

export const PHASE_SIZE = 24;
const PHASE_STEPS = 34;

export type PhaseFieldConditionMode = "inside" | "outside" | "surface";

export interface PhaseFieldCondition {
  mode: PhaseFieldConditionMode;
  inside: Uint8Array;
  distanceToSurface: Uint8Array;
}

export interface PhaseFieldDynamics {
  windMode?: "uniform" | "curved" | "pulsing";
  windX: number;
  windZ: number;
  curl?: number;
  pulseCycles?: number;
  cohesion: number;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash3(x: number, y: number, z: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 0.0137) * 43758.5453123);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const tz = smooth(z - zi);
  const h = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed) * 2 - 1;
  const x00 = THREE.MathUtils.lerp(h(0, 0, 0), h(1, 0, 0), tx);
  const x10 = THREE.MathUtils.lerp(h(0, 1, 0), h(1, 1, 0), tx);
  const x01 = THREE.MathUtils.lerp(h(0, 0, 1), h(1, 0, 1), tx);
  const x11 = THREE.MathUtils.lerp(h(0, 1, 1), h(1, 1, 1), tx);
  const y0 = THREE.MathUtils.lerp(x00, x10, ty);
  const y1 = THREE.MathUtils.lerp(x01, x11, ty);
  return THREE.MathUtils.lerp(y0, y1, tz);
}

function fbm(x: number, y: number, z: number, seed: number): number {
  let sum = 0;
  let amplitude = 0.58;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < 4; octave++) {
    sum += valueNoise(x * frequency, y * frequency, z * frequency, seed + octave * 101) * amplitude;
    norm += amplitude;
    amplitude *= 0.52;
    frequency *= 2.03;
  }
  return sum / norm;
}

function phaseIndex(x: number, y: number, z: number): number {
  return x + PHASE_SIZE * (y + PHASE_SIZE * z);
}

function sampleBounded(field: Float32Array, x: number, y: number, z: number): number {
  const x0Raw = Math.floor(x);
  const y0Raw = Math.floor(y);
  const z0Raw = Math.floor(z);
  const tx = x - x0Raw;
  const ty = y - y0Raw;
  const tz = z - z0Raw;
  const at = (xi: number, yi: number, zi: number) =>
    xi < 0 || xi >= PHASE_SIZE || yi < 0 || yi >= PHASE_SIZE || zi < 0 || zi >= PHASE_SIZE
      ? 0
      : field[phaseIndex(xi, yi, zi)];
  const x00 = THREE.MathUtils.lerp(at(x0Raw, y0Raw, z0Raw), at(x0Raw + 1, y0Raw, z0Raw), tx);
  const x10 = THREE.MathUtils.lerp(at(x0Raw, y0Raw + 1, z0Raw), at(x0Raw + 1, y0Raw + 1, z0Raw), tx);
  const x01 = THREE.MathUtils.lerp(at(x0Raw, y0Raw, z0Raw + 1), at(x0Raw + 1, y0Raw, z0Raw + 1), tx);
  const x11 = THREE.MathUtils.lerp(
    at(x0Raw, y0Raw + 1, z0Raw + 1),
    at(x0Raw + 1, y0Raw + 1, z0Raw + 1),
    tx,
  );
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(x00, x10, ty),
    THREE.MathUtils.lerp(x01, x11, ty),
    tz,
  );
}

/**
 * A compact Allen–Cahn-style sketch on a periodic 3D lattice.
 * It makes two domains coarsen, but is deliberately not presented as a
 * calibrated material simulation (README "Setup").
 */
export function createPhaseField(
  seed: number,
  steps = PHASE_STEPS,
  condition?: PhaseFieldCondition,
  dynamics?: PhaseFieldDynamics,
): Float32Array {
  let field = new Float32Array(PHASE_SIZE ** 3);
  let next = new Float32Array(field.length);
  const advected = new Float32Array(field.length);
  if (
    condition &&
    (condition.inside.length !== field.length || condition.distanceToSurface.length !== field.length)
  ) {
    throw new Error(`Phase field condition must contain ${field.length} voxels`);
  }
  const isActive = (index: number) =>
    !condition ||
    condition.mode === "surface" ||
    (condition.mode === "inside" ? condition.inside[index] === 1 : condition.inside[index] === 0);
  const isSurfaceSource = (index: number) =>
    condition?.mode === "surface" && condition.distanceToSurface[index] <= 1;
  for (let z = 0; z < PHASE_SIZE; z++) {
    for (let y = 0; y < PHASE_SIZE; y++) {
      for (let x = 0; x < PHASE_SIZE; x++) {
        const index = phaseIndex(x, y, z);
        if (!isActive(index)) {
          field[index] = 0;
        } else if (isSurfaceSource(index)) {
          field[index] = 0.95;
        } else {
          const random = (hash3(x, y, z, seed) * 2 - 1) * 0.22;
          field[index] = condition?.mode === "surface" ? random - 0.08 : random;
        }
      }
    }
  }

  const wrap = (v: number) => (v + PHASE_SIZE) % PHASE_SIZE;
  const windX = THREE.MathUtils.clamp(dynamics?.windX ?? 0, -0.95, 0.95);
  const windZ = THREE.MathUtils.clamp(dynamics?.windZ ?? 0, -0.95, 0.95);
  const windMode = dynamics?.windMode ?? "uniform";
  const curl = THREE.MathUtils.clamp(dynamics?.curl ?? 0, 0, 1.5);
  const pulseCycles = THREE.MathUtils.clamp(dynamics?.pulseCycles ?? 3, 1, 6);
  const cohesion = THREE.MathUtils.clamp(dynamics?.cohesion ?? 1, 0, 2);
  const hasWind = Math.abs(windX) > 1e-6 || Math.abs(windZ) > 1e-6;
  const velocityAt = (step: number): { x: number; z: number } => {
    let vx = windX;
    let vz = windZ;
    if (windMode === "curved") {
      const turn = (Math.PI * curl * step) / 80;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      vx = windX * cos - windZ * sin;
      vz = windX * sin + windZ * cos;
    }
    if (windMode === "pulsing") {
      const pulse = 0.5 - 0.5 * Math.cos((Math.PI * 2 * pulseCycles * step) / 80);
      vx *= pulse;
      vz *= pulse;
    }
    const speed = Math.hypot(vx, vz);
    if (speed > 0.95) {
      vx *= 0.95 / speed;
      vz *= 0.95 / speed;
    }
    return { x: vx, z: vz };
  };
  const stepCount = THREE.MathUtils.clamp(Math.round(steps), 0, 80);
  for (let step = 0; step < stepCount; step++) {
    let current = field;
    if (hasWind) {
      for (let z = 0; z < PHASE_SIZE; z++) {
        for (let y = 0; y < PHASE_SIZE; y++) {
          for (let x = 0; x < PHASE_SIZE; x++) {
            const index = phaseIndex(x, y, z);
            const velocity = velocityAt(step);
            advected[index] = isActive(index)
              ? sampleBounded(field, x - velocity.x, y, z - velocity.z)
              : 0;
          }
        }
      }
      current = advected;
    }
    const neighbourValue = (index: number, center: number) => (isActive(index) ? current[index] : center);
    for (let z = 0; z < PHASE_SIZE; z++) {
      for (let y = 0; y < PHASE_SIZE; y++) {
        for (let x = 0; x < PHASE_SIZE; x++) {
          const i = phaseIndex(x, y, z);
          if (!isActive(i)) {
            next[i] = 0;
            continue;
          }
          if (isSurfaceSource(i)) {
            next[i] = 0.95;
            continue;
          }
          const v = current[i];
          const neighbours =
            neighbourValue(phaseIndex(wrap(x - 1), y, z), v) +
            neighbourValue(phaseIndex(wrap(x + 1), y, z), v) +
            neighbourValue(phaseIndex(x, wrap(y - 1), z), v) +
            neighbourValue(phaseIndex(x, wrap(y + 1), z), v) +
            neighbourValue(phaseIndex(x, y, wrap(z - 1)), v) +
            neighbourValue(phaseIndex(x, y, wrap(z + 1)), v);
          const laplacian = neighbours / 6 - v;
          next[i] = THREE.MathUtils.clamp(
            v + 0.19 * cohesion * (0.72 * laplacian + v - v * v * v),
            -1,
            1,
          );
        }
      }
    }
    [field, next] = [next, field];
  }
  return field;
}

function samplePhaseField(field: Float32Array, point: THREE.Vector3, scale: number): number {
  const sampleAxis = (value: number): { i0: number; i1: number; t: number } => {
    // Base geometry is normalized to roughly [-1, 1]. Repeat the periodic
    // phase volume as scale rises, producing smaller domains without re-running.
    const u = fract((value * 0.42 * scale + 0.5) * 0.97);
    const f = u * PHASE_SIZE;
    const i0 = Math.floor(f) % PHASE_SIZE;
    return { i0, i1: (i0 + 1) % PHASE_SIZE, t: f - Math.floor(f) };
  };
  const ax = sampleAxis(point.x);
  const ay = sampleAxis(point.y);
  const az = sampleAxis(point.z);
  const at = (x: number, y: number, z: number) => field[phaseIndex(x, y, z)];
  const x00 = THREE.MathUtils.lerp(at(ax.i0, ay.i0, az.i0), at(ax.i1, ay.i0, az.i0), ax.t);
  const x10 = THREE.MathUtils.lerp(at(ax.i0, ay.i1, az.i0), at(ax.i1, ay.i1, az.i0), ax.t);
  const x01 = THREE.MathUtils.lerp(at(ax.i0, ay.i0, az.i1), at(ax.i1, ay.i0, az.i1), ax.t);
  const x11 = THREE.MathUtils.lerp(at(ax.i0, ay.i1, az.i1), at(ax.i1, ay.i1, az.i1), ax.t);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(x00, x10, ay.t),
    THREE.MathUtils.lerp(x01, x11, ay.t),
    az.t,
  );
}

function differentialGrowthDisplacement(p: THREE.Vector3, params: HitsujiParams): number {
  const controls = params.differential;
  const low = fbm(
    p.x * 1.45 * controls.patchScale,
    p.y * 1.45 * controls.patchScale,
    p.z * 1.45 * controls.patchScale,
    params.seed,
  );
  const normalized = THREE.MathUtils.clamp(low * 0.5 + 0.5, 0, 1);
  const growth = Math.pow(normalized, controls.contrast * 1.65);
  const secondary =
    0.5 +
    0.5 *
      valueNoise(
        p.x * 4.2 * controls.patchScale,
        p.y * 4.2 * controls.patchScale,
        p.z * 4.2 * controls.patchScale,
        params.seed + 71,
      );
  const surface = THREE.MathUtils.lerp(1, 0.55 + 0.9 * secondary, controls.roughness);
  return controls.amount * (0.012 + 0.205 * growth * surface);
}

function flowWoolDisplacement(p: THREE.Vector3, params: HitsujiParams): number {
  const controls = params.flow;
  // A curved directional field expressed as a phase function. Thin positive
  // ridges, not a color texture, move the actual surface along its normals.
  const warp =
    p.x +
    controls.curl *
      (0.42 * Math.sin(p.y * 2.6 + params.seed * 0.0011) +
        0.23 * Math.sin(p.z * 2.8 - p.y * 1.3));
  const cross = p.z + controls.curl * 0.18 * Math.sin(p.x * 3.1 + p.y * 1.7);
  const wave = Math.sin((8.5 + 4.8 * controls.density) * warp + controls.curl * 1.7 * Math.sin(cross * 3.2));
  const ridge = Math.pow(Math.max(0, 0.5 + 0.5 * wave), controls.sharpness);
  const uneven = 0.72 + 0.28 * (0.5 + 0.5 * fbm(p.x * 2.2, p.y * 2.2, p.z * 2.2, params.seed + 303));
  return controls.height * (0.008 + 0.205 * ridge * uneven);
}

function buildPhaseSeparationGeometry(
  base: THREE.BufferGeometry,
  params: HitsujiParams,
  phaseField: Float32Array,
): THREE.BufferGeometry {
  const basePositions = base.getAttribute("position") as THREE.BufferAttribute;
  const baseNormals = base.getAttribute("normal") as THREE.BufferAttribute;
  const phases = new Float32Array(basePositions.count);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < basePositions.count; i++) {
    p.fromBufferAttribute(basePositions, i);
    phases[i] = samplePhaseField(phaseField, p, params.phase.domainScale);
  }

  const sorted = Array.from(phases).sort((a, b) => a - b);
  const quantileIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor(params.phase.voidFraction * sorted.length)));
  // Keep the threshold finite even at "穴の量 0". Using -Infinity would
  // preserve all triangles but poison smoothstep below with NaN.
  const threshold = params.phase.voidFraction <= 0 ? sorted[0] - 1 : sorted[quantileIndex];

  // One domain remains material; the other is genuinely omitted from the
  // render geometry. This creates open boundaries (holes) rather than merely
  // painting or swelling a two-phase pattern.
  const sourceIndex = base.getIndex();
  const triangleCount = sourceIndex ? sourceIndex.count / 3 : basePositions.count / 3;
  const keptOuter: number[] = [];
  const at = (index: number) => (sourceIndex ? sourceIndex.getX(index) : index);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const a = at(triangle * 3);
    const b = at(triangle * 3 + 1);
    const c = at(triangle * 3 + 2);
    const average = (phases[a] + phases[b] + phases[c]) / 3;
    if (average >= threshold) keptOuter.push(a, b, c);
  }

  // Build a shell around the kept phase:
  // outer surface = original surface + inflation
  // inner surface = original surface - innerDepth
  // boundary walls = connect every open edge between both surfaces.
  // This closes the visible cut edges without claiming to be a volumetric
  // phase separation or a guaranteed self-intersection-free solid.
  const vertexCount = basePositions.count;
  const shellPositions = new Float32Array(vertexCount * 2 * 3);
  const writePosition = (index: number, point: THREE.Vector3) => {
    shellPositions[index * 3] = point.x;
    shellPositions[index * 3 + 1] = point.y;
    shellPositions[index * 3 + 2] = point.z;
  };
  const outer = new THREE.Vector3();
  const inner = new THREE.Vector3();
  for (let i = 0; i < vertexCount; i++) {
    p.fromBufferAttribute(basePositions, i);
    n.fromBufferAttribute(baseNormals, i);
    const domain = THREE.MathUtils.smoothstep(phases[i], threshold, Math.max(threshold + 0.001, 0.75));
    const outward = params.phase.inflation * 0.13 * domain;
    const inward = params.phase.innerDepth * 0.13;
    outer.copy(p).addScaledVector(n, outward);
    inner.copy(p).addScaledVector(n, -inward);
    writePosition(i, outer);
    writePosition(i + vertexCount, inner);
  }

  const shellIndices: number[] = [...keptOuter];
  for (let triangle = 0; triangle < keptOuter.length; triangle += 3) {
    const a = keptOuter[triangle] + vertexCount;
    const b = keptOuter[triangle + 1] + vertexCount;
    const c = keptOuter[triangle + 2] + vertexCount;
    shellIndices.push(a, c, b);
  }

  interface EdgeUse {
    a: number;
    b: number;
    count: number;
  }
  const edges = new Map<string, EdgeUse>();
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const existing = edges.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      edges.set(key, { a, b, count: 1 });
    }
  };
  for (let triangle = 0; triangle < keptOuter.length; triangle += 3) {
    const a = keptOuter[triangle];
    const b = keptOuter[triangle + 1];
    const c = keptOuter[triangle + 2];
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  let boundaryEdges = 0;
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue;
    boundaryEdges += 1;
    const aInner = edge.a + vertexCount;
    const bInner = edge.b + vertexCount;
    shellIndices.push(edge.b, edge.a, aInner, edge.b, aInner, bInner);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(shellPositions, 3));
  geometry.setIndex(shellIndices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.hitsujiPhase = {
    baseTriangles: triangleCount,
    keptTriangles: keptOuter.length / 3,
    removedPercent: triangleCount > 0 ? ((triangleCount - keptOuter.length / 3) / triangleCount) * 100 : 0,
    boundaryEdges,
    shellTriangles: shellIndices.length / 3,
  };
  return geometry;
}

export function buildVariantGeometry(
  base: THREE.BufferGeometry,
  variant: HitsujiVariant,
  params: HitsujiParams,
  phaseField: Float32Array,
): THREE.BufferGeometry {
  if (variant === "phase-separation") {
    return buildPhaseSeparationGeometry(base, params, phaseField);
  }

  const geometry = base.clone();
  const basePositions = base.getAttribute("position") as THREE.BufferAttribute;
  const baseNormals = base.getAttribute("normal") as THREE.BufferAttribute;
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(basePositions, i);
    n.fromBufferAttribute(baseNormals, i);
    const amount =
      variant === "differential-growth"
        ? differentialGrowthDisplacement(p, params)
        : variant === "flow-wool"
          ? flowWoolDisplacement(p, params)
          : 0;
    positions.setXYZ(i, p.x + n.x * amount, p.y + n.y * amount, p.z + n.z * amount);
  }
  positions.needsUpdate = true;
  // main.ts welds the GLB's repeated triangle corners first, so recomputing
  // normals here remains continuous instead of turning each face into a
  // separate flat-shaded shard.
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
