import * as THREE from "three";
import type { ConceptBuildContext, ConceptFrameContext } from "../conceptTypes.ts";
import type { ConceptEdge, ConceptMotif } from "../sourceAdapter.ts";
import type { ParameterValue } from "../parameterStore.ts";

export type VisualQualityMode = "baseline" | "lifted";

export interface VisualQualityProfile {
  readonly pointScale: number;
  readonly density: number;
  readonly bloom: number;
  readonly atmosphere: number;
  readonly depth: number;
}

export interface SpatialEcho {
  readonly sourceId: string;
  readonly position: THREE.Vector3;
  readonly scale: number;
  readonly depthBand: 0 | 1 | 2;
  readonly primitive: "point" | "gaussian" | "ribbon" | "hairline" | "fog" | "shadow";
  readonly focusBias: number;
  readonly opacityBias: number;
  readonly luminanceBias: number;
  readonly parallaxFactor: number;
  readonly temporalPhase: number;
}

export function qualityProfile(mode: VisualQualityMode = "lifted", viewport: "mobile" | "desktop" | "capture" = "desktop"): VisualQualityProfile {
  if (mode === "baseline") return { pointScale: 0, density: 0, bloom: 0, atmosphere: 0, depth: 0 };
  const mobile = viewport === "mobile";
  return {
    pointScale: mobile ? 15 : 19,
    density: mobile ? 0.62 : 1,
    bloom: mobile ? 0.78 : 1,
    atmosphere: mobile ? 0.72 : 1,
    depth: mobile ? 0.78 : 1,
  };
}

export function conceptQualityProfile(conceptId: string, mode: VisualQualityMode = "lifted", viewport: "mobile" | "desktop" | "capture" = "desktop"): VisualQualityProfile {
  const base = qualityProfile(mode, viewport);
  const tuning: Record<string, Partial<VisualQualityProfile>> = {
    "weight-of-hesitation": { pointScale: base.pointScale * 1.06, bloom: base.bloom * 1.08, depth: base.depth * 1.08 },
    "mutual-rescue": { density: base.density * 1.08, bloom: base.bloom * 1.14, atmosphere: base.atmosphere * 1.04 },
    "void-bouquet": { density: base.density * 0.88, bloom: base.bloom * 0.86, atmosphere: base.atmosphere * 1.22, depth: base.depth * 1.18 },
    "inside-out": { pointScale: base.pointScale * 1.04, bloom: base.bloom * 1.1, atmosphere: base.atmosphere * 1.12 },
    "one-hand-many-flowers": { pointScale: base.pointScale * 0.82, density: base.density * 0.92, atmosphere: base.atmosphere * 0.96 },
    "craft-strata": { pointScale: base.pointScale * 0.98, density: base.density * 1.04, bloom: base.bloom * 1.06 },
    "shadow-room": { pointScale: base.pointScale * 0.9, bloom: base.bloom * 0.78, atmosphere: base.atmosphere * 1.3, depth: base.depth * 1.26 },
    "micro-landscape": { pointScale: base.pointScale * 0.9, density: base.density * 1.1, atmosphere: base.atmosphere * 1.16, depth: base.depth * 1.12 },
    "visible-mending": { pointScale: base.pointScale * 1.02, bloom: base.bloom * 1.1, atmosphere: base.atmosphere * 1.08 },
    "structural-choir": { pointScale: base.pointScale * 0.96, density: base.density * 1.06, atmosphere: base.atmosphere * 1.05 },
  };
  return { ...base, ...tuning[conceptId] };
}

interface QualityDatum {
  readonly position: THREE.Vector3;
  readonly size: number;
  readonly alpha: number;
  readonly phase: number;
  readonly morph: number;
  readonly aspect: number;
  readonly angle: number;
  readonly layer: number;
  readonly metric: number;
  readonly focus: number;
  readonly state: number;
  readonly luminance: number;
  readonly color: THREE.Color;
  readonly drift: THREE.Vector3;
  readonly delay: number;
  readonly life: number;
}

export interface QualityLayer {
  readonly object: THREE.Points;
  update(frame: ConceptFrameContext, params: Readonly<Record<string, ParameterValue>>): void;
}

