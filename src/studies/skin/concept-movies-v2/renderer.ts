import * as THREE from "three";
import type { InternalStructureGraph } from "../voronoi.ts";
import type { VisualStudySource } from "../visual-studies/catalog.ts";
import { conceptMovieV2Choice, type ConceptMovieV2Id, type ConceptMovieV2Palette } from "./catalog.ts";

export interface ConceptMovieV2Frame {
  readonly progress: number;
  readonly stage: string;
  readonly stable: boolean;
}

interface SourceProfile {
  readonly length: number;
  readonly junction: number;
  readonly hesitation: number;
  readonly tempo: number;
  readonly persistence: number;
  readonly density: number;
  readonly motif: number;
  readonly support: number;
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
  readonly gaussian: number;
  readonly metric: number;
  readonly secondary: number;
}

interface ConceptCloud {
  readonly object: THREE.Points;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly points: readonly ConceptPoint[];
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly alphas: Float32Array;
  readonly gaussians: Float32Array;
  readonly stretches: Float32Array;
}

interface WaveItem {
  readonly point: ConceptPoint;
  readonly distance: number;
  readonly phase: number;
  readonly source: number;
}

interface DappleItem {
  readonly u: number;
  readonly v: number;
  readonly radius: number;
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
  attribute float aGaussian;
  attribute vec3 aDrift;
  attribute vec3 aColor;
  uniform float uPointScale;
  uniform float uTime;
  uniform float uMotion;
  varying float vAlpha;
  varying float vPhase;
  varying float vStretch;
  varying float vAngle;
  varying float vGaussian;
  varying vec3 vColor;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vPhase = aPhase;
    vStretch = aStretch;
    vAngle = aAngle;
    vGaussian = aGaussian;
    float bodyTime = uTime * 0.00018 * (0.72 + aPhase * 0.8);
    float hesitation = 0.78 + 0.22 * sin(bodyTime + aPhase * 19.0);
    vec3 animatedPosition = position + aDrift * hesitation * uMotion;
    vec4 modelViewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    float depthScale = 116.0 / max(1.0, -modelViewPosition.z);
    float bodyVariation = 0.93 + 0.07 * sin(uTime * 0.00041 + aPhase * 23.0);
    gl_PointSize = clamp(aPointSize * uPointScale * depthScale * bodyVariation, 1.0, 96.0);
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
  varying float vGaussian;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float cosine = cos(vAngle);
    float sine = sin(vAngle);
    vec2 rotated = vec2(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
    rotated.x /= max(0.36, vStretch);
    float distance = dot(rotated, rotated);
    float radial = dot(point, point);
    if (radial > 1.08) discard;
    float disk = 1.0 - smoothstep(0.38, 1.02, distance);
    float gaussian = exp(-distance * 1.08);
    float softBoundary = 1.0 - smoothstep(0.68, 1.04, radial);
    float form = mix(disk, gaussian, clamp(vGaussian + uGaussian * 0.72, 0.0, 1.0)) * softBoundary;
    float halo = exp(-distance * 0.3) * (0.08 + 0.16 * clamp(vGaussian + uGaussian, 0.0, 1.0)) * softBoundary;
    float body = 0.88 + 0.12 * sin(uTime * 0.0011 * (0.7 + vPhase) + vPhase * 17.0);
    float whiteAmount = clamp(uWhite * (0.58 + vPhase * 0.28) + vGaussian * 0.06, 0.0, 1.0);
    vec3 color = mix(vColor, vec3(0.99, 0.995, 0.96), whiteAmount);
    gl_FragColor = vec4(color, (form + halo) * vAlpha * uOpacity * body);
  }
`;

const RICH_PALETTE = [0xe36d67, 0xe6a44f, 0xa17bc4, 0x55b3bd, 0xe5d36c] as const;
const RED_PALETTE = [0x571126, 0x8f2035, 0xc94852, 0xe9878e, 0xffd8c4] as const;
const BLUE_PALETTE = [0x12234f, 0x1d568c, 0x29a6c1, 0x69cedb, 0xd4edee] as const;

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

function paletteColors(palette: ConceptMovieV2Palette): readonly number[] {
  if (palette === "red") return RED_PALETTE;
  if (palette === "blue") return BLUE_PALETTE;
  return RICH_PALETTE;
}

function colorFor(palette: ConceptMovieV2Palette, index: number, lightness = 0): THREE.Color {
  const colors = paletteColors(palette);
  return new THREE.Color(colors[index % colors.length]).lerp(new THREE.Color(0xfff0dc), clamp01(lightness));
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

export class ConceptMovieV2Renderer {
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
  private activeMovie: ConceptMovieV2Id = "luminous-cloud";
  private activePalette: ConceptMovieV2Palette = "rich";
  private startedAt = performance.now();
  private animationFrame = 0;
  private destroyed = false;
  private luminousCloud: ConceptCloud | null = null;
  private luminousThreads: THREE.LineSegments | null = null;
  private waveCloud: ConceptCloud | null = null;
  private waveItems: WaveItem[] = [];
  private gardenFront: ConceptCloud | null = null;
  private gardenMiddle: ConceptCloud | null = null;
  private gardenFar: ConceptCloud | null = null;
  private gardenThreads: THREE.LineSegments | null = null;
  private gatheringCloud: ConceptCloud | null = null;
  private gatheringCores: ConceptCloud | null = null;
  private weatherCloud: ConceptCloud | null = null;
  private weatherGlow: ConceptCloud | null = null;
  private dappleSprite: THREE.Sprite | null = null;
  private dappleCanvas: HTMLCanvasElement | null = null;
  private dappleTexture: THREE.CanvasTexture | null = null;
  private dappleItems: DappleItem[] = [];
  private readonly onFrame: (frame: ConceptMovieV2Frame) => void;

  constructor(root: HTMLElement, source: VisualStudySource, onFrame: (frame: ConceptMovieV2Frame) => void) {
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
    this.renderer.domElement.className = "concept-movies-v2-canvas";
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
    this.setMovie("luminous-cloud", "rich");
    window.addEventListener("resize", this.resize);
    this.resize();
    this.tick = this.tick.bind(this);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  setMovie(movie: ConceptMovieV2Id, palette: ConceptMovieV2Palette = "rich"): void {
    this.activeMovie = movie;
    this.activePalette = palette;
    this.clearMovieObjects();
    this.renderer.setClearColor(0x050808, 1);
    switch (movie) {
      case "luminous-cloud": this.buildLuminousCloud(); break;
      case "wave-bloom": this.buildWaveBloom(); break;
      case "garden-in-the-air": this.buildGardenInTheAir(); break;
      case "gathering-white": this.buildGatheringWhite(); break;
      case "weather-of-the-bouquet": this.buildWeatherOfTheBouquet(); break;
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
    this.dappleTexture?.dispose();
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.root.clientWidth || window.innerWidth);
    const height = Math.max(1, this.root.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.dappleSprite) {
      this.dappleSprite.scale.set(
        this.span * 3.5 * Math.max(1, this.camera.aspect * 0.74),
        this.span * 2.8,
        1,
      );
    }
  };

  private readonly tick = (now: number): void => {
    if (this.destroyed) return;
    const duration = conceptMovieV2Choice(this.activeMovie).duration;
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
    this.sourceGroup.add(makeLine(positions, this.sourceMaterial, "completed-source-graph-v2"));
  }

  private clearMovieObjects(): void {
    for (const child of [...this.movieGroup.children]) {
      this.movieGroup.remove(child);
      disposeObject(child);
    }
    this.dappleTexture?.dispose();
    this.sourceMaterial.opacity = 0;
    this.luminousCloud = null;
    this.luminousThreads = null;
    this.waveCloud = null;
    this.waveItems = [];
    this.gardenFront = null;
    this.gardenMiddle = null;
    this.gardenFar = null;
    this.gardenThreads = null;
    this.gatheringCloud = null;
    this.gatheringCores = null;
    this.weatherCloud = null;
    this.weatherGlow = null;
    this.dappleSprite = null;
    this.dappleCanvas = null;
    this.dappleTexture = null;
    this.dappleItems = [];
    this.camera.position.copy(this.initialCameraPosition);
    this.camera.lookAt(this.center);
  }

  private profileFor(index: number): SourceProfile {
    return this.profiles[index % Math.max(1, this.profiles.length)] ?? {
      length: 0.5,
      junction: 0,
      hesitation: 0.25,
      tempo: 0.75,
      persistence: 0.6,
      density: 0.2,
      motif: 0.4,
      support: 0.3,
    };
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
      const nearby = this.edgeMidpoints.reduce((count, midpoint, midpointIndex) => (
        midpointIndex !== index && midpoint.distanceTo(this.edgeMidpoints[index] ?? midpoint) < this.span * 0.2 ? count + 1 : count
      ), 0);
      const density = clamp01(nearby / 12 + junction * 0.5);
      const nearestMotif = this.motifCenters.length === 0
        ? this.span
        : Math.min(...this.motifCenters.map((motif) => motif.distanceTo(this.edgeMidpoints[index] ?? this.center)));
      const motif = 1 - clamp01(nearestMotif / (this.span * 0.72));
      const hesitation = clamp01(turnAt(index, edge.start) * 0.46 + turnAt(index, edge.end) * 0.3 + junction * 0.14 + (1 - lengthVariation) * 0.1);
      return {
        length: lengthVariation,
        junction,
        hesitation,
        tempo: clamp01(0.92 - hesitation * 0.48 + lengthVariation * 0.1),
        persistence: clamp01(0.46 + hesitation * 0.34 + junction * 0.2),
        density,
        motif,
        support: clamp01(junction * 0.56 + motif * 0.28 + density * 0.16),
      };
    });
  }

  private createCloud(points: readonly ConceptPoint[], pointScale: number): ConceptCloud {
    const positions = new Float32Array(points.length * 3);
    const sizes = new Float32Array(points.length);
    const alphas = new Float32Array(points.length);
    const phases = new Float32Array(points.length);
    const stretches = new Float32Array(points.length);
    const gaussians = new Float32Array(points.length);
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
      gaussians[index] = point.gaussian;
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
    geometry.setAttribute("aGaussian", new THREE.BufferAttribute(gaussians, 1));
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
    return { object, geometry, material, points, positions, sizes, alphas, gaussians, stretches };
  }

  private animateCloud(
    cloud: ConceptCloud,
    progress: number,
    elapsed: number,
    gaussian: number,
    opacity: number,
    white: number,
    motion: number,
    sizeFactor: number,
  ): void {
    const position = cloud.geometry.getAttribute("position") as THREE.BufferAttribute;
    const sizes = cloud.geometry.getAttribute("aPointSize") as THREE.BufferAttribute;
    const alphas = cloud.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const gaussians = cloud.geometry.getAttribute("aGaussian") as THREE.BufferAttribute;
    const stretches = cloud.geometry.getAttribute("aStretch") as THREE.BufferAttribute;
    for (const [index, point] of cloud.points.entries()) {
      const bodyPause = 0.74 + 0.26 * Math.sin(elapsed * (0.00016 + point.secondary * 0.00011) + point.phase * 20);
      const driftAmount = motion * (0.55 + 0.45 * bodyPause) * (0.72 + point.metric * 0.52);
      const next = point.position.clone().addScaledVector(point.drift, driftAmount);
      position.setXYZ(index, next.x, next.y, next.z);
      sizes.setX(index, point.size * sizeFactor * (1 + point.metric * 0.6 + gaussian * point.secondary * 0.28));
      alphas.setX(index, point.alpha * opacity * (0.72 + bodyPause * 0.28) * (0.68 + smooth(progress * 1.16) * 0.32));
      gaussians.setX(index, clamp01(point.gaussian + gaussian * (0.62 + point.metric * 0.32)));
      stretches.setX(index, point.stretch * (1 + gaussian * point.secondary * 0.42));
    }
    position.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
    gaussians.needsUpdate = true;
    stretches.needsUpdate = true;
    cloud.material.uniforms.uGaussian.value = gaussian;
    cloud.material.uniforms.uOpacity.value = opacity;
    cloud.material.uniforms.uWhite.value = white;
    cloud.material.uniforms.uTime.value = elapsed;
    cloud.material.uniforms.uMotion.value = motion;
  }

  private viewPoint(u: number, v: number, depth = 0): THREE.Vector3 {
    return this.center.clone().addScaledVector(this.viewRight, u).addScaledVector(this.viewUp, v).addScaledVector(this.viewForward, depth);
  }

  private screenPoint(index: number, salt = 0, spread = 1): THREE.Vector3 {
    return this.viewPoint(
      (seeded(index, salt + 1) * 2 - 1) * this.span * 1.72 * spread,
      (seeded(index, salt + 2) * 2 - 1) * this.span * 1.13 * spread,
      (seeded(index, salt + 3) - 0.5) * this.span * 0.72,
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

  private buildLuminousCloud(): void {
    const points: ConceptPoint[] = [];
    const edgeCount = Math.max(1, this.edgeMidpoints.length);
    for (let index = 0; index < 2_250; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profileFor(edgeIndex);
      const foreground = index < 230;
      const sourceBound = index < 1_500;
      const anchor = foreground
        ? this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.edgeMidpoints[edgeIndex] ?? this.center
        : sourceBound
          ? this.edgeMidpoints[edgeIndex] ?? this.center
          : this.screenPoint(index, 11, 0.58 + profile.persistence * 0.52);
      const position = anchor.clone()
        .addScaledVector(this.viewRight, (seeded(index, 12) - 0.5) * this.span * (foreground ? 0.18 : 0.12 + profile.density * 0.35))
        .addScaledVector(this.viewUp, (seeded(index, 13) - 0.5) * this.span * (foreground ? 0.18 : 0.12 + profile.hesitation * 0.34))
        .addScaledVector(this.viewForward, foreground ? -this.span * (0.32 + seeded(index, 14) * 0.28) : (seeded(index, 14) - 0.5) * this.span * 0.44);
      points.push({
        position,
        size: this.span * (foreground ? 0.045 + seeded(index, 15) * 0.09 + profile.junction * 0.05 : 0.004 + seeded(index, 15) * 0.018 + profile.density * 0.012),
        alpha: foreground ? 0.1 + profile.persistence * 0.26 : 0.04 + profile.persistence * 0.18,
        color: colorFor(this.activePalette, index, profile.hesitation * 0.2),
        phase: 0.02 + seeded(index, 16) * 0.72 + profile.hesitation * 0.08,
        stretch: foreground ? 0.7 + profile.length * 1.9 : 0.62 + profile.length * 1.22,
        angle: (seeded(index, 17) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 18) - 0.5) * this.span * (0.012 + profile.hesitation * 0.045)).add(
          this.viewUp.clone().multiplyScalar((seeded(index, 19) - 0.5) * this.span * 0.018),
        ),
        gaussian: foreground ? 0.58 + profile.motif * 0.32 : seeded(index, 20) * 0.26,
        metric: clamp01(profile.density * 0.56 + profile.junction * 0.3 + profile.motif * 0.14),
        secondary: profile.hesitation,
      });
    }
    this.luminousCloud = this.createCloud(points, 10.6);
    const selectedEdges = this.graph.edges.map((_, index) => index).filter((index) => (this.profileFor(index).support > 0.2 && index % 2 === 0));
    this.luminousThreads = this.makeProfileLines(selectedEdges, new THREE.Color(0xd6e1cc), 0, "luminous-cloud-support");
  }

  private buildWaveBloom(): void {
    const origins = (this.motifCenters.length > 0 ? this.motifCenters : this.edgeMidpoints).slice(0, 4);
    const points: ConceptPoint[] = [];
    const edgeCount = Math.max(1, this.edgeMidpoints.length);
    this.waveItems = [];
    for (let index = 0; index < 1_950; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profileFor(edgeIndex);
      const anchor = index % 7 === 0
        ? this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.center
        : this.edgeMidpoints[edgeIndex] ?? this.center;
      const point = anchor.clone()
        .addScaledVector(this.viewRight, (seeded(index, 21) - 0.5) * this.span * (0.08 + profile.density * 0.28))
        .addScaledVector(this.viewUp, (seeded(index, 22) - 0.5) * this.span * (0.08 + profile.hesitation * 0.28))
        .addScaledVector(this.viewForward, (seeded(index, 23) - 0.5) * this.span * 0.55);
      const sourceIndex = index % Math.max(1, origins.length);
      const source = origins[sourceIndex] ?? this.center;
      const conceptPoint: ConceptPoint = {
        position: point,
        size: this.span * (0.004 + seeded(index, 24) * 0.015 + profile.junction * 0.009),
        alpha: 0.08 + profile.persistence * 0.2,
        color: colorFor(this.activePalette, index, profile.hesitation * 0.16),
        phase: 0.02 + seeded(index, 25) * 0.2 + profile.tempo * 0.18,
        stretch: 0.7 + profile.length * 1.18,
        angle: Math.atan2((source.z - point.z), (source.x - point.x)),
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 26) - 0.5) * this.span * 0.018).add(
          this.viewUp.clone().multiplyScalar((seeded(index, 27) - 0.5) * this.span * 0.014),
        ),
        gaussian: 0.02,
        metric: clamp01(profile.density * 0.62 + profile.junction * 0.25),
        secondary: profile.hesitation,
      };
      points.push(conceptPoint);
      this.waveItems.push({ point: conceptPoint, distance: point.distanceTo(source) / this.span, phase: conceptPoint.phase, source: sourceIndex });
    }
    this.waveCloud = this.createCloud(points, 10.2);
  }

  private buildGardenInTheAir(): void {
    const colors = this.activePalette;
    const front: ConceptPoint[] = [];
    const middle: ConceptPoint[] = [];
    const far: ConceptPoint[] = [];
    const edgeCount = Math.max(1, this.edgeMidpoints.length);
    for (let index = 0; index < 360; index++) {
      const motif = this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.center;
      const profile = this.profileFor(index * 3);
      front.push({
        position: motif.clone()
          .addScaledVector(this.viewRight, (seeded(index, 31) - 0.5) * this.span * 0.25)
          .addScaledVector(this.viewUp, (seeded(index, 32) - 0.5) * this.span * 0.22)
          .addScaledVector(this.viewForward, -this.span * (0.32 + seeded(index, 33) * 0.3)),
        size: this.span * (0.055 + seeded(index, 34) * 0.12 + profile.junction * 0.045),
        alpha: 0.12 + profile.persistence * 0.25,
        color: colorFor(colors, index, 0.08 + profile.hesitation * 0.18),
        phase: seeded(index, 35) * 0.6,
        stretch: 0.58 + seeded(index, 36) * 1.7,
        angle: (seeded(index, 37) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 38) - 0.5) * this.span * 0.018).add(this.viewUp.clone().multiplyScalar((seeded(index, 39) - 0.5) * this.span * 0.024)),
        gaussian: 0.72 + profile.motif * 0.24,
        metric: clamp01(profile.motif * 0.5 + profile.junction * 0.35 + profile.density * 0.15),
        secondary: profile.hesitation,
      });
    }
    for (let index = 0; index < 1_250; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profileFor(edgeIndex);
      const anchor = this.edgeMidpoints[edgeIndex] ?? this.center;
      middle.push({
        position: anchor.clone()
          .addScaledVector(this.viewRight, (seeded(index, 41) - 0.5) * this.span * (0.1 + profile.density * 0.3))
          .addScaledVector(this.viewUp, (seeded(index, 42) - 0.5) * this.span * (0.1 + profile.hesitation * 0.3))
          .addScaledVector(this.viewForward, (seeded(index, 43) - 0.5) * this.span * 0.25),
        size: this.span * (0.008 + seeded(index, 44) * 0.032 + profile.junction * 0.018),
        alpha: 0.06 + profile.persistence * 0.2,
        color: colorFor(colors, index + 2, profile.hesitation * 0.14),
        phase: 0.04 + seeded(index, 45) * 0.72,
        stretch: 0.58 + profile.length * 1.64,
        angle: (seeded(index, 46) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 47) - 0.5) * this.span * (0.01 + profile.hesitation * 0.035)).add(this.viewUp.clone().multiplyScalar((seeded(index, 48) - 0.5) * this.span * 0.02)),
        gaussian: 0.28 + profile.density * 0.48,
        metric: clamp01(profile.density * 0.45 + profile.junction * 0.35 + profile.motif * 0.2),
        secondary: profile.hesitation,
      });
    }
    for (let index = 0; index < 1_400; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profileFor(edgeIndex);
      const anchor = this.edgeMidpoints[edgeIndex] ?? this.center;
      far.push({
        position: anchor.clone()
          .addScaledVector(this.viewRight, (seeded(index, 51) - 0.5) * this.span * (0.2 + profile.persistence * 0.72))
          .addScaledVector(this.viewUp, (seeded(index, 52) - 0.5) * this.span * (0.18 + profile.hesitation * 0.66))
          .addScaledVector(this.viewForward, this.span * (0.35 + seeded(index, 53) * 0.75)),
        size: this.span * (0.0028 + seeded(index, 54) * 0.009 + profile.length * 0.005),
        alpha: 0.025 + profile.persistence * 0.12,
        color: colorFor(colors, index + 4, 0.02),
        phase: 0.08 + seeded(index, 55) * 0.8,
        stretch: 0.7 + profile.length * 0.9,
        angle: (seeded(index, 56) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 57) - 0.5) * this.span * 0.012).add(this.viewUp.clone().multiplyScalar((seeded(index, 58) - 0.5) * this.span * 0.016)),
        gaussian: seeded(index, 59) * 0.2,
        metric: clamp01(profile.persistence * 0.5 + profile.length * 0.3 + profile.density * 0.2),
        secondary: profile.hesitation,
      });
    }
    this.gardenFront = this.createCloud(front, 8.8);
    this.gardenMiddle = this.createCloud(middle, 10.1);
    this.gardenFar = this.createCloud(far, 11.4);
    const selectedEdges = this.graph.edges.map((_, index) => index).filter((index) => index % 4 === 0 || this.profileFor(index).support > 0.42);
    this.gardenThreads = this.makeProfileLines(selectedEdges, new THREE.Color(0xa9c7bd), 0, "garden-air-bridges");
  }

  private buildGatheringWhite(): void {
    const points: ConceptPoint[] = [];
    const cores: ConceptPoint[] = [];
    const edgeCount = Math.max(1, this.edgeMidpoints.length);
    for (let index = 0; index < 2_350; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profileFor(edgeIndex);
      const anchor = index < 1_780
        ? this.edgeMidpoints[edgeIndex] ?? this.center
        : this.screenPoint(index, 61, 0.45 + profile.density * 0.42);
      points.push({
        position: anchor.clone()
          .addScaledVector(this.viewRight, (seeded(index, 62) - 0.5) * this.span * (0.08 + profile.density * 0.3))
          .addScaledVector(this.viewUp, (seeded(index, 63) - 0.5) * this.span * (0.08 + profile.hesitation * 0.28))
          .addScaledVector(this.viewForward, (seeded(index, 64) - 0.5) * this.span * 0.4),
        size: this.span * (0.0035 + seeded(index, 65) * 0.016 + profile.junction * 0.012),
        alpha: 0.05 + profile.persistence * 0.18,
        color: colorFor(this.activePalette, index, profile.hesitation * 0.18),
        phase: 0.04 + seeded(index, 66) * 0.64 + profile.tempo * 0.09,
        stretch: 0.62 + profile.length * 1.44,
        angle: (seeded(index, 67) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 68) - 0.5) * this.span * (0.009 + profile.hesitation * 0.026)),
        gaussian: 0.04 + seeded(index, 69) * 0.16,
        metric: clamp01(profile.density * 0.58 + profile.junction * 0.32 + profile.motif * 0.1),
        secondary: profile.hesitation,
      });
    }
    for (let index = 0; index < 560; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profileFor(edgeIndex);
      const anchor = index % 3 === 0
        ? this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.edgeMidpoints[edgeIndex] ?? this.center
        : this.edgeMidpoints[edgeIndex] ?? this.center;
      cores.push({
        position: anchor.clone()
          .addScaledVector(this.viewRight, (seeded(index, 71) - 0.5) * this.span * 0.12)
          .addScaledVector(this.viewUp, (seeded(index, 72) - 0.5) * this.span * 0.12)
          .addScaledVector(this.viewForward, (seeded(index, 73) - 0.5) * this.span * 0.18),
        size: this.span * (0.035 + seeded(index, 74) * 0.075 + profile.junction * 0.05),
        alpha: 0.12 + profile.persistence * 0.3,
        color: colorFor(this.activePalette, index, 0.12 + profile.hesitation * 0.22),
        phase: 0.08 + seeded(index, 75) * 0.62,
        stretch: 0.65 + profile.length * 1.4 + profile.junction * 0.8,
        angle: (seeded(index, 76) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 77) - 0.5) * this.span * 0.014).add(this.viewUp.clone().multiplyScalar((seeded(index, 78) - 0.5) * this.span * 0.014)),
        gaussian: 0.6 + profile.density * 0.3,
        metric: clamp01(profile.density * 0.48 + profile.junction * 0.38 + profile.motif * 0.14),
        secondary: profile.hesitation,
      });
    }
    this.gatheringCloud = this.createCloud(points, 10.4);
    this.gatheringCores = this.createCloud(cores, 11.2);
  }

  private buildWeatherOfTheBouquet(): void {
    const points: ConceptPoint[] = [];
    const glow: ConceptPoint[] = [];
    const edgeCount = Math.max(1, this.edgeMidpoints.length);
    for (let index = 0; index < 2_550; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profileFor(edgeIndex);
      const anchor = index < 1_650
        ? this.edgeMidpoints[edgeIndex] ?? this.center
        : this.screenPoint(index, 81, 0.4 + profile.persistence * 0.7);
      points.push({
        position: anchor.clone()
          .addScaledVector(this.viewRight, (seeded(index, 82) - 0.5) * this.span * (0.1 + profile.persistence * 0.52))
          .addScaledVector(this.viewUp, (seeded(index, 83) - 0.5) * this.span * (0.1 + profile.hesitation * 0.5))
          .addScaledVector(this.viewForward, (seeded(index, 84) - 0.5) * this.span * 0.8),
        size: this.span * (0.003 + seeded(index, 85) * 0.018 + profile.density * 0.012),
        alpha: 0.04 + profile.persistence * 0.17,
        color: colorFor(this.activePalette, index, profile.hesitation * 0.2),
        phase: seeded(index, 86) * 0.9,
        stretch: 0.62 + profile.length * 1.48,
        angle: (seeded(index, 87) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 88) - 0.5) * this.span * (0.014 + profile.hesitation * 0.045)).add(this.viewUp.clone().multiplyScalar((seeded(index, 89) - 0.5) * this.span * 0.03)),
        gaussian: seeded(index, 90) * 0.22,
        metric: clamp01(profile.density * 0.42 + profile.hesitation * 0.2 + profile.support * 0.38),
        secondary: profile.hesitation,
      });
    }
    for (let index = 0; index < 420; index++) {
      const edgeIndex = index % edgeCount;
      const profile = this.profileFor(edgeIndex);
      const anchor = this.motifCenters[index % Math.max(1, this.motifCenters.length)] ?? this.edgeMidpoints[edgeIndex] ?? this.center;
      glow.push({
        position: anchor.clone().addScaledVector(this.viewForward, (seeded(index, 91) - 0.5) * this.span * 0.32),
        size: this.span * (0.025 + seeded(index, 92) * 0.07 + profile.junction * 0.04),
        alpha: 0.08 + profile.persistence * 0.24,
        color: colorFor(this.activePalette, index, 0.08),
        phase: 0.06 + seeded(index, 93) * 0.74,
        stretch: 0.7 + profile.length * 1.6,
        angle: (seeded(index, 94) - 0.5) * Math.PI,
        drift: this.viewRight.clone().multiplyScalar((seeded(index, 95) - 0.5) * this.span * 0.02).add(this.viewUp.clone().multiplyScalar((seeded(index, 96) - 0.5) * this.span * 0.022)),
        gaussian: 0.56 + profile.density * 0.3,
        metric: clamp01(profile.motif * 0.44 + profile.junction * 0.36 + profile.density * 0.2),
        secondary: profile.hesitation,
      });
    }
    this.weatherCloud = this.createCloud(points, 10.2);
    this.weatherGlow = this.createCloud(glow, 11.1);
    this.buildDappleLayer();
  }

  private buildDappleLayer(): void {
    this.dappleItems = this.edgeMidpoints.map((midpoint, index) => {
      const offset = midpoint.clone().sub(this.center);
      return {
        u: offset.dot(this.viewRight),
        v: offset.dot(this.viewUp),
        radius: this.span * (0.06 + this.profileFor(index).persistence * 0.14),
        phase: 0.06 + seeded(index, 101) * 0.68,
        profile: this.profileFor(index),
        colorIndex: index,
      };
    });
    this.dappleCanvas = document.createElement("canvas");
    this.dappleCanvas.width = 900;
    this.dappleCanvas.height = 900;
    this.dappleTexture = new THREE.CanvasTexture(this.dappleCanvas);
    this.dappleTexture.colorSpace = THREE.SRGBColorSpace;
    this.dappleTexture.minFilter = THREE.LinearFilter;
    this.dappleTexture.magFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: this.dappleTexture,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.dappleSprite = new THREE.Sprite(material);
    this.dappleSprite.position.copy(this.center).addScaledVector(this.viewForward, this.span * 0.12);
    this.dappleSprite.scale.set(this.span * 3.5, this.span * 2.8, 1);
    this.dappleSprite.renderOrder = 10;
    this.movieGroup.add(this.dappleSprite);
  }

  private updateDapple(progress: number, elapsed: number, strength: number): void {
    const canvas = this.dappleCanvas;
    const texture = this.dappleTexture;
    if (!canvas || !texture) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / (this.span * 3.5);
    const scaleY = canvas.height / (this.span * 2.8);
    const colors = paletteColors(this.activePalette);
    for (const [index, item] of this.dappleItems.entries()) {
      const arrive = smooth((progress - item.phase) / (0.18 + item.profile.hesitation * 0.14));
      if (arrive <= 0) continue;
      const body = 0.54 + 0.46 * Math.sin(elapsed * (0.00012 + item.profile.tempo * 0.00017) + item.phase * 16.0);
      const x = canvas.width * 0.5 + item.u * scaleX;
      const y = canvas.height * 0.5 - item.v * scaleY;
      const radius = item.radius * scaleX * (0.58 + arrive * 0.78) * (0.78 + body * 0.22);
      const color = new THREE.Color(colors[index % colors.length]);
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      context.save();
      context.translate(x, y);
      context.rotate((seeded(index, 102) - 0.5) * 1.2);
      context.scale(1, 0.52 + item.profile.length * 0.7);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.22 * arrive * strength * body})`);
      gradient.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${0.08 * arrive * strength})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    texture.needsUpdate = true;
  }

  private updateMovie(progress: number, elapsed: number): void {
    switch (this.activeMovie) {
      case "luminous-cloud": this.updateLuminousCloud(progress, elapsed); break;
      case "wave-bloom": this.updateWaveBloom(progress, elapsed); break;
      case "garden-in-the-air": this.updateGardenInTheAir(progress, elapsed); break;
      case "gathering-white": this.updateGatheringWhite(progress, elapsed); break;
      case "weather-of-the-bouquet": this.updateWeatherOfTheBouquet(progress, elapsed); break;
    }
    this.onFrame({ progress, stage: this.stageLabel(this.activeMovie, progress), stable: progress > 0.9 });
  }

  private updateLuminousCloud(progress: number, elapsed: number): void {
    const cloud = this.luminousCloud;
    if (!cloud) return;
    const arrival = smooth((progress - 0.025) / 0.34);
    const density = smooth((progress - 0.2) / 0.42);
    const spill = smooth((progress - 0.46) / 0.34);
    const white = smooth((progress - 0.7) / 0.2);
    this.animateCloud(cloud, progress, elapsed, 0.08 + density * 0.58 + spill * 0.1, 0.12 + arrival * 0.25 + density * 0.32 + spill * 0.34, white * 0.62, 0.85 + spill * 0.7, 0.62 + density * 0.98 + spill * 0.32);
    if (this.luminousThreads) (this.luminousThreads.material as THREE.LineBasicMaterial).opacity = spill * 0.045;
    this.sourceMaterial.opacity = 0;
  }

  private updateWaveBloom(progress: number, elapsed: number): void {
    const cloud = this.waveCloud;
    if (!cloud) return;
    const position = cloud.geometry.getAttribute("position") as THREE.BufferAttribute;
    const sizes = cloud.geometry.getAttribute("aPointSize") as THREE.BufferAttribute;
    const alphas = cloud.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const gaussians = cloud.geometry.getAttribute("aGaussian") as THREE.BufferAttribute;
    const stretches = cloud.geometry.getAttribute("aStretch") as THREE.BufferAttribute;
    for (const [index, item] of this.waveItems.entries()) {
      const arrival = 0.06 + item.distance * 0.22 + item.phase * 0.22;
      const firstWave = smooth((progress - arrival) / (0.1 + item.point.secondary * 0.05)) * (1 - smooth((progress - arrival - 0.16) / 0.18));
      const secondWave = smooth((progress - arrival - 0.36 - (item.source % 2) * 0.04) / 0.1) * (1 - smooth((progress - arrival - 0.53) / 0.17));
      const conversion = clamp01(firstWave + secondWave * 0.82);
      const reappearing = smooth((progress - arrival - 0.62) / 0.16) * (index % 4 === 0 ? 0.72 : 0.18);
      const pause = 0.73 + 0.27 * Math.sin(elapsed * (0.0002 + item.point.secondary * 0.00016) + item.phase * 22);
      const displacement = (1 - conversion * 0.54) * (0.7 + pause * 0.3);
      const point = item.point.position.clone()
        .addScaledVector(item.point.drift, displacement)
        .addScaledVector(this.viewRight, Math.sin(elapsed * (0.00012 + item.point.secondary * 0.0002) + index * 0.17) * this.span * 0.009 * (0.5 + conversion))
        .addScaledVector(this.viewUp, Math.cos(elapsed * 0.00017 + index * 0.11) * this.span * 0.006 * (0.4 + conversion));
      position.setXYZ(index, point.x, point.y, point.z);
      sizes.setX(index, item.point.size * (0.62 + conversion * (2.6 + item.point.metric * 2.2) + reappearing * 0.7));
      alphas.setX(index, item.point.alpha * (0.32 + conversion * 1.35 + reappearing * 0.55));
      gaussians.setX(index, clamp01(0.02 + conversion * 0.96 + reappearing * 0.36));
      stretches.setX(index, item.point.stretch * (1 + conversion * (0.36 + item.point.secondary * 0.8)));
    }
    position.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
    gaussians.needsUpdate = true;
    stretches.needsUpdate = true;
    cloud.material.uniforms.uGaussian.value = 0.04;
    cloud.material.uniforms.uOpacity.value = 0.78;
    cloud.material.uniforms.uWhite.value = smooth((progress - 0.72) / 0.2) * 0.22;
    cloud.material.uniforms.uTime.value = elapsed;
    cloud.material.uniforms.uMotion.value = 0.9;
    this.sourceMaterial.opacity = smooth((progress - 0.48) / 0.22) * 0.012;
  }

  private updateGardenInTheAir(progress: number, elapsed: number): void {
    const arrival = smooth((progress - 0.02) / 0.26);
    const depth = smooth((progress - 0.16) / 0.62);
    const calm = smooth((progress - 0.78) / 0.14);
    if (this.gardenFront) this.animateCloud(this.gardenFront, progress, elapsed, 0.72, arrival * (0.32 + depth * 0.34 - calm * 0.08), 0.08, 0.56 + depth * 0.38, 0.74 + depth * 0.35);
    if (this.gardenMiddle) this.animateCloud(this.gardenMiddle, progress, elapsed, 0.34 + depth * 0.4, arrival * (0.24 + depth * 0.4), 0.04, 0.72 + depth * 0.42, 0.74 + depth * 0.6);
    if (this.gardenFar) this.animateCloud(this.gardenFar, progress, elapsed, 0.06 + depth * 0.2, arrival * (0.18 + depth * 0.3), 0.02, 0.42, 0.7 + depth * 0.25);
    if (this.gardenThreads) (this.gardenThreads.material as THREE.LineBasicMaterial).opacity = depth * 0.035;
    const inward = smooth((progress - 0.28) / 0.6) * this.span * 0.065;
    const side = Math.sin(elapsed * 0.00011 + 0.8) * this.span * 0.025;
    this.camera.position.copy(this.initialCameraPosition).addScaledVector(this.viewForward, inward).addScaledVector(this.viewRight, side);
    this.camera.lookAt(this.center);
    this.sourceMaterial.opacity = 0;
  }

  private updateGatheringWhite(progress: number, elapsed: number): void {
    const gathering = smooth((progress - 0.06) / 0.48);
    const accumulation = smooth((progress - 0.36) / 0.38);
    const white = smooth((progress - 0.66) / 0.22);
    if (this.gatheringCloud) this.animateCloud(this.gatheringCloud, progress, elapsed, 0.06 + gathering * 0.48 + accumulation * 0.34, 0.12 + gathering * 0.32 + accumulation * 0.33, white * 0.86, 0.6 + accumulation * 0.7, 0.68 + gathering * 0.82);
    if (this.gatheringCores) this.animateCloud(this.gatheringCores, progress, elapsed, 0.28 + accumulation * 0.64, accumulation * (0.22 + white * 0.72), white * 1.02, 0.45 + accumulation * 0.45, 0.62 + accumulation * 1.35);
    this.sourceMaterial.opacity = 0;
  }

  private updateWeatherOfTheBouquet(progress: number, elapsed: number): void {
    const cloud = this.weatherCloud;
    if (!cloud) return;
    const weatherRise = smooth((progress - 0.08) / 0.25);
    const weatherWave = smooth((progress - 0.34) / 0.14) * (1 - smooth((progress - 0.55) / 0.16));
    const weatherWind = smooth((progress - 0.48) / 0.2);
    const weatherAfterlight = smooth((progress - 0.78) / 0.16);
    const position = cloud.geometry.getAttribute("position") as THREE.BufferAttribute;
    const sizes = cloud.geometry.getAttribute("aPointSize") as THREE.BufferAttribute;
    const alphas = cloud.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const gaussians = cloud.geometry.getAttribute("aGaussian") as THREE.BufferAttribute;
    const stretches = cloud.geometry.getAttribute("aStretch") as THREE.BufferAttribute;
    for (const [index, point] of cloud.points.entries()) {
      const cloudRise = smooth((progress - 0.08 - point.phase * 0.04) / (0.25 + point.secondary * 0.08));
      const wave = smooth((progress - 0.34 - point.metric * 0.12) / (0.1 + point.secondary * 0.05)) * (1 - smooth((progress - 0.55 - point.phase * 0.08) / 0.16));
      const wind = smooth((progress - 0.48 + point.secondary * 0.04) / 0.2);
      const afterlight = smooth((progress - 0.78) / 0.16);
      const stillness = smooth((progress - 0.26) / 0.08) * (1 - smooth((progress - 0.38) / 0.1));
      const drift = Math.sin(elapsed * (0.00013 + point.metric * 0.00016) + point.phase * 21) * this.span * (0.008 + wind * (0.024 + point.secondary * 0.035));
      const reversal = Math.cos(elapsed * (0.00019 + point.secondary * 0.00011) + index * 0.07) * this.span * (0.004 + wave * 0.014);
      const next = point.position.clone()
        .addScaledVector(this.viewRight, drift - reversal * (point.phase > 0.54 ? 1 : -1))
        .addScaledVector(this.viewUp, Math.sin(elapsed * 0.00016 + index * 0.04) * this.span * (0.004 + cloudRise * 0.014))
        .addScaledVector(this.viewForward, (cloudRise * 0.015 - stillness * 0.01) * this.span);
      position.setXYZ(index, next.x, next.y, next.z);
      sizes.setX(index, point.size * (0.42 + cloudRise * (0.7 + point.metric) + wave * (1.7 + point.secondary * 1.5) + afterlight * 0.45));
      alphas.setX(index, point.alpha * (0.24 + cloudRise * 0.62 + wave * 0.92 + afterlight * 0.45));
      gaussians.setX(index, clamp01(point.gaussian + cloudRise * 0.28 + wave * 0.58 + afterlight * 0.28));
      stretches.setX(index, point.stretch * (1 + wave * (0.28 + point.metric * 0.6)));
    }
    position.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
    gaussians.needsUpdate = true;
    stretches.needsUpdate = true;
    cloud.material.uniforms.uGaussian.value = 0.04;
    cloud.material.uniforms.uOpacity.value = 0.82;
    cloud.material.uniforms.uWhite.value = weatherAfterlight * 0.16;
    cloud.material.uniforms.uTime.value = elapsed;
    cloud.material.uniforms.uMotion.value = 0.7;
    if (this.weatherGlow) this.animateCloud(this.weatherGlow, progress, elapsed, 0.34 + weatherAfterlight * 0.34, 0.16 + weatherRise * 0.24 + weatherWave * 0.32 + weatherAfterlight * 0.16, weatherAfterlight * 0.42, 0.52, 0.74 + weatherWave * 0.86);
    this.updateDapple(progress, elapsed, 0.3 + weatherRise * 0.45 + weatherWave * 0.4 + weatherAfterlight * 0.28);
    const drift = Math.sin(elapsed * 0.0001 + 1.1) * this.span * 0.04 * weatherWind;
    this.camera.position.copy(this.initialCameraPosition).addScaledVector(this.viewRight, drift).addScaledVector(this.viewForward, -weatherWind * this.span * 0.025);
    this.camera.lookAt(this.center);
    this.sourceMaterial.opacity = 0;
  }

  private stageLabel(movie: ConceptMovieV2Id, progress: number): string {
    if (progress > 0.9) return "THE AIR HOLDS";
    if (progress < 0.08) return "BLACK / QUIET";
    switch (movie) {
      case "luminous-cloud": return progress < 0.28 ? "POINTS / ARRIVING" : progress < 0.58 ? "CLOUD / DENSITY" : progress < 0.78 ? "SPILL / LIGHT" : "OVERLAP / WHITE";
      case "wave-bloom": return progress < 0.24 ? "ONE POINT" : progress < 0.52 ? "WAVE / PROPAGATING" : progress < 0.78 ? "CONVERSION / LOCAL" : "INTERFERENCE / LIGHT";
      case "garden-in-the-air": return progress < 0.24 ? "AIR / FAR POINTS" : progress < 0.54 ? "FLOWERS / NEAR" : progress < 0.8 ? "DEPTH / BETWEEN" : "BOUQUET / INSIDE";
      case "gathering-white": return progress < 0.24 ? "SPARSE / BLACK" : progress < 0.52 ? "SMALL GS / GATHERING" : progress < 0.78 ? "DENSITY / LOCAL WHITE" : "GAPS / REMAIN";
      case "weather-of-the-bouquet": return progress < 0.24 ? "QUIET AIR" : progress < 0.42 ? "CLOUD / FORMS" : progress < 0.64 ? "WAVE / WEATHER" : progress < 0.82 ? "WIND / PAUSE" : "LIGHT / REMAINS";
    }
  }
}
