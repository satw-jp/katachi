import * as THREE from "three";
import type { InternalStructureGraph } from "../voronoi.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";
import type { ConceptMovieId, ConceptPalette } from "./catalog.ts";

export interface ConceptMovieFrame {
  readonly progress: number;
  readonly stage: string;
  readonly stable: boolean;
}

interface ConceptPoint {
  readonly position: THREE.Vector3;
  readonly size: number;
  readonly alpha: number;
  readonly color: THREE.Color;
  readonly phase: number;
  readonly stretch: number;
  readonly angle: number;
  readonly drift: THREE.Vector3;
}

interface ConceptCloud {
  readonly object: THREE.Points;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly alphas: Float32Array;
}

interface SourceProfile {
  readonly length: number;
  readonly junction: number;
  readonly hesitation: number;
  readonly tempo: number;
  readonly persistence: number;
}

interface DustItem {
  readonly start: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly profile: SourceProfile;
  readonly phase: number;
  readonly bend: number;
  readonly baseSize: number;
  readonly baseAlpha: number;
}

interface UnstableLine {
  readonly line: THREE.Line;
  readonly material: THREE.LineBasicMaterial;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly profile: SourceProfile;
  readonly phase: number;
  readonly baseOpacity: number;
}

interface UnstablePoint {
  readonly base: THREE.Vector3;
  readonly profile: SourceProfile;
  readonly phase: number;
  readonly baseAlpha: number;
  readonly index: number;
}

interface GapEvent {
  readonly point: THREE.Vector3;
  readonly u: number;
  readonly v: number;
  readonly direction: THREE.Vector2;
  readonly phase: number;
  readonly profile: SourceProfile;
  readonly colorIndex: number;
}

const POINT_VERTEX_SHADER = /* glsl */ `
  attribute float aPointSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute float aStretch;
  attribute float aAngle;
  attribute vec3 aDrift;
  attribute vec3 aColor;
  uniform float uPointScale;
  uniform float uTime;
  uniform float uMotion;
  varying float vAlpha;
  varying float vPhase;
  varying float vStretch;
  varying float vAngle;
  varying vec3 vColor;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vPhase = aPhase;
    vStretch = aStretch;
    vAngle = aAngle;
    float breath = 0.74 + 0.26 * sin(uTime * 0.00054 * (0.74 + aPhase * 0.9) + aPhase * 21.0);
    vec3 animatedPosition = position + aDrift * breath * uMotion;
    vec4 modelViewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    gl_PointSize = clamp(aPointSize * uPointScale * (1.0 + 0.16 * uMotion * sin(uTime * 0.0008 + aPhase * 15.0)) * (120.0 / max(1.0, -modelViewPosition.z)), 1.0, 64.0);
  }
`;

const POINT_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGaussian;
  uniform float uWhite;
  uniform float uOpacity;
  uniform float uTime;
  varying float vAlpha;
  varying float vPhase;
  varying float vStretch;
  varying float vAngle;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float cosine = cos(vAngle);
    float sine = sin(vAngle);
    vec2 rotated = vec2(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
    rotated.x /= max(0.42, vStretch);
    float distance = dot(rotated, rotated);
    if (distance > 3.8) discard;
    float disk = 1.0 - smoothstep(0.56, 1.02, distance);
    float gaussian = exp(-distance * 1.18);
    float edge = mix(disk, gaussian, clamp(uGaussian, 0.0, 1.0));
    float halo = exp(-distance * 0.42) * 0.17 * uGaussian;
    float shimmer = 0.91 + 0.09 * sin(uTime * 0.0015 + vPhase * 17.0);
    float whiteAmount = clamp(uWhite * (0.64 + vPhase * 0.24), 0.0, 1.0);
    vec3 color = mix(vColor, vec3(0.98, 0.99, 0.94), whiteAmount);
    gl_FragColor = vec4(color, (edge + halo) * vAlpha * uOpacity * shimmer);
  }
