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
  attribute vec4 aMetrics;
  attribute vec4 aShape;
  attribute vec3 aDrift;
  attribute vec3 aColor;
  attribute vec4 aTemporal;
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

  float waveAt(vec3 point) {
    float result = 0.0;
    for (int index = 0; index < 6; index += 1) {
      vec4 wave = uWaveParams[index];
      float distanceToOrigin = distance(point, uWaveOrigins[index]);
      result += sin(distanceToOrigin * wave.x - uTime * wave.y + aPhase * 6.2831) * wave.z * exp(-distanceToOrigin * wave.w);
    }
    return result;
  }

  void main() {
    float wave = waveAt(position) * uWave;
    float localClock = uTime * (0.11 + aTemporal.z * 0.15) + aPhase * 18.0 + aTemporal.w * 1.7;
    float pause = 0.5 + 0.5 * sin(localClock * 0.37 + aMetrics.z * 5.0);
    float driftDecision = sin(localClock * 0.63 + aMetrics.x * 9.0) * 0.5 + 0.5;
    float growthPhase = fract(max(0.0, uTime * (0.16 + aTemporal.y * 0.025) - aTemporal.x));
    float growthReveal = smoothstep(0.04, 0.28, growthPhase) * (1.0 - smoothstep(0.76, 0.98, growthPhase) * 0.72);
    float growth = mix(1.0, 0.18 + 0.82 * growthReveal, uGrowth * (0.62 + aMetrics.w * 0.24));
    float hesitation = sin(uTime * (0.38 + aMetrics.z * 1.1 + aTemporal.z) + aPhase * 27.0 + aTemporal.w) * aMetrics.z * uTremor;
    float oscillation = sin(uTime * (0.19 + aTemporal.z * 0.42) + aPhase * 14.0 + aTemporal.w * 2.1);
    float residue = uAccumulation * (0.11 + 0.12 * (0.5 + 0.5 * sin(localClock * 0.21 - aPhase * 9.0)));
    vec3 animated = position;
    animated += aDrift * uDrift * (0.4 + driftDecision * 0.46 + wave * 0.68 + pause * 0.12);
    animated += normalize(position + aDrift * 0.2 + vec3(0.001)) * hesitation * 0.019;
    animated += normalize(position + vec3(0.001)) * oscillation * uOscillation * (0.008 + aShape.x * 0.022);
    animated -= aDrift * residue * (0.8 + aMetrics.z * 1.6);
    animated.z += (aShape.w - 1.0) * uDepthSpread * uSpatialEcho * 0.26;
    animated += vec3(wave * 0.014 * uParallax, sin(wave * 3.0 + aPhase + aTemporal.w) * 0.012 * uParallax, wave * 0.022 * uParallax);
    vec4 mv = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * mv;
    float depthScale = aShape.w < 0.5 ? uForegroundScale : (aShape.w > 1.5 ? uBackgroundScale : 1.0);
    float perspective = 82.0 / max(1.0, -mv.z);
    gl_PointSize = clamp(aSize * uSize * depthScale * perspective * (0.76 + growth * 0.3 + abs(oscillation) * uOscillation * 0.1), 1.0, 260.0);
    vAlpha = aAlpha * uAmount * (0.62 + 0.38 * pause) * (0.7 + aMetrics.x * 0.3) * (0.78 + growth * 0.22);
    vPhase = aPhase;
    vAspect = aShape.y;
    vAngle = aShape.z + hesitation * 0.35;
    vFocus = clamp(0.18 + aShape.w * 0.2 + uFocusDisorder * (0.45 - aShape.w * 0.12), 0.0, 1.0);
    vStyleMetric = clamp(aMetrics.y * 0.45 + aShape.x * 0.3 + uAccumulation * 0.18 + abs(wave) * 0.15 + abs(oscillation) * uOscillation * 0.12, 0.0, 1.0);
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
    float whiteResult = smoothstep(0.69, 1.0, vStyleMetric) * uHighlight;
    vec3 color = mix(vColor, vec3(1.0, 0.97, 0.9), whiteResult);
    color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, uSaturation);
    color = min(color * (1.2 + vStyleMetric * 0.8 + vMorph * 0.24), vec3(1.0));
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
function edgePoint(edge: ComposerSource["edges"][number], u: number): THREE.Vector3 { return edge.start.clone().lerp(edge.end, u); }
function nearestEdge(source: ComposerSource, position: THREE.Vector3): ComposerSource["edges"][number] { return source.edges.reduce((best, edge) => edge.midpoint.distanceToSquared(position) < best.midpoint.distanceToSquared(position) ? edge : best, source.edges[0]!); }

