import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import type { ComposerSource } from "../source/composerSource.ts";
import { composerBudget, type ComposerBudget } from "./moduleBudget.ts";
import { DEFAULT_COMPOSER_STATE, type ComposerCameraMode, type ComposerColorSource, type ComposerPalette, type ComposerState } from "./state.ts";

interface SpriteDatum {
  readonly position: THREE.Vector3;
  readonly size: number;
  readonly alpha: number;
  readonly phase: number;
  readonly layer: number;
  readonly metric: number;
  readonly connectivity: number;
  readonly directionChange: number;
  readonly support: number;
  readonly motif: number;
  readonly aspect: number;
  readonly angle: number;
  readonly color: THREE.Color;
  readonly drift: THREE.Vector3;
  readonly growthStart: number;
  readonly growthDuration: number;
  readonly clusterFrequency: number;
  readonly region: number;
  /** Presentation-only curve delta at unit strength (bend axis). w = t along edge. */
  readonly curveBend: THREE.Vector4;
  /** Presentation-only curve delta (sag axis). w = flow phase. */
  readonly curveSagFlow: THREE.Vector4;
}

interface SpriteLayer {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly object: THREE.Points;
}

interface LineLayer {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.LineBasicMaterial;
  readonly object: THREE.LineSegments;
  readonly starts: readonly THREE.Vector3[];
  readonly ends: readonly THREE.Vector3[];
  readonly controls: readonly THREE.Vector3[];
}

export interface ComposerFrame {
  readonly elapsedSeconds: number;
  readonly sourceFingerprint: string;
}

export interface CurveParams {
  readonly amount: number;
  readonly bend: number;
  readonly sag: number;
  readonly flow: number;
}

const CURVE_SUBDIVISIONS = 4;

const SPRITE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute vec4 aMetrics;
  attribute vec4 aShape;
  attribute vec3 aDrift;
  attribute vec3 aColor;
  attribute vec4 aTemporal;
  attribute vec4 aCurve1;
  attribute vec4 aCurve2;
  uniform float uTime;
  uniform float uAmount;
  uniform float uSize;
  uniform float uOpacity;
  uniform float uDensity;
  uniform float uFieldCompression;
  uniform float uSplatScale;
  uniform float uLightAccumulation;
  uniform float uElementMotionScale;
  uniform float uStyle;
  uniform float uDrift;
  uniform float uWave;
  uniform float uGrowth;
  uniform float uTremor;
  uniform float uAccumulation;
  uniform float uOscillation;
  uniform float uDepthSpread;
  uniform float uForegroundScale;
  uniform float uBackgroundScale;
  uniform float uFocusDisorder;
  uniform float uSpatialEcho;
  uniform float uParallax;
  uniform float uCurveAmount;
  uniform float uCurveBend;
  uniform float uCurveSag;
  uniform float uCurveFlow;
  uniform float uWarpBend;
  uniform float uWarpTwist;
  uniform float uWarpWave;
  uniform float uWarpLocal;
  uniform float uWarpScale;
  uniform float uWarpSpeed;
  uniform float uTrailLength;
  uniform float uTrailFade;
  uniform float uTrailResidue;
  uniform float uMicroDrift;
  uniform float uMicroSize;
  uniform vec3 uFieldCenter;
  uniform float uFieldSpan;
  uniform vec3 uWaveOrigins[6];
  uniform vec4 uWaveParams[6];
  varying float vAlpha;
  varying float vPhase;
  varying float vAspect;
  varying float vAngle;
  varying float vFocus;
  varying float vStyleMetric;
  varying float vMorph;
  varying float vResidue;
  varying vec3 vColor;

  vec3 applyWarp(vec3 point) {
    float span = max(uWarpScale, 0.0001);
    vec3 q = (point - uFieldCenter) / span;
    q.y += uWarpBend * q.x * q.x * 1.2;
    q.z += uWarpBend * q.x * q.x * 0.6;
    float tw = uWarpTwist * q.y * 2.6;
    float c = cos(tw);
    float s = sin(tw);
    q.xz = mat2(c, -s, s, c) * q.xz;
    q += vec3(
      sin(q.y * 2.1 + uTime * uWarpSpeed * 1.3),
      sin(q.z * 2.3 - uTime * uWarpSpeed),
      sin(q.x * 1.7 + uTime * uWarpSpeed * 0.7)
    ) * uWarpWave * 0.35;
    vec3 locus = vec3(
      sin(uTime * uWarpSpeed * 0.31) * 0.8,
      cos(uTime * uWarpSpeed * 0.23) * 0.8,
      sin(uTime * uWarpSpeed * 0.27 + 1.7) * 0.6
    );
    float dist = distance(q, locus);
    float bulge = exp(-dist * dist * 2.2) * uWarpLocal;
    q += normalize(q - locus + vec3(0.001)) * bulge * 0.8;
    return uFieldCenter + q * span;
  }

  float waveAt(vec3 point) {
    float result = 0.0;
    for (int index = 0; index < 6; index += 1) {
      vec4 wave = uWaveParams[index];
      float fi = float(index);
      vec3 dir = normalize(vec3(sin(fi * 2.4), cos(fi * 1.7), sin(fi * 1.1) * 0.5) + vec3(0.001));
      float distanceToOrigin = distance(point, uWaveOrigins[index]);
      result += sin(distanceToOrigin * wave.x - uTime * wave.y + aPhase * 6.2831) * wave.z * exp(-distanceToOrigin * wave.w);
      result += sin(dot(point - uWaveOrigins[index], dir) * 1.3 - uTime * wave.y * 0.8 + aPhase * 4.0) * wave.z * 0.5 * exp(-distanceToOrigin * wave.w * 0.7);
    }
    return result;
  }

  void main() {
    float band = floor(aTemporal.w);
    float densityThreshold = fract(aTemporal.w);
    float densityGate = densityThreshold < 0.01 ? (0.16 + clamp(uDensity, 0.0, 1.0) * 0.84) : smoothstep(densityThreshold - 0.06, densityThreshold + 0.06, clamp(uDensity / 3.0, 0.0, 1.0));
    float bandCompression = band < 0.5 ? 0.65 : band > 1.5 ? 0.85 : 1.0;
    float outlierCompression = step(0.925, aPhase) * 0.48;
    float fieldScale = mix(1.0, 0.35, clamp(uFieldCompression * mix(bandCompression, 0.35, outlierCompression), 0.0, 1.0));
    vec3 displayPosition = uFieldCenter + (position - uFieldCenter) * fieldScale;
    // Presentation-only curve re-draw: straight -> curved blend, live via uniforms.
    float edgeT = aCurve1.w;
    float curveT = sin(edgeT * 3.14159);
    vec3 bendAxis = aCurve1.xyz;
    float bendLen = length(bendAxis);
    vec3 flowAxis = bendLen > 0.0001 ? bendAxis / bendLen : vec3(0.0);
    displayPosition += bendAxis * (uCurveAmount * uCurveBend) * curveT;
    displayPosition += aCurve2.xyz * (uCurveAmount * uCurveSag) * curveT;
    displayPosition += flowAxis * sin(edgeT * 6.2831 + aCurve2.w + uTime * 0.7) * (uCurveAmount * uCurveFlow) * bendLen * 0.6;
    displayPosition = applyWarp(displayPosition);
    float wave = waveAt(displayPosition) * uWave;
    float localClock = uTime * (0.11 + aTemporal.z * 0.15) + aPhase * 18.0 + band * 1.7;
    float pause = 0.5 + 0.5 * sin(localClock * 0.37 + aMetrics.z * 5.0);
    // DRIFT: per-region direction and speed so local patches move differently.
    float region = band;
    float regionAngle = region * 1.0472 + aPhase * 0.6;
    float cosR = cos(regionAngle);
    float sinR = sin(regionAngle);
    vec3 regionDrift = vec3(aDrift.x * cosR - aDrift.y * sinR, aDrift.x * sinR + aDrift.y * cosR, aDrift.z);
    float regionSpeed = 0.5 + fract(region * 0.37 + aPhase) * 0.9;
    float driftDecision = sin(localClock * 0.63 + aMetrics.x * 9.0) * 0.5 + 0.5;
    // GROWTH: slow spatial sweep so relations appear in order, not a global pulse.
    float distToCenter = distance(displayPosition, uFieldCenter) / max(uFieldSpan, 0.0001);
    float growthPhase = fract(max(0.0, uTime * (0.05 + aTemporal.y * 0.012) - aTemporal.x - distToCenter * 0.35));
    float growthReveal = smoothstep(0.04, 0.34, growthPhase) * (1.0 - smoothstep(0.8, 0.99, growthPhase) * 0.72);
    float growth = mix(1.0, 0.18 + 0.82 * growthReveal, uGrowth * (0.62 + aMetrics.w * 0.24));
    // TREMOR: quiet / fine / occasional-burst mix by region instead of uniform shake.
    float tremorKind = mod(region, 3.0);
    float tremorGate = tremorKind < 0.5 ? 0.15 : tremorKind < 1.5 ? 1.0 : step(0.72, 0.5 + 0.5 * sin(localClock * 0.11 + aPhase * 31.0));
    float tremorFreq = tremorKind < 0.5 ? 0.38 : tremorKind < 1.5 ? 1.6 : 0.7;
    float hesitation = sin(uTime * (tremorFreq + aMetrics.z * 1.1 + aTemporal.z) + aPhase * 27.0 + aTemporal.w) * aMetrics.z * uTremor * tremorGate;
    // OSCILLATION: cluster-quantized frequency/phase so clusters do not sync globally.
    float bandFreq = 0.14 + region * 0.09 + aTemporal.z * 0.2;
    float oscillation = sin(uTime * (0.19 + bandFreq * 0.42) + aPhase * 14.0 + region * 2.1 + aTemporal.w * 2.1);
    float residue = uAccumulation * (0.11 + 0.12 * (0.5 + 0.5 * sin(localClock * 0.21 - aPhase * 9.0))) + uTrailResidue * 0.12;
    vec3 animated = displayPosition;
    animated += regionDrift * uDrift * (0.4 + driftDecision * 0.46 + wave * 0.68 + pause * 0.12) * uElementMotionScale * regionSpeed;
    animated += normalize(displayPosition + regionDrift * 0.2 + vec3(0.001)) * hesitation * 0.019 * uElementMotionScale;
    animated += normalize(displayPosition + vec3(0.001)) * oscillation * uOscillation * (0.008 + aShape.x * 0.022) * uElementMotionScale;
    animated -= regionDrift * residue * (0.8 + aMetrics.z * 1.6) * uElementMotionScale;
    animated += normalize(regionDrift + vec3(0.001)) * growthReveal * uGrowth * (0.045 + aMetrics.w * 0.045) * uElementMotionScale;
    // TRAIL: ghost stretch behind the drift direction, dotted by phase.
    float trailGate = step(fract(aPhase * 7.0 + aTemporal.w), clamp(uTrailLength, 0.0, 1.0));
    animated -= normalize(regionDrift + vec3(0.001)) * uTrailLength * (0.05 + fract(aPhase * 13.0) * 0.22) * uElementMotionScale * (0.4 + uDrift);
    animated += regionDrift * uMicroDrift * uElementMotionScale;
    animated.z += (aShape.w - 1.0) * uDepthSpread * uSpatialEcho * 0.26;
    animated += vec3(wave * 0.014 * uParallax, sin(wave * 3.0 + aPhase + band) * 0.012 * uParallax, wave * 0.022 * uParallax) * uElementMotionScale;
    vec4 mv = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * mv;
    float depthScale = aShape.w < 0.5 ? uForegroundScale : (aShape.w > 1.5 ? uBackgroundScale : 1.0);
    float perspective = 82.0 / max(1.0, -mv.z);
    float microScale = 0.76 + growth * 0.3 + abs(oscillation) * uOscillation * 0.1;
    gl_PointSize = clamp(aSize * uSize * uSplatScale * uMicroSize * depthScale * perspective * microScale, 1.0, 260.0);
    float emission = uStyle < 0.5 ? 0.82 : mix(0.62, 1.0, clamp(uLightAccumulation / 2.0, 0.0, 1.0));
    float growthVis = mix(1.0, 0.3 + 0.7 * growthReveal, uGrowth);
    float trailDim = mix(1.0, 0.35 + 0.65 * trailGate, clamp(uTrailLength * 2.0, 0.0, 1.0) * 0.5);
    vAlpha = aAlpha * uAmount * densityGate * emission * (0.62 + 0.38 * pause) * (0.7 + aMetrics.x * 0.3) * (0.35 + 0.65 * growth) * growthVis * trailDim * (1.0 - uTrailFade * 0.25);
    vPhase = aPhase;
    vAspect = aShape.y;
    vAngle = aShape.z + hesitation * 0.35;
    vFocus = clamp(0.18 + aShape.w * 0.2 + uFocusDisorder * (0.45 - aShape.w * 0.12), 0.0, 1.0);
    vStyleMetric = clamp(aMetrics.y * 0.45 + aShape.x * 0.3 + uAccumulation * 0.18 + abs(wave) * 0.15 + abs(oscillation) * uOscillation * 0.12 + (uLightAccumulation - 1.0) * 0.12, 0.0, 1.0);
    vMorph = clamp(0.12 + abs(wave) * 0.18 + growthReveal * uGrowth * 0.5 + uAccumulation * 0.16 + aShape.x * 0.14 + abs(oscillation) * uOscillation * 0.14, 0.0, 1.0);
    vResidue = residue;
    vColor = aColor;
  }
