import * as THREE from "three";
import type { ComposerSource } from "../source/composerSource.ts";
import { composerBudget, type ComposerBudget } from "./moduleBudget.ts";
import type { ComposerCameraMode, ComposerColorSource, ComposerPalette, ComposerState } from "./state.ts";

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
}

export interface ComposerFrame {
  readonly elapsedSeconds: number;
  readonly sourceFingerprint: string;
}

const SPRITE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute float aLayer;
  attribute float aMetric;
  attribute float aConnectivity;
  attribute float aDirectionChange;
  attribute float aSupport;
  attribute float aMotif;
  attribute float aAspect;
  attribute float aAngle;
  attribute vec3 aDrift;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uAmount;
  uniform float uSize;
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
  uniform vec3 uWaveOrigins[4];
  uniform vec4 uWaveParams[4];
  varying float vAlpha;
  varying float vPhase;
  varying float vAspect;
  varying float vAngle;
  varying float vFocus;
  varying float vStyleMetric;
  varying vec3 vColor;

  float waveAt(vec3 point) {
    float result = 0.0;
    for (int index = 0; index < 4; index += 1) {
      vec4 wave = uWaveParams[index];
      float distanceToOrigin = distance(point, uWaveOrigins[index]);
      result += sin(distanceToOrigin * wave.x - uTime * wave.y + aPhase * 6.2831) * wave.z * exp(-distanceToOrigin * wave.w);
    }
    return result;
  }

  void main() {
    float wave = waveAt(position) * uWave;
    float hesitation = sin(uTime * (0.17 + aDirectionChange * 0.48) + aPhase * 27.0) * aDirectionChange * uTremor;
    float pause = 0.5 + 0.5 * sin(uTime * (0.06 + aPhase * 0.05) + aPhase * 13.0);
    float growth = mix(1.0, smoothstep(0.12, 0.82, pause), uGrowth * (0.42 + aSupport * 0.38));
    vec3 animated = position;
    animated += aDrift * uDrift * (0.48 + wave * 0.68 + pause * 0.12);
    animated += normalize(position + vec3(0.001)) * hesitation * 0.015;
    animated.z += (aLayer - 1.0) * uDepthSpread * uSpatialEcho * 0.26;
    animated += vec3(wave * 0.014 * uParallax, sin(wave * 3.0 + aPhase) * 0.012 * uParallax, wave * 0.022 * uParallax);
    vec4 mv = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * mv;
    float depthScale = aLayer < 0.5 ? uForegroundScale : (aLayer > 1.5 ? uBackgroundScale : 1.0);
    float perspective = 82.0 / max(1.0, -mv.z);
    gl_PointSize = clamp(aSize * uSize * depthScale * perspective * (0.86 + growth * 0.2), 1.0, 260.0);
    vAlpha = aAlpha * uAmount * (0.68 + 0.32 * pause) * (0.76 + aMetric * 0.26);
    vPhase = aPhase;
    vAspect = aAspect;
    vAngle = aAngle + hesitation * 0.35;
    vFocus = clamp(0.18 + aLayer * 0.2 + uFocusDisorder * (0.45 - aLayer * 0.12), 0.0, 1.0);
    vStyleMetric = clamp(aConnectivity * 0.45 + aMotif * 0.28 + uAccumulation * 0.3 + wave * 0.12 + uOscillation * 0.08, 0.0, 1.0);
    vColor = aColor;
  }