const QUALITY_VERTEX = /* glsl */ `
  attribute vec2 aSizeAlpha;
  attribute vec2 aPhaseMorph;
  attribute vec2 aAspectAngle;
  attribute vec4 aStats;
  attribute vec3 aLuminanceLife;
  attribute vec3 aDrift;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uEnergy;
  uniform float uPointScale;
  uniform float uOpacity;
  uniform float uDepth;
  uniform float uForeground;
  uniform float uFocusContradiction;
  uniform float uVoidRetention;
  uniform float uScaleEcho;
  uniform float uParallax;
  uniform float uAmbiguity;

  varying float vAlpha;
  varying float vPhase;
  varying float vMorph;
  varying float vAspect;
  varying float vAngle;
  varying float vFocus;
  varying float vAccumulation;
  varying float vVisibility;
  varying vec3 vColor;

  void main() {
    float aSize = aSizeAlpha.x;
    float aAlpha = aSizeAlpha.y;
    float aPhase = aPhaseMorph.x;
    float aMorph = aPhaseMorph.y;
    float aAspect = aAspectAngle.x;
    float aAngle = aAspectAngle.y;
    float aLayer = aStats.x;
    float aMetric = aStats.y;
    float aFocus = aStats.z;
    float aState = aStats.w;
    float aLuminance = aLuminanceLife.x;
    float aDelay = aLuminanceLife.y;
    float aLife = aLuminanceLife.z;
    float local = uTime + aPhase * 19.0;
    float hesitation = sin(local * (0.13 + aPhase * 0.09) + aPhase * 23.0);
    float pause = smoothstep(0.18, 0.52, sin(local * 0.19 + aPhase * 11.0) * 0.5 + 0.5);
    float motion = 0.0;
    if (aState < 0.5) motion = sin(local * 0.72) * 0.34;
    else if (aState < 1.5) motion = hesitation * 0.12;
    else if (aState < 2.5) motion = sin(local * 1.8) * 0.46;
    else if (aState < 3.5) motion = sin(local * 0.37 + 1.2) * 0.18;
    else motion = sin(local * 0.92) * 0.7;

    float cycle = 28.0;
    float cycleTime = mod(uTime + aPhase * 8.0, cycle);
    float emerge = smoothstep(aDelay, aDelay + 0.72 + aPhase * 0.45, cycleTime);
    float release = 1.0 - smoothstep(aDelay + aLife - 1.6, aDelay + aLife, cycleTime);
    float hold = 0.74 + 0.26 * (0.5 + 0.5 * sin(local * (0.16 + aPhase * 0.08) + aLayer * 3.0));
    float visibility = max(0.035, emerge * release) * (0.64 + pause * 0.36);
    float echoScale = 1.0 + uScaleEcho * (aLayer < 0.5 ? 0.27 : aLayer > 1.5 ? -0.12 : 0.04);
    float foregroundScale = 1.0 + uForeground * (aLayer < 0.5 ? 0.34 : 0.0);
    vec3 animated = position + aDrift * (0.34 + motion * (0.42 + uAmbiguity * 0.2) + uEnergy * 0.12) * (0.72 + uParallax * 0.74);
    animated += normalize(position + vec3(0.001, 0.003, 0.002)) * hesitation * 0.014 * (0.4 + aMetric);
    vec4 modelViewPosition = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    float perspective = 86.0 / max(1.0, -modelViewPosition.z);
    float breath = 1.0 + 0.09 * sin(local * 0.37) + motion * 0.035;
    gl_PointSize = clamp(aSize * uPointScale * perspective * breath * (0.82 + uDepth * 0.18) * echoScale * foregroundScale, 1.0, 176.0);

    vColor = aColor;
    float voidWeight = aLayer > 1.5 ? (1.0 - uVoidRetention * 0.22) : 1.0;
    vAlpha = aAlpha * hold * visibility * uOpacity * voidWeight;
    vPhase = aPhase;
    vMorph = clamp(aMorph + max(0.0, motion) * 0.08 + uEnergy * 0.06, 0.0, 1.0);
    vAspect = aAspect;
    vAngle = aAngle + hesitation * 0.12;
    vFocus = clamp(aFocus + motion * 0.06 + (aLayer - 1.0) * uFocusContradiction * 0.28, 0.0, 1.0);
    vAccumulation = clamp(aLuminance * 0.75 + aMetric * 0.2 + uEnergy * 0.09, 0.0, 1.0);
    vVisibility = visibility;
  }
`;