`;

const SPRITE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uStyle;
  uniform float uHighlight;
  uniform float uBlackRetention;
  uniform float uSaturation;
  uniform float uLightAccumulation;
  varying float vAlpha;
  varying float vPhase;
  varying float vAspect;
  varying float vAngle;
  varying float vFocus;
  varying float vStyleMetric;
  varying float vMorph;
  varying float vResidue;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float cosine = cos(vAngle);
    float sine = sin(vAngle);
    vec2 rotated = vec2(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
    rotated.x /= max(0.25, vAspect);
    float radius = dot(rotated, rotated);
    if (radius > 1.0) discard;
    float disk = 1.0 - smoothstep(0.24, 0.82, radius);
    float gaussian = exp(-radius * mix(1.7, 0.5, vFocus));
    float halo = exp(-radius * 1.1) * 0.18;
    float pointShape = mix(disk, gaussian, vMorph);
    float gaussianShape = mix(gaussian, gaussian + halo, vMorph * 0.72);
    float shape = uStyle < 0.5 ? pointShape : uStyle < 1.5 ? gaussianShape : uStyle < 2.5 ? mix(gaussianShape, halo, 0.32) : gaussianShape * 0.62;
    float shimmer = 0.86 + 0.14 * sin(vPhase * 23.0 + vStyleMetric * 9.0 + vResidue * 14.0);
    float whiteResult = smoothstep(0.62, 0.98, vStyleMetric * (0.55 + uLightAccumulation * 0.45)) * uHighlight;
    vec3 color = mix(vColor, vec3(1.0, 0.97, 0.9), whiteResult);
    color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, uSaturation);
    color = min(color * (0.86 + uLightAccumulation * 0.3 + vStyleMetric * 0.8 + vMorph * 0.24), vec3(1.0));
    float residueGlow = vResidue * exp(-radius * 0.7) * 0.85;
    float alpha = (shape + halo + residueGlow) * vAlpha * uOpacity * shimmer * (1.0 - uBlackRetention * 0.18);
    gl_FragColor = vec4(color, alpha);
  }
`;

const PALETTES: Record<ComposerPalette, readonly number[]> = {
  rich: [0xe66b60, 0x48a9b6, 0xf4d58e, 0x9c7bc9, 0xf1aa76, 0xd85b87],
  red: [0x64152a, 0xa7293b, 0xe26168, 0xffb8a8, 0xffe3d5],
  blue: [0x12316c, 0x1c5a95, 0x2ba8bd, 0x7568c4, 0xd9f4ec],
  monochrome: [0x6e7772, 0xa7b2ab, 0xd9ded7, 0xffffff],
};

function clamp(value: number, min = 0, max = 1): number { return Math.max(min, Math.min(max, value)); }
function fract(value: number): number { return value - Math.floor(value); }
function smoothReveal(value: number): number { return clamp((value - 0.04) / 0.24) * (1 - clamp((value - 0.76) / 0.22) * 0.72); }
function hash(index: number, seed: number): number { const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453; return value - Math.floor(value); }
function sourceColor(source: ComposerColorSource, edge: { density: number; connectivity: number; directionChange: number; supportRole: number; motifInfluence: number; direction: THREE.Vector3 }, index: number, palette: ComposerPalette, saturation: number, contrast: number): THREE.Color {
  const sourceValue = source === "DENSITY" ? edge.density : source === "CONNECTIVITY" ? edge.connectivity : source === "DIRECTION" ? (Math.atan2(edge.direction.y, edge.direction.x) / (Math.PI * 2) + 0.5) : source === "SUPPORT" ? edge.supportRole : edge.motifInfluence;
  const colors = PALETTES[palette];
  const color = new THREE.Color(colors[Math.floor(clamp(sourceValue) * (colors.length - 1) + index * 0.31) % colors.length]);
  color.offsetHSL((sourceValue - 0.5) * 0.04, (saturation - 0.5) * 0.2, (contrast - 0.5) * 0.14);
  return color;
}

/**
 * Presentation-only curve control offset at unit strength.
 * Never mutates the source edge: returns a fresh vector derived from
 * start/end/midpoint/direction/length/local metric.
 */