`;

const RICH_PALETTE = [0xe56e64, 0xe4a255, 0x9c83c8, 0x58b4bd, 0xe5d16b] as const;
const RED_PALETTE = [0x68172b, 0x9f2638, 0xd55256, 0xf0a0a0, 0xffdfc7] as const;
const BLUE_PALETTE = [0x152b6a, 0x1e5f96, 0x2aa6c4, 0x75d4dc, 0xdceff5] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function seeded(index: number, salt = 0): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function paletteColors(palette: ConceptPalette): readonly number[] {
  if (palette === "red") return RED_PALETTE;
  if (palette === "blue") return BLUE_PALETTE;
  return RICH_PALETTE;
}

function colorFor(palette: ConceptPalette, index: number, lightness = 0): THREE.Color {
  const colors = paletteColors(palette);
  return new THREE.Color(colors[index % colors.length]).lerp(new THREE.Color(0xfff4dd), clamp01(lightness));
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const drawable = child as THREE.Mesh;
    if (drawable.geometry) drawable.geometry.dispose();
    const material = drawable.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

function makeLine(positions: readonly number[], material: THREE.LineBasicMaterial, name: string): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const line = new THREE.LineSegments(geometry, material);
  line.name = name;
  line.renderOrder = 8;
  return line;
}

export class ConceptMovieRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly root: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(39, 1, 0.01, 100);
  private readonly source: VisualStudySource;
  private readonly graph: InternalStructureGraph;
  private readonly graphPositions: THREE.Vector3[];
  private readonly motifCenters: THREE.Vector3[];
  private readonly edgeMidpoints: THREE.Vector3[];
  private readonly degree: number[];
  private readonly profiles: readonly SourceProfile[];
  private readonly center: THREE.Vector3;
  private readonly span: number;
  private readonly viewForward = new THREE.Vector3();
  private readonly viewRight = new THREE.Vector3();
  private readonly viewUp = new THREE.Vector3();
  private readonly initialCameraPosition = new THREE.Vector3();
  private readonly artGroup = new THREE.Group();
  private readonly sourceGroup = new THREE.Group();
  private readonly movieGroup = new THREE.Group();
  private readonly sourceMaterial = new THREE.LineBasicMaterial({
    color: 0x9bb8b0,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly motifMaterials: THREE.MeshBasicMaterial[] = [];
  private activeMovie: ConceptMovieId = "bloom-saturation";
  private activePalette: ConceptPalette = "rich";
  private startedAt = performance.now();
  private animationFrame = 0;
  private destroyed = false;
  private bloomField: ConceptCloud | null = null;
  private bloomLight: ConceptCloud | null = null;
  private bloomThreads: THREE.LineSegments | null = null;
  private breathingCloud: ConceptCloud | null = null;
  private dustCloud: ConceptCloud | null = null;
  private dustItems: DustItem[] = [];
  private dustStreaks: THREE.LineSegments | null = null;
  private gapsCloud: ConceptCloud | null = null;
  private gapsSprite: THREE.Sprite | null = null;
  private gapsCanvas: HTMLCanvasElement | null = null;
  private gapsTexture: THREE.CanvasTexture | null = null;
  private gapEvents: GapEvent[] = [];
  private unstableCloud: ConceptCloud | null = null;
  private unstableLines: UnstableLine[] = [];
  private unstablePoints: UnstablePoint[] = [];
  private readonly onFrame: (frame: ConceptMovieFrame) => void;

  constructor(root: HTMLElement, source: VisualStudySource, onFrame: (frame: ConceptMovieFrame) => void) {
    this.root = root;
    this.source = source;
    this.graph = source.graph;
    this.onFrame = onFrame;
    this.graphPositions = this.graph.nodes.map((node) => new THREE.Vector3(node.position.x, node.position.y, node.position.z));
    this.motifCenters = source.patterns.map((patch) => {
      const center = patch.points.reduce(
        (sum, point) => sum.add(new THREE.Vector3(point.x, point.y, point.z)),
        new THREE.Vector3(),
      );
      return center.multiplyScalar(1 / Math.max(1, patch.points.length));
    });
    this.edgeMidpoints = this.graph.edges.map((edge) => {
      const start = this.graphPositions[edge.start] ?? new THREE.Vector3();
      const end = this.graphPositions[edge.end] ?? start;
      return start.clone().add(end).multiplyScalar(0.5);
    });
    this.degree = Array.from({ length: this.graph.nodes.length }, () => 0);
    for (const edge of this.graph.edges) {
      if (this.degree[edge.start] !== undefined) this.degree[edge.start]++;
      if (this.degree[edge.end] !== undefined) this.degree[edge.end]++;
    }
    const bounds = new THREE.Box3().setFromPoints([
      ...this.graphPositions,
      ...this.motifCenters,
      ...source.base.host.map((ball) => new THREE.Vector3(ball.x, ball.y, ball.z)),
    ]);
    this.center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    this.span = Math.max(size.x, size.y, size.z, 1);
    this.profiles = this.deriveProfiles();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x050808, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "concept-movies-canvas";
    this.renderer.domElement.setAttribute("aria-label", "SKIN concept movie artwork");
    this.root.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.fitCamera();
    this.initialCameraPosition.copy(this.camera.position);
    this.camera.getWorldDirection(this.viewForward).normalize();
    this.viewRight.copy(this.viewForward).cross(this.camera.up).normalize();
    this.viewUp.copy(this.viewRight).cross(this.viewForward).normalize();
    this.scene.add(this.artGroup);
    this.artGroup.add(this.sourceGroup, this.movieGroup);
    this.buildSourceLayers();
    this.setMovie("bloom-saturation", "rich");
    window.addEventListener("resize", this.resize);
    this.resize();
    this.tick = this.tick.bind(this);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  setMovie(movie: ConceptMovieId, palette: ConceptPalette = "rich"): void {
    this.activeMovie = movie;
    this.activePalette = palette;
    this.clearMovieObjects();
    this.renderer.setClearColor(0x050808, 1);
    switch (movie) {
      case "bloom-saturation": this.buildBloomSaturation(); break;
      case "breathing-bouquet": this.buildBreathingBouquet(); break;
      case "dust-to-light": this.buildDustToLight(); break;
      case "light-through-gaps": this.buildLightThroughGaps(); break;
      case "unstable-bloom": this.buildUnstableBloom(); break;
    }
    this.startedAt = performance.now();
    this.onFrame({ progress: 0, stage: this.stageLabel(movie, 0), stable: false });
  }

  replay(): void {
    this.startedAt = performance.now();
    this.onFrame({ progress: 0, stage: this.stageLabel(this.activeMovie, 0), stable: false });
  }

  destroy(): void {
    this.destroyed = true;
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    disposeObject(this.scene);
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.root.clientWidth || window.innerWidth);
    const height = Math.max(1, this.root.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.gapsSprite) this.gapsSprite.scale.set(this.span * 3.2 * Math.max(1, this.camera.aspect * 0.72), this.span * 2.2, 1);
  };

  private readonly tick = (now: number): void => {
    if (this.destroyed) return;
    const duration = this.activeMovie === "breathing-bouquet" ? 30_000 : this.activeMovie === "dust-to-light" || this.activeMovie === "unstable-bloom" ? 15_000 : 20_000;
    const elapsed = (now - this.startedAt) % duration;
    const progress = elapsed / duration;
    this.updateMovie(progress, elapsed);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private fitCamera(): void {
    const points = [
      ...this.graphPositions,
      ...this.motifCenters,
      ...this.source.base.host.map((ball) => new THREE.Vector3(ball.x, ball.y, ball.z)),
    ];
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    const direction = new THREE.Vector3(1.15, -1.35, 0.82).normalize();
    const distance = span / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))) * 1.46;
    this.camera.position.copy(center).addScaledVector(direction, Math.max(8.6, distance));
    this.camera.lookAt(center);
  }

  private buildSourceLayers(): void {
    const positions: number[] = [];
    for (const edge of this.graph.edges) {
      const start = this.graphPositions[edge.start];
      const end = this.graphPositions[edge.end];
      if (!start || !end) continue;
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
    this.sourceGroup.add(makeLine(positions, this.sourceMaterial, "completed-source-graph"));
    for (const [index, center] of this.motifCenters.entries()) {
      const material = new THREE.MeshBasicMaterial({
        color: colorFor("rich", index, 0.08),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const motif = new THREE.Mesh(new THREE.SphereGeometry(this.span * (0.008 + (index % 3) * 0.002), 8, 6), material);
      motif.position.copy(center);
      motif.renderOrder = 5;
      this.sourceGroup.add(motif);
      this.motifMaterials.push(material);
    }
  }

  private clearMovieObjects(): void {
    this.gapsTexture?.dispose();
    for (const child of [...this.movieGroup.children]) {
      this.movieGroup.remove(child);
      disposeObject(child);
    }
    this.sourceMaterial.opacity = 0;
    this.motifMaterials.forEach((material) => { material.opacity = 0; });
    this.bloomField = null;
    this.bloomLight = null;
    this.bloomThreads = null;
    this.breathingCloud = null;
    this.dustCloud = null;
    this.dustItems = [];
    this.dustStreaks = null;
    this.gapsCloud = null;
    this.gapsSprite = null;
    this.gapsCanvas = null;
    this.gapsTexture = null;
    this.gapEvents = [];
    this.unstableCloud = null;
    this.unstableLines = [];
    this.unstablePoints = [];
    this.camera.position.copy(this.initialCameraPosition);
    this.camera.lookAt(this.center);
  }

  private deriveProfiles(): readonly SourceProfile[] {
    const incident = new Map<number, number[]>();
    for (const [edgeIndex, edge] of this.graph.edges.entries()) {
      for (const nodeIndex of [edge.start, edge.end]) {
        const edges = incident.get(nodeIndex) ?? [];
        edges.push(edgeIndex);
        incident.set(nodeIndex, edges);
      }
    }
    const lengths = this.graph.edges.map((edge) => {
      const start = this.graphPositions[edge.start] ?? new THREE.Vector3();
      const end = this.graphPositions[edge.end] ?? start;
      return start.distanceTo(end);
    });
    const minimum = Math.min(...lengths, 0);
    const maximum = Math.max(...lengths, 1);
    const directionAt = (edgeIndex: number, nodeIndex: number): THREE.Vector3 => {
      const edge = this.graph.edges[edgeIndex];
      const own = this.graphPositions[nodeIndex] ?? new THREE.Vector3();
      const other = edge?.start === nodeIndex ? edge.end : edge?.start;
      return (this.graphPositions[other ?? nodeIndex] ?? own).clone().sub(own).normalize();
    };
    const turnAt = (edgeIndex: number, nodeIndex: number): number => {
      const current = directionAt(edgeIndex, nodeIndex);
      const neighbors = (incident.get(nodeIndex) ?? []).filter((candidate) => candidate !== edgeIndex);
      if (neighbors.length === 0) return 0;
      return clamp01(neighbors.reduce((sum, neighbor) => sum + 1 - Math.abs(current.dot(directionAt(neighbor, nodeIndex))), 0) / neighbors.length);
    };
    return this.graph.edges.map((edge, index) => {
      const length = lengths[index] ?? 0;
      const lengthVariation = maximum - minimum < 0.000001 ? 0.5 : clamp01((length - minimum) / (maximum - minimum));
      const junction = clamp01(((this.degree[edge.start] ?? 0) + (this.degree[edge.end] ?? 0) - 2) / 9);
      const hesitation = clamp01(turnAt(index, edge.start) * 0.48 + turnAt(index, edge.end) * 0.34 + junction * 0.18);
      return {
        length: lengthVariation,
        junction,
        hesitation,
        tempo: clamp01(0.92 - hesitation * 0.5 + lengthVariation * 0.1),
        persistence: clamp01(0.52 + hesitation * 0.34 + junction * 0.2),
      };
    });
  }

  private createCloud(points: readonly ConceptPoint[], pointScale: number): ConceptCloud {
    const positions = new Float32Array(points.length * 3);
    const sizes = new Float32Array(points.length);
    const alphas = new Float32Array(points.length);
    const phases = new Float32Array(points.length);
    const stretches = new Float32Array(points.length);
    const angles = new Float32Array(points.length);
    const drifts = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    for (const [index, point] of points.entries()) {
      positions[index * 3] = point.position.x;
      positions[index * 3 + 1] = point.position.y;
      positions[index * 3 + 2] = point.position.z;
      sizes[index] = point.size;
      alphas[index] = point.alpha;
      phases[index] = point.phase;
      stretches[index] = point.stretch;
      angles[index] = point.angle;
      drifts[index * 3] = point.drift.x;
      drifts[index * 3 + 1] = point.drift.y;
      drifts[index * 3 + 2] = point.drift.z;
      colors[index * 3] = point.color.r;
      colors[index * 3 + 1] = point.color.g;
      colors[index * 3 + 2] = point.color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPointSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aStretch", new THREE.BufferAttribute(stretches, 1));
    geometry.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
    geometry.setAttribute("aDrift", new THREE.BufferAttribute(drifts, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.ShaderMaterial({
      vertexShader: POINT_VERTEX_SHADER,
      fragmentShader: POINT_FRAGMENT_SHADER,
      uniforms: {
        uPointScale: { value: pointScale },
        uGaussian: { value: 0 },
        uWhite: { value: 0 },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uMotion: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const object = new THREE.Points(geometry, material);
    object.renderOrder = 12;
    this.movieGroup.add(object);
    return { object, geometry, material, positions, sizes, alphas };
  }

  private updateCloud(cloud: ConceptCloud, progress: number, elapsed: number, gaussian: number, opacity: number, white = 0, motion = 1): void {
    cloud.material.uniforms.uGaussian.value = gaussian;
    cloud.material.uniforms.uOpacity.value = opacity;
    cloud.material.uniforms.uWhite.value = white;
    cloud.material.uniforms.uTime.value = elapsed;
    cloud.material.uniforms.uMotion.value = motion;
    const phases = cloud.geometry.getAttribute("aPhase") as THREE.BufferAttribute;
    cloud.material.uniforms.uPointScale.value = cloud.material.uniforms.uPointScale.value;
    // A point's phase is part of the source-derived timing, not a random flicker.
    cloud.material.uniforms.uOpacity.value *= 0.88 + 0.12 * smooth(progress * 1.12);
    phases.needsUpdate = false;
  }

  private viewPoint(u: number, v: number, depth = 0): THREE.Vector3 {
    return this.center.clone().addScaledVector(this.viewRight, u).addScaledVector(this.viewUp, v).addScaledVector(this.viewForward, depth);
  }

  private screenPoint(index: number, salt = 0, spread = 1): THREE.Vector3 {
    return this.viewPoint(
      (seeded(index, salt + 1) * 2 - 1) * this.span * 1.95 * spread,
      (seeded(index, salt + 2) * 2 - 1) * this.span * 1.18 * spread,
      (seeded(index, salt + 3) - 0.5) * this.span * 0.32,
    );
  }

  private graphLinePositions(edgeIndices: readonly number[]): number[] {
    const positions: number[] = [];
    for (const edgeIndex of edgeIndices) {
      const edge = this.graph.edges[edgeIndex];
      const start = edge ? this.graphPositions[edge.start] : undefined;
      const end = edge ? this.graphPositions[edge.end] : undefined;
      if (!start || !end) continue;
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
    return positions;
  }

  private makeProfileLines(edgeIndices: readonly number[], color: THREE.Color, opacity: number, name: string): THREE.LineSegments {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const line = makeLine(this.graphLinePositions(edgeIndices), material, name);
    this.movieGroup.add(line);
    return line;
  }

  private buildBloomSaturation(): void {
    const points: ConceptPoint[] = [];
    const colors = paletteColors("rich");
    const edgeCount = Math.max(1, this.edgeMidpoints.length);
    for (let index = 0; index < 2_200; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profiles[edgeIndex] ?? this.profiles[0]!;
      const anchor = index < 900
        ? this.edgeMidpoints[edgeIndex]!.clone()
        : this.screenPoint(index, 20, 0.48 + profile.persistence * 0.64);
      const outward = anchor.clone().sub(this.center);
      if (outward.lengthSq() < 0.00001) outward.set(1, 0, 0);
      outward.normalize();
      const position = anchor.addScaledVector(outward, (seeded(index, 31) - 0.36) * this.span * (0.2 + profile.persistence * 0.85));
      points.push({
        position,
        size: this.span * (0.009 + seeded(index, 32) * 0.025 + profile.junction * 0.018),
        alpha: 0.08 + profile.persistence * 0.28 + seeded(index, 33) * 0.12,
        color: new THREE.Color(colors[index % colors.length]).lerp(new THREE.Color(0xffefd4), profile.hesitation * 0.16),
        phase: 0.03 + seeded(index, 34) * 0.58,
        stretch: 0.72 + profile.length * 1.55,
        angle: Math.atan2(outward.z, outward.x),
        drift: outward.multiplyScalar(this.span * (0.006 + profile.hesitation * 0.018)),
      });
    }
    this.bloomField = this.createCloud(points, 8.8);
    const lightPoints: ConceptPoint[] = [];
    for (let index = 0; index < 460; index++) {
      const motif = this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.center;
      const profile = this.profiles[index % edgeCount] ?? this.profiles[0]!;
      const direction = motif.clone().sub(this.center).normalize();
      if (direction.lengthSq() < 0.00001) direction.set(1, 0, 0);
      lightPoints.push({
        position: motif.clone().addScaledVector(direction, (seeded(index, 41) - 0.4) * this.span * 0.22),
        size: this.span * (0.026 + profile.junction * 0.045 + seeded(index, 42) * 0.04),
        alpha: 0.16 + profile.persistence * 0.46,
        color: colorFor("rich", index, 0.08 + profile.hesitation * 0.14),
        phase: 0.17 + seeded(index, 43) * 0.44,
        stretch: 1.0 + profile.length * 1.8 + profile.junction * 0.5,
        angle: Math.atan2(direction.z, direction.x),
        drift: direction.multiplyScalar(this.span * (0.008 + profile.persistence * 0.018)),
      });
    }
    this.bloomLight = this.createCloud(lightPoints, 13.6);
    const selectedEdges = this.graph.edges.map((_, index) => index).filter((index) => index % 2 === 0);
    this.bloomThreads = this.makeProfileLines(selectedEdges, new THREE.Color(0xbfd6cd), 0, "luminous-support-threads");
  }

  private buildBreathingBouquet(): void {
    const points: ConceptPoint[] = [];
    const colors = paletteColors(this.activePalette);
    const edgeCount = Math.max(1, this.edgeMidpoints.length);
    for (let index = 0; index < 2_650; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profiles[edgeIndex] ?? this.profiles[0]!;
      const anchor = index % 5 === 0
        ? this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.center
        : this.edgeMidpoints[edgeIndex] ?? this.center;
      const lateral = this.viewRight.clone().multiplyScalar((seeded(index, 51) - 0.5) * this.span * (0.18 + profile.persistence * 0.48));
      const vertical = this.viewUp.clone().multiplyScalar((seeded(index, 52) - 0.5) * this.span * (0.1 + profile.hesitation * 0.4));
      const depth = this.viewForward.clone().multiplyScalar((seeded(index, 53) - 0.5) * this.span * 0.26);
      points.push({
        position: anchor.clone().add(lateral).add(vertical).add(depth),
        size: this.span * (0.018 + seeded(index, 54) * 0.064 + profile.junction * 0.035),
        alpha: 0.055 + profile.persistence * 0.23 + seeded(index, 55) * 0.08,
        color: new THREE.Color(colors[index % colors.length]).lerp(new THREE.Color(0xfff1dc), profile.hesitation * 0.12),
        phase: 0.02 + seeded(index, 56) * 0.58,
        stretch: 0.74 + seeded(index, 57) * 1.85 + profile.junction * 0.65,
        angle: (seeded(index, 58) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 59) - 0.5) * this.span * (0.01 + profile.hesitation * 0.04)).add(
          this.viewUp.clone().multiplyScalar((seeded(index, 60) - 0.5) * this.span * 0.024),
        ),
      });
    }
    this.breathingCloud = this.createCloud(points, 12.3);
  }

  private buildDustToLight(): void {
    const points: ConceptPoint[] = [];
    const edgeCount = Math.max(1, this.edgeMidpoints.length);
    for (let index = 0; index < 1_750; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profiles[edgeIndex] ?? this.profiles[0]!;
      const target = index % 4 === 0
        ? this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.center
        : this.edgeMidpoints[edgeIndex] ?? this.center;
      const start = this.screenPoint(index, 71, 0.74 + profile.persistence * 0.34);
      const color = new THREE.Color(0xcfded6).lerp(colorFor("rich", index, 0.16), 0.26 + profile.persistence * 0.54);
      this.dustItems.push({
        start,
        target: target.clone(),
        profile,
        phase: seeded(index, 72) * 0.34,
        bend: (seeded(index, 73) - 0.5) * this.span * (0.12 + profile.hesitation * 0.38),
        baseSize: this.span * (0.008 + seeded(index, 74) * 0.014),
        baseAlpha: 0.19 + profile.persistence * 0.34,
      });
      points.push({
        position: start.clone(),
        size: this.span * (0.008 + seeded(index, 74) * 0.014),
        alpha: 0.19 + profile.persistence * 0.34,
        color,
        phase: 0,
        stretch: 0.82 + profile.length * 0.72,
        angle: seeded(index, 75) * Math.PI,
        drift: this.viewUp.clone().multiplyScalar((seeded(index, 76) - 0.5) * this.span * 0.02),
      });
    }
    this.dustCloud = this.createCloud(points, 8.5);
    const selectedEdges = this.graph.edges.map((_, index) => index).filter((index) => (this.profiles[index]?.junction ?? 0) > 0.16);
    this.dustStreaks = this.makeProfileLines(selectedEdges, new THREE.Color(0xb9d4cb), 0, "dust-formed-light");
  }

  private buildLightThroughGaps(): void {
    this.sourceMaterial.opacity = 0.014;
    this.gapEvents = this.edgeMidpoints.map((point, index) => {
      const profile = this.profiles[index] ?? this.profiles[0]!;
      const offset = point.clone().sub(this.center);
      return {
        point: point.clone(),
        u: offset.dot(this.viewRight),
        v: offset.dot(this.viewUp),
        direction: new THREE.Vector2(
          (seeded(index, 81) - 0.5) * 0.9,
          0.45 + seeded(index, 82) * 0.55,
        ).normalize(),
        phase: 0.04 + (index / Math.max(1, this.edgeMidpoints.length)) * 0.62 + profile.hesitation * 0.08,
        profile,
        colorIndex: index,
      };
    });
    const points: ConceptPoint[] = this.gapEvents.map((event, index) => ({
      position: event.point,
      size: this.span * (0.018 + event.profile.hesitation * 0.035),
      alpha: 0.12 + event.profile.persistence * 0.28,
      color: colorFor("red", index, 0.04),
      phase: event.phase,
      stretch: 1.5 + event.profile.length * 1.8,
      angle: event.direction.angle(),
      drift: this.viewRight.clone().multiplyScalar(event.direction.x * this.span * 0.02).add(this.viewUp.clone().multiplyScalar(event.direction.y * this.span * 0.018)),
    }));
    this.gapsCloud = this.createCloud(points, 13.5);
    this.gapsCanvas = document.createElement("canvas");
    this.gapsCanvas.width = 1024;
    this.gapsCanvas.height = 768;
    this.gapsTexture = new THREE.CanvasTexture(this.gapsCanvas);
    this.gapsTexture.colorSpace = THREE.SRGBColorSpace;
    this.gapsTexture.minFilter = THREE.LinearFilter;
    this.gapsTexture.magFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: this.gapsTexture,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.gapsSprite = new THREE.Sprite(material);
    this.gapsSprite.position.copy(this.center).addScaledVector(this.viewForward, this.span * 0.14);
    this.gapsSprite.scale.set(this.span * 3.2, this.span * 2.2, 1);
    this.gapsSprite.renderOrder = 9;
    this.movieGroup.add(this.gapsSprite);
  }

  private buildUnstableBloom(): void {
    const edgeOrder = this.graph.edges.map((_, index) => index).sort((left, right) => (
      (this.profiles[right]?.hesitation ?? 0) - (this.profiles[left]?.hesitation ?? 0) || left - right
    )).slice(0, 92);
    for (const [lineIndex, edgeIndex] of edgeOrder.entries()) {
      const edge = this.graph.edges[edgeIndex];
      const start = edge ? this.graphPositions[edge.start] : undefined;
      const end = edge ? this.graphPositions[edge.end] : undefined;
      const profile = this.profiles[edgeIndex];
      if (!start || !end || !profile) continue;
      const material = new THREE.LineBasicMaterial({
        color: colorFor("rich", lineIndex, profile.hesitation * 0.16),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([start.x, start.y, start.z, end.x, end.y, end.z], 3));
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 11;
      this.movieGroup.add(line);
      this.unstableLines.push({
        line,
        material,
        start: start.clone(),
        end: end.clone(),
        profile,
        phase: 0.025 + lineIndex / Math.max(1, edgeOrder.length) * 0.76,
        baseOpacity: 0.065 + profile.persistence * 0.15,
      });
    }
    const points: ConceptPoint[] = [];
    for (let index = 0; index < 1_240; index++) {
      const edgeIndex = index % Math.max(1, this.edgeMidpoints.length);
      const profile = this.profiles[edgeIndex] ?? this.profiles[0]!;
      const base = index < 920 && index % 3 === 0
        ? this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.center
        : index < 920
          ? this.edgeMidpoints[edgeIndex] ?? this.center
          : this.screenPoint(index, 96, 0.42 + profile.persistence * 0.46);
      const outward = base.clone().sub(this.center).normalize();
      if (outward.lengthSq() < 0.00001) outward.set(1, 0, 0);
      const phase = seeded(index, 91) * 0.78;
      this.unstablePoints.push({ base: base.clone(), profile, phase, baseAlpha: 0.18 + profile.persistence * 0.48, index });
      points.push({
        position: base.clone().addScaledVector(outward, (seeded(index, 92) - 0.5) * this.span * 0.16),
        size: this.span * (0.013 + seeded(index, 93) * 0.035 + profile.junction * 0.032 + (index % 11 === 0 ? 0.026 : 0)),
        alpha: 0.18 + profile.persistence * 0.48,
        color: colorFor("rich", index, 0.08 + profile.hesitation * 0.15),
        phase: 0,
        stretch: 0.75 + profile.length * 1.75 + profile.junction * 0.42,
        angle: seeded(index, 94) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 95) - 0.5) * this.span * (0.02 + profile.hesitation * 0.06)),
      });
    }
    this.unstableCloud = this.createCloud(points, 10.2);
  }

  private updateMovie(progress: number, elapsed: number): void {
    switch (this.activeMovie) {
      case "bloom-saturation": this.updateBloomSaturation(progress, elapsed); break;
      case "breathing-bouquet": this.updateBreathingBouquet(progress, elapsed); break;
      case "dust-to-light": this.updateDustToLight(progress, elapsed); break;
      case "light-through-gaps": this.updateLightThroughGaps(progress, elapsed); break;
      case "unstable-bloom": this.updateUnstableBloom(progress, elapsed); break;
    }
    this.onFrame({ progress, stage: this.stageLabel(this.activeMovie, progress), stable: progress > 0.9 });
  }

  private updateBloomSaturation(progress: number, elapsed: number): void {
    const first = smooth((progress - 0.02) / 0.24);
    const bloom = smooth((progress - 0.18) / 0.46);
    const spill = smooth((progress - 0.36) / 0.42);
    const white = smooth((progress - 0.66) / 0.3);
    this.sourceMaterial.opacity = 0;
    this.motifMaterials.forEach((material, index) => { material.opacity = first * 0.035 * (0.7 + (index % 4) * 0.08); });
    if (this.bloomField) this.updateCloud(this.bloomField, progress, elapsed, 0.2 + bloom * 0.46, first * (0.2 + spill * 0.66), white * 0.55, 1.15);
    if (this.bloomLight) this.updateCloud(this.bloomLight, progress, elapsed, 0.62 + bloom * 0.38, bloom * (0.24 + spill * 0.9), white, 1.2);
    if (this.bloomThreads) (this.bloomThreads.material as THREE.LineBasicMaterial).opacity = spill * 0.06;
    const background = new THREE.Color(0x050808).lerp(new THREE.Color(0xf1f6eb), white * 0.84);
    this.renderer.setClearColor(background, 1);
  }

  private updateBreathingBouquet(progress: number, elapsed: number): void {
    const arrival = smooth((progress - 0.02) / 0.24);
    const settle = smooth((progress - 0.82) / 0.15);
    const breath = 0.78 + 0.22 * Math.sin(elapsed * 0.00043) + 0.12 * Math.sin(elapsed * 0.00091 + 1.7);
    if (this.breathingCloud) this.updateCloud(this.breathingCloud, progress, elapsed, 0.96, arrival * (0.36 + breath * 0.26 - settle * 0.12), 0.04 + settle * 0.18, 1.2 + breath * 0.7);
    this.renderer.setClearColor(0x050808, 1);
  }

  private updateDustToLight(progress: number, elapsed: number): void {
    const cloud = this.dustCloud;
    if (!cloud) return;
    const position = cloud.geometry.getAttribute("position") as THREE.BufferAttribute;
    const sizes = cloud.geometry.getAttribute("aPointSize") as THREE.BufferAttribute;
    const alphas = cloud.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const stretches = cloud.geometry.getAttribute("aStretch") as THREE.BufferAttribute;
    const gaussian = smooth((progress - 0.27) / 0.52);
    for (const [index, item] of this.dustItems.entries()) {
      const gather = smooth((progress - item.phase) / (0.56 + item.profile.hesitation * 0.14));
      const point = item.start.clone().lerp(item.target, gather);
      point.addScaledVector(this.viewUp, Math.sin(elapsed * (0.00055 + item.profile.tempo * 0.00045) + index * 0.09) * item.bend * (0.34 + gather));
      point.addScaledVector(this.viewRight, Math.cos(elapsed * 0.0007 + index * 0.13) * this.span * 0.008 * gather);
      position.setXYZ(index, point.x, point.y, point.z);
      sizes.setX(index, item.baseSize * (1 + gaussian * (2.2 + item.profile.junction * 2.6)));
      alphas.setX(index, item.baseAlpha * (0.7 + gaussian * 1.1));
      stretches.setX(index, 0.82 + item.profile.length * 0.72 + gaussian * (item.profile.hesitation * 2.2));
    }
    position.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
    stretches.needsUpdate = true;
    this.updateCloud(cloud, 1, elapsed, gaussian, 0.36 + gaussian * 0.72, gaussian * 0.18, 0.72 + gaussian * 0.8);
    if (this.dustStreaks) (this.dustStreaks.material as THREE.LineBasicMaterial).opacity = gaussian * 0.08;
    const cameraDrift = smooth((progress - 0.44) / 0.45) * this.span * 0.045;
    this.camera.position.copy(this.initialCameraPosition).addScaledVector(this.viewRight, cameraDrift).addScaledVector(this.viewUp, Math.sin(elapsed * 0.00018) * cameraDrift * 0.45);
    this.camera.lookAt(this.center);
  }

  private updateLightThroughGaps(progress: number, elapsed: number): void {
    const canvas = this.gapsCanvas;
    const texture = this.gapsTexture;
    if (!canvas || !texture) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / (this.span * 3.2);
    const scaleY = canvas.height / (this.span * 2.2);
    for (const [index, event] of this.gapEvents.entries()) {
      const reveal = smooth((progress - event.phase) / (0.2 + event.profile.hesitation * 0.1));
      if (reveal <= 0) continue;
      const pulse = 0.7 + 0.3 * Math.sin(elapsed * (0.00035 + event.profile.tempo * 0.00028) + index * 0.7);
      const x = canvas.width * 0.5 + event.u * scaleX;
      const y = canvas.height * 0.5 - event.v * scaleY;
      const radius = canvas.width * (0.018 + event.profile.persistence * 0.032) * (0.6 + reveal * 0.8) * pulse;
      const hue = index % 5 === 0 ? "255, 202, 176" : "193, 119, 207";
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${hue}, ${0.66 * reveal})`);
      gradient.addColorStop(0.22, `rgba(${hue}, ${0.22 * reveal})`);
      gradient.addColorStop(1, `rgba(${hue}, 0)`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      const length = radius * (2.2 + event.profile.length * 3.2);
      const dx = event.direction.x * length;
      const dy = event.direction.y * length;
      const streak = context.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
      streak.addColorStop(0, "rgba(255, 224, 205, 0)");
      streak.addColorStop(0.5, `rgba(255, 231, 212, ${0.15 * reveal * pulse})`);
      streak.addColorStop(1, "rgba(255, 224, 205, 0)");
      context.strokeStyle = streak;
      context.lineWidth = Math.max(1, radius * 0.24);
      context.beginPath();
      context.moveTo(x - dx, y - dy);
      context.lineTo(x + dx, y + dy);
      context.stroke();
    }
    texture.needsUpdate = true;
    if (this.gapsCloud) this.updateCloud(this.gapsCloud, progress, elapsed, 1, smooth((progress - 0.06) / 0.72) * 0.62, 0.12, 0.95);
    this.sourceMaterial.opacity = 0.01 + smooth((progress - 0.58) / 0.3) * 0.014;
    this.renderer.setClearColor(0x050808, 1);
  }

  private updateUnstableBloom(progress: number, elapsed: number): void {
    for (const item of this.unstableLines) {
      const local = progress * 1.48 - item.phase;
      const wrapped = ((local % 1) + 1) % 1;
      const arrive = smooth(wrapped / (0.17 + item.profile.hesitation * 0.08));
      const release = 1 - smooth((wrapped - 0.2) / (0.13 + item.profile.tempo * 0.05));
      const returnAmount = smooth((wrapped - 0.55) / (0.2 + item.profile.hesitation * 0.08));
      const visibility = clamp01(arrive * release + returnAmount * (0.28 + item.profile.persistence * 0.62));
      const pulse = 0.84 + Math.sin(elapsed * (0.0011 + item.profile.tempo * 0.0007) + item.phase * 13) * 0.16;
      item.material.opacity = item.baseOpacity * visibility * pulse;
    }
    if (this.unstableCloud) {
      const position = this.unstableCloud.geometry.getAttribute("position") as THREE.BufferAttribute;
      const alphas = this.unstableCloud.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
      for (const [index, item] of this.unstablePoints.entries()) {
        const local = progress * 1.48 - item.phase;
        const wrapped = ((local % 1) + 1) % 1;
        const arrive = smooth(wrapped / 0.17);
        const release = 1 - smooth((wrapped - 0.2) / 0.14);
        const returnAmount = smooth((wrapped - 0.55) / 0.2);
        const visibility = clamp01(arrive * release + returnAmount * (0.3 + item.profile.persistence * 0.58));
        const offset = this.viewRight.clone().multiplyScalar(Math.sin(elapsed * 0.0008 + index * 0.06) * this.span * (0.008 + item.profile.hesitation * 0.028));
        const point = item.base.clone().add(offset);
        position.setXYZ(index, point.x, point.y, point.z);
        alphas.setX(index, item.baseAlpha * visibility);
      }
      position.needsUpdate = true;
      alphas.needsUpdate = true;
      this.updateCloud(this.unstableCloud, 1, elapsed, 0.46 + progress * 0.44, 1.02, 0.04, 1.12);
    }
    const drift = Math.sin(elapsed * 0.00017) * this.span * 0.035;
    this.camera.position.copy(this.initialCameraPosition).addScaledVector(this.viewRight, drift).addScaledVector(this.viewUp, Math.sin(elapsed * 0.00023 + 1.4) * this.span * 0.02);
    this.camera.lookAt(this.center);
    this.renderer.setClearColor(0x050808, 1);
  }

  private stageLabel(movie: ConceptMovieId, progress: number): string {
    if (progress > 0.9) return "MOVIE HOLDS";
    if (progress < 0.08) return "BLACK / BEFORE FORM";
    switch (movie) {
      case "bloom-saturation": return progress < 0.24 ? "FIRST TRACE" : progress < 0.55 ? "BLOOM / SUPPORT" : progress < 0.78 ? "SPILL / SATURATION" : "WHITE / INFECTING";
      case "breathing-bouquet": return progress < 0.3 ? "DENSITY / ARRIVING" : progress < 0.68 ? "BLOOM / ASYNCHRONOUS" : progress < 0.86 ? "BREATH / SETTLING" : "LIGHT / OUTSIDE";
      case "dust-to-light": return progress < 0.24 ? "DUST / UNRELATED" : progress < 0.52 ? "DENSITY / GATHERING" : progress < 0.8 ? "SPLATS / FINDING RELATION" : "LIGHT / BOUQUET";
      case "light-through-gaps": return progress < 0.25 ? "ONE GAP" : progress < 0.56 ? "LIGHT / ENTERING" : progress < 0.82 ? "OVERLAP / AIR" : "OBJECT / INFERRED";
      case "unstable-bloom": return progress < 0.25 ? "FIRST THING" : progress < 0.58 ? "HOLDS / LETS GO" : progress < 0.82 ? "RETURNS / CHANGES" : "AFTERIMAGE";
    }
  }
}