const QUALITY_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying float vAlpha;
  varying float vPhase;
  varying float vMorph;
  varying float vAspect;
  varying float vAngle;
  varying float vFocus;
  varying float vAccumulation;
  varying float vVisibility;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float cosine = cos(vAngle);
    float sine = sin(vAngle);
    vec2 rotated = vec2(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
    rotated.x /= max(0.28, vAspect);
    float radius = dot(rotated, rotated);
    if (radius > 1.0) discard;
    float boundary = pow(1.0 - smoothstep(0.38, 0.99, radius), 1.95);
    float gaussian = exp(-radius * mix(2.0, 0.62, vFocus));
    float core = exp(-radius * 3.8);
    float halo = exp(-radius * 1.32) * (0.028 + 0.075 * vMorph);
    float shape = mix(core, gaussian, vMorph);
    float shimmer = 0.91 + 0.09 * sin(uTime * (0.17 + vPhase * 0.06) + vPhase * 21.0);
    float white = smoothstep(0.72, 1.0, vAccumulation) * (0.18 + 0.7 * vMorph);
    vec3 color = mix(vColor, vec3(1.0, 0.98, 0.92), white);
    float alpha = (shape + halo) * boundary * vAlpha * shimmer * (0.72 + vVisibility * 0.28);
    gl_FragColor = vec4(color, alpha);
  }
