import * as THREE from "three";
import type { ConceptMovieV3Palette } from "./catalog.ts";
import { seededRandom } from "./replaySeed.ts";
import type { V3Source, VisualSourceMetric } from "./source.ts";

export interface ConceptMovieV3Frame {
  readonly progress: number;
  readonly stage: string;
  readonly stable: boolean;
  readonly seed: number;
}

type MotionState = "drift" | "hold" | "tremble" | "gather" | "dissolve" | "pulse";

interface SpriteDatum {
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
  readonly state: MotionState;
  readonly luminance: number;
  readonly color: THREE.Color;
  readonly drift: THREE.Vector3;
}

interface WaveEmitter {
  readonly origin: THREE.Vector3;
  readonly frequency: number;
  readonly speed: number;
  readonly amplitude: number;
  readonly falloff: number;
}

interface SpriteLayer {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
}

const DURATION = 42_000;
const MAX_WAVES = 8;

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute float aMorph;
  attribute float aAspect;
  attribute float aAngle;
  attribute float aLayer;
  attribute float aMetric;
  attribute float aFocus;
  attribute float aState;
  attribute float aLuminance;
  attribute vec3 aDrift;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uEnergy;
  uniform float uPointScale;
  uniform float uFocusShift;
  uniform vec3 uWaveOrigins[8];
  uniform vec4 uWaveParams[8];

  varying float vAlpha;
  varying float vPhase;
  varying float vMorph;
  varying float vAspect;
  varying float vAngle;
  varying float vFocus;
  varying float vAccumulation;
  varying vec3 vColor;

  float waveAt(vec3 point) {
    float result = 0.0;
    for (int index = 0; index < 8; index += 1) {
      vec4 params = uWaveParams[index];
      float distanceToEmitter = distance(point, uWaveOrigins[index]);
      float envelope = exp(-distanceToEmitter * params.w);
      result += sin(distanceToEmitter * params.x - uTime * params.y + aPhase * 5.7) * params.z * envelope;
    }
    return result;
  }

  void main() {
    float wave = waveAt(position);
    float stateTempo = 0.16 + aPhase * 0.21 + aState * 0.025;
    float stateMotion = 0.0;
    if (aState < 0.5) stateMotion = sin(uTime * stateTempo + aPhase * 20.0) * 0.78;
    else if (aState < 1.5) stateMotion = sin(uTime * stateTempo * 0.42 + aPhase * 11.0) * 0.22;
    else if (aState < 2.5) stateMotion = (sin(uTime * stateTempo * 2.4 + aPhase * 31.0) + sin(uTime * stateTempo * 5.1)) * 0.38;
    else if (aState < 3.5) stateMotion = sin(uTime * stateTempo * 0.74 + aPhase * 17.0) * 0.55;
    else if (aState < 4.5) stateMotion = sin(uTime * stateTempo * 1.18 + aPhase * 7.0) * 0.88;
    else stateMotion = sin(uTime * stateTempo * 1.64 + aPhase * 24.0) * 0.62;

    vec3 animatedPosition = position + aDrift * (0.34 + 0.28 * stateMotion + wave * 0.52 + uEnergy * 0.16);
    float radialNudge = sin(uTime * (0.09 + aPhase * 0.03) + aPhase * 14.0) * 0.012;
    animatedPosition += normalize(position + vec3(0.001, 0.003, 0.002)) * radialNudge * (0.4 + aMetric);

    vec4 modelViewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    float perspective = 86.0 / max(1.0, -modelViewPosition.z);
    float breathingSize = 1.0 + 0.08 * sin(uTime * (0.11 + aPhase * 0.05) + aPhase * 22.0) + wave * 0.05;
    gl_PointSize = clamp(aSize * uPointScale * perspective * breathingSize, 1.0, 240.0);

    vColor = aColor;
    vAlpha = aAlpha;
    vPhase = aPhase;
    vMorph = clamp(aMorph + wave * 0.16 + uEnergy * 0.12, 0.0, 1.0);
    vAspect = aAspect;
    vAngle = aAngle + wave * 0.16;
    vFocus = clamp(aFocus + uFocusShift * (0.55 - aLayer * 0.12), 0.0, 1.0);
    vAccumulation = clamp(aLuminance * 0.72 + max(0.0, wave) * 0.22 + aMetric * 0.18 + uEnergy * 0.08, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vPhase;
  varying float vMorph;
  varying float vAspect;
  varying float vAngle;
  varying float vFocus;
  varying float vAccumulation;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float cosine = cos(vAngle);
    float sine = sin(vAngle);
    vec2 rotated = vec2(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
    rotated.x /= max(0.34, vAspect);
    float radius = dot(rotated, rotated);
    if (radius > 0.98) discard;

    float boundary = pow(1.0 - smoothstep(0.58, 0.94, radius), 1.55);
    float disk = 1.0 - smoothstep(0.28, 0.9, radius);
    float gaussian = exp(-radius * mix(1.42, 0.64, vFocus));
    float softHalo = exp(-radius * 1.35) * (0.035 + 0.075 * vMorph);
    float shape = mix(disk, gaussian, vMorph);
    float focusSoftness = mix(0.68, 1.0, vFocus);
    float shimmer = 0.93 + 0.07 * sin(uTime * (0.17 + vPhase * 0.06) + vPhase * 19.0);

    // White is an accumulation result: only dense luminous elements approach it.
    float whiteAmount = smoothstep(0.68, 1.0, vAccumulation) * (0.22 + 0.68 * vMorph);
    vec3 color = mix(vColor, vec3(1.0, 0.985, 0.92), whiteAmount);
    float alpha = (shape * focusSoftness + softHalo) * boundary * vAlpha * uOpacity * shimmer;
    gl_FragColor = vec4(color, alpha);
  }
`;

const RICH_PALETTE = [0xe6665c, 0xe7a14d, 0x8b77cf, 0x42b1b9, 0xe7d176, 0xf2c6ac] as const;
const RED_PALETTE = [0x5d1229, 0x8f2034, 0xc9424b, 0xe77878, 0xffd6c2, 0xfff0df] as const;
const BLUE_PALETTE = [0x10275f, 0x194f8f, 0x218dad, 0x63cbd4, 0xa1dbe1, 0xe7f7f1] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function stateCode(state: MotionState): number {
  return { drift: 0, hold: 1, tremble: 2, gather: 3, dissolve: 4, pulse: 5 }[state];
}

function paletteValues(palette: ConceptMovieV3Palette): readonly number[] {
  if (palette === "red") return RED_PALETTE;
  if (palette === "blue") return BLUE_PALETTE;
  return RICH_PALETTE;
}

function paletteColor(palette: ConceptMovieV3Palette, index: number, lightness = 0): THREE.Color {
  const values = paletteValues(palette);
  return new THREE.Color(values[index % values.length]).lerp(new THREE.Color(0xfff3e3), clamp01(lightness));
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const drawable = child as THREE.Mesh;
    drawable.geometry?.dispose();
    const material = drawable.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

function displayVector(value: THREE.Vector3, source: V3Source): THREE.Vector3 {
  return value.clone().sub(source.center).multiplyScalar(4.45 / source.span);
}

function addJitter(random: () => number, scale: number): THREE.Vector3 {
  const angle = random() * Math.PI * 2;
  const radial = Math.sqrt(random()) * scale;
  return new THREE.Vector3(
    Math.cos(angle) * radial,
    Math.sin(angle) * radial,
    (random() - 0.5) * scale * 0.62,
  );
}

function motionFor(metric: VisualSourceMetric, index: number): MotionState {
  if (metric.directionChange > 0.67) return "tremble";
  if (metric.supportRole > 0.7 && index % 5 === 0) return "hold";
  if (metric.density > 0.6) return "gather";
  if (metric.motifInfluence < 0.22 && index % 7 === 0) return "dissolve";
  if (metric.motifInfluence > 0.65) return "pulse";
  return "drift";
}

function sourceDirection(metric: VisualSourceMetric): THREE.Vector3 {
  const direction = metric.direction.clone();
  if (direction.lengthSq() < 0.0001) return new THREE.Vector3(0.12, 0.06, 0.04);
  return direction.normalize();
}

export class ConceptMovieV3Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly root: HTMLElement;
  private readonly source: V3Source;
  private readonly onFrame: (frame: ConceptMovieV3Frame) => void;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.03, 100);
  private readonly movieGroup = new THREE.Group();
  private readonly initialCameraPosition = new THREE.Vector3(3.9, -6.4, 3.5);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3(0, 0, 1);
  private readonly waveEmitters: WaveEmitter[] = [];
  private spriteLayer: SpriteLayer | null = null;
  private activePalette: ConceptMovieV3Palette;
  private presentationSeed: number;
  private startedAt = performance.now();
  private lastFrameBucket = -1;
  private animationFrame = 0;
  private destroyed = false;

  constructor(
    root: HTMLElement,
    source: V3Source,
    palette: ConceptMovieV3Palette,
    seed: number,
    onFrame: (frame: ConceptMovieV3Frame) => void,
  ) {
    this.root = root;
    this.source = source;
    this.activePalette = palette;
    this.presentationSeed = seed;
    this.onFrame = onFrame;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "concept-movies-v3-canvas";
    this.renderer.domElement.setAttribute("aria-label", "SKIN ART bouquet weather artwork");
    this.root.appendChild(this.renderer.domElement);
    this.camera.up.copy(this.cameraUp);
    this.camera.position.copy(this.initialCameraPosition);
    this.camera.lookAt(this.cameraTarget);
    this.updateCameraBasis();
    this.scene.add(this.movieGroup);
    this.buildPresentation();
    window.addEventListener("resize", this.resize);
    this.resize();
    this.tick = this.tick.bind(this);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  setPalette(palette: ConceptMovieV3Palette): void {
    this.activePalette = palette;
    this.buildPresentation();
    this.startedAt = performance.now();
  }

  replay(seed: number): void {
    this.presentationSeed = seed;
    this.buildPresentation();
    this.startedAt = performance.now();
    this.lastFrameBucket = -1;
    this.emitFrame(0);
  }

  destroy(): void {
    this.destroyed = true;
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    this.clearPresentation();
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.root.clientWidth || window.innerWidth);
    const height = Math.max(1, this.root.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly tick = (now: number): void => {
    if (this.destroyed) return;
    const elapsed = now - this.startedAt;
    const cycleElapsed = elapsed % DURATION;
    const seconds = elapsed * 0.001;
    const energy = 0.42 + 0.26 * Math.sin(seconds * 0.17 + 0.6) + 0.18 * Math.sin(seconds * 0.071 + 2.1);
    this.updateCamera(seconds);
    if (this.spriteLayer) {
      this.spriteLayer.material.uniforms.uTime.value = seconds;
      this.spriteLayer.material.uniforms.uEnergy.value = clamp01(energy);
      this.spriteLayer.material.uniforms.uFocusShift.value = 0.13 * Math.sin(seconds * 0.083 + 1.7) + 0.06 * Math.sin(seconds * 0.19);
    }
    this.renderer.render(this.scene, this.camera);
    const bucket = Math.floor(elapsed / 240);
    if (bucket !== this.lastFrameBucket) {
      this.lastFrameBucket = bucket;
      this.emitFrame(cycleElapsed / DURATION);
    }
    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private emitFrame(progress: number): void {
    const time = performance.now() - this.startedAt;
    const energy = 0.42 + 0.26 * Math.sin(time * 0.00017 + 0.6) + 0.18 * Math.sin(time * 0.000071 + 2.1);
    const stage = energy > 0.68 ? "LUMINOUS WEATHER" : energy < 0.29 ? "DARK GAPS / DRIFT" : "POINT / GAUSSIAN FIELD";
    this.onFrame({ progress, stage, stable: false, seed: this.presentationSeed });
  }

  private updateCamera(seconds: number): void {
    const side = Math.sin(seconds * 0.061 + 0.8) * 0.22 + Math.sin(seconds * 0.113 + 2.2) * 0.08;
    const vertical = Math.sin(seconds * 0.047 + 1.1) * 0.14 + Math.sin(seconds * 0.091) * 0.05;
    const forward = Math.sin(seconds * 0.035 + 2.8) * 0.18;
    this.camera.position.copy(this.initialCameraPosition)
      .addScaledVector(this.cameraRight, side)
      .addScaledVector(this.cameraUp, vertical)
      .addScaledVector(new THREE.Vector3(0.35, 0.18, -0.08).normalize(), forward);
    this.camera.lookAt(this.cameraTarget);
  }

  private updateCameraBasis(): void {
    this.camera.getWorldDirection(this.cameraForward).normalize();
    this.cameraRight.copy(this.cameraForward).cross(this.camera.up).normalize();
  }

  private clearPresentation(): void {
    for (const child of [...this.movieGroup.children]) {
      this.movieGroup.remove(child);
      disposeObject(child);
    }
    this.spriteLayer = null;
    this.waveEmitters.length = 0;
  }

  private buildPresentation(): void {
    this.clearPresentation();
    const random = seededRandom(this.presentationSeed);
    const points: SpriteDatum[] = [];
    const add = (datum: Omit<SpriteDatum, "color"> & { color?: THREE.Color }): void => {
      points.push({ ...datum, color: datum.color ?? paletteColor(this.activePalette, points.length, datum.luminance * 0.08) });
    };
    const metricAnchors = this.source.metrics.map((metric) => displayVector(metric.position, this.source));
    const motifAnchors = this.source.motifs.map((motif) => displayVector(motif, this.source));
    const nodeAnchors = this.source.nodes.map((node) => displayVector(node, this.source));

    for (const [motifIndex, anchor] of motifAnchors.entries()) {
      const motifColor = paletteColor(this.activePalette, motifIndex, 0.04);
      for (let index = 0; index < 48; index += 1) {
        const jitter = addJitter(random, 0.12 + (index % 5) * 0.026);
        const layer = index % 9 === 0 ? 0 : index % 3 === 0 ? 1 : 2;
        const metric = 0.48 + (index % 7) * 0.055;
        add({
          position: anchor.clone().add(jitter).add(new THREE.Vector3(0, 0, (layer - 1) * 0.18)),
          size: 0.032 + (index % 6) * 0.007 + (layer === 0 ? 0.06 : 0),
          alpha: layer === 0 ? 0.18 : 0.19 + (index % 4) * 0.022,
          phase: random(),
          morph: layer === 0 ? 0.74 : 0.36 + (index % 5) * 0.08,
          aspect: 0.74 + (index % 4) * 0.18,
          angle: random() * Math.PI,
          layer,
          metric,
          focus: layer === 0 ? 0.88 : layer === 1 ? 0.63 : 0.22,
          state: index % 7 === 0 ? "hold" : index % 5 === 0 ? "pulse" : "gather",
          luminance: layer === 0 ? 0.84 : 0.54 + (index % 5) * 0.045,
          color: motifColor.clone().lerp(paletteColor(this.activePalette, motifIndex + index, 0.12), 0.34),
          drift: new THREE.Vector3((random() - 0.5) * 0.035, (random() - 0.5) * 0.035, (random() - 0.5) * 0.02),
        });
      }
      for (let index = 0; index < 10; index += 1) {
        add({
          position: anchor.clone().add(addJitter(random, 0.28 + index * 0.018)).add(new THREE.Vector3((random() - 0.5) * 0.16, (random() - 0.5) * 0.16, -0.34 - index * 0.025)),
          size: 0.18 + (index % 4) * 0.07,
          alpha: 0.075 + (index % 3) * 0.024,
          phase: random(),
          morph: 0.91,
          aspect: 0.58 + (index % 3) * 0.25,
          angle: random() * Math.PI,
          layer: 0,
          metric: 0.7,
          focus: 0.16 + (index % 4) * 0.1,
          state: index % 3 === 0 ? "drift" : "hold",
          luminance: 0.7 + (index % 4) * 0.05,
          color: motifColor.clone().lerp(new THREE.Color(0xffe8d1), 0.2),
          drift: new THREE.Vector3((random() - 0.5) * 0.1, (random() - 0.5) * 0.1, (random() - 0.5) * 0.05),
        });
      }
    }

    for (const [index, metric] of this.source.metrics.entries()) {
      const startNode = this.source.graph.nodes[this.source.graph.edges[index]?.start ?? -1];
      const endNode = this.source.graph.nodes[this.source.graph.edges[index]?.end ?? -1];
      const start = startNode ? displayVector(new THREE.Vector3(startNode.position.x, startNode.position.y, startNode.position.z), this.source) : metricAnchors[index];
      const end = endNode ? displayVector(new THREE.Vector3(endNode.position.x, endNode.position.y, endNode.position.z), this.source) : metricAnchors[index];
      const direction = sourceDirection(metric);
      const state = motionFor(metric, index);
      for (const fraction of [0.18, 0.5, 0.82]) {
        const position = start.clone().lerp(end, fraction);
        const layer = index % 7 === 0 ? 0 : index % 3 === 0 ? 1 : 2;
        add({
          position,
          size: 0.012 + metric.density * 0.018 + (layer === 0 ? 0.028 : 0),
          alpha: 0.095 + metric.connectivity * 0.1 + (layer === 0 ? 0.035 : 0),
          phase: (index * 0.137 + fraction) % 1,
          morph: clamp01(0.08 + metric.density * 0.3 + metric.motifInfluence * 0.22),
          aspect: 4.2 + metric.lengthInfluence * 4.8,
          angle: Math.atan2(direction.z, direction.x),
          layer,
          metric: clamp01(metric.density * 0.55 + metric.connectivity * 0.28 + metric.directionChange * 0.17),
          focus: layer === 0 ? 0.86 : layer === 1 ? 0.52 : 0.16,
          state,
          luminance: clamp01(0.2 + metric.motifInfluence * 0.34 + metric.density * 0.28),
          color: paletteColor(this.activePalette, index + 2, metric.supportRole * -0.24),
          drift: direction.clone().multiplyScalar(0.045 + metric.lengthInfluence * 0.05).add(new THREE.Vector3(0, 0, (random() - 0.5) * 0.03)),
        });
      }
      if (index % 2 === 0) {
        add({
          position: metricAnchors[index]?.clone() ?? this.cameraTarget.clone(),
          size: 0.018 + metric.connectivity * 0.025,
          alpha: 0.12 + metric.density * 0.1,
          phase: random(),
          morph: 0.16 + metric.directionChange * 0.3,
          aspect: 1.2 + metric.directionChange * 1.4,
          angle: Math.atan2(direction.y, direction.x),
          layer: 1,
          metric: metric.directionChange,
          focus: 0.48,
          state: metric.directionChange > 0.5 ? "tremble" : "drift",
          luminance: 0.25 + metric.density * 0.32,
          color: paletteColor(this.activePalette, index + 3, -0.3),
          drift: direction.clone().multiplyScalar(0.025),
        });
      }
      if (metric.connectivity > 0.45 && index % 4 === 0) {
        add({
          position: metricAnchors[index]?.clone().add(new THREE.Vector3(0, 0, 0.12)) ?? this.cameraTarget.clone(),
          size: 0.12 + metric.density * 0.08,
          alpha: 0.06 + metric.connectivity * 0.06,
          phase: random(),
          morph: 0.88,
          aspect: 0.82,
          angle: random() * Math.PI,
          layer: 0,
          metric: metric.connectivity,
          focus: 0.22,
          state: "gather",
          luminance: 0.4 + metric.density * 0.42,
          color: paletteColor(this.activePalette, index + 1, -0.12),
          drift: direction.clone().multiplyScalar(0.06),
        });
      }
    }

    for (const [index, node] of nodeAnchors.entries()) {
      add({
        position: node.clone().add(new THREE.Vector3(0, 0, (random() - 0.5) * 0.15)),
        size: 0.014 + (index % 4) * 0.006,
        alpha: 0.11 + (index % 5) * 0.014,
        phase: random(),
        morph: index % 6 === 0 ? 0.58 : 0.08,
        aspect: 0.8 + (index % 3) * 0.4,
        angle: random() * Math.PI,
        layer: index % 4 === 0 ? 1 : 2,
        metric: 0.16 + (index % 8) * 0.05,
        focus: index % 4 === 0 ? 0.55 : 0.08,
        state: index % 9 === 0 ? "dissolve" : "drift",
        luminance: 0.22 + (index % 6) * 0.04,
        color: paletteColor(this.activePalette, index + 4, -0.12),
        drift: new THREE.Vector3((random() - 0.5) * 0.045, (random() - 0.5) * 0.045, (random() - 0.5) * 0.04),
      });
    }

    const atmosphericAnchors = [
      ...motifAnchors.slice(0, 4),
      ...metricAnchors.filter((_, index) => index % 17 === 0).slice(0, 6),
      this.cameraTarget.clone(),
    ];
    for (const [anchorIndex, anchor] of atmosphericAnchors.entries()) {
      for (let index = 0; index < 22; index += 1) {
        const side = (random() - 0.5) * (1.8 + (index % 5) * 0.45);
        const depth = (random() - 0.5) * 2.1;
        add({
          position: anchor.clone().add(new THREE.Vector3(side, depth, (random() - 0.5) * 1.0)),
          size: 0.18 + (index % 5) * 0.08,
          alpha: 0.036 + (index % 4) * 0.013,
          phase: random(),
          morph: 0.96,
          aspect: 0.62 + (index % 4) * 0.26,
          angle: random() * Math.PI,
          layer: index % 5 === 0 ? 0 : 2,
          metric: 0.2 + (index % 5) * 0.12,
          focus: index % 5 === 0 ? 0.04 : 0.12,
          state: index % 4 === 0 ? "dissolve" : "drift",
          luminance: 0.22 + (index % 5) * 0.07,
          color: paletteColor(this.activePalette, anchorIndex + index + 1, -0.26),
          drift: new THREE.Vector3((random() - 0.5) * 0.12, (random() - 0.5) * 0.12, (random() - 0.5) * 0.08),
        });
      }
    }

    // The bouquet is allowed to become weather: structured, source-seeded fog
    // crosses the viewing volume and keeps the screen from reading as a framed
    // object. It is still made of radial splats, never a rectangular overlay.
    for (let index = 0; index < 120; index += 1) {
      const side = (random() - 0.5) * 8.6;
      const vertical = (random() - 0.5) * 5.4;
      const depth = -1.2 + (random() - 0.5) * 2.6;
      const anchor = atmosphericAnchors[index % atmosphericAnchors.length] ?? this.cameraTarget;
      add({
        position: anchor.clone()
          .add(this.cameraRight.clone().multiplyScalar(side))
          .add(this.cameraUp.clone().multiplyScalar(vertical))
          .add(this.cameraForward.clone().multiplyScalar(depth)),
        size: 0.2 + (index % 7) * 0.065,
        alpha: 0.031 + (index % 6) * 0.01,
        phase: random(),
        morph: 0.98,
        aspect: 0.56 + (index % 5) * 0.25,
        angle: random() * Math.PI,
        layer: index % 4 === 0 ? 0 : 2,
        metric: 0.16 + (index % 9) * 0.07,
        focus: index % 4 === 0 ? 0.05 : 0.18,
        state: index % 6 === 0 ? "hold" : index % 5 === 0 ? "dissolve" : "drift",
        luminance: 0.32 + (index % 6) * 0.055,
        color: paletteColor(this.activePalette, index + 2, -0.2),
        drift: this.cameraRight.clone().multiplyScalar((random() - 0.5) * 0.08)
          .add(this.cameraUp.clone().multiplyScalar((random() - 0.5) * 0.05)),
      });
    }

    // A few motif-led weather fronts widen the composition without drawing a
    // fake full-screen plane. Their offsets are fixed by source order and the
    // replay seed, so the spill reads as a bouquet event rather than a texture.
    for (let frontIndex = 0; frontIndex < 5; frontIndex += 1) {
      const anchor = motifAnchors[frontIndex % Math.max(1, motifAnchors.length)] ?? this.cameraTarget;
      const side = (frontIndex - 2) * 1.12;
      const vertical = (frontIndex % 2 === 0 ? 1 : -1) * (0.54 + (frontIndex % 3) * 0.22);
      for (let index = 0; index < 18; index += 1) {
        add({
          position: anchor.clone()
            .add(this.cameraRight.clone().multiplyScalar(side + (random() - 0.5) * 0.72))
            .add(this.cameraUp.clone().multiplyScalar(vertical + (random() - 0.5) * 0.58))
            .add(this.cameraForward.clone().multiplyScalar(-0.35 + (random() - 0.5) * 0.7)),
          size: 0.24 + (index % 6) * 0.075,
          alpha: 0.045 + (index % 5) * 0.012,
          phase: random(),
          morph: 0.77 + (index % 4) * 0.055,
          aspect: 0.72 + (index % 4) * 0.17,
          angle: random() * Math.PI,
          layer: index % 5 === 0 ? 0 : 1,
          metric: 0.35 + (frontIndex % 4) * 0.11,
          focus: index % 5 === 0 ? 0.34 : 0.46,
          state: index % 5 === 0 ? "pulse" : index % 4 === 0 ? "hold" : "drift",
          luminance: 0.46 + (index % 5) * 0.055,
          color: paletteColor(this.activePalette, frontIndex + index, 0.02),
          drift: this.cameraRight.clone().multiplyScalar((frontIndex % 2 === 0 ? 1 : -1) * (0.035 + index * 0.002))
            .add(this.cameraUp.clone().multiplyScalar((random() - 0.5) * 0.035)),
        });
      }
    }

    this.buildWaveEmitters(motifAnchors, metricAnchors);
    this.spriteLayer = this.createSpriteLayer(points);
    this.movieGroup.add(new THREE.Points(this.spriteLayer.geometry, this.spriteLayer.material));
    this.movieGroup.add(this.createHairlineNetwork(random));
  }

  private buildWaveEmitters(motifAnchors: readonly THREE.Vector3[], metricAnchors: readonly THREE.Vector3[]): void {
    const candidates = [
      ...motifAnchors,
      ...this.source.metrics
        .map((metric, index) => ({ metric, position: metricAnchors[index] }))
        .sort((left, right) => (right.metric.connectivity + right.metric.density) - (left.metric.connectivity + left.metric.density))
        .map((item) => item.position)
        .filter((position): position is THREE.Vector3 => position !== undefined),
      ...metricAnchors.filter((_, index) => index % 23 === 0),
    ];
    const unique: THREE.Vector3[] = [];
    for (const candidate of candidates) {
      if (unique.every((other) => other.distanceTo(candidate) > 0.22)) unique.push(candidate.clone());
      if (unique.length >= MAX_WAVES) break;
    }
    while (unique.length < 4) unique.push(metricAnchors[unique.length % Math.max(1, metricAnchors.length)]?.clone() ?? new THREE.Vector3());
    const random = seededRandom(this.presentationSeed ^ 0x9e3779b9);
    for (const [index, origin] of unique.entries()) {
      this.waveEmitters.push({
        origin,
        frequency: 1.1 + random() * 2.8 + (index % 3) * 0.22,
        speed: 0.55 + random() * 0.75 + (index % 2) * 0.16,
        amplitude: 0.24 + random() * 0.22,
        falloff: 0.42 + random() * 0.34,
      });
    }
  }

  private createSpriteLayer(points: readonly SpriteDatum[]): SpriteLayer {
    const positions: number[] = [];
    const sizes: number[] = [];
    const alphas: number[] = [];
    const phases: number[] = [];
    const morphs: number[] = [];
    const aspects: number[] = [];
    const angles: number[] = [];
    const layers: number[] = [];
    const metrics: number[] = [];
    const focuses: number[] = [];
    const states: number[] = [];
    const luminances: number[] = [];
    const drifts: number[] = [];
    const colors: number[] = [];
    for (const point of points) {
      positions.push(point.position.x, point.position.y, point.position.z);
      sizes.push(point.size);
      alphas.push(point.alpha);
      phases.push(point.phase);
      morphs.push(point.morph);
      aspects.push(point.aspect);
      angles.push(point.angle);
      layers.push(point.layer);
      metrics.push(point.metric);
      focuses.push(point.focus);
      states.push(stateCode(point.state));
      luminances.push(point.luminance);
      drifts.push(point.drift.x, point.drift.y, point.drift.z);
      colors.push(point.color.r, point.color.g, point.color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.Float32BufferAttribute(alphas, 1));
    geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
    geometry.setAttribute("aMorph", new THREE.Float32BufferAttribute(morphs, 1));
    geometry.setAttribute("aAspect", new THREE.Float32BufferAttribute(aspects, 1));
    geometry.setAttribute("aAngle", new THREE.Float32BufferAttribute(angles, 1));
    geometry.setAttribute("aLayer", new THREE.Float32BufferAttribute(layers, 1));
    geometry.setAttribute("aMetric", new THREE.Float32BufferAttribute(metrics, 1));
    geometry.setAttribute("aFocus", new THREE.Float32BufferAttribute(focuses, 1));
    geometry.setAttribute("aState", new THREE.Float32BufferAttribute(states, 1));
    geometry.setAttribute("aLuminance", new THREE.Float32BufferAttribute(luminances, 1));
    geometry.setAttribute("aDrift", new THREE.Float32BufferAttribute(drifts, 3));
    geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const waveOrigins = Array.from({ length: MAX_WAVES }, (_, index) => this.waveEmitters[index]?.origin ?? new THREE.Vector3());
    const waveParams = Array.from({ length: MAX_WAVES }, (_, index) => {
      const wave = this.waveEmitters[index];
      return new THREE.Vector4(wave?.frequency ?? 0, wave?.speed ?? 0, wave?.amplitude ?? 0, wave?.falloff ?? 0);
    });
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.42 },
        uPointScale: { value: 12.0 },
        uFocusShift: { value: 0 },
        uOpacity: { value: 1.08 },
        uWaveOrigins: { value: waveOrigins },
        uWaveParams: { value: waveParams },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    material.name = "bouquet-weather-static-attribute-sprites";
    return { geometry, material };
  }

  private createHairlineNetwork(random: () => number): THREE.Group {
    const group = new THREE.Group();
    const finePositions: number[] = [];
    const ghostPositions: number[] = [];
    for (const [index, edge] of this.source.graph.edges.entries()) {
      const startNode = this.source.graph.nodes[edge.start];
      const endNode = this.source.graph.nodes[edge.end];
      if (!startNode || !endNode) continue;
      const start = displayVector(new THREE.Vector3(startNode.position.x, startNode.position.y, startNode.position.z), this.source);
      const end = displayVector(new THREE.Vector3(endNode.position.x, endNode.position.y, endNode.position.z), this.source);
      if ((index + Math.floor(random() * 3)) % 3 === 0) finePositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
      if (index % 5 === 0) ghostPositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
    const fineMaterial = new THREE.LineBasicMaterial({
      color: paletteValues(this.activePalette)[0],
      transparent: true,
      opacity: 0.095,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const ghostMaterial = new THREE.LineBasicMaterial({
      color: paletteValues(this.activePalette)[2] ?? paletteValues(this.activePalette)[0],
      transparent: true,
      opacity: 0.042,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const fineGeometry = new THREE.BufferGeometry();
    fineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(finePositions, 3));
    const ghostGeometry = new THREE.BufferGeometry();
    ghostGeometry.setAttribute("position", new THREE.Float32BufferAttribute(ghostPositions, 3));
    const fine = new THREE.LineSegments(fineGeometry, fineMaterial);
    const ghost = new THREE.LineSegments(ghostGeometry, ghostMaterial);
    fine.renderOrder = 1;
    ghost.renderOrder = 1;
    group.add(fine, ghost);
    group.name = "bouquet-weather-hairline-network";
    return group;
  }
}