export function curveControlOffset(
  edge: ComposerSource["edges"][number],
  index: number,
  seed: number,
): { bend: THREE.Vector3; sag: THREE.Vector3; flowPhase: number } {
  const up = new THREE.Vector3(0, 0, 1);
  const perp = new THREE.Vector3().crossVectors(edge.direction, up);
  if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
  perp.normalize();
  const side = (hash(index * 13 + 5, seed) - 0.5) * 2;
  const bend = perp.clone().multiplyScalar(side * edge.length * 0.35);
  const sag = new THREE.Vector3(0, 0, -(0.12 + hash(index * 17 + 9, seed) * 0.3) * edge.length);
  const flowPhase = hash(index * 19 + 3, seed) * Math.PI * 2;
  return { bend, sag, flowPhase };
}

export function curveSamplePoint(
  edge: ComposerSource["edges"][number],
  control: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  // Quadratic Bezier(start, control, end): presentation-only re-draw.
  const a = edge.start.clone().lerp(control, t);
  const b = control.clone().lerp(edge.end, t);
  return a.lerp(b, t);
}

export function curveControlPoint(
  edge: ComposerSource["edges"][number],
  params: CurveParams,
  index: number,
  seed: number,
): THREE.Vector3 {
  const { bend, sag } = curveControlOffset(edge, index, seed);
  const flowDir = bend.clone().normalize();
  if (flowDir.lengthSq() < 1e-6) flowDir.set(1, 0, 0);
  return edge.midpoint.clone()
    .addScaledVector(bend, params.bend)
    .addScaledVector(sag, params.sag)
    .addScaledVector(flowDir, Math.sin(params.flow * Math.PI + index) * edge.length * 0.2 * params.flow);
}

function nearestEdge(source: ComposerSource, position: THREE.Vector3): ComposerSource["edges"][number] { return source.edges.reduce((best, edge) => edge.midpoint.distanceToSquared(position) < best.midpoint.distanceToSquared(position) ? edge : best, source.edges[0]!); }

function spriteLayer(data: readonly SpriteDatum[], style: number): SpriteLayer {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = []; const sizes: number[] = []; const alphas: number[] = []; const phases: number[] = [];
  const metricVectors: number[] = []; const shapeVectors: number[] = [];
  const drifts: number[] = []; const colors: number[] = []; const temporals: number[] = [];
  const curve1: number[] = []; const curve2: number[] = [];
  data.forEach((datum) => {
    positions.push(datum.position.x, datum.position.y, datum.position.z); sizes.push(datum.size); alphas.push(datum.alpha); phases.push(datum.phase); metricVectors.push(datum.metric, datum.connectivity, datum.directionChange, datum.support); shapeVectors.push(datum.motif, datum.aspect, datum.angle, datum.layer); drifts.push(datum.drift.x, datum.drift.y, datum.drift.z); colors.push(datum.color.r, datum.color.g, datum.color.b); temporals.push(datum.growthStart, datum.growthDuration, datum.clusterFrequency, datum.region);
    curve1.push(datum.curveBend.x, datum.curveBend.y, datum.curveBend.z, datum.curveBend.w);
    curve2.push(datum.curveSagFlow.x, datum.curveSagFlow.y, datum.curveSagFlow.z, datum.curveSagFlow.w);
  });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  for (const [name, values, itemSize] of [["aSize", sizes, 1], ["aAlpha", alphas, 1], ["aPhase", phases, 1], ["aMetrics", metricVectors, 4], ["aShape", shapeVectors, 4], ["aDrift", drifts, 3], ["aColor", colors, 3], ["aTemporal", temporals, 4], ["aCurve1", curve1, 4], ["aCurve2", curve2, 4]] as const) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, itemSize));
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({ vertexShader: SPRITE_VERTEX, fragmentShader: SPRITE_FRAGMENT, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uSize: { value: 1 }, uOpacity: { value: style === 3 ? 0.72 : 1 }, uStyle: { value: style }, uDensity: { value: 1 }, uFieldCompression: { value: 0 }, uSplatScale: { value: 1 }, uLightAccumulation: { value: 1 }, uElementMotionScale: { value: 1 }, uDrift: { value: 0 }, uWave: { value: 0 }, uGrowth: { value: 0 }, uTremor: { value: 0 }, uAccumulation: { value: 0 }, uOscillation: { value: 0 }, uDepthSpread: { value: 1 }, uForegroundScale: { value: 1.2 }, uBackgroundScale: { value: 0.8 }, uFocusDisorder: { value: 0.65 }, uSpatialEcho: { value: 0.55 }, uParallax: { value: 0.3 }, uFieldCenter: { value: new THREE.Vector3() }, uFieldSpan: { value: 1 }, uCurveAmount: { value: 0.45 }, uCurveBend: { value: 0.35 }, uCurveSag: { value: 0.25 }, uCurveFlow: { value: 0.4 }, uWarpBend: { value: 0.12 }, uWarpTwist: { value: 0.08 }, uWarpWave: { value: 0.1 }, uWarpLocal: { value: 0.15 }, uWarpScale: { value: 1 }, uWarpSpeed: { value: 0.5 }, uTrailLength: { value: 0.5 }, uTrailFade: { value: 0.5 }, uTrailResidue: { value: 0.4 }, uMicroDrift: { value: 0 }, uMicroSize: { value: 1 }, uHighlight: { value: 0.72 }, uBlackRetention: { value: 0.65 }, uSaturation: { value: 0.8 }, uWaveOrigins: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) }, uWaveParams: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) } }, name: `skin-art-composer-sprite-${style}` });
  const object = new THREE.Points(geometry, material); object.frustumCulled = false; object.renderOrder = style === 3 ? 1 : 3;
  return { geometry, material, object };
}

function expandDensityData(data: readonly SpriteDatum[], seed: number): SpriteDatum[] {
  const thresholds = [0, 0.38, 0.7, 0.88];
  const expanded: SpriteDatum[] = [];
  data.forEach((datum, index) => {
    const region = Math.floor(datum.region);
    expanded.push({ ...datum, region });
    for (let pass = 1; pass < thresholds.length; pass += 1) {
      const radial = datum.position.clone().normalize();
      const offset = new THREE.Vector3(
        (hash(index * 31 + pass * 7, seed) - 0.5) * (0.024 + pass * 0.012),
        (hash(index * 37 + pass * 11, seed) - 0.5) * (0.024 + pass * 0.012),
        (hash(index * 41 + pass * 13, seed) - 0.5) * (0.02 + pass * 0.01),
      );
      expanded.push({
        ...datum,
        position: datum.position.clone().addScaledVector(radial, (hash(index * 43 + pass, seed) - 0.5) * 0.08).add(offset),
        size: datum.size * (0.84 + hash(index * 47 + pass * 3, seed) * 0.28),
        alpha: datum.alpha * (0.54 + hash(index * 53 + pass * 5, seed) * 0.26),
        phase: fract(datum.phase + hash(index * 59 + pass * 17, seed) * 0.12),
        region: region + thresholds[pass]!,
      });
    }
  });
  return expanded;
}