`;

class GaussianLayerImpl implements QualityLayer {
  readonly object: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(data: readonly QualityDatum[], profile: VisualQualityProfile) {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const sizeAlphas: number[] = [];
    const phaseMorphs: number[] = [];
    const aspectAngles: number[] = [];
    const stats: number[] = [];
    const luminanceLives: number[] = [];
    const drifts: number[] = [];
    const colors: number[] = [];
    for (const datum of data) {
      positions.push(datum.position.x, datum.position.y, datum.position.z);
      sizeAlphas.push(datum.size, datum.alpha);
      phaseMorphs.push(datum.phase, datum.morph);
      aspectAngles.push(datum.aspect, datum.angle);
      stats.push(datum.layer, datum.metric, datum.focus, datum.state);
      luminanceLives.push(datum.luminance, datum.delay, datum.life);
      drifts.push(datum.drift.x, datum.drift.y, datum.drift.z);
      colors.push(datum.color.r, datum.color.g, datum.color.b);
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aSizeAlpha", new THREE.Float32BufferAttribute(sizeAlphas, 2));
    geometry.setAttribute("aPhaseMorph", new THREE.Float32BufferAttribute(phaseMorphs, 2));
    geometry.setAttribute("aAspectAngle", new THREE.Float32BufferAttribute(aspectAngles, 2));
    geometry.setAttribute("aStats", new THREE.Float32BufferAttribute(stats, 4));
    geometry.setAttribute("aLuminanceLife", new THREE.Float32BufferAttribute(luminanceLives, 3));
    geometry.setAttribute("aDrift", new THREE.Float32BufferAttribute(drifts, 3));
    geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    this.material = new THREE.ShaderMaterial({
      vertexShader: QUALITY_VERTEX,
      fragmentShader: QUALITY_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.38 },
        uPointScale: { value: profile.pointScale },
        uOpacity: { value: 1.65 * profile.bloom },
        uDepth: { value: profile.depth },
        uForeground: { value: 1.05 },
        uFocusContradiction: { value: 0.62 },
        uVoidRetention: { value: 0.55 },
        uScaleEcho: { value: 0.85 },
        uParallax: { value: 0.24 },
        uAmbiguity: { value: 0.68 },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.material.name = "skin-art-v4-1-gaussian-datum";
    this.object = new THREE.Points(geometry, this.material);
    this.object.name = "skin-art-v4-1-gaussian-layer";
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
  }

  update(frame: ConceptFrameContext, params: Readonly<Record<string, ParameterValue>>): void {
    this.material.uniforms.uTime.value = frame.elapsedSeconds;
    this.material.uniforms.uEnergy.value = Math.max(0.08, Math.min(1, frame.eventEnergy * 0.56 + 0.2));
    const exposure = typeof params.exposure === "number" ? params.exposure : 1.25;
    const contrast = typeof params.localContrast === "number" ? params.localContrast : 1.2;
    const blur = typeof params.blurAmount === "number" ? params.blurAmount : 0.7;
    this.material.uniforms.uOpacity.value = Math.min(2.2, (0.98 + exposure * 0.3 + contrast * 0.11) * (0.9 + blur * 0.24));
    this.material.uniforms.uForeground.value = typeof params.foregroundIntrusion === "number" ? params.foregroundIntrusion : 1.05;
    this.material.uniforms.uFocusContradiction.value = typeof params.focusContradiction === "number" ? params.focusContradiction : 0.62;
    this.material.uniforms.uVoidRetention.value = typeof params.voidRetention === "number" ? params.voidRetention : 0.55;
    this.material.uniforms.uScaleEcho.value = typeof params.scaleEcho === "number" ? params.scaleEcho : 0.85;
    this.material.uniforms.uParallax.value = typeof params.parallaxDisorder === "number" ? params.parallaxDisorder : 0.24;
    this.material.uniforms.uAmbiguity.value = typeof params.spatialAmbiguity === "number" ? params.spatialAmbiguity : 0.68;
  }
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function numberParam(parameters: Readonly<Record<string, ParameterValue>>, id: string, fallback: number): number {
  const value = parameters[id];
  return typeof value === "number" ? value : fallback;
}

function hash(index: number, seed: number): number {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function paletteColor(ctx: ConceptBuildContext, index: number, lightness = 0): THREE.Color {
  const values = [ctx.colors.primary, ctx.colors.secondary, ctx.colors.highlight, ctx.colors.accent, ctx.colors.shadow];
  const result = new THREE.Color(values[Math.abs(index) % values.length]);
  return result.lerp(new THREE.Color(0xfff0df), clamp01(lightness));
}

function addDatum(data: QualityDatum[], datum: Omit<QualityDatum, "phase" | "delay" | "life">, index: number, seed: number, delay = 0): void {
  const phase = hash(index * 7 + 3, seed);
  data.push({ ...datum, phase, delay: delay + hash(index * 5 + 9, seed) * 1.4, life: 12 + hash(index * 11 + 4, seed) * 10 });
}

function edgePoint(edge: ConceptEdge, u: number, bend = 0): THREE.Vector3 {
  const point = edge.start.clone().lerp(edge.end, u);
  const perpendicular = edge.direction.clone().cross(new THREE.Vector3(0, 0, 1));
  if (perpendicular.lengthSq() < 0.01) perpendicular.set(0, 1, 0);
  return point.add(perpendicular.normalize().multiplyScalar(Math.sin(Math.PI * u) * bend));
}

function addRibbon(data: QualityDatum[], edge: ConceptEdge, ctx: ConceptBuildContext, seed: number, offset: number, options: { colorOffset?: number; size?: number; alpha?: number; startDelay?: number; bend?: number; state?: number } = {}): void {
  const samples = 8 + (edge.directionChange > 0.55 ? 3 : 0);
  const baseSize = options.size ?? (0.025 + edge.density * 0.032);
  for (let sample = 0; sample <= samples; sample += 1) {
    const u = sample / samples;
    const width = baseSize * (0.58 + 0.7 * (0.5 + 0.5 * Math.sin(u * Math.PI + edge.directionChange * 7)));
    const echoes = spatialEchoes(edge, ctx, seed, offset, u, options.bend ?? edge.directionChange * 0.16);
    echoes.forEach((echo, echoIndex) => {
      const primitiveMorph = echo.primitive === "hairline" || echo.primitive === "point" ? 0.24 : echo.primitive === "fog" ? 1 : 0.92;
      const primitiveScale = echo.primitive === "hairline" ? 0.44 : echo.primitive === "fog" ? 1.28 : 1;
      addDatum(data, { position: echo.position, size: width * echo.scale * primitiveScale, alpha: (options.alpha ?? 0.13) * echo.opacityBias, morph: primitiveMorph, aspect: (1.18 + edge.length * 0.08) * (echo.primitive === "ribbon" ? 1.2 : 1), angle: Math.atan2(edge.direction.y, edge.direction.x), layer: echo.depthBand, metric: edge.density, focus: clamp01(0.44 + echo.focusBias), state: options.state ?? (echoIndex === 0 ? 3 : edge.directionChange > 0.6 ? 2 : 1), luminance: clamp01(0.42 + edge.connectivity * 0.22 + echo.luminanceBias), color: paletteColor(ctx, offset + sample + echoIndex + 1 + (options.colorOffset ?? 0), echo.depthBand === 0 ? 0.1 : 0), drift: edge.direction.clone().multiplyScalar(0.018 * echo.parallaxFactor).add(new THREE.Vector3(0, 0, 0.008 * echo.parallaxFactor)) }, sample + offset * 23 + echoIndex * 800, seed, (options.startDelay ?? 0) + sample * (0.12 + echoIndex * 0.05) + echo.temporalPhase);
    });
  }
}

function spatialEchoes(edge: ConceptEdge, ctx: ConceptBuildContext, seed: number, offset: number, u: number, bend: number): SpatialEcho[] {
  const position = edgePoint(edge, u, bend);
  const phase = hash(offset * 13 + Math.round(u * 100), seed);
  const normal = edge.direction.clone().cross(new THREE.Vector3(0, 0, 1));
  if (normal.lengthSq() < 0.01) normal.set(0, 1, 0);
  normal.normalize();
  const ambiguity = numberParam(ctx.parameters, "spatialAmbiguity", 0.68);
  return [
    { sourceId: edge.id, position: position.clone().addScaledVector(normal, (0.08 + ambiguity * 0.12) * (phase - 0.5)).add(new THREE.Vector3(0, 0, 0.52)), scale: 1.55 + ambiguity * 0.35, depthBand: 0, primitive: "gaussian", focusBias: -0.2, opacityBias: 0.68, luminanceBias: 0.18, parallaxFactor: 1.28, temporalPhase: phase * 0.4 },
    { sourceId: edge.id, position: position.clone().add(new THREE.Vector3(0, 0, (phase - 0.5) * 0.12)), scale: 1, depthBand: 1, primitive: "ribbon", focusBias: 0.02, opacityBias: 0.82, luminanceBias: 0.08, parallaxFactor: 1, temporalPhase: phase * 0.2 },
    { sourceId: edge.id, position: position.clone().addScaledVector(normal, (phase - 0.5) * 0.08).add(new THREE.Vector3(0, 0, -0.55)), scale: 0.72, depthBand: 2, primitive: "hairline", focusBias: 0.28, opacityBias: 0.56, luminanceBias: -0.04, parallaxFactor: 0.68, temporalPhase: phase * 0.8 },
  ];
}

function addCloud(data: QualityDatum[], center: THREE.Vector3, ctx: ConceptBuildContext, seed: number, offset: number, count: number, options: { scale?: number; alpha?: number; colorOffset?: number; layer?: number; state?: number; delay?: number } = {}): void {
  const scale = options.scale ?? 0.4;
  for (let index = 0; index < count; index += 1) {
    const a = hash(index * 13 + offset, seed) * Math.PI * 2;
    const radial = Math.pow(hash(index * 17 + 2 + offset, seed), 0.62) * scale;
    const z = (hash(index * 19 + 4 + offset, seed) - 0.5) * scale * 1.6;
    const position = center.clone().add(new THREE.Vector3(Math.cos(a) * radial, Math.sin(a) * radial * (0.58 + hash(index + 3, seed) * 0.6), z));
    const layer = options.layer ?? (index % 5 === 0 ? 0 : 2);
    const color = paletteColor(ctx, offset + index + (options.colorOffset ?? 0), index % 4 === 0 ? 0.14 : -0.04);
    addDatum(data, { position, size: (0.082 + hash(index * 3 + offset, seed) * 0.18) * (layer === 0 ? 1.72 : 1), alpha: options.alpha ?? 0.09, morph: 0.7 + hash(index * 5 + 1, seed) * 0.3, aspect: 0.45 + hash(index * 7 + 8, seed) * 1.2, angle: a + 0.4, layer, metric: 0.3 + hash(index + 5, seed) * 0.55, focus: layer === 0 ? 0.16 : 0.38, state: options.state ?? (index % 7 === 0 ? 4 : index % 4 === 0 ? 3 : 0), luminance: 0.34 + hash(index * 11, seed) * 0.48, color, drift: new THREE.Vector3((hash(index * 2 + offset, seed) - 0.5) * 0.07, (hash(index * 3 + offset, seed) - 0.5) * 0.07, (hash(index * 5 + offset, seed) - 0.5) * 0.04) }, index + offset * 31, seed, options.delay ?? 0);
  }
}

function addPoints(data: QualityDatum[], points: readonly THREE.Vector3[], ctx: ConceptBuildContext, seed: number, offset: number, options: { size?: number; alpha?: number; colorOffset?: number; state?: number; layer?: number } = {}): void {
  points.forEach((position, index) => {
    const layer = options.layer ?? 2;
    addDatum(data, { position: position.clone(), size: options.size ?? 0.028, alpha: options.alpha ?? 0.11, morph: 0.28, aspect: 0.86 + hash(index * 3, seed) * 0.4, angle: hash(index * 5, seed) * Math.PI, layer, metric: 0.18 + hash(index * 7, seed) * 0.36, focus: 0.06 + hash(index * 9, seed) * 0.18, state: options.state ?? (index % 5 === 0 ? 2 : 0), luminance: 0.22 + hash(index * 13, seed) * 0.2, color: paletteColor(ctx, index + offset + (options.colorOffset ?? 0), -0.08), drift: new THREE.Vector3((hash(index * 17, seed) - 0.5) * 0.08, (hash(index * 19, seed) - 0.5) * 0.08, (hash(index * 23, seed) - 0.5) * 0.06) }, index + offset * 29, seed, index * 0.16);
  });
}

function addMotifCluster(data: QualityDatum[], motif: ConceptMotif, ctx: ConceptBuildContext, seed: number, offset: number, count: number, colorOffset = 0): void {
  addCloud(data, motif.center, ctx, seed, offset, count, { scale: motif.scale * 4.6, alpha: 0.105, colorOffset, state: 3, layer: 0 });
  addCloud(data, motif.center.clone().add(new THREE.Vector3(0, 0, 0.08)), ctx, seed + 17, offset + 120, Math.max(6, Math.floor(count * 0.5)), { scale: motif.scale * 2.1, alpha: 0.18, colorOffset: colorOffset + 1, state: 4, layer: 0 });
}

function sourceEdges(ctx: ConceptBuildContext, stride: number, limit: number): ConceptEdge[] {
  return ctx.source.edges.filter((edge, index) => index % stride === 0 || edge.connectivity > 0.72).slice(0, limit);
}

function createQualityData(ctx: ConceptBuildContext, conceptId: string, profile: VisualQualityProfile): QualityDatum[] {
  const data: QualityDatum[] = [];
  const seed = ctx.seed ^ conceptId.length * 7919;
  const edges = sourceEdges(ctx, 5, Math.max(9, Math.floor(42 * profile.density)));
  const motifs = ctx.source.motifs.slice(0, Math.max(6, Math.floor(14 * profile.density)));
  const nodes = ctx.source.nodes.slice(0, Math.max(24, Math.floor(96 * profile.density)));

  if (conceptId === "weight-of-hesitation") {
    edges.forEach((edge, index) => addRibbon(data, edge, ctx, seed, index, { size: 0.045 + edge.length * 0.008, alpha: 0.17, bend: -0.11 - edge.directionChange * 0.14, state: 1 }));
    motifs.slice(0, 7).forEach((motif, index) => addMotifCluster(data, motif, ctx, seed, index + 300, 18, index + 2));
  } else if (conceptId === "mutual-rescue") {
    motifs.forEach((motif, index) => addMotifCluster(data, motif, ctx, seed, index * 11, 24 + (index % 3) * 10, index));
    edges.slice(0, 12).forEach((edge, index) => addRibbon(data, edge, ctx, seed, index + 100, { size: 0.034, alpha: 0.105, colorOffset: 2, startDelay: index * 0.25, state: 3 }));
  } else if (conceptId === "void-bouquet") {
    edges.slice(0, 22).forEach((edge, index) => {
      const normal = edge.direction.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
      addCloud(data, edge.midpoint.clone().addScaledVector(normal, (index % 2 ? 1 : -1) * 0.2), ctx, seed, index * 17, 9 + index % 6, { scale: 0.23 + edge.directionChange * 0.18, alpha: 0.075, colorOffset: index + 1, state: 4 });
    });
    addPoints(data, nodes.filter((_, index) => index % 3 === 0), ctx, seed, 500, { size: 0.022, alpha: 0.095, layer: 2 });
  } else if (conceptId === "inside-out") {
    motifs.forEach((motif, index) => addCloud(data, motif.center, ctx, seed, index * 14, 18, { scale: motif.scale * 4.4, alpha: 0.105, colorOffset: index, state: 3, layer: 0 }));
    edges.slice(0, 24).forEach((edge, index) => addRibbon(data, edge, ctx, seed, index + 180, { size: 0.031 + edge.supportRole * 0.02, alpha: 0.12, bend: edge.directionChange * 0.24, state: 0 }));
    motifs.slice(0, 5).forEach((motif, index) => addCloud(data, motif.center.clone().multiplyScalar(1.45), ctx, seed + 11, index + 700, 15, { scale: 0.24, alpha: 0.075, colorOffset: 3, state: 4, layer: 1 }));
  } else if (conceptId === "one-hand-many-flowers") {
    addPoints(data, nodes, ctx, seed, 10, { size: 0.017, alpha: 0.07, state: 0, layer: 2 });
    edges.slice(0, 18).forEach((edge, index) => addRibbon(data, edge, ctx, seed, index + 240, { size: 0.019 + (index % 4) * 0.006, alpha: 0.075, colorOffset: index, startDelay: index * 0.55, bend: edge.directionChange * 0.12, state: index % 5 === 0 ? 2 : 1 }));
    motifs.slice(0, 9).forEach((motif, index) => addCloud(data, motif.center, ctx, seed, index + 400, 8, { scale: motif.scale * 2.6, alpha: 0.08, colorOffset: index + 1, state: 3, layer: 0, delay: index * 0.8 }));
  } else if (conceptId === "craft-strata") {
    edges.slice(0, 26).forEach((edge, index) => addRibbon(data, edge, ctx, seed, index + 60, { size: 0.034 + (index % 5) * 0.008, alpha: 0.12 + (index % 4) * 0.018, bend: edge.directionChange * 0.18, state: index % 4 === 0 ? 3 : 1 }));
    edges.filter((edge) => edge.connectivity > 0.68).slice(0, 12).forEach((edge, index) => addCloud(data, edge.midpoint, ctx, seed, index + 900, 10, { scale: 0.16 + edge.density * 0.1, alpha: 0.15, colorOffset: 3, state: 4, layer: 0 }));
  } else if (conceptId === "shadow-room") {
    motifs.slice(0, 12).forEach((motif, index) => addCloud(data, new THREE.Vector3(motif.center.x * 1.4, motif.center.y * 0.72 + 1.3, -0.04 - index * 0.01), ctx, seed, index * 18, 20, { scale: 0.22 + (index % 3) * 0.08, alpha: 0.075, colorOffset: index, state: index % 3, layer: 2 }));
    addPoints(data, nodes.filter((_, index) => index % 4 === 0), ctx, seed, 600, { size: 0.032, alpha: 0.045, colorOffset: 2, layer: 1 });
  } else if (conceptId === "micro-landscape") {
    addPoints(data, nodes, ctx, seed, 10, { size: 0.018, alpha: 0.08, layer: 2 });
    edges.slice(0, 22).forEach((edge, index) => addRibbon(data, edge, ctx, seed, index + 300, { size: 0.024, alpha: 0.085, colorOffset: 1, state: 0 }));
    motifs.slice(0, 6).forEach((motif, index) => addCloud(data, motif.center.clone().multiplyScalar(1.4), ctx, seed, index + 800, 24, { scale: 0.45 + index * 0.04, alpha: 0.1, colorOffset: 2, layer: 0, state: 4 }));
  } else if (conceptId === "visible-mending") {
    edges.slice(0, 12).forEach((edge, index) => addRibbon(data, edge, ctx, seed, index + 110, { size: 0.034 + edge.directionChange * 0.018, alpha: 0.14, colorOffset: 2, bend: edge.directionChange * 0.3, state: 3 }));
    edges.slice(0, 12).forEach((edge, index) => addCloud(data, edge.midpoint, ctx, seed + 23, index + 500, 13, { scale: 0.13 + edge.length * 0.04, alpha: 0.08, colorOffset: 4, state: 4, layer: 1 }));
  } else {
    edges.slice(0, 30).forEach((edge, index) => addRibbon(data, edge, ctx, seed, index + 12, { size: 0.022 + edge.connectivity * 0.022, alpha: 0.085, colorOffset: index % 3, state: index % 4 }));
    nodes.filter((_, index) => index % 2 === 0).forEach((node, index) => addCloud(data, node, ctx, seed, index + 700, 5, { scale: 0.12, alpha: 0.08, colorOffset: index, state: 2, layer: 0 }));
  }

  // A shared, source-seeded atmosphere keeps every concept in one spatial field.
  // It is radial and sparse: no screen-space rectangle or background-color fade.
  const anchors = [...motifs.slice(0, 5).map((motif) => motif.center), ...edges.filter((edge) => edge.connectivity > 0.7).slice(0, 4).map((edge) => edge.midpoint)];
  anchors.forEach((anchor, index) => addCloud(data, anchor.clone().add(new THREE.Vector3((index - 4) * 0.22, (index % 2 ? -1 : 1) * 0.16, 0.55 + index * 0.13)), ctx, seed + 43, 1200 + index * 21, Math.max(10, Math.floor(18 * profile.atmosphere)), { scale: 0.38 + (index % 3) * 0.16, alpha: 0.052 + (index % 3) * 0.015, colorOffset: index + 1, state: index % 4, layer: 2 }));
  // Source-seeded spill anchors make the field continue beyond the object.
  // They are irregular radial clouds, never a full-screen rectangle.
  for (let index = 0; index < 6; index += 1) {
    const angle = -0.25 + index * 1.08 + hash(index * 31, seed) * 0.34;
    const radius = 2.15 + hash(index * 37, seed) * 0.85;
    const anchor = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.68, -0.5 + (hash(index * 41, seed) - 0.5) * 1.4);
    addCloud(data, anchor, ctx, seed + 61, 1500 + index * 23, Math.max(16, Math.floor(28 * profile.atmosphere)), { scale: 0.62 + hash(index * 43, seed) * 0.38, alpha: 0.044 + (index % 3) * 0.012, colorOffset: index + 2, state: index % 4, layer: index % 2 });
  }
  return data;
}

export function createQualityOverlay(ctx: ConceptBuildContext, conceptId: string): QualityLayer | null {
  const mode = ctx.visualQuality ?? "lifted";
  if (mode === "baseline") return null;
  const profile = conceptQualityProfile(conceptId, mode, ctx.quality);
  const data = createQualityData(ctx, conceptId, profile);
  return new GaussianLayerImpl(data, profile);
}

export function attachQuality(group: THREE.Group, layer: QualityLayer | null): void {
  if (!layer) return;
  // The lifted renderer is the visual study, not a second primitive viewer.
  // Keep the old V4 objects in the baseline route and let the quality layer
  // carry the image on the current route.
  group.children.forEach((child) => { child.visible = false; });
  group.add(layer.object);
  group.userData.v4QualityUpdate = (frame: ConceptFrameContext, params: Readonly<Record<string, ParameterValue>>) => layer.update(frame, params);
}

export function updateAttachedQuality(group: THREE.Group, frame: ConceptFrameContext, params: Readonly<Record<string, ParameterValue>>): void {
  const update = group.userData.v4QualityUpdate as ((nextFrame: ConceptFrameContext, nextParams: Readonly<Record<string, ParameterValue>>) => void) | undefined;
  update?.(frame, params);
}