`;

const SPRITE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uStyle;
  uniform float uHighlight;
  uniform float uBlackRetention;
  uniform float uSaturation;
  varying float vAlpha;
  varying float vPhase;
  varying float vAspect;
  varying float vAngle;
  varying float vFocus;
  varying float vStyleMetric;
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
    float shape = uStyle < 0.5 ? disk : uStyle < 1.5 ? gaussian : uStyle < 2.5 ? mix(gaussian, halo, 0.32) : gaussian * 0.62;
    float shimmer = 0.91 + 0.09 * sin(vPhase * 23.0 + vStyleMetric * 9.0);
    float whiteResult = smoothstep(0.67, 1.0, vStyleMetric) * uHighlight;
    vec3 color = mix(vColor, vec3(1.0, 0.97, 0.9), whiteResult);
    color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, uSaturation);
    float alpha = (shape + halo) * vAlpha * uOpacity * shimmer * (1.0 - uBlackRetention * 0.18);
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
function hash(index: number, seed: number): number { const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453; return value - Math.floor(value); }
function sourceColor(source: ComposerColorSource, edge: { density: number; connectivity: number; directionChange: number; supportRole: number; motifInfluence: number; direction: THREE.Vector3 }, index: number, palette: ComposerPalette, saturation: number, contrast: number): THREE.Color {
  const sourceValue = source === "DENSITY" ? edge.density : source === "CONNECTIVITY" ? edge.connectivity : source === "DIRECTION" ? (Math.atan2(edge.direction.y, edge.direction.x) / (Math.PI * 2) + 0.5) : source === "SUPPORT" ? edge.supportRole : edge.motifInfluence;
  const colors = PALETTES[palette];
  const color = new THREE.Color(colors[Math.floor(clamp(sourceValue) * (colors.length - 1) + index * 0.31) % colors.length]);
  color.offsetHSL((sourceValue - 0.5) * 0.04, (saturation - 0.5) * 0.2, (contrast - 0.5) * 0.14);
  return color;
}
function edgePoint(edge: ComposerSource["edges"][number], u: number): THREE.Vector3 { return edge.start.clone().lerp(edge.end, u); }
function nearestEdge(source: ComposerSource, position: THREE.Vector3): ComposerSource["edges"][number] { return source.edges.reduce((best, edge) => edge.midpoint.distanceToSquared(position) < best.midpoint.distanceToSquared(position) ? edge : best, source.edges[0]!); }

function spriteLayer(data: readonly SpriteDatum[], style: number): SpriteLayer {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = []; const sizes: number[] = []; const alphas: number[] = []; const phases: number[] = []; const layers: number[] = [];
  const metrics: number[] = []; const connectivity: number[] = []; const directionChanges: number[] = []; const supports: number[] = []; const motifs: number[] = [];
  const aspects: number[] = []; const angles: number[] = []; const drifts: number[] = []; const colors: number[] = [];
  data.forEach((datum) => {
    positions.push(datum.position.x, datum.position.y, datum.position.z); sizes.push(datum.size); alphas.push(datum.alpha); phases.push(datum.phase); layers.push(datum.layer); metrics.push(datum.metric); connectivity.push(datum.connectivity); directionChanges.push(datum.directionChange); supports.push(datum.support); motifs.push(datum.motif); aspects.push(datum.aspect); angles.push(datum.angle); drifts.push(datum.drift.x, datum.drift.y, datum.drift.z); colors.push(datum.color.r, datum.color.g, datum.color.b);
  });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  for (const [name, values, itemSize] of [["aSize", sizes, 1], ["aAlpha", alphas, 1], ["aPhase", phases, 1], ["aLayer", layers, 1], ["aMetric", metrics, 1], ["aConnectivity", connectivity, 1], ["aDirectionChange", directionChanges, 1], ["aSupport", supports, 1], ["aMotif", motifs, 1], ["aAspect", aspects, 1], ["aAngle", angles, 1], ["aDrift", drifts, 3], ["aColor", colors, 3] ] as const) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, itemSize));
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({ vertexShader: SPRITE_VERTEX, fragmentShader: SPRITE_FRAGMENT, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uSize: { value: 1 }, uOpacity: { value: style === 3 ? 0.72 : 1 }, uStyle: { value: style }, uDrift: { value: 0 }, uWave: { value: 0 }, uGrowth: { value: 0 }, uTremor: { value: 0 }, uAccumulation: { value: 0 }, uOscillation: { value: 0 }, uDepthSpread: { value: 1 }, uForegroundScale: { value: 1.2 }, uBackgroundScale: { value: 0.8 }, uFocusDisorder: { value: 0.65 }, uSpatialEcho: { value: 0.55 }, uParallax: { value: 0.3 }, uHighlight: { value: 0.72 }, uBlackRetention: { value: 0.65 }, uSaturation: { value: 0.8 }, uWaveOrigins: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }, uWaveParams: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] } }, name: `skin-art-composer-sprite-${style}` });
  const object = new THREE.Points(geometry, material); object.frustumCulled = false; object.renderOrder = style === 3 ? 1 : 3;
  return { geometry, material, object };
}

function lineLayer(source: ComposerSource, soft: boolean, palette: ComposerPalette): LineLayer {
  const starts = source.edges.map((edge) => edge.start.clone()); const ends = source.edges.map((edge) => edge.end.clone());
  const positions: number[] = []; const colors: number[] = [];
  source.edges.forEach((edge, index) => { positions.push(edge.start.x, edge.start.y, edge.start.z, edge.end.x, edge.end.y, edge.end.z); const color = sourceColor("SUPPORT", edge, index, palette, 0.68, 0.56); colors.push(color.r, color.g, color.b, color.r, color.g, color.b); });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: soft ? 0.22 : 0.3, blending: THREE.AdditiveBlending, depthWrite: false, name: soft ? "skin-art-composer-soft-lines" : "skin-art-composer-hairlines" });
  const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false; object.renderOrder = soft ? 2 : 4;
  return { geometry, material, object, starts, ends };
}

export class ComposerRuntime {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.01, 100);
  private readonly artwork: HTMLElement;
  private readonly source: ComposerSource;
  private readonly budget: ComposerBudget;
  private readonly layers: { points: SpriteLayer; gaussian: SpriteLayer; cloud: SpriteLayer; void: SpriteLayer; hairlines: LineLayer; softLines: LineLayer };
  private readonly baseCamera = new THREE.Vector3(5.4, -8.2, 4.5);
  private readonly cameraTargetOrigin = new THREE.Vector3(0, 0.2, 0);
  private readonly target = new THREE.Vector3(0, 0.2, 0);
  private readonly waveOrigins: THREE.Vector3[];
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
    this.renderer.domElement.className = "composer-canvas"; this.renderer.domElement.setAttribute("aria-label", "SKIN ART live composer artwork"); artwork.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1); this.scene.scale.setScalar(1.7); this.fitCamera(); this.camera.position.copy(this.baseCamera); this.camera.lookAt(this.target); this.resize(); window.addEventListener("resize", this.resize);
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
  stateData(): ComposerState { return this.state; }
  cameraData(): { mode: ComposerCameraMode; position: [number, number, number]; target: [number, number, number]; fov: number } { return { mode: this.state.camera.mode, position: [this.camera.position.x, this.camera.position.y, this.camera.position.z], target: [this.target.x, this.target.y, this.target.z], fov: this.camera.fov }; }
  restart(): void { this.elapsedSeconds = 0; this.lastTick = performance.now(); this.playing = true; }
  renderNow(): void { this.renderer.render(this.scene, this.camera); }
  resize = (): void => { const width = Math.max(1, this.artwork.clientWidth || window.innerWidth); const height = Math.max(1, this.artwork.clientHeight || window.innerHeight); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); };

  dispose(): void { this.destroyed = true; window.cancelAnimationFrame(this.animationFrame); window.removeEventListener("resize", this.resize); Object.values(this.layers).forEach((layer) => { layer.geometry.dispose(); layer.material.dispose(); }); this.renderer.dispose(); this.renderer.domElement.remove(); }

  private createWaveOrigins(): THREE.Vector3[] {
    const motifOrigins = this.source.motifs.slice(0, 3).map((motif) => motif.center.clone());
    const junction = this.source.edges.slice().sort((a, b) => b.connectivity - a.connectivity)[0]?.midpoint.clone() ?? new THREE.Vector3();
    return [...motifOrigins, junction].slice(0, 4).concat(Array.from({ length: Math.max(0, 4 - motifOrigins.length - 1) }, () => new THREE.Vector3()));
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

  private createLayers() {
    const pointData: SpriteDatum[] = []; const gaussianData: SpriteDatum[] = []; const cloudData: SpriteDatum[] = []; const voidData: SpriteDatum[] = [];
    const palette = this.state.color.palette; const makeDatum = (position: THREE.Vector3, edge: ComposerSource["edges"][number], index: number, style: "point" | "gaussian" | "cloud" | "void", layer: number): SpriteDatum => ({ position, size: style === "point" ? 0.032 + edge.density * 0.024 : style === "gaussian" ? 0.14 + edge.length * 0.12 + edge.motifInfluence * 0.1 : style === "cloud" ? 0.18 + edge.density * 0.24 : 0.05 + edge.density * 0.03, alpha: style === "point" ? 0.28 : style === "gaussian" ? 0.28 + edge.connectivity * 0.16 : style === "cloud" ? 0.14 : 0.1, phase: hash(index * 11 + style.length, this.state.seed), layer, metric: edge.density, connectivity: edge.connectivity, directionChange: edge.directionChange, support: edge.supportRole, motif: edge.motifInfluence, aspect: style === "gaussian" ? 0.36 + edge.length * 0.34 : style === "cloud" ? 0.6 + hash(index, this.state.seed) * 1.2 : 0.7 + hash(index * 3, this.state.seed) * 0.5, angle: Math.atan2(edge.direction.y, edge.direction.x) + hash(index * 4, this.state.seed) * 0.5, color: sourceColor(this.state.color.source, edge, index, palette, this.state.color.saturation, this.state.color.localContrast), drift: edge.direction.clone().multiplyScalar(0.018 + edge.directionChange * 0.026).add(new THREE.Vector3((hash(index + 19, this.state.seed) - 0.5) * 0.025, (hash(index + 23, this.state.seed) - 0.5) * 0.025, (hash(index + 29, this.state.seed) - 0.5) * 0.02)) });
    const nodes = this.source.nodes; nodes.forEach((node, index) => { const edge = nearestEdge(this.source, node); pointData.push(makeDatum(node.clone().add(new THREE.Vector3((hash(index, this.state.seed) - 0.5) * 0.018, (hash(index + 4, this.state.seed) - 0.5) * 0.018, 0)), edge, index, "point", 2)); });
    const pointSamples = Math.min(this.budget.pointLike, Math.max(1, this.source.edges.length * 5)); const gaussianSamples = Math.min(this.budget.gaussian, Math.max(1, this.source.edges.length * 3));
    for (let index = 0; index < pointSamples; index += 1) { const edge = this.source.edges[index % this.source.edges.length]!; const u = (hash(index * 7, this.state.seed) * 0.92) + 0.04; pointData.push(makeDatum(edgePoint(edge, u).add(new THREE.Vector3((hash(index * 2, this.state.seed) - 0.5) * 0.03, (hash(index * 3, this.state.seed) - 0.5) * 0.03, (hash(index * 5, this.state.seed) - 0.5) * 0.025)), edge, index + 100, "point", index % 5 === 0 ? 1 : 2)); }
    for (let index = 0; index < gaussianSamples; index += 1) { const edge = this.source.edges[(index * 3) % this.source.edges.length]!; gaussianData.push(makeDatum(edgePoint(edge, (index % 7 + 1) / 8), edge, index + 500, "gaussian", index % 3)); }
    this.source.motifs.forEach((motif, index) => { const edge = nearestEdge(this.source, motif.center); gaussianData.push(makeDatum(motif.center.clone(), edge, index + 900, "gaussian", 0)); for (let ring = 0; ring < Math.min(18, Math.ceil(this.budget.cloud / Math.max(1, this.source.motifs.length))); ring += 1) { const angle = hash(ring * 3 + index, this.state.seed) * Math.PI * 2; const radius = motif.scale * (1.4 + hash(ring * 5 + index, this.state.seed) * 4.4); cloudData.push(makeDatum(motif.center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, (hash(ring * 7 + index, this.state.seed) - 0.5) * radius)), edge, index * 31 + ring, "cloud", ring % 3)); } });
    this.source.edges.forEach((edge, index) => { if (index % 2 === 0) voidData.push(makeDatum(edge.midpoint.clone(), edge, index + 1200, "void", index % 3)); });
    return { points: spriteLayer(pointData, 0), gaussian: spriteLayer(gaussianData, 1), cloud: spriteLayer(cloudData.slice(0, this.budget.cloud), 2), void: spriteLayer(voidData, 3), hairlines: lineLayer(this.source, false, palette), softLines: lineLayer(this.source, true, palette) };
  }

  private updateSprite(layer: SpriteLayer, amount: number, styleSize: number): void {
    const uniforms = layer.material.uniforms; uniforms.uTime.value = this.elapsedSeconds; uniforms.uAmount.value = amount; uniforms.uSize.value = styleSize; uniforms.uDrift.value = this.state.motion.drift; uniforms.uWave.value = this.state.motion.wave; uniforms.uGrowth.value = this.state.motion.growth; uniforms.uTremor.value = this.state.motion.tremor; uniforms.uAccumulation.value = this.state.motion.accumulation; uniforms.uOscillation.value = this.state.motion.oscillation; uniforms.uDepthSpread.value = this.state.space.depthSpread; uniforms.uForegroundScale.value = this.state.space.foregroundScale; uniforms.uBackgroundScale.value = this.state.space.backgroundScale; uniforms.uFocusDisorder.value = this.state.space.focusDisorder; uniforms.uSpatialEcho.value = this.state.space.spatialEcho; uniforms.uParallax.value = this.state.space.parallax; uniforms.uHighlight.value = this.state.color.highlight; uniforms.uBlackRetention.value = this.state.color.blackRetention; uniforms.uSaturation.value = this.state.color.saturation; uniforms.uWaveOrigins.value = this.waveOrigins; uniforms.uWaveParams.value = [0, 1, 2, 3].map((index) => new THREE.Vector4(0.92 + index * 0.23, 0.22 + index * 0.06, this.state.motion.wave * (0.23 + index * 0.04), 0.64 + index * 0.16));
  }

  private updateLines(layer: LineLayer, amount: number, blur: number): void {
    layer.material.opacity = amount * blur; const positions = layer.geometry.getAttribute("position") as THREE.BufferAttribute; const values = positions.array as Float32Array;
    this.source.edges.forEach((edge, index) => { const wave = this.waveAt(edge.midpoint); const wobble = Math.sin(this.elapsedSeconds * (0.15 + edge.directionChange * 0.45) + index) * this.state.motion.tremor * edge.directionChange * 0.018; const drift = edge.direction.clone().multiplyScalar(this.state.motion.drift * (0.01 + edge.supportRole * 0.016) + wave * this.state.motion.wave * 0.008); const start = layer.starts[index]!.clone().add(drift).add(new THREE.Vector3(0, 0, wobble)); const end = layer.ends[index]!.clone().add(drift).add(new THREE.Vector3(0, 0, wobble)); const offset = index * 6; values[offset] = start.x; values[offset + 1] = start.y; values[offset + 2] = start.z; values[offset + 3] = end.x; values[offset + 4] = end.y; values[offset + 5] = end.z; }); positions.needsUpdate = true;
  }

  private waveAt(point: THREE.Vector3): number { return this.waveOrigins.reduce((sum, origin, index) => sum + Math.sin(point.distanceTo(origin) * (0.92 + index * 0.23) - this.elapsedSeconds * (0.22 + index * 0.06)) * this.state.motion.wave * (0.23 + index * 0.04) * Math.exp(-point.distanceTo(origin) * (0.64 + index * 0.16)), 0); }

  private updateCamera(): void {
    const t = this.elapsedSeconds; const camera = this.state.camera; this.camera.fov = camera.fov;
    if (camera.mode === "STILL") this.camera.position.copy(this.baseCamera);
    else if (camera.mode === "DRIFT") this.camera.position.set(this.baseCamera.x + Math.sin(t * 0.11) * camera.orbit, this.baseCamera.y + Math.cos(t * 0.08) * camera.dolly, this.baseCamera.z + Math.sin(t * 0.07) * camera.targetShift);
    else { const travel = (t * 0.035 * camera.passThrough) % 1; this.camera.position.set(this.baseCamera.x * (1 - travel) + 1.4 * travel, this.baseCamera.y * (1 - travel) + 0.8 * travel, this.baseCamera.z * (1 - travel) + 2.4 * travel); }
    this.target.copy(this.cameraTargetOrigin).add(new THREE.Vector3(Math.sin(t * 0.09) * camera.targetShift * 0.24, Math.cos(t * 0.07) * camera.targetShift * 0.18, Math.sin(t * 0.05) * camera.targetShift * 0.12)); this.camera.lookAt(this.target); this.camera.updateProjectionMatrix();
  }

  private readonly tick = (now: number): void => { if (this.destroyed) return; const delta = Math.min(0.06, Math.max(0, (now - this.lastTick) / 1000)); this.lastTick = now; if (this.playing) this.elapsedSeconds += delta; this.updateSprite(this.layers.points, this.state.visual.points, 1); this.updateSprite(this.layers.gaussian, this.state.visual.gaussian, 1.22); this.updateSprite(this.layers.cloud, this.state.visual.cloud, 1.5); this.updateSprite(this.layers.void, this.state.visual.void, 0.9); this.updateLines(this.layers.hairlines, this.state.visual.hairlines, 0.46); this.updateLines(this.layers.softLines, this.state.visual.softLines, 0.72); this.updateCamera(); this.renderer.render(this.scene, this.camera); this.animationFrame = window.requestAnimationFrame(this.tick); };
}