function lineLayer(source: ComposerSource, palette: ComposerPalette, seed: number): LineLayer {
  // Curved hairlines: each edge becomes CURVE_SUBDIVISIONS straight segments
  // along a presentation-only Bezier. Source topology is untouched.
  const segmentCount = source.edges.length * CURVE_SUBDIVISIONS;
  const positions = new Float32Array(segmentCount * 6);
  const colors = new Float32Array(segmentCount * 6);
  const starts: THREE.Vector3[] = [];
  const ends: THREE.Vector3[] = [];
  const controls: THREE.Vector3[] = [];
  source.edges.forEach((edge, index) => {
    const { bend, sag } = curveControlOffset(edge, index, seed);
    const control = edge.midpoint.clone().add(bend).add(sag);
    starts.push(edge.start.clone());
    ends.push(edge.end.clone());
    controls.push(control);
    const color = sourceColor("SUPPORT", edge, index, palette, 0.68, 0.56);
    for (let seg = 0; seg < CURVE_SUBDIVISIONS; seg += 1) {
      const t0 = seg / CURVE_SUBDIVISIONS;
      const t1 = (seg + 1) / CURVE_SUBDIVISIONS;
      const p0 = curveSamplePoint(edge, control, t0);
      const p1 = curveSamplePoint(edge, control, t1);
      const offset = (index * CURVE_SUBDIVISIONS + seg) * 6;
      positions[offset] = p0.x; positions[offset + 1] = p0.y; positions[offset + 2] = p0.z;
      positions[offset + 3] = p1.x; positions[offset + 4] = p1.y; positions[offset + 5] = p1.z;
      colors[offset] = color.r; colors[offset + 1] = color.g; colors[offset + 2] = color.b;
      colors[offset + 3] = color.r; colors[offset + 4] = color.g; colors[offset + 5] = color.b;
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, name: "skin-art-composer-hairlines" });
  const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false; object.renderOrder = 4;
  return { geometry, material, object, starts, ends, controls };
}

type LayerName = "points" | "gaussian" | "cloud" | "light" | "void" | "hairlines" | "softLines" | "micro" | "trails";

/** Camera grammar states for the auto-camera state machine. */
type CameraGrammarState = "hold" | "drift" | "orbit" | "dollyIn" | "dollyOut" | "targetShift" | "passThrough" | "slowPan" | "rollDrift";

function grammarStateForSlot(slot: number, seed: number, autoVary: number): CameraGrammarState {
  const roll = hash(slot * 977 + 13, seed);
  // With autoVary at 0, collapse to gentle drift/hold only.
  if (roll > 0.3 + autoVary * 0.7) return roll > 0.9 ? "hold" : "drift";
  const pick = hash(slot * 613 + 71, seed + 7);
  if (pick < 0.12) return "hold";
  if (pick < 0.32) return "drift";
  if (pick < 0.48) return "orbit";
  if (pick < 0.58) return "dollyIn";
  if (pick < 0.68) return "dollyOut";
  if (pick < 0.8) return "targetShift";
  if (pick < 0.88) return "passThrough";
  if (pick < 0.96) return "slowPan";
  return "rollDrift";
}

export class ComposerRuntime {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.01, 100);
  readonly controls: TrackballControls;
  private readonly artwork: HTMLElement;
  private readonly source: ComposerSource;
  private readonly budget: ComposerBudget;
  private readonly layers: Record<LayerName, SpriteLayer | LineLayer>;
  private readonly fadeScene = new THREE.Scene();
  private readonly fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fadeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  private readonly baseCamera = new THREE.Vector3(5.4, -8.2, 4.5);
  private readonly cameraTargetOrigin = new THREE.Vector3(0, 0.2, 0);
  private readonly target = new THREE.Vector3(0, 0.2, 0);
  private readonly cameraPositionWork = new THREE.Vector3();
  private readonly cameraTargetWork = new THREE.Vector3();
  private readonly cameraPositionOffset = new THREE.Vector3();
  private readonly cameraTargetOffset = new THREE.Vector3();
  private readonly smoothPositionOffset = new THREE.Vector3();
  private readonly smoothTargetOffset = new THREE.Vector3();
  private smoothRoll = 0;
  private readonly cameraAxis = new THREE.Vector3(0, 0, 1);
  private readonly cameraRightWork = new THREE.Vector3(1, 0, 0);
  private readonly cameraViewWork = new THREE.Vector3(0, 1, 0);
  private readonly userPosition = new THREE.Vector3();
  private readonly userTarget = new THREE.Vector3();
  private readonly userUp = new THREE.Vector3(0, 0, 1);
  private readonly autoPositionOffset = new THREE.Vector3();
  private readonly autoTargetOffset = new THREE.Vector3();
  private readonly defaultCameraPosition = new THREE.Vector3();
  private readonly defaultCameraTarget = new THREE.Vector3();
  private readonly defaultCameraUp = new THREE.Vector3(0, 0, 1);
  private readonly waveOrigins: THREE.Vector3[];
  private readonly waveParams = Array.from({ length: 6 }, () => new THREE.Vector4());
  private waveParamAmount = -1;
  private yawAngle = 0;
  private pitchAngle = 0;
  private rollAngle = 0;
  private lastAutoRotateSeconds = 0;
  private autoRotateResumeAt = 0;
  private smoothPauseGate = 1;
  private userInteracting = false;
  private elapsedSeconds = 0;
  private lastTick = performance.now();
  private animationFrame = 0;
  private destroyed = false;
  private playing = true;
  private state: ComposerState;

  constructor(artwork: HTMLElement, source: ComposerSource, state: ComposerState, onFrame?: (frame: ComposerFrame) => void) {
    this.artwork = artwork; this.source = source; this.state = state; this.budget = composerBudget(source);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); this.renderer.setClearColor(0x000000, 1); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.18;
    this.renderer.autoClear = false;
    this.renderer.domElement.className = "composer-canvas"; this.renderer.domElement.setAttribute("aria-label", "SKIN ART live composer artwork"); artwork.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1); this.scene.scale.setScalar(1.7); this.fitCamera(); this.camera.position.copy(this.baseCamera); this.camera.lookAt(this.target);
    // Manual camera mirrors SKIN本体 (TrackballControls, pole-free):
    // drag = rotate, wheel = zoom, right-drag = pan, touch supported.
    this.controls = new TrackballControls(this.camera, this.renderer.domElement);
    this.controls.rotateSpeed = 1.0; this.controls.zoomSpeed = 1.2; this.controls.panSpeed = 0.3; this.controls.staticMoving = true; this.controls.dynamicDampingFactor = 0.12;     this.controls.keys = ["", "", ""];
    // Stock TrackballControls gesture map (same feel as SKIN本体):
    // LEFT rotate / MIDDLE dolly / RIGHT pan, one-finger rotate,
    // two-finger dolly+pan, wheel zoom. No custom override needed.
    this.controls.target.copy(this.target); this.controls.update(); this.captureUserPose();
    this.defaultCameraPosition.copy(this.userPosition); this.defaultCameraTarget.copy(this.userTarget); this.defaultCameraUp.copy(this.userUp);
    this.applySavedCameraPose(state);
    this.controls.addEventListener("start", this.handleControlStart); this.controls.addEventListener("change", this.handleControlChange); this.controls.addEventListener("end", this.handleControlEnd);
    this.resize(); window.addEventListener("resize", this.resize);
    const fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fadeMaterial);
    fadeMesh.material.toneMapped = false;
    fadeMesh.frustumCulled = false;
    fadeMesh.renderOrder = -10;
    this.fadeScene.add(fadeMesh);
    this.waveOrigins = this.createWaveOrigins();
    this.layers = this.createLayers();
    Object.values(this.layers).forEach((layer) => this.scene.add(layer.object));
    this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld(true);
    this.tick = this.tick.bind(this); this.animationFrame = window.requestAnimationFrame(this.tick); onFrame?.({ elapsedSeconds: 0, sourceFingerprint: source.fingerprint });
  }

  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }
  get sourceData(): ComposerSource { return this.source; }
  get budgetData(): ComposerBudget { return this.budget; }
  get timeSeconds(): number { return this.elapsedSeconds; }
  get isPlaying(): boolean { return this.playing; }
  setPlaying(playing: boolean): void { this.playing = playing; }
  setState(state: ComposerState): void { this.state = state; }
  stateData(): ComposerState { return { ...this.state, camera: { ...this.state.camera, ...this.cameraStatePatch() } }; }
  cameraStatePatch(): ComposerState["camera"] { this.captureUserPose(); return { ...this.state.camera, position: [this.userPosition.x, this.userPosition.y, this.userPosition.z], target: [this.userTarget.x, this.userTarget.y, this.userTarget.z], up: [this.userUp.x, this.userUp.y, this.userUp.z] }; }
  cameraData(): { mode: ComposerCameraMode; position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fov: number; autoRotate: boolean; autoRotateSpeed: number; autoRotateDirection: "CW" | "CCW" } { const pose = this.cameraStatePatch(); return { mode: pose.mode, position: [pose.position[0], pose.position[1], pose.position[2]], target: [pose.target[0], pose.target[1], pose.target[2]], up: [pose.up[0], pose.up[1], pose.up[2]], fov: this.camera.fov, autoRotate: pose.autoRotate, autoRotateSpeed: pose.autoRotateSpeed, autoRotateDirection: pose.autoRotateDirection }; }
  restart(): void { this.elapsedSeconds = 0; this.lastTick = performance.now(); this.lastAutoRotateSeconds = 0; this.yawAngle = 0; this.pitchAngle = 0; this.rollAngle = 0; this.smoothPositionOffset.set(0, 0, 0); this.smoothTargetOffset.set(0, 0, 0); this.smoothRoll = 0; this.smoothPauseGate = 1; this.playing = true; }
  resetCamera(): void { this.clearAutoOffset(); this.yawAngle = 0; this.pitchAngle = 0; this.rollAngle = 0; this.smoothPositionOffset.set(0, 0, 0); this.smoothTargetOffset.set(0, 0, 0); this.smoothRoll = 0; this.lastAutoRotateSeconds = this.elapsedSeconds; this.camera.position.copy(this.defaultCameraPosition); this.camera.up.copy(this.defaultCameraUp); this.controls.target.copy(this.defaultCameraTarget); this.camera.fov = this.state.camera.fov; this.controls.update(); this.captureUserPose(); }
  renderNow(): void {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }
  resize = (): void => { const width = Math.max(1, this.artwork.clientWidth || window.innerWidth); const height = Math.max(1, this.artwork.clientHeight || window.innerHeight); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); };

  dispose(): void { this.destroyed = true; window.cancelAnimationFrame(this.animationFrame); window.removeEventListener("resize", this.resize); this.controls.removeEventListener("start", this.handleControlStart); this.controls.removeEventListener("change", this.handleControlChange); this.controls.removeEventListener("end", this.handleControlEnd); this.controls.dispose(); Object.values(this.layers).forEach((layer) => { layer.geometry.dispose(); (layer.material as THREE.Material).dispose(); }); this.fadeScene.clear(); this.fadeMaterial.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }

  private createWaveOrigins(): THREE.Vector3[] {
    const motifOrigins = this.source.motifs.slice().sort((a, b) => b.scale - a.scale).slice(0, 3).map((motif) => motif.center.clone());
    const junctions = this.source.edges.slice().sort((a, b) => b.connectivity - a.connectivity).slice(0, 3).map((edge) => edge.midpoint.clone());
    return [...motifOrigins, ...junctions].slice(0, 6).concat(Array.from({ length: Math.max(0, 6 - motifOrigins.length - junctions.length) }, () => new THREE.Vector3()));
  }

  private fitCamera(): void {
    const points = [...this.source.nodes, ...this.source.motifs.map((motif) => motif.center)];
    const bounds = new THREE.Box3().setFromPoints(points.length ? points : [new THREE.Vector3()]);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    const direction = new THREE.Vector3(1.15, -1.35, 0.82).normalize();
    const distance = (span * 1.7) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))) * 1.42;
    this.cameraTargetOrigin.copy(center);
    this.target.copy(center);
    this.baseCamera.copy(center).addScaledVector(direction, Math.max(8.6, distance));
  }

  private zeroCurve(): { bend: THREE.Vector4; sagFlow: THREE.Vector4 } {
    return { bend: new THREE.Vector4(0, 0, 0, 0.5), sagFlow: new THREE.Vector4(0, 0, 0, 0) };
  }

  private createLayers() {
    const pointData: SpriteDatum[] = []; const gaussianData: SpriteDatum[] = []; const cloudData: SpriteDatum[] = []; const lightData: SpriteDatum[] = []; const voidData: SpriteDatum[] = []; const softLineData: SpriteDatum[] = []; const microData: SpriteDatum[] = []; const trailData: SpriteDatum[] = [];
    const palette = this.state.color.palette;
    const seed = this.state.seed;
    const curveFor = (edge: ComposerSource["edges"][number], index: number, t: number): { bend: THREE.Vector4; sagFlow: THREE.Vector4 } => {
      const { bend, sag, flowPhase } = curveControlOffset(edge, index, seed);
      return { bend: new THREE.Vector4(bend.x, bend.y, bend.z, t), sagFlow: new THREE.Vector4(sag.x, sag.y, sag.z, flowPhase) };
    };
    const makeDatum = (position: THREE.Vector3, edge: ComposerSource["edges"][number], index: number, style: "point" | "gaussian" | "cloud" | "void" | "micro" | "trail", layer: number, t = 0.5): SpriteDatum => {
      const curve = curveFor(edge, index, t);
      const base = {
        position, layer,
        size: style === "point" ? 0.046 + edge.density * 0.034 : style === "gaussian" ? 0.2 + edge.length * 0.18 + edge.motifInfluence * 0.15 : style === "cloud" ? 0.28 + edge.density * 0.36 : style === "micro" ? 0.012 + edge.density * 0.012 : style === "trail" ? 0.05 + edge.connectivity * 0.05 : 0.08 + edge.density * 0.04,
        alpha: style === "point" ? 0.34 : style === "gaussian" ? 0.38 + edge.connectivity * 0.2 : style === "cloud" ? 0.2 : style === "micro" ? 0.5 : style === "trail" ? 0.3 : 0.12,
        phase: hash(index * 11 + style.length, seed), metric: edge.density, connectivity: edge.connectivity, directionChange: edge.directionChange, support: edge.supportRole, motif: edge.motifInfluence,
        aspect: style === "gaussian" ? 0.36 + edge.length * 0.34 : style === "cloud" ? 0.6 + hash(index, seed) * 1.2 : 0.7 + hash(index * 3, seed) * 0.5,
        angle: Math.atan2(edge.direction.y, edge.direction.x) + hash(index * 4, seed) * 0.5,
        color: sourceColor(this.state.color.source, edge, index, palette, this.state.color.saturation, this.state.color.localContrast),
        drift: edge.direction.clone().multiplyScalar(0.018 + edge.directionChange * 0.026).add(new THREE.Vector3((hash(index + 19, seed) - 0.5) * 0.025, (hash(index + 23, seed) - 0.5) * 0.025, (hash(index + 29, seed) - 0.5) * 0.02)),
        growthStart: 0, growthDuration: 1, clusterFrequency: 0.5, region: index % 6,
        curveBend: curve.bend, curveSagFlow: curve.sagFlow,
      };
      return base;
    };
    const datum = (position: THREE.Vector3, edge: ComposerSource["edges"][number], index: number, style: "point" | "gaussian" | "cloud" | "void" | "micro" | "trail", layer: number, t = 0.5): SpriteDatum => { const base = makeDatum(position, edge, index, style, layer, t); return { ...base, growthStart: hash(index * 17 + 3, seed) * 1.8 + (index % 9) * 0.18, growthDuration: 0.8 + hash(index * 19 + 7, seed) * 2.6, clusterFrequency: 0.14 + hash(index * 23 + 11, seed) * 0.86, region: index % 6 }; };
    const edgeCurvePoint = (edge: ComposerSource["edges"][number], index: number, t: number): { point: THREE.Vector3; bend: THREE.Vector4; sagFlow: THREE.Vector4 } => {
      const { bend, sag, flowPhase } = curveControlOffset(edge, index, seed);
      const control = edge.midpoint.clone().add(bend).add(sag);
      return { point: curveSamplePoint(edge, control, t), bend: new THREE.Vector4(bend.x, bend.y, bend.z, t), sagFlow: new THREE.Vector4(sag.x, sag.y, sag.z, flowPhase) };
    };
    const nodes = this.source.nodes; nodes.forEach((node, index) => { const edge = nearestEdge(this.source, node); const base = datum(node.clone().add(new THREE.Vector3((hash(index, seed) - 0.5) * 0.018, (hash(index + 4, seed) - 0.5) * 0.018, 0)), edge, index, "point", 2); pointData.push({ ...base, ...this.zeroCurve() }); });
    const pointSamples = Math.min(this.budget.pointLike, Math.max(1, this.source.edges.length * 5)); const gaussianSamples = Math.min(this.budget.gaussian, Math.max(1, this.source.edges.length * 3));
    for (let index = 0; index < pointSamples; index += 1) {
      const edgeIndex = index % this.source.edges.length;
      const edge = this.source.edges[edgeIndex]!;
      const u = (hash(index * 7, seed) * 0.92) + 0.04;
      const sampled = edgeCurvePoint(edge, edgeIndex, u);
      const jitter = new THREE.Vector3((hash(index * 2, seed) - 0.5) * 0.03, (hash(index * 3, seed) - 0.5) * 0.03, (hash(index * 5, seed) - 0.5) * 0.025);
      const base = datum(sampled.point.add(jitter), edge, index + 100, "point", index % 5 === 0 ? 1 : 2, u);
      pointData.push({ ...base, curveBend: sampled.bend, curveSagFlow: sampled.sagFlow });
    }
    for (let index = 0; index < gaussianSamples; index += 1) {
      const edgeIndex = (index * 3) % this.source.edges.length;
      const edge = this.source.edges[edgeIndex]!;
      const u = (index % 7 + 1) / 8;
      const sampled = edgeCurvePoint(edge, edgeIndex, u);
      const base = datum(sampled.point, edge, index + 500, "gaussian", index % 3, u);
      gaussianData.push({ ...base, curveBend: sampled.bend, curveSagFlow: sampled.sagFlow });
    }
    const ribbonSamples = Math.min(this.budget.ribbonSamples, Math.max(1, this.source.edges.length * 4));
    for (let index = 0; index < ribbonSamples; index += 1) {
      const edgeIndex = index % this.source.edges.length;
      const edge = this.source.edges[edgeIndex]!;
      const u = (index % 4 + 1) / 5;
      const sampled = edgeCurvePoint(edge, edgeIndex, u);
      const sample = datum(sampled.point, edge, index + 1600, "gaussian", index % 3, u);
      softLineData.push({ ...sample, size: 0.12 + edge.length * 0.07 + edge.connectivity * 0.04, alpha: 0.16 + edge.motifInfluence * 0.1, aspect: 0.16 + edge.length * 0.2, angle: Math.atan2(edge.direction.y, edge.direction.x), curveBend: sampled.bend, curveSagFlow: sampled.sagFlow });
    }
    // Micro dust: hairline-grade particles sampled along curves + motif halos.
    const microSamples = Math.min(this.budget.micro, Math.max(1, this.source.edges.length * 6));
    for (let index = 0; index < microSamples; index += 1) {
      const edgeIndex = index % this.source.edges.length;
      const edge = this.source.edges[edgeIndex]!;
      const u = hash(index * 29 + 3, seed);
      const sampled = edgeCurvePoint(edge, edgeIndex, u);
      const jitter = new THREE.Vector3((hash(index * 31, seed) - 0.5) * 0.09, (hash(index * 37, seed) - 0.5) * 0.09, (hash(index * 41, seed) - 0.5) * 0.07);
      const base = datum(sampled.point.add(jitter), edge, index + 4100, "micro", index % 3, u);
      microData.push({ ...base, drift: base.drift.clone().multiplyScalar(2.1), curveBend: sampled.bend, curveSagFlow: sampled.sagFlow });
    }
    // Trails: ghost points stretched behind the drift direction (dotted tails).
    const trailSamples = Math.min(this.budget.trail, Math.max(1, this.source.edges.length * 2));
    for (let index = 0; index < trailSamples; index += 1) {
      const edgeIndex = (index * 2) % this.source.edges.length;
      const edge = this.source.edges[edgeIndex]!;
      const u = hash(index * 43 + 11, seed);
      const sampled = edgeCurvePoint(edge, edgeIndex, u);
      const ghostStep = 1 + (index % 3);
      const behind = sampled.point.clone().addScaledVector(edge.direction, -0.05 * ghostStep * (0.5 + hash(index * 47, seed)));
      const base = datum(behind, edge, index + 6100, "trail", index % 3, u);
      trailData.push({ ...base, alpha: base.alpha * (0.75 - ghostStep * 0.16), curveBend: sampled.bend, curveSagFlow: sampled.sagFlow });
    }
    this.source.motifs.forEach((motif, index) => {
      const edge = nearestEdge(this.source, motif.center);
      const core = datum(motif.center.clone(), edge, index + 900, "gaussian", 0);
      gaussianData.push({ ...core, ...this.zeroCurve() });
      // Light mass: bright core + wide halo so overlaps build almost-white.
      const lightCore = datum(motif.center.clone(), edge, index + 1900, "cloud", 0);
      lightData.push({ ...lightCore, size: 0.5 + motif.scale * 0.5, alpha: 0.5 + edge.motifInfluence * 0.22, aspect: 0.9 + hash(index + 4, seed) * 0.5, motif: 1, ...this.zeroCurve() });
      const lightHalo = datum(motif.center.clone(), edge, index + 2900, "cloud", 1);
      lightData.push({ ...lightHalo, size: 1.1 + motif.scale * 1.05, alpha: 0.2 + edge.motifInfluence * 0.12, aspect: 0.72 + hash(index + 9, seed) * 0.9, motif: 1, ...this.zeroCurve() });
      for (let ring = 0; ring < Math.min(18, Math.ceil(this.budget.cloud / Math.max(1, this.source.motifs.length))); ring += 1) {
        const angle = hash(ring * 3 + index, seed) * Math.PI * 2;
        const radius = motif.scale * (1.6 + hash(ring * 5 + index, seed) * 5.2);
        const base = datum(motif.center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, (hash(ring * 7 + index, seed) - 0.5) * radius)), edge, index * 31 + ring, "cloud", ring % 3);
        cloudData.push({ ...base, ...this.zeroCurve() });
      }
      // Micro halo around motifs: fine dust shells.
      for (let ring = 0; ring < 6; ring += 1) {
        const angle = hash(ring * 13 + index * 7, seed) * Math.PI * 2;
        const radius = motif.scale * (0.7 + hash(ring * 17 + index, seed) * 2.2);
        const base = datum(motif.center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, (hash(ring * 19 + index, seed) - 0.5) * radius * 0.6)), edge, index * 43 + ring + 8100, "micro", ring % 3);
        microData.push({ ...base, drift: base.drift.clone().multiplyScalar(1.6), ...this.zeroCurve() });
      }
    });
    this.source.edges.forEach((edge, index) => {
      if (index % 2 === 0) {
        const base = datum(edge.midpoint.clone(), edge, index + 1200, "void", index % 3);
        voidData.push({ ...base, ...this.zeroCurve() });
      }
      if (edge.connectivity > 0.48 || edge.motifInfluence > 0.5) {
        const direction = new THREE.Vector3(-edge.direction.y, edge.direction.x, edge.direction.z * 0.2).normalize();
        const base = datum(edge.midpoint.clone().addScaledVector(direction, 0.06 + edge.length * 0.12), edge, index + 2300, "cloud", index % 3);
        lightData.push({ ...base, size: 0.5 + edge.connectivity * 0.55 + edge.length * 0.24, alpha: 0.24 + edge.connectivity * 0.22, aspect: 0.46 + edge.length * 0.22, motif: Math.max(edge.motifInfluence, 0.62), ...this.zeroCurve() });
      }
    });
    return {
      points: spriteLayer(expandDensityData(pointData, seed), 0),
      gaussian: spriteLayer(expandDensityData(gaussianData, seed + 101), 1),
      cloud: spriteLayer(expandDensityData(cloudData.slice(0, this.budget.cloud), seed + 211), 2),
      light: spriteLayer(expandDensityData(lightData.slice(0, Math.max(1, Math.floor(this.budget.cloud * 0.72))), seed + 307), 2),
      void: spriteLayer(expandDensityData(voidData, seed + 401), 3),
      hairlines: lineLayer(this.source, palette, seed),
      softLines: spriteLayer(expandDensityData(softLineData, seed + 503), 1),
      micro: spriteLayer(expandDensityData(microData, seed + 701), 0),
      trails: spriteLayer(expandDensityData(trailData, seed + 809), 1),
    };
  }

  private updateSprite(layer: SpriteLayer, amount: number, styleSize: number, opacityOverride?: number, microSize = 1, microDrift = 0): void {
    if (this.waveParamAmount !== this.state.motion.wave) { this.waveParamAmount = this.state.motion.wave; this.waveParams.forEach((param, index) => param.set(0.78 + index * 0.19, 0.16 + index * 0.055, this.state.motion.wave * (0.2 + index * 0.035), 0.52 + index * 0.13)); }
    const uniforms = layer.material.uniforms;
    uniforms.uTime.value = this.elapsedSeconds; uniforms.uAmount.value = amount; uniforms.uSize.value = styleSize; uniforms.uDensity.value = this.state.density.amount; uniforms.uFieldCompression.value = this.state.density.compression; uniforms.uSplatScale.value = styleSize === 0.46 ? 1 : this.state.density.splatScale; uniforms.uLightAccumulation.value = this.state.density.lightAccumulation; uniforms.uElementMotionScale.value = this.state.motion.elementMotionScale; uniforms.uFieldCenter.value = this.cameraTargetOrigin; uniforms.uFieldSpan.value = Math.max(0.001, this.source.span);
    uniforms.uDrift.value = this.state.motion.drift; uniforms.uWave.value = this.state.motion.wave; uniforms.uGrowth.value = this.state.motion.growth; uniforms.uTremor.value = this.state.motion.tremor;
    uniforms.uAccumulation.value = this.state.motion.accumulation * (0.7 + this.state.trail.residue * 0.6);
    uniforms.uOscillation.value = this.state.motion.oscillation;
    uniforms.uDepthSpread.value = this.state.space.depthSpread; uniforms.uForegroundScale.value = this.state.space.foregroundScale; uniforms.uBackgroundScale.value = this.state.space.backgroundScale; uniforms.uFocusDisorder.value = this.state.space.focusDisorder; uniforms.uSpatialEcho.value = this.state.space.spatialEcho; uniforms.uParallax.value = this.state.space.parallax;
    uniforms.uCurveAmount.value = this.state.curve.amount; uniforms.uCurveBend.value = this.state.curve.bend; uniforms.uCurveSag.value = this.state.curve.sag; uniforms.uCurveFlow.value = this.state.curve.flow;
    uniforms.uWarpBend.value = this.state.warp.bend; uniforms.uWarpTwist.value = this.state.warp.twist; uniforms.uWarpWave.value = this.state.warp.wave; uniforms.uWarpLocal.value = this.state.warp.local; uniforms.uWarpScale.value = Math.max(0.2, this.state.warp.scale); uniforms.uWarpSpeed.value = this.state.warp.speed;
    uniforms.uTrailLength.value = this.state.trail.length; uniforms.uTrailFade.value = this.state.trail.fade; uniforms.uTrailResidue.value = this.state.trail.residue;
    uniforms.uMicroDrift.value = microDrift; uniforms.uMicroSize.value = microSize;
    uniforms.uHighlight.value = this.state.color.highlight; uniforms.uBlackRetention.value = this.state.color.blackRetention; uniforms.uSaturation.value = this.state.color.saturation; uniforms.uWaveOrigins.value = this.waveOrigins; uniforms.uWaveParams.value = this.waveParams;
    if (opacityOverride !== undefined) uniforms.uOpacity.value = opacityOverride;
  }

  private warpPointJs(point: THREE.Vector3): THREE.Vector3 {
    const span = Math.max(0.2, this.state.warp.scale);
    const q = point.clone().sub(this.cameraTargetOrigin).divideScalar(span);
    q.y += this.state.warp.bend * q.x * q.x * 1.2;
    q.z += this.state.warp.bend * q.x * q.x * 0.6;
    const tw = this.state.warp.twist * q.y * 2.6;
    const c = Math.cos(tw);
    const s = Math.sin(tw);
    const x = q.x * c - q.z * s;
    const z = q.x * s + q.z * c;
    q.x = x; q.z = z;
    const t = this.elapsedSeconds;
    const sp = this.state.warp.speed;
    q.x += Math.sin(q.y * 2.1 + t * sp * 1.3) * this.state.warp.wave * 0.35;
    q.y += Math.sin(q.z * 2.3 - t * sp) * this.state.warp.wave * 0.35;
    q.z += Math.sin(q.x * 1.7 + t * sp * 0.7) * this.state.warp.wave * 0.35;
    const locus = new THREE.Vector3(Math.sin(t * sp * 0.31) * 0.8, Math.cos(t * sp * 0.23) * 0.8, Math.sin(t * sp * 0.27 + 1.7) * 0.6);
    const dist = q.distanceTo(locus);
    const bulge = Math.exp(-dist * dist * 2.2) * this.state.warp.local;
    q.addScaledVector(q.clone().sub(locus).normalize(), bulge * 0.8);
    return this.cameraTargetOrigin.clone().addScaledVector(q, span);
  }

  private updateLines(layer: LineLayer, amount: number, blur: number): void {
    layer.material.opacity = amount * blur; const positions = layer.geometry.getAttribute("position") as THREE.BufferAttribute; const values = positions.array as Float32Array;
    const fieldScale = THREE.MathUtils.lerp(1, 0.35, clamp(this.state.density.compression)); const motionScale = this.state.motion.elementMotionScale;
    const curve = this.state.curve;
    this.source.edges.forEach((edge, index) => {
      const wave = this.waveAt(edge.midpoint); const localPhase = fract(this.elapsedSeconds * (0.05 + (index % 5) * 0.006) - (index % 11) * 0.08 - edge.midpoint.distanceTo(this.cameraTargetOrigin) * 0.02); const growthReveal = this.state.motion.growth <= 0 ? 1 : smoothReveal(localPhase);
      const tremorKind = (index % 6) % 3;
      const tremorGate = tremorKind === 0 ? 0.15 : tremorKind === 1 ? 1 : (Math.sin(this.elapsedSeconds * 0.4 + index) > 0.6 ? 1 : 0.1);
      const wobble = Math.sin(this.elapsedSeconds * (0.7 + edge.directionChange * 1.1) + index * 1.7) * this.state.motion.tremor * edge.directionChange * 0.018 * motionScale * tremorGate;
      const drift = edge.direction.clone().multiplyScalar((this.state.motion.drift * (0.01 + edge.supportRole * 0.016) + wave * this.state.motion.wave * 0.008) * motionScale);
      const unit = curveControlOffset(edge, index, this.state.seed);
      const control = edge.midpoint.clone()
        .addScaledVector(unit.bend, curve.amount * curve.bend)
        .addScaledVector(unit.sag, curve.amount * curve.sag);
      const applyPoint = (t: number): THREE.Vector3 => {
        const a = edge.start.clone().lerp(control, t);
        const b = control.clone().lerp(edge.end, t);
        const onCurve = a.lerp(b, t);
        const straight = edge.start.clone().lerp(edge.end, t);
        const blended = straight.lerp(onCurve, clamp(curve.amount, 0, 1));
        return this.warpPointJs(blended.sub(this.cameraTargetOrigin).multiplyScalar(fieldScale).add(this.cameraTargetOrigin).add(drift).add(new THREE.Vector3(0, 0, wobble)));
      };
      for (let seg = 0; seg < CURVE_SUBDIVISIONS; seg += 1) {
        const t0 = seg / CURVE_SUBDIVISIONS;
        const t1 = (seg + 1) / CURVE_SUBDIVISIONS;
        const growthEnd = (t: number): number => {
          if (this.state.motion.growth <= 0) return t;
          // Growth reveals along the curve: start -> end in order.
          const revealEnd = growthReveal;
          if (t <= revealEnd) return t;
          return revealEnd;
        };
        const p0 = applyPoint(Math.min(t0, growthEnd(1)));
        const p1 = applyPoint(Math.min(t1, growthEnd(1)));
        const offset = (index * CURVE_SUBDIVISIONS + seg) * 6;
        values[offset] = p0.x; values[offset + 1] = p0.y; values[offset + 2] = p0.z; values[offset + 3] = p1.x; values[offset + 4] = p1.y; values[offset + 5] = p1.z;
      }
    });
    positions.needsUpdate = true;
  }

  private waveAt(point: THREE.Vector3): number { return this.waveOrigins.reduce((sum, origin, index) => sum + Math.sin(point.distanceTo(origin) * (0.78 + index * 0.19) - this.elapsedSeconds * (0.16 + index * 0.055) + index * 0.8) * this.state.motion.wave * (0.2 + index * 0.035) * Math.exp(-point.distanceTo(origin) * (0.52 + index * 0.13)), 0); }

  private captureUserPose(): void { this.userPosition.copy(this.camera.position); this.userTarget.copy(this.controls.target); this.userUp.copy(this.camera.up); }

  private clearAutoOffset(): void { if (this.autoPositionOffset.lengthSq() > 0) this.camera.position.sub(this.autoPositionOffset); if (this.autoTargetOffset.lengthSq() > 0) this.controls.target.sub(this.autoTargetOffset); this.autoPositionOffset.set(0, 0, 0); this.autoTargetOffset.set(0, 0, 0); this.target.copy(this.controls.target); }

  private readonly handleControlStart = (): void => { this.clearAutoOffset(); this.smoothPositionOffset.set(0, 0, 0); this.smoothTargetOffset.set(0, 0, 0); this.smoothRoll = 0; this.yawAngle = 0; this.pitchAngle = 0; this.rollAngle = 0; this.lastAutoRotateSeconds = this.elapsedSeconds; this.userInteracting = true; this.autoRotateResumeAt = Number.POSITIVE_INFINITY; this.controls.update(); this.captureUserPose(); };
  private readonly handleControlChange = (): void => { if (this.autoPositionOffset.lengthSq() < 1e-10) this.captureUserPose(); };
  private readonly handleControlEnd = (): void => { this.userInteracting = false; this.autoRotateResumeAt = performance.now() + 900; this.lastAutoRotateSeconds = this.elapsedSeconds; this.captureUserPose(); };

  private applySavedCameraPose(state: ComposerState): void {
    const saved = state.camera;
    const defaultPose = DEFAULT_COMPOSER_STATE.camera;
    const hasSavedPose = saved.position.some((value, index) => Math.abs(value - defaultPose.position[index]) > 0.001) || saved.target.some((value, index) => Math.abs(value - defaultPose.target[index]) > 0.001) || saved.up.some((value, index) => Math.abs(value - defaultPose.up[index]) > 0.001);
    if (!hasSavedPose) return;
    this.camera.position.fromArray(saved.position); this.camera.up.fromArray(saved.up); this.controls.target.fromArray(saved.target); this.camera.fov = saved.fov; this.controls.update(); this.captureUserPose();
  }

  private updateCamera(deltaSeconds: number): void {
    const t = this.elapsedSeconds; const camera = this.state.camera; const now = performance.now();
    this.clearAutoOffset(); this.controls.update(); this.captureUserPose();
    // While the user is dragging, never fight the gesture: hold the user pose.
    if (this.userInteracting) {
      this.camera.fov = camera.fov; this.camera.updateProjectionMatrix();
      this.autoPositionOffset.set(0, 0, 0); this.autoTargetOffset.set(0, 0, 0);
      this.target.copy(this.controls.target);
      return;
    }
    this.camera.fov = camera.fov;
    const mode: ComposerCameraMode = camera.mode;
    const autoVary = clamp(camera.autoVary, 0, 1);
    const slotDuration = THREE.MathUtils.lerp(9, 3.5, autoVary);
    const slot = Math.floor(t / Math.max(0.5, slotDuration));
    const grammar: CameraGrammarState = mode === "MANUAL" ? "hold" : mode === "DRIFT" ? (hash(slot * 977 + 13, this.state.seed) > 0.75 ? "hold" : "drift") : grammarStateForSlot(slot, this.state.seed, autoVary);
    const viewDir = this.cameraViewWork.copy(this.userPosition).sub(this.userTarget);
    const viewDist = Math.max(0.001, viewDir.length());
    viewDir.divideScalar(viewDist);
    const right = this.cameraRightWork.crossVectors(viewDir, this.userUp);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const upTrue = new THREE.Vector3(0, 0, 1);
    // Target offsets per grammar state.
    const targetPos = this.cameraPositionOffset.set(0, 0, 0);
    const targetTgt = this.cameraTargetOffset.set(0, 0, 0);
    let targetRoll = 0;
    const orbit = camera.orbit;
    const dolly = camera.dolly;
    const shift = camera.targetShift;
    const pass = camera.passThrough;
    switch (grammar) {
      case "hold": targetPos.multiplyScalar(0); targetTgt.multiplyScalar(0); break;
      case "drift":
        targetPos.set(Math.sin(t * 0.11) * orbit * 0.22, Math.cos(t * 0.08) * dolly * 0.26, Math.sin(t * 0.07) * shift * 0.18);
        targetTgt.set(Math.sin(t * 0.09) * shift * 0.2, Math.cos(t * 0.067) * shift * 0.14, Math.sin(t * 0.053) * shift * 0.1);
        break;
      case "orbit":
        targetPos.set(Math.sin(t * 0.071) * orbit * 0.5 + Math.cos(t * 0.037) * dolly * 0.24, Math.cos(t * 0.059) * dolly * 0.42, Math.sin(t * 0.047) * shift * 0.34);
        targetTgt.set(Math.sin(t * 0.061) * shift * 0.3, Math.cos(t * 0.043) * shift * 0.22, 0);
        break;
      case "dollyIn": targetPos.addScaledVector(viewDir, -Math.sin(t * 0.05) * dolly * 0.5 - dolly * 0.2); break;
      case "dollyOut": targetPos.addScaledVector(viewDir, Math.abs(Math.sin(t * 0.045)) * dolly * 0.55 + dolly * 0.12); break;
      case "targetShift":
        targetTgt.set(Math.sin(t * 0.061) * shift * 0.5, Math.cos(t * 0.043) * shift * 0.36, Math.sin(t * 0.029) * shift * 0.26);
        targetPos.addScaledVector(right, Math.sin(t * 0.05 + 1.2) * orbit * 0.2);
        break;
      case "passThrough":
        targetPos.addScaledVector(viewDir, Math.sin(t * 0.041) * pass * 0.6);
        targetPos.addScaledVector(right, Math.sin(t * 0.13) * pass * 0.3);
        targetTgt.addScaledVector(right, Math.cos(t * 0.09) * shift * 0.2);
        break;
      case "slowPan":
        targetPos.addScaledVector(right, Math.sin(t * 0.055) * (0.2 + orbit * 0.5));
        targetTgt.addScaledVector(right, Math.sin(t * 0.055 + 0.4) * shift * 0.4);
        break;
      case "rollDrift": targetRoll = Math.sin(t * 0.06) * 0.05; break;
    }
    void upTrue;
    // Smooth state transitions so the grammar never jumps.
    const blend = 1 - Math.exp(-Math.max(0, deltaSeconds) * 2);
    this.smoothPositionOffset.lerp(targetPos, blend);
    this.smoothTargetOffset.lerp(targetTgt, blend);
    this.smoothRoll += (targetRoll - this.smoothRoll) * blend;
    // Multi-axis auto rotate as a camera orbit (object itself never rotates).
    const autoRotate = camera.autoRotate && now >= this.autoRotateResumeAt;
    if (autoRotate) {
      const elapsedDelta = Math.max(0, this.elapsedSeconds - this.lastAutoRotateSeconds);
      const axisMix = clamp(camera.autoRotateAxisMix, 0, 1);
      const vary = clamp(camera.autoRotateVary, 0, 1);
      const pauseAmount = clamp(camera.autoRotatePause, 0, 1);
      const pauseBlock = Math.floor(t / 4);
      const shouldPause = hash(pauseBlock * 31 + 7, this.state.seed) < pauseAmount * 0.55;
      const pauseTarget = shouldPause ? 0 : 1;
      this.smoothPauseGate += (pauseTarget - this.smoothPauseGate) * (1 - Math.exp(-Math.max(0, deltaSeconds) * 3));
      const modeFactor = mode === "EXPLORE" || mode === "AUTO" ? 0.58 : 1;
      const flip = hash(Math.floor(t / 7) * 57 + 3, this.state.seed) < vary * 0.35 ? -1 : 1;
      const baseDir = camera.autoRotateDirection === "CCW" ? -1 : 1;
      const speedRad = THREE.MathUtils.degToRad(camera.autoRotateSpeed) * baseDir * flip * modeFactor * this.smoothPauseGate;
      const speedFactor = 1 + vary * 0.8 * Math.sin(t * 0.31 + 1.7) + vary * 0.5 * Math.sin(t * 0.13);
      this.yawAngle += elapsedDelta * speedRad * (1 - axisMix * 0.45) * speedFactor;
      this.pitchAngle += elapsedDelta * speedRad * axisMix * 0.6 * Math.sin(t * 0.21 + 0.8);
      this.rollAngle += elapsedDelta * speedRad * axisMix * 0.25 * Math.sin(t * 0.17 + 2.1);
    }
    this.lastAutoRotateSeconds = this.elapsedSeconds;
    this.cameraPositionWork.copy(this.userPosition).add(this.smoothPositionOffset);
    this.cameraTargetWork.copy(this.userTarget).add(this.smoothTargetOffset);
    // Clamp camera distance to prevent getting too close or too far from source
    const minDist = this.source.span * 0.5;
    const maxDist = this.source.span * 3;
    const currentPos = this.cameraPositionWork.clone();
    const currentTarget = this.cameraTargetWork.clone();
    const toCurrent = currentPos.clone().sub(currentTarget);
    const currentDist = toCurrent.length();
    const clampedDist = THREE.MathUtils.clamp(currentDist, minDist, maxDist);
    const direction = toCurrent.normalize();
    this.cameraPositionWork.copy(currentTarget).addScaledVector(direction, clampedDist);
    if (autoRotate && this.smoothPauseGate > 0.001) {
      const offset = this.cameraPositionWork.sub(this.userTarget);
      offset.applyAxisAngle(this.cameraAxis.set(0, 0, 1), this.yawAngle);
      const pitchAxis = new THREE.Vector3().crossVectors(offset.clone().normalize(), new THREE.Vector3(0, 0, 1));
      if (pitchAxis.lengthSq() > 1e-8 && Math.abs(this.pitchAngle) > 1e-6) {
        pitchAxis.normalize();
        offset.applyAxisAngle(pitchAxis, this.pitchAngle);
      }
      if (Math.abs(this.rollAngle) > 1e-6) offset.applyAxisAngle(offset.clone().normalize(), this.rollAngle * 0.3);
      this.cameraPositionWork.copy(this.userTarget).add(offset);
      this.yawAngle = 0; this.pitchAngle = 0; this.rollAngle = 0;
    }
    this.autoPositionOffset.copy(this.cameraPositionWork).sub(this.userPosition); this.autoTargetOffset.copy(this.cameraTargetWork).sub(this.userTarget);
    this.camera.position.copy(this.cameraPositionWork); this.controls.target.copy(this.cameraTargetWork); this.target.copy(this.controls.target);
    if (Math.abs(this.smoothRoll) > 0.0004) {
      const lookDir = this.cameraTargetWork.clone().sub(this.camera.position).normalize();
      this.camera.up.copy(this.userUp).applyAxisAngle(lookDir, this.smoothRoll);
    } else {
      this.camera.up.copy(this.userUp);
    }
    if (mode !== "MANUAL" || autoRotate) this.camera.lookAt(this.target); this.camera.updateProjectionMatrix();
  }

  private effectivePersistence(): number {
    const trailsOn = this.state.visual.trails > 0.01;
    const base = Math.max(this.state.trail.persistence, this.state.motion.accumulation * 0.55) * (trailsOn ? 1 : 0.6);
    return clamp(base, 0, 0.92);
  }

  private readonly tick = (now: number): void => {
    if (this.destroyed) return;
    const delta = Math.min(0.06, Math.max(0, (now - this.lastTick) / 1000)); this.lastTick = now;
    if (this.playing) this.elapsedSeconds += delta * Math.max(0.05, Math.min(4, this.state.motion.timeScale));
    const frameDelta = this.playing ? delta * Math.max(0.05, Math.min(4, this.state.motion.timeScale)) : 0;
    this.updateSprite(this.layers.points as SpriteLayer, this.state.visual.points, 1);
    this.updateSprite(this.layers.gaussian as SpriteLayer, this.state.visual.gaussian, 1.22);
    this.updateSprite(this.layers.cloud as SpriteLayer, this.state.visual.cloud, 1.5);
    this.updateSprite(this.layers.light as SpriteLayer, this.state.visual.light, 1.62);
    this.updateSprite(this.layers.void as SpriteLayer, this.state.visual.void, 0.9);
    this.updateSprite(this.layers.softLines as SpriteLayer, this.state.visual.softLines, 1.08);
    this.updateSprite(this.layers.micro as SpriteLayer, this.state.visual.microPoints * this.state.micro.amount, 0.5 * (0.5 + this.state.micro.size), this.state.micro.brightness, 0.5 + this.state.micro.size * 0.9, this.state.micro.drift * 0.6);
    this.updateSprite(this.layers.trails as SpriteLayer, this.state.visual.trails, 1.1, 0.85, 1, 0);
    this.updateLines(this.layers.hairlines as LineLayer, this.state.visual.hairlines, 0.38);
    this.updateCamera(frameDelta);
    // Residual motion: screen-space persistence keeps luminous tails/fog residue.
    const persistence = this.effectivePersistence();
    if (persistence > 0.02 && this.playing) {
      const fadeAlpha = (1 - persistence) * 0.35 + 0.02;
      this.fadeMaterial.opacity = clamp(fadeAlpha, 0.02, 0.5);
      this.renderer.render(this.fadeScene, this.fadeCamera);
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
    this.animationFrame = window.requestAnimationFrame(this.tick);
  };
}