function spriteLayer(data: readonly SpriteDatum[], style: number): SpriteLayer {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = []; const sizes: number[] = []; const alphas: number[] = []; const phases: number[] = [];
  const metricVectors: number[] = []; const shapeVectors: number[] = [];
  const drifts: number[] = []; const colors: number[] = []; const temporals: number[] = [];
  data.forEach((datum) => {
    positions.push(datum.position.x, datum.position.y, datum.position.z); sizes.push(datum.size); alphas.push(datum.alpha); phases.push(datum.phase); metricVectors.push(datum.metric, datum.connectivity, datum.directionChange, datum.support); shapeVectors.push(datum.motif, datum.aspect, datum.angle, datum.layer); drifts.push(datum.drift.x, datum.drift.y, datum.drift.z); colors.push(datum.color.r, datum.color.g, datum.color.b); temporals.push(datum.growthStart, datum.growthDuration, datum.clusterFrequency, datum.region);
  });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  for (const [name, values, itemSize] of [["aSize", sizes, 1], ["aAlpha", alphas, 1], ["aPhase", phases, 1], ["aMetrics", metricVectors, 4], ["aShape", shapeVectors, 4], ["aDrift", drifts, 3], ["aColor", colors, 3], ["aTemporal", temporals, 4] ] as const) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, itemSize));
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({ vertexShader: SPRITE_VERTEX, fragmentShader: SPRITE_FRAGMENT, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uSize: { value: 1 }, uOpacity: { value: style === 3 ? 0.72 : 1 }, uStyle: { value: style }, uDrift: { value: 0 }, uWave: { value: 0 }, uGrowth: { value: 0 }, uTremor: { value: 0 }, uAccumulation: { value: 0 }, uOscillation: { value: 0 }, uDepthSpread: { value: 1 }, uForegroundScale: { value: 1.2 }, uBackgroundScale: { value: 0.8 }, uFocusDisorder: { value: 0.65 }, uSpatialEcho: { value: 0.55 }, uParallax: { value: 0.3 }, uHighlight: { value: 0.72 }, uBlackRetention: { value: 0.65 }, uSaturation: { value: 0.8 }, uWaveOrigins: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) }, uWaveParams: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) } }, name: `skin-art-composer-sprite-${style}` });
  const object = new THREE.Points(geometry, material); object.frustumCulled = false; object.renderOrder = style === 3 ? 1 : 3;
  return { geometry, material, object };
}

function lineLayer(source: ComposerSource, palette: ComposerPalette): LineLayer {
  const starts = source.edges.map((edge) => edge.start.clone()); const ends = source.edges.map((edge) => edge.end.clone());
  const positions: number[] = []; const colors: number[] = [];
  source.edges.forEach((edge, index) => { positions.push(edge.start.x, edge.start.y, edge.start.z, edge.end.x, edge.end.y, edge.end.z); const color = sourceColor("SUPPORT", edge, index, palette, 0.68, 0.56); colors.push(color.r, color.g, color.b, color.r, color.g, color.b); });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, name: "skin-art-composer-hairlines" });
  const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false; object.renderOrder = 4;
  return { geometry, material, object, starts, ends };
}

export class ComposerRuntime {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.01, 100);
  readonly controls: TrackballControls;
  private readonly artwork: HTMLElement;
  private readonly source: ComposerSource;
  private readonly budget: ComposerBudget;
  private readonly layers: { points: SpriteLayer; gaussian: SpriteLayer; cloud: SpriteLayer; light: SpriteLayer; void: SpriteLayer; hairlines: LineLayer; softLines: SpriteLayer };
  private readonly baseCamera = new THREE.Vector3(5.4, -8.2, 4.5);
  private readonly cameraTargetOrigin = new THREE.Vector3(0, 0.2, 0);
  private readonly target = new THREE.Vector3(0, 0.2, 0);
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
    this.camera.up.set(0, 0, 1); this.scene.scale.setScalar(1.7); this.fitCamera(); this.camera.position.copy(this.baseCamera); this.camera.lookAt(this.target);
    this.controls = new TrackballControls(this.camera, this.renderer.domElement);
    this.controls.rotateSpeed = 1.0; this.controls.zoomSpeed = 1.2; this.controls.panSpeed = 0.3; this.controls.staticMoving = true; this.controls.dynamicDampingFactor = 0.12; this.controls.keys = ["", "", ""];
    this.controls.target.copy(this.target); this.controls.update(); this.captureUserPose();
    this.defaultCameraPosition.copy(this.userPosition); this.defaultCameraTarget.copy(this.userTarget); this.defaultCameraUp.copy(this.userUp);
    this.applySavedCameraPose(state);
    this.controls.addEventListener("start", this.handleControlStart); this.controls.addEventListener("change", this.handleControlChange);
    this.resize(); window.addEventListener("resize", this.resize);
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
  cameraData(): { mode: ComposerCameraMode; position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fov: number } { const pose = this.cameraStatePatch(); return { mode: pose.mode, position: [pose.position[0], pose.position[1], pose.position[2]], target: [pose.target[0], pose.target[1], pose.target[2]], up: [pose.up[0], pose.up[1], pose.up[2]], fov: this.camera.fov }; }
  restart(): void { this.elapsedSeconds = 0; this.lastTick = performance.now(); this.playing = true; }
  resetCamera(): void { this.clearAutoOffset(); this.camera.position.copy(this.defaultCameraPosition); this.camera.up.copy(this.defaultCameraUp); this.controls.target.copy(this.defaultCameraTarget); this.camera.fov = this.state.camera.fov; this.controls.update(); this.captureUserPose(); }
  renderNow(): void { this.renderer.render(this.scene, this.camera); }
  resize = (): void => { const width = Math.max(1, this.artwork.clientWidth || window.innerWidth); const height = Math.max(1, this.artwork.clientHeight || window.innerHeight); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); };

  dispose(): void { this.destroyed = true; window.cancelAnimationFrame(this.animationFrame); window.removeEventListener("resize", this.resize); this.controls.removeEventListener("start", this.handleControlStart); this.controls.removeEventListener("change", this.handleControlChange); this.controls.dispose(); Object.values(this.layers).forEach((layer) => { layer.geometry.dispose(); layer.material.dispose(); }); this.renderer.dispose(); this.renderer.domElement.remove(); }

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

  private createLayers() {
    const pointData: SpriteDatum[] = []; const gaussianData: SpriteDatum[] = []; const cloudData: SpriteDatum[] = []; const lightData: SpriteDatum[] = []; const voidData: SpriteDatum[] = []; const softLineData: SpriteDatum[] = [];
    const palette = this.state.color.palette; const makeDatum = (position: THREE.Vector3, edge: ComposerSource["edges"][number], index: number, style: "point" | "gaussian" | "cloud" | "void", layer: number): SpriteDatum => ({ position, size: style === "point" ? 0.046 + edge.density * 0.034 : style === "gaussian" ? 0.2 + edge.length * 0.18 + edge.motifInfluence * 0.15 : style === "cloud" ? 0.28 + edge.density * 0.36 : 0.08 + edge.density * 0.04, alpha: style === "point" ? 0.34 : style === "gaussian" ? 0.38 + edge.connectivity * 0.2 : style === "cloud" ? 0.2 : 0.12, phase: hash(index * 11 + style.length, this.state.seed), layer, metric: edge.density, connectivity: edge.connectivity, directionChange: edge.directionChange, support: edge.supportRole, motif: edge.motifInfluence, aspect: style === "gaussian" ? 0.36 + edge.length * 0.34 : style === "cloud" ? 0.6 + hash(index, this.state.seed) * 1.2 : 0.7 + hash(index * 3, this.state.seed) * 0.5, angle: Math.atan2(edge.direction.y, edge.direction.x) + hash(index * 4, this.state.seed) * 0.5, color: sourceColor(this.state.color.source, edge, index, palette, this.state.color.saturation, this.state.color.localContrast), drift: edge.direction.clone().multiplyScalar(0.018 + edge.directionChange * 0.026).add(new THREE.Vector3((hash(index + 19, this.state.seed) - 0.5) * 0.025, (hash(index + 23, this.state.seed) - 0.5) * 0.025, (hash(index + 29, this.state.seed) - 0.5) * 0.02)), growthStart: 0, growthDuration: 1, clusterFrequency: 0.5, region: index % 6 });
    const datum = (position: THREE.Vector3, edge: ComposerSource["edges"][number], index: number, style: "point" | "gaussian" | "cloud" | "void", layer: number): SpriteDatum => { const base = makeDatum(position, edge, index, style, layer); return { ...base, growthStart: hash(index * 17 + 3, this.state.seed) * 1.8 + (index % 9) * 0.18, growthDuration: 0.8 + hash(index * 19 + 7, this.state.seed) * 2.6, clusterFrequency: 0.14 + hash(index * 23 + 11, this.state.seed) * 0.86, region: index % 6 }; };
    const nodes = this.source.nodes; nodes.forEach((node, index) => { const edge = nearestEdge(this.source, node); pointData.push(datum(node.clone().add(new THREE.Vector3((hash(index, this.state.seed) - 0.5) * 0.018, (hash(index + 4, this.state.seed) - 0.5) * 0.018, 0)), edge, index, "point", 2)); });
    const pointSamples = Math.min(this.budget.pointLike, Math.max(1, this.source.edges.length * 5)); const gaussianSamples = Math.min(this.budget.gaussian, Math.max(1, this.source.edges.length * 3));
    for (let index = 0; index < pointSamples; index += 1) { const edge = this.source.edges[index % this.source.edges.length]!; const u = (hash(index * 7, this.state.seed) * 0.92) + 0.04; pointData.push(datum(edgePoint(edge, u).add(new THREE.Vector3((hash(index * 2, this.state.seed) - 0.5) * 0.03, (hash(index * 3, this.state.seed) - 0.5) * 0.03, (hash(index * 5, this.state.seed) - 0.5) * 0.025)), edge, index + 100, "point", index % 5 === 0 ? 1 : 2)); }
    for (let index = 0; index < gaussianSamples; index += 1) { const edge = this.source.edges[(index * 3) % this.source.edges.length]!; gaussianData.push(datum(edgePoint(edge, (index % 7 + 1) / 8), edge, index + 500, "gaussian", index % 3)); }
    const ribbonSamples = Math.min(this.budget.ribbonSamples, Math.max(1, this.source.edges.length * 4));
    for (let index = 0; index < ribbonSamples; index += 1) { const edge = this.source.edges[index % this.source.edges.length]!; const sample = datum(edgePoint(edge, (index % 4 + 1) / 5), edge, index + 1600, "gaussian", index % 3); softLineData.push({ ...sample, size: 0.12 + edge.length * 0.07 + edge.connectivity * 0.04, alpha: 0.16 + edge.motifInfluence * 0.1, aspect: 0.16 + edge.length * 0.2, angle: Math.atan2(edge.direction.y, edge.direction.x) }); }
    this.source.motifs.forEach((motif, index) => { const edge = nearestEdge(this.source, motif.center); gaussianData.push(datum(motif.center.clone(), edge, index + 900, "gaussian", 0)); lightData.push({ ...datum(motif.center.clone(), edge, index + 1900, "cloud", 0), size: 0.68 + motif.scale * 0.72, alpha: 0.36 + edge.motifInfluence * 0.2, aspect: 0.72 + hash(index + 4, this.state.seed) * 0.9, motif: 1 }); for (let ring = 0; ring < Math.min(18, Math.ceil(this.budget.cloud / Math.max(1, this.source.motifs.length))); ring += 1) { const angle = hash(ring * 3 + index, this.state.seed) * Math.PI * 2; const radius = motif.scale * (1.4 + hash(ring * 5 + index, this.state.seed) * 4.4); cloudData.push(datum(motif.center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, (hash(ring * 7 + index, this.state.seed) - 0.5) * radius)), edge, index * 31 + ring, "cloud", ring % 3)); } });
    this.source.edges.forEach((edge, index) => { if (index % 2 === 0) voidData.push(datum(edge.midpoint.clone(), edge, index + 1200, "void", index % 3)); if (edge.connectivity > 0.48 || edge.motifInfluence > 0.5) { const direction = new THREE.Vector3(-edge.direction.y, edge.direction.x, edge.direction.z * 0.2).normalize(); lightData.push({ ...datum(edge.midpoint.clone().addScaledVector(direction, 0.06 + edge.length * 0.12), edge, index + 2300, "cloud", index % 3), size: 0.38 + edge.connectivity * 0.46 + edge.length * 0.2, alpha: 0.2 + edge.connectivity * 0.2, aspect: 0.46 + edge.length * 0.22, motif: Math.max(edge.motifInfluence, 0.62) }); } });
    return { points: spriteLayer(pointData, 0), gaussian: spriteLayer(gaussianData, 1), cloud: spriteLayer(cloudData.slice(0, this.budget.cloud), 2), light: spriteLayer(lightData.slice(0, Math.max(1, Math.floor(this.budget.cloud * 0.72))), 2), void: spriteLayer(voidData, 3), hairlines: lineLayer(this.source, palette), softLines: spriteLayer(softLineData, 1) };
  }

  private updateSprite(layer: SpriteLayer, amount: number, styleSize: number): void {
    if (this.waveParamAmount !== this.state.motion.wave) { this.waveParamAmount = this.state.motion.wave; this.waveParams.forEach((param, index) => param.set(0.78 + index * 0.19, 0.16 + index * 0.055, this.state.motion.wave * (0.2 + index * 0.035), 0.52 + index * 0.13)); }
    const uniforms = layer.material.uniforms; uniforms.uTime.value = this.elapsedSeconds; uniforms.uAmount.value = amount; uniforms.uSize.value = styleSize; uniforms.uDrift.value = this.state.motion.drift; uniforms.uWave.value = this.state.motion.wave; uniforms.uGrowth.value = this.state.motion.growth; uniforms.uTremor.value = this.state.motion.tremor; uniforms.uAccumulation.value = this.state.motion.accumulation; uniforms.uOscillation.value = this.state.motion.oscillation; uniforms.uDepthSpread.value = this.state.space.depthSpread; uniforms.uForegroundScale.value = this.state.space.foregroundScale; uniforms.uBackgroundScale.value = this.state.space.backgroundScale; uniforms.uFocusDisorder.value = this.state.space.focusDisorder; uniforms.uSpatialEcho.value = this.state.space.spatialEcho; uniforms.uParallax.value = this.state.space.parallax; uniforms.uHighlight.value = this.state.color.highlight; uniforms.uBlackRetention.value = this.state.color.blackRetention; uniforms.uSaturation.value = this.state.color.saturation; uniforms.uWaveOrigins.value = this.waveOrigins; uniforms.uWaveParams.value = this.waveParams;
  }

  private updateLines(layer: LineLayer, amount: number, blur: number): void {
    layer.material.opacity = amount * blur; const positions = layer.geometry.getAttribute("position") as THREE.BufferAttribute; const values = positions.array as Float32Array;
    this.source.edges.forEach((edge, index) => { const wave = this.waveAt(edge.midpoint); const localPhase = fract(this.elapsedSeconds * (0.16 + (index % 5) * 0.012) - (index % 11) * 0.08); const growthReveal = this.state.motion.growth <= 0 ? 1 : smoothReveal(localPhase); const wobble = Math.sin(this.elapsedSeconds * (0.38 + edge.directionChange * 1.1) + index * 1.7) * this.state.motion.tremor * edge.directionChange * 0.018; const drift = edge.direction.clone().multiplyScalar(this.state.motion.drift * (0.01 + edge.supportRole * 0.016) + wave * this.state.motion.wave * 0.008); const start = layer.starts[index]!.clone().add(drift).add(new THREE.Vector3(0, 0, wobble)); const fullEnd = layer.ends[index]!.clone().add(drift).add(new THREE.Vector3(0, 0, wobble)); const end = start.clone().lerp(fullEnd, growthReveal); const offset = index * 6; values[offset] = start.x; values[offset + 1] = start.y; values[offset + 2] = start.z; values[offset + 3] = end.x; values[offset + 4] = end.y; values[offset + 5] = end.z; }); positions.needsUpdate = true;
  }

  private waveAt(point: THREE.Vector3): number { return this.waveOrigins.reduce((sum, origin, index) => sum + Math.sin(point.distanceTo(origin) * (0.78 + index * 0.19) - this.elapsedSeconds * (0.16 + index * 0.055) + index * 0.8) * this.state.motion.wave * (0.2 + index * 0.035) * Math.exp(-point.distanceTo(origin) * (0.52 + index * 0.13)), 0); }

  private captureUserPose(): void { this.userPosition.copy(this.camera.position); this.userTarget.copy(this.controls.target); this.userUp.copy(this.camera.up); }

  private clearAutoOffset(): void { if (this.autoPositionOffset.lengthSq() > 0) this.camera.position.sub(this.autoPositionOffset); if (this.autoTargetOffset.lengthSq() > 0) this.controls.target.sub(this.autoTargetOffset); this.autoPositionOffset.set(0, 0, 0); this.autoTargetOffset.set(0, 0, 0); this.target.copy(this.controls.target); }

  private readonly handleControlStart = (): void => { this.clearAutoOffset(); this.controls.update(); this.captureUserPose(); };
  private readonly handleControlChange = (): void => { if (this.autoPositionOffset.lengthSq() < 1e-10) this.captureUserPose(); };

  private applySavedCameraPose(state: ComposerState): void {
    const saved = state.camera;
    const defaultPose = DEFAULT_COMPOSER_STATE.camera;
    const hasSavedPose = saved.position.some((value, index) => Math.abs(value - defaultPose.position[index]) > 0.001) || saved.target.some((value, index) => Math.abs(value - defaultPose.target[index]) > 0.001) || saved.up.some((value, index) => Math.abs(value - defaultPose.up[index]) > 0.001);
    if (!hasSavedPose) return;
    this.camera.position.fromArray(saved.position); this.camera.up.fromArray(saved.up); this.controls.target.fromArray(saved.target); this.camera.fov = saved.fov; this.controls.update(); this.captureUserPose();
  }

  private updateCamera(): void {
    const t = this.elapsedSeconds; const camera = this.state.camera; this.clearAutoOffset(); this.controls.update(); this.captureUserPose(); this.camera.fov = camera.fov;
    if (camera.mode === "MANUAL") { this.target.copy(this.userTarget); this.camera.updateProjectionMatrix(); return; }
    const positionOffset = new THREE.Vector3(); const targetOffset = new THREE.Vector3();
    if (camera.mode === "DRIFT") {
      positionOffset.set(Math.sin(t * 0.11) * camera.orbit * 0.22, Math.cos(t * 0.08) * camera.dolly * 0.26, Math.sin(t * 0.07) * camera.targetShift * 0.18);
      targetOffset.set(Math.sin(t * 0.09) * camera.targetShift * 0.2, Math.cos(t * 0.067) * camera.targetShift * 0.14, Math.sin(t * 0.053) * camera.targetShift * 0.1);
    } else {
      const direction = this.userPosition.clone().sub(this.userTarget).normalize();
      positionOffset.set(Math.sin(t * 0.071) * camera.orbit * 0.5 + Math.cos(t * 0.037) * camera.dolly * 0.24, Math.cos(t * 0.059) * camera.dolly * 0.42, Math.sin(t * 0.047) * camera.targetShift * 0.34);
      positionOffset.addScaledVector(direction, Math.sin(t * 0.041) * camera.passThrough * 0.36);
      targetOffset.set(Math.sin(t * 0.061) * camera.targetShift * 0.34, Math.cos(t * 0.043) * camera.targetShift * 0.24, Math.sin(t * 0.029) * camera.targetShift * 0.18);
    }
    this.autoPositionOffset.copy(positionOffset); this.autoTargetOffset.copy(targetOffset); this.camera.position.copy(this.userPosition).add(positionOffset); this.controls.target.copy(this.userTarget).add(targetOffset); this.target.copy(this.controls.target); this.camera.lookAt(this.target); this.camera.updateProjectionMatrix();
  }

  private readonly tick = (now: number): void => { if (this.destroyed) return; const delta = Math.min(0.06, Math.max(0, (now - this.lastTick) / 1000)); this.lastTick = now; if (this.playing) this.elapsedSeconds += delta; this.updateSprite(this.layers.points, this.state.visual.points, 1); this.updateSprite(this.layers.gaussian, this.state.visual.gaussian, 1.22); this.updateSprite(this.layers.cloud, this.state.visual.cloud, 1.5); this.updateSprite(this.layers.light, this.state.visual.light, 1.62); this.updateSprite(this.layers.void, this.state.visual.void, 0.9); this.updateSprite(this.layers.softLines, this.state.visual.softLines, 1.08); this.updateLines(this.layers.hairlines, this.state.visual.hairlines, 0.46); this.updateCamera(); this.renderer.render(this.scene, this.camera); this.animationFrame = window.requestAnimationFrame(this.tick); };
}
