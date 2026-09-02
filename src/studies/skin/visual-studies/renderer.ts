import * as THREE from "three";
import type { InternalStructureGraph } from "../voronoi.ts";
import type { VisualStudyId, VisualStudySource } from "./catalog.ts";

export interface VisualStudyFrame {
  readonly progress: number;
  readonly stage: string;
  readonly stable: boolean;
}

interface PointDatum {
  readonly position: THREE.Vector3;
  readonly size: number;
  readonly alpha: number;
  readonly color: THREE.Color;
  readonly phase?: number;
  readonly stretch?: number;
  readonly angle?: number;
  readonly drift?: THREE.Vector3;
}

interface PointCloud {
  readonly object: THREE.Points;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly positions: Float32Array;
}

interface GrowthStroke {
  readonly start: THREE.Vector3;
  readonly control: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly line: THREE.Line;
  readonly position: THREE.BufferAttribute;
  readonly phase: number;
  readonly tempo: number;
  readonly hesitation: number;
}

interface MatterTube {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly phase: number;
  readonly tempo: number;
  readonly persistence: number;
}

interface ProfiledLine {
  readonly line: THREE.Line;
  readonly material: THREE.LineBasicMaterial;
  readonly profile: EdgeGestureProfile;
  readonly baseOpacity: number;
  readonly phase: number;
}

interface EdgeGestureProfile {
  readonly lengthVariation: number;
  readonly junction: number;
  readonly hesitation: number;
  readonly tempo: number;
  readonly persistence: number;
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
  uniform float uProgress;
  uniform float uTime;
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
    float breath = 0.82 + 0.18 * sin(uTime * 0.00065 * (0.75 + aPhase) + aPhase * 23.0);
    vec3 animatedPosition = position + aDrift * breath;
    vec4 modelViewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    gl_PointSize = clamp(aPointSize * uPointScale * (120.0 / max(1.0, -modelViewPosition.z)), 1.0, 34.0);
  }
`;

const POINT_FRAGMENT_SHADER = /* glsl */ `
  uniform float uProgress;
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
    vec2 rotated = vec2(
      point.x * cosine - point.y * sine,
      point.x * sine + point.y * cosine
    );
    rotated.x /= max(0.55, vStretch);
    float gaussianDistance = dot(rotated, rotated);
    if (gaussianDistance > 2.9) discard;
    float edge = exp(-gaussianDistance * 1.35);
    float arrival = smoothstep(vPhase - 0.16, vPhase + 0.05, uProgress);
    float shimmer = 0.92 + 0.08 * sin(uTime * 0.0017 + vPhase * 19.0);
    gl_FragColor = vec4(vColor, edge * vAlpha * arrival * shimmer);
  }
`;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerpNumber(from: number, to: number, amount: number): number {
  return from + (to - from) * clamp01(amount);
}

function seeded(index: number, salt = 0): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const FLOWER_COLORS = [
  0xd96e68,
  0xe0a15c,
  0x9e83be,
  0x5b9fb4,
  0xd3bd68,
] as const;

function normalizeRange(value: number, minimum: number, maximum: number): number {
  if (maximum - minimum < 0.000001) return 0.5;
  return clamp01((value - minimum) / (maximum - minimum));
}

function flowerColor(patchIndex: number, pointIndex: number, pointCount: number): THREE.Color {
  const base = new THREE.Color(FLOWER_COLORS[patchIndex % FLOWER_COLORS.length]);
  const highlight = pointCount <= 1 ? 0.16 : 0.12 + (pointIndex / (pointCount - 1)) * 0.2;
  return base.lerp(new THREE.Color(0xffecd0), highlight);
}

function profiledColor(color: number, profile: EdgeGestureProfile): THREE.Color {
  return new THREE.Color(color).lerp(new THREE.Color(0xf3ead5), 0.06 + profile.hesitation * 0.17);
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const drawable = child as THREE.Mesh;
    if (drawable.geometry) drawable.geometry.dispose();
    const material = drawable.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else if (material) {
      const mapMaterial = material as THREE.Material & { map?: THREE.Texture | null };
      mapMaterial.map?.dispose();
      material.dispose();
    }
  });
}

function makeLineSegments(
  positions: readonly number[],
  material: THREE.LineBasicMaterial,
  name: string,
): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = name;
  lines.renderOrder = 8;
  return lines;
}

function colorMix(from: THREE.Color, to: THREE.Color, amount: number): THREE.Color {
  return from.clone().lerp(to, clamp01(amount));
}

export class VisualStudyRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly root: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(39, 1, 0.01, 100);
  private readonly source: VisualStudySource;
  private readonly graph: InternalStructureGraph;
  private readonly artGroup = new THREE.Group();
  private readonly baseGroup = new THREE.Group();
  private readonly motifGroup = new THREE.Group();
  private readonly studyGroup = new THREE.Group();
  private readonly graphPositions: THREE.Vector3[];
  private readonly motifPositions: THREE.Vector3[];
  private readonly motifCenters: THREE.Vector3[];
  private readonly edgeMidpoints: THREE.Vector3[];
  private readonly degree: number[];
  private readonly graphEdgeOrder: number[];
  private readonly edgeProfiles: readonly EdgeGestureProfile[];
  private readonly motifMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly baseMaterial = new THREE.LineBasicMaterial({
    color: 0xc4d7ce,
    transparent: true,
    opacity: 0.055,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private activeStudy: VisualStudyId = "field";
  private startedAt = performance.now();
  private animationFrame = 0;
  private destroyed = false;
  private fieldCloud: PointCloud | null = null;
  private fieldBasePositions = new Float32Array();
  private fieldSpillDirections: THREE.Vector3[] = [];
  private fieldSpillAmounts: number[] = [];
  private dustCloud: PointCloud | null = null;
  private dustStart: THREE.Vector3[] = [];
  private dustEnd: THREE.Vector3[] = [];
  private dustBend: number[] = [];
  private dustTempo: number[] = [];
  private volumeCloud: PointCloud | null = null;
  private volumeMassMaterials: THREE.MeshBasicMaterial[] = [];
  private growthStrokes: GrowthStroke[] = [];
  private growthGraph: THREE.LineSegments | null = null;
  private shadowSprite: THREE.Sprite | null = null;
  private shadowCanvas: HTMLCanvasElement | null = null;
  private shadowTexture: THREE.CanvasTexture | null = null;
  private scanCloud: PointCloud | null = null;
  private scanBand: THREE.Line | null = null;
  private scanAtmosphere: PointCloud | null = null;
  private scanResidueLines: ProfiledLine[] = [];
  private residueProposalLines: ProfiledLine[] = [];
  private residueRejectedLines: ProfiledLine[] = [];
  private residueRevisedLines: ProfiledLine[] = [];
  private residueFinalLines: ProfiledLine[] = [];
  private residueRemains: PointCloud | null = null;
  private matterTubes: MatterTube[] = [];
  private matterDust: PointCloud | null = null;
  private gaussianCloud: PointCloud | null = null;
  private readonly onFrame: (frame: VisualStudyFrame) => void;

  constructor(root: HTMLElement, source: VisualStudySource, onFrame: (frame: VisualStudyFrame) => void) {
    this.root = root;
    this.source = source;
    this.graph = source.graph;
    this.onFrame = onFrame;
    this.graphPositions = this.graph.nodes.map((node) => new THREE.Vector3(node.position.x, node.position.y, node.position.z));
    this.motifPositions = source.patterns.flatMap((patch) => patch.points.map((point) => new THREE.Vector3(point.x, point.y, point.z)));
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
    this.graphEdgeOrder = this.graph.edges.map((_, index) => index).sort((left, right) => (
      (this.edgeMidpoints[left]?.z ?? 0) - (this.edgeMidpoints[right]?.z ?? 0) || left - right
    ));
    this.edgeProfiles = this.deriveEdgeProfiles();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x050808, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "visual-studies-canvas";
    this.renderer.domElement.setAttribute("aria-label", "SKIN visual study artwork");
    this.root.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.fitCamera();
    this.scene.add(this.artGroup);
    this.artGroup.add(this.baseGroup, this.motifGroup, this.studyGroup);
    this.buildSourceLayers();
    this.setStudy("field");
    window.addEventListener("resize", this.resize);
    this.resize();
    this.tick = this.tick.bind(this);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  get currentStudy(): VisualStudyId {
    return this.activeStudy;
  }

  setStudy(study: VisualStudyId): void {
    this.activeStudy = study;
    this.clearStudyObjects();
    this.buildStudy(study);
    this.startedAt = performance.now();
    this.onFrame({ progress: 0, stage: this.stageLabel(study, 0), stable: false });
  }

  replay(): void {
    this.startedAt = performance.now();
    this.onFrame({ progress: 0, stage: this.stageLabel(this.activeStudy, 0), stable: false });
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
  };

  private readonly tick = (now: number): void => {
    if (this.destroyed) return;
    const duration = this.activeStudy === "shadow" ? 10_000 : this.activeStudy === "growth" ? 7_600 : 9_200;
    const elapsed = (now - this.startedAt) % duration;
    const progress = elapsed / duration;
    this.updateStudy(progress, elapsed);
    this.artGroup.rotation.y = this.activeStudy === "shadow" ? 0 : Math.sin(now * 0.000085) * 0.045;
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private fitCamera(): void {
    const points = [
      ...this.graphPositions,
      ...this.motifPositions,
      ...this.source.base.host.map((ball) => new THREE.Vector3(ball.x, ball.y, ball.z)),
    ];
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    const direction = new THREE.Vector3(1.15, -1.35, 0.82).normalize();
    const distance = span / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))) * 1.42;
    this.camera.position.copy(center).addScaledVector(direction, Math.max(8.6, distance));
    this.camera.lookAt(center);
  }

  private buildSourceLayers(): void {
    for (const ball of this.source.base.host) {
      const sphere = new THREE.SphereGeometry(1, 10, 6);
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(sphere), this.baseMaterial);
      sphere.dispose();
      wire.position.set(ball.x, ball.y, ball.z);
      wire.scale.setScalar(ball.r);
      wire.renderOrder = 1;
      this.baseGroup.add(wire);
    }
    for (const [patchIndex, patch] of this.source.patterns.entries()) {
      for (const [pointIndex, point] of patch.points.entries()) {
        const material = new THREE.MeshBasicMaterial({
          color: flowerColor(patchIndex, pointIndex, patch.points.length),
          transparent: true,
          opacity: 0.36,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.018, point.r * 0.16), 8, 6), material);
        sphere.position.set(point.x, point.y, point.z);
        sphere.renderOrder = 4;
        this.motifGroup.add(sphere);
        this.motifMaterials.push(material);
      }
    }
  }

  private clearStudyObjects(): void {
    for (const child of [...this.studyGroup.children]) {
      this.studyGroup.remove(child);
      disposeObject(child);
    }
    this.fieldCloud = null;
    this.fieldBasePositions = new Float32Array();
    this.fieldSpillDirections = [];
    this.fieldSpillAmounts = [];
    this.dustCloud = null;
    this.dustStart = [];
    this.dustEnd = [];
    this.dustBend = [];
    this.dustTempo = [];
    this.volumeCloud = null;
    this.volumeMassMaterials = [];
    this.growthStrokes = [];
    this.growthGraph = null;
    this.shadowSprite = null;
    this.shadowCanvas = null;
    this.shadowTexture = null;
    this.scanCloud = null;
    this.scanBand = null;
    this.scanAtmosphere = null;
    this.scanResidueLines = [];
    this.residueProposalLines = [];
    this.residueRejectedLines = [];
    this.residueRevisedLines = [];
    this.residueFinalLines = [];
    this.residueRemains = null;
    this.matterTubes = [];
    this.matterDust = null;
    this.gaussianCloud = null;
  }

  private buildStudy(study: VisualStudyId): void {
    switch (study) {
      case "field": this.buildField(); break;
      case "dust": this.buildDust(); break;
      case "growth": this.buildGrowth(); break;
      case "volume": this.buildVolume(); break;
      case "shadow": this.buildShadow(); break;
      case "scan": this.buildScan(); break;
      case "residue": this.buildResidue(); break;
      case "matter": this.buildMatter(); break;
      case "gaussian": this.buildGaussian(); break;
    }
  }

  /**
   * The completed FKEI does not carry HANA's Raw Gesture, so the presentation
   * derives a deterministic hand-trace proxy from source geometry only. Edge
   * length, junction pressure, and directional change affect appearance and
   * timing; they never enter the SKIN geometry or saved runtime.
   */
  private deriveEdgeProfiles(): readonly EdgeGestureProfile[] {
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
    const minimumLength = Math.min(...lengths, 0);
    const maximumLength = Math.max(...lengths, 1);
    const directionAt = (edgeIndex: number, nodeIndex: number): THREE.Vector3 => {
      const edge = this.graph.edges[edgeIndex];
      const own = this.graphPositions[nodeIndex] ?? new THREE.Vector3();
      const otherIndex = edge?.start === nodeIndex ? edge.end : edge?.start;
      return (this.graphPositions[otherIndex ?? nodeIndex] ?? own).clone().sub(own).normalize();
    };
    const turnAt = (edgeIndex: number, nodeIndex: number): number => {
      const current = directionAt(edgeIndex, nodeIndex);
      const neighbors = (incident.get(nodeIndex) ?? []).filter((candidate) => candidate !== edgeIndex);
      if (neighbors.length === 0) return 0;
      let turn = 0;
      for (const neighbor of neighbors) turn += 1 - Math.abs(current.dot(directionAt(neighbor, nodeIndex)));
      return clamp01(turn / neighbors.length);
    };
    return this.graph.edges.map((edge, edgeIndex) => {
      const length = lengths[edgeIndex] ?? 0;
      const lengthVariation = normalizeRange(length, minimumLength, maximumLength);
      const junction = clamp01(((this.degree[edge.start] ?? 0) + (this.degree[edge.end] ?? 0) - 2) / 9);
      const hesitation = clamp01(turnAt(edgeIndex, edge.start) * 0.46 + turnAt(edgeIndex, edge.end) * 0.34 + junction * 0.2);
      return {
        lengthVariation,
        junction,
        hesitation,
        tempo: clamp01(0.88 - hesitation * 0.46 + lengthVariation * 0.12),
        persistence: clamp01(0.56 + hesitation * 0.34 + junction * 0.18),
      };
    });
  }

  private createPointCloud(points: readonly PointDatum[], pointScale = 8): PointCloud {
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
      phases[index] = point.phase ?? 0;
      stretches[index] = point.stretch ?? 1;
      angles[index] = point.angle ?? 0;
      drifts[index * 3] = point.drift?.x ?? 0;
      drifts[index * 3 + 1] = point.drift?.y ?? 0;
      drifts[index * 3 + 2] = point.drift?.z ?? 0;
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
        uProgress: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const object = new THREE.Points(geometry, material);
    object.renderOrder = 10;
    this.studyGroup.add(object);
    return { object, geometry, material, positions };
  }

  private updatePointCloud(cloud: PointCloud, progress: number, time: number): void {
    cloud.material.uniforms.uProgress.value = progress;
    cloud.material.uniforms.uTime.value = time;
  }

  private nearestDistance(point: THREE.Vector3, candidates: readonly THREE.Vector3[]): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) nearest = Math.min(nearest, point.distanceTo(candidate));
    return nearest;
  }

  private sourceBounds(): { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3; size: THREE.Vector3 } {
    const points = [
      ...this.graphPositions,
      ...this.motifPositions,
      ...this.source.base.host.map((ball) => new THREE.Vector3(ball.x, ball.y, ball.z)),
    ];
    const box = new THREE.Box3().setFromPoints(points);
    return { min: box.min.clone(), max: box.max.clone(), center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
  }

  private sampleWithinSource(index: number): THREE.Vector3 {
    const bounds = this.sourceBounds();
    const radii = new THREE.Vector3(
      Math.max(0.5, bounds.size.x * 0.58),
      Math.max(0.5, bounds.size.y * 0.58),
      Math.max(1.0, bounds.size.z * 0.56),
    );
    for (let attempt = 0; attempt < 24; attempt++) {
      const point = new THREE.Vector3(
        (seeded(index + attempt * 13, 1) * 2 - 1) * radii.x,
        (seeded(index + attempt * 13, 2) * 2 - 1) * radii.y,
        (seeded(index + attempt * 13, 3) * 2 - 1) * radii.z,
      );
      const normalized = (point.x * point.x) / (radii.x * radii.x)
        + (point.y * point.y) / (radii.y * radii.y)
        + (point.z * point.z) / (radii.z * radii.z);
      if (normalized <= 1) return point.add(bounds.center);
    }
    return bounds.center.clone();
  }

  private buildField(): void {
    const fieldPoints: PointDatum[] = [];
    const cool = new THREE.Color(0x6bbcb3);
    const warm = new THREE.Color(0xd8c779);
    const bounds = this.sourceBounds();
    const spillStart = 2400;
    this.fieldSpillDirections = [];
    this.fieldSpillAmounts = [];
    for (let index = 0; index < 3600; index++) {
      const isSpill = index >= spillStart;
      const edgeIndex = index % Math.max(1, this.edgeMidpoints.length);
      const profile = this.edgeProfiles[edgeIndex] ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
      const direction = isSpill
        ? (this.edgeMidpoints[edgeIndex]?.clone().sub(bounds.center) ?? new THREE.Vector3(1, 0, 0))
        : new THREE.Vector3();
      if (direction.lengthSq() < 0.000001) direction.set(1, 0, 0);
      direction.normalize();
      const spillAmount = isSpill ? 0.14 + profile.lengthVariation * 0.2 + profile.junction * 0.16 : 0;
      const position = isSpill
        ? (this.edgeMidpoints[edgeIndex]?.clone() ?? bounds.center.clone()).addScaledVector(direction, spillAmount * 0.1)
        : this.sampleWithinSource(index);
      const graphDistance = this.nearestDistance(position, this.graphPositions);
      const motifDistance = this.nearestDistance(position, this.motifCenters);
      const graphInfluence = Math.exp(-graphDistance * 3.9);
      const motifInfluence = Math.exp(-motifDistance * 5.4);
      const influence = clamp01(graphInfluence * 0.72 + motifInfluence * 0.28);
      this.fieldSpillDirections.push(direction);
      this.fieldSpillAmounts.push(spillAmount);
      fieldPoints.push({
        position,
        size: 0.024 + influence * 0.07 + (isSpill ? profile.persistence * 0.025 : seeded(index, 11) * 0.028),
        alpha: 0.09 + influence * 0.55 + (isSpill ? profile.persistence * 0.11 : 0),
        color: colorMix(cool, warm, influence),
        phase: isSpill ? 0.34 + (index - spillStart) / (3600 - spillStart) * 0.46 : 0.08 + seeded(index, 12) * 0.72,
        stretch: isSpill ? 1.25 + profile.hesitation * 0.8 : 1,
        angle: isSpill ? Math.atan2(direction.z, direction.x) : 0,
      });
    }
    this.fieldCloud = this.createPointCloud(fieldPoints, 9.2);
    this.fieldBasePositions = this.fieldCloud.positions.slice();
  }

  private buildDust(): void {
    const dust: PointDatum[] = [];
    const count = Math.min(1800, Math.max(900, this.graph.nodes.length * 6));
    const originPool = this.motifCenters.length > 0 ? this.motifCenters : this.graphPositions;
    const bounds = this.sourceBounds();
    for (let index = 0; index < count; index++) {
      const origin = originPool[index % originPool.length]?.clone() ?? new THREE.Vector3();
      const edgeIndex = index % Math.max(1, this.edgeMidpoints.length);
      const profile = this.edgeProfiles[edgeIndex] ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
      const target = index % 4 === 0
        ? (() => {
          const anchor = this.edgeMidpoints[edgeIndex]?.clone() ?? bounds.center.clone();
          const direction = anchor.sub(bounds.center);
          if (direction.lengthSq() < 0.000001) direction.set(1, 0, 0);
          direction.normalize();
          return (this.edgeMidpoints[edgeIndex]?.clone() ?? origin.clone()).addScaledVector(
            direction,
            0.2 + profile.persistence * 0.22 + profile.lengthVariation * 0.12,
          );
        })()
        : this.graphPositions[(index * 7 + Math.floor(index / 11)) % Math.max(1, this.graphPositions.length)]?.clone() ?? origin.clone();
      const start = origin.add(new THREE.Vector3(
        (seeded(index, 20) - 0.5) * 0.42,
        (seeded(index, 21) - 0.5) * 0.42,
        (seeded(index, 22) - 0.5) * 0.42,
      ));
      const end = target.add(new THREE.Vector3(
        (seeded(index, 23) - 0.5) * 0.12,
        (seeded(index, 24) - 0.5) * 0.12,
        (seeded(index, 25) - 0.5) * 0.12,
      ));
      this.dustStart.push(start);
      this.dustEnd.push(end);
      this.dustBend.push((seeded(index, 26) - 0.5) * 0.22);
      this.dustTempo.push(profile.tempo);
      dust.push({
        position: start,
        size: 0.028 + seeded(index, 27) * 0.045,
        alpha: 0.24 + seeded(index, 28) * 0.58,
        color: colorMix(new THREE.Color(0xc4d9d2), new THREE.Color(0xe4c96d), seeded(index, 29)),
        phase: index % 4 === 0 ? 0.22 + (index / count) * 0.54 : 0.04 + (index / count) * 0.75,
        stretch: index % 4 === 0 ? 1.15 + profile.lengthVariation * 0.8 : 1,
      });
    }
    this.dustCloud = this.createPointCloud(dust, 12.5);
  }

  private nearestGraphIndex(point: THREE.Vector3): number {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [index, candidate] of this.graphPositions.entries()) {
      const distance = point.distanceToSquared(candidate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    return nearestIndex;
  }

  private buildGrowth(): void {
    const source = this.motifCenters.length > 0 ? this.motifCenters : [new THREE.Vector3()];
    const supportNodes = this.graph.nodes
      .map((_, index) => ({ index, degree: this.degree[index] ?? 0 }))
      .sort((left, right) => right.degree - left.degree || left.index - right.index)
      .slice(0, Math.min(36, Math.max(12, this.graph.nodes.length)));
    const strokes: GrowthStroke[] = [];
    const stride = Math.max(1, Math.ceil(source.length / 34));
    for (let index = 0; index < source.length; index += stride) {
      const start = source[index]?.clone() ?? new THREE.Vector3();
      const targetIndex = supportNodes.reduce((nearest, candidate) => {
        const currentDistance = start.distanceToSquared(this.graphPositions[nearest] ?? start);
        const candidateDistance = start.distanceToSquared(this.graphPositions[candidate.index] ?? start);
        const degreeBias = (candidate.degree - (this.degree[nearest] ?? 0)) * 0.012;
        return candidateDistance - degreeBias < currentDistance ? candidate.index : nearest;
      }, this.nearestGraphIndex(start));
      const end = this.graphPositions[targetIndex]?.clone() ?? start.clone();
      const profile = this.edgeProfiles[this.graph.edges.findIndex((edge) => edge.start === targetIndex || edge.end === targetIndex)]
        ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
      const direction = end.clone().sub(start);
      const bend = new THREE.Vector3(-direction.z, direction.y * 0.35, direction.x);
      if (bend.lengthSq() < 0.000001) bend.set(0, 1, 0);
      bend.normalize();
      const control = start.clone().lerp(end, 0.42).addScaledVector(
        bend,
        (0.06 + profile.hesitation * 0.16) * (index % 2 === 0 ? 1 : -1),
      );
      const positions = new Float32Array(9);
      positions[0] = start.x;
      positions[1] = start.y;
      positions[2] = start.z;
      positions[3] = start.x;
      positions[4] = start.y;
      positions[5] = start.z;
      positions[6] = start.x;
      positions[7] = start.y;
      positions[8] = start.z;
      const geometry = new THREE.BufferGeometry();
      const position = new THREE.BufferAttribute(positions, 3);
      geometry.setAttribute("position", position);
      const material = new THREE.LineBasicMaterial({
        color: profiledColor(0x71aaa1, profile),
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 12;
      this.studyGroup.add(line);
      strokes.push({
        start,
        control,
        end,
        line,
        position,
        phase: 0.02 + profile.hesitation * 0.22 + (index / Math.max(1, source.length)) * 0.16,
        tempo: profile.tempo,
        hesitation: profile.hesitation,
      });
    }
    this.growthStrokes = strokes;
    this.growthGraph = this.makeGraphLines(this.graphEdgeOrder, 0.1, 0xb7e5c9, "growth-final-network");
    this.growthGraph.visible = false;
  }

  private buildVolume(): void {
    const points: PointDatum[] = [];
    for (const [edgeIndex, edge] of this.graph.edges.entries()) {
      const start = this.graphPositions[edge.start] ?? new THREE.Vector3();
      const end = this.graphPositions[edge.end] ?? start;
      const samples = 7;
      const localWeight = 0.35 + ((this.degree[edge.start] ?? 0) + (this.degree[edge.end] ?? 0)) * 0.025;
      const profile = this.edgeProfiles[edgeIndex] ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
      const edgeDirection = end.clone().sub(start).normalize();
      const flow = new THREE.Vector3(-edgeDirection.z, edgeDirection.y * 0.45, edgeDirection.x)
        .normalize()
        .multiplyScalar(0.012 + profile.hesitation * 0.02);
      for (let sample = 0; sample < samples; sample++) {
        const t = sample / (samples - 1);
        const position = start.clone().lerp(end, t);
        const jitter = 0.035 + localWeight * 0.06;
        position.x += (seeded(edgeIndex * samples + sample, 40) - 0.5) * jitter;
        position.y += (seeded(edgeIndex * samples + sample, 41) - 0.5) * jitter;
        position.z += (seeded(edgeIndex * samples + sample, 42) - 0.5) * jitter;
        points.push({
          position,
          size: 0.07 + localWeight * 0.07 + seeded(edgeIndex * samples + sample, 43) * 0.08,
          alpha: 0.14 + localWeight * 0.08,
          color: colorMix(new THREE.Color(0x86b7c1), new THREE.Color(0xb594d0), localWeight * 0.7),
          phase: 0.08 + edgeIndex / Math.max(1, this.graph.edges.length) * 0.78,
          stretch: 1.1 + profile.junction * 0.8 + profile.lengthVariation * 0.35,
          angle: Math.atan2(edgeDirection.z, edgeDirection.x),
          drift: flow,
        });
      }
    }
    this.volumeCloud = this.createPointCloud(points, 10.5);
    const highDegreeNodes = this.graph.nodes
      .map((node, index) => ({ node, index, degree: this.degree[index] ?? 0 }))
      .sort((left, right) => right.degree - left.degree)
      .slice(0, 22);
    for (const [index, item] of highDegreeNodes.entries()) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? 0x84c2bf : 0xb896d1,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
      mesh.position.copy(this.graphPositions[item.index] ?? new THREE.Vector3());
      mesh.scale.setScalar(0.13 + item.degree * 0.028);
      mesh.renderOrder = 9;
      this.studyGroup.add(mesh);
      this.volumeMassMaterials.push(material);
    }
  }

  private buildShadow(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    const bounds = this.sourceBounds();
    const height = Math.max(1, bounds.size.z * 1.35);
    const width = Math.max(1, bounds.size.x * 1.9);
    sprite.position.set(bounds.center.x, bounds.center.y + 0.05, bounds.center.z);
    sprite.scale.set(width, height, 1);
    sprite.renderOrder = -2;
    this.studyGroup.add(sprite);
    this.shadowCanvas = canvas;
    this.shadowTexture = texture;
    this.shadowSprite = sprite;
  }

  private buildScan(): void {
    const count = this.graph.edges.length + this.graph.nodes.length;
    const points: PointDatum[] = Array.from({ length: count }, () => ({
      position: new THREE.Vector3(),
      size: 0.045,
      alpha: 0,
      color: new THREE.Color(0xb9e5c9),
      phase: 0,
    }));
    this.scanCloud = this.createPointCloud(points, 9.5);
    const atmosphere: PointDatum[] = [];
    for (const [edgeIndex, edge] of this.graph.edges.entries()) {
      const start = this.graphPositions[edge.start] ?? new THREE.Vector3();
      const end = this.graphPositions[edge.end] ?? start;
      const direction = end.clone().sub(start).normalize();
      const profile = this.edgeProfiles[edgeIndex] ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
      const drift = new THREE.Vector3(-direction.z, direction.y * 0.35, direction.x)
        .normalize()
        .multiplyScalar(0.008 + profile.persistence * 0.012);
      for (let sample = 0; sample < 4; sample++) {
        const t = (sample + 0.5) / 4;
        atmosphere.push({
          position: start.clone().lerp(end, t),
          size: 0.03 + profile.junction * 0.05,
          alpha: 0.06 + profile.persistence * 0.13,
          color: colorMix(new THREE.Color(0x79b9b4), new THREE.Color(0xae91c8), profile.hesitation * 0.8),
          phase: 0.12 + edgeIndex / Math.max(1, this.graph.edges.length) * 0.56,
          stretch: 1.2 + profile.lengthVariation * 0.75,
          angle: Math.atan2(direction.z, direction.x),
          drift,
        });
      }
    }
    this.scanAtmosphere = this.createPointCloud(atmosphere, 8.6);
    const residueIndices = [...this.graphEdgeOrder]
      .sort((left, right) => (this.edgeProfiles[right]?.hesitation ?? 0) - (this.edgeProfiles[left]?.hesitation ?? 0) || left - right)
      .slice(0, Math.max(24, Math.floor(this.graph.edges.length * 0.3)));
    this.scanResidueLines = this.makeProfiledGraphLines(residueIndices, 0.18, 0x9b8dc0, "scan-residue");
    const bounds = this.sourceBounds();
    const bandGeometry = new THREE.BufferGeometry();
    bandGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      bounds.min.x - 0.3, bounds.center.y, bounds.min.z,
      bounds.max.x + 0.3, bounds.center.y, bounds.min.z,
    ], 3));
    const bandMaterial = new THREE.LineBasicMaterial({
      color: 0xb5e8d1,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.scanBand = new THREE.Line(bandGeometry, bandMaterial);
    this.scanBand.renderOrder = 13;
    this.studyGroup.add(this.scanBand);
  }

  private buildResidue(): void {
    const proposalIndices = this.graphEdgeOrder.slice(0, Math.max(14, Math.floor(this.graph.edges.length * 0.2)));
    const hesitationOrder = [...this.graphEdgeOrder].sort((left, right) => (
      (this.edgeProfiles[right]?.hesitation ?? 0) - (this.edgeProfiles[left]?.hesitation ?? 0) || left - right
    ));
    const rejectedIndices = hesitationOrder.slice(0, Math.max(18, Math.floor(this.graph.edges.length * 0.16)));
    const revisedIndices = this.graphEdgeOrder
      .filter((edgeIndex) => (this.edgeProfiles[edgeIndex]?.hesitation ?? 0) < 0.86)
      .slice(0, Math.max(28, Math.floor(this.graph.edges.length * 0.5)));
    this.residueProposalLines = this.makeProfiledGraphLines(proposalIndices, 0.7, 0xe0ca68, "hand-remains-proposals");
    this.residueRejectedLines = this.makeProfiledGraphLines(rejectedIndices, 0.55, 0xe17c72, "hand-remains-rejected");
    this.residueRevisedLines = this.makeProfiledGraphLines(revisedIndices, 0.64, 0x7eb9b0, "hand-remains-revised");
    this.residueFinalLines = this.makeProfiledGraphLines(this.graphEdgeOrder, 0.32, 0xd8e1bb, "hand-remains-final");
    this.residueRemains = this.createPointCloud(this.edgeMidpoints.map((position, edgeIndex) => {
      const profile = this.edgeProfiles[edgeIndex] ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
      return {
        position: position.clone(),
        size: 0.024 + profile.hesitation * 0.05 + profile.junction * 0.028,
        alpha: 0.12 + profile.persistence * 0.28,
        color: profiledColor(0xd88478, profile),
        phase: 0.04 + (1 - profile.persistence) * 0.3,
      };
    }), 9.8);
  }

  private buildMatter(): void {
    const incident = new Map<number, number[]>();
    for (const [edgeIndex, edge] of this.graph.edges.entries()) {
      for (const nodeIndex of [edge.start, edge.end]) {
        const edges = incident.get(nodeIndex) ?? [];
        edges.push(edgeIndex);
        incident.set(nodeIndex, edges);
      }
    }
    const tubes: MatterTube[] = [];
    const seedNodes = this.graph.nodes
      .map((node, index) => ({ node, index, degree: this.degree[index] ?? 0 }))
      .sort((left, right) => right.degree - left.degree || left.node.position.z - right.node.position.z || left.index - right.index)
      .slice(0, Math.min(20, Math.max(8, this.graph.nodes.length)));
    const seedCount = seedNodes.length;
    for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
      let nodeIndex = seedNodes[seedIndex]?.index ?? 0;
      const path: THREE.Vector3[] = [];
      const pathProfiles: EdgeGestureProfile[] = [];
      const visited = new Set<number>();
      let pathHesitation = 0;
      let pathPersistence = 0.56;
      let pathTempo = 0.8;
      for (let step = 0; step < 8; step++) {
        path.push((this.graphPositions[nodeIndex] ?? new THREE.Vector3()).clone());
        const options = (incident.get(nodeIndex) ?? []).filter((edgeIndex) => !visited.has(edgeIndex));
        const edgeIndex = [...options].sort((left, right) => (
          (this.edgeProfiles[right]?.hesitation ?? 0) - (this.edgeProfiles[left]?.hesitation ?? 0) || left - right
        ))[0];
        if (edgeIndex === undefined) break;
        visited.add(edgeIndex);
        const profile = this.edgeProfiles[edgeIndex];
        if (profile) {
          pathProfiles.push(profile);
          pathHesitation = Math.max(pathHesitation, profile.hesitation);
          pathPersistence = Math.max(pathPersistence, profile.persistence);
          pathTempo = Math.min(pathTempo, profile.tempo);
        }
        const edge = this.graph.edges[edgeIndex];
        nodeIndex = edge.start === nodeIndex ? edge.end : edge.start;
      }
      if (path.length < 3) continue;
      const curve = new THREE.CatmullRomCurve3(path, false, "centripetal", 0.55);
      const radius = 0.014 + pathHesitation * 0.018 + pathPersistence * 0.008;
      const geometry = new THREE.TubeGeometry(curve, 42, radius, 6, false);
      const tubePosition = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let tubularIndex = 0; tubularIndex <= 42; tubularIndex++) {
        const profile = pathProfiles[Math.min(pathProfiles.length - 1, Math.floor(tubularIndex / 42 * pathProfiles.length))]
          ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
        const center = curve.getPointAt(tubularIndex / 42);
        const radiusVariation = 0.62 + profile.lengthVariation * 0.22 + profile.junction * 0.62 + profile.hesitation * 0.45;
        for (let radialIndex = 0; radialIndex <= 6; radialIndex++) {
          const vertexIndex = tubularIndex * 7 + radialIndex;
          const vertex = new THREE.Vector3().fromBufferAttribute(tubePosition, vertexIndex);
          vertex.sub(center).multiplyScalar(radiusVariation).add(center);
          tubePosition.setXYZ(vertexIndex, vertex.x, vertex.y, vertex.z);
        }
      }
      tubePosition.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({
        color: profiledColor(0x72aaa2, {
          lengthVariation: 0.5,
          junction: pathHesitation,
          hesitation: pathHesitation,
          tempo: pathTempo,
          persistence: pathPersistence,
        }),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 10;
      this.studyGroup.add(mesh);
      tubes.push({
        mesh,
        material,
        phase: 0.04 + (1 - pathPersistence) * 0.2 + seedIndex / Math.max(1, seedCount) * 0.18,
        tempo: pathTempo,
        persistence: pathPersistence,
      });
    }
    this.matterTubes = tubes;
    const granularPoints: PointDatum[] = [];
    for (const [index, midpoint] of this.edgeMidpoints.entries()) {
      const profile = this.edgeProfiles[index] ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
      granularPoints.push({
        position: midpoint.clone(),
        size: 0.022 + profile.junction * 0.042 + profile.hesitation * 0.024,
        alpha: 0.1 + profile.persistence * 0.3,
        color: profiledColor(0xd49487, profile),
        phase: 0.12 + (1 - profile.persistence) * 0.32 + index / Math.max(1, this.edgeMidpoints.length) * 0.45,
      });
    }
    this.matterDust = this.createPointCloud(granularPoints, 9);
  }

  private buildGaussian(): void {
    const bounds = this.sourceBounds();
    const points: PointDatum[] = [];
    const cool = new THREE.Color(0x67b9bc);
    const warm = new THREE.Color(0xe2a06f);
    const violet = new THREE.Color(0xa48ac8);
    for (const [patchIndex, center] of this.motifCenters.entries()) {
      const outward = center.clone().sub(bounds.center);
      if (outward.lengthSq() < 0.000001) outward.set(1, 0, 0);
      outward.normalize();
      points.push({
        position: center.clone(),
        size: 0.14,
        alpha: 0.78,
        color: flowerColor(patchIndex, 0, 1),
        phase: 0.06 + (patchIndex / Math.max(1, this.motifCenters.length)) * 0.28,
        stretch: 1.55 + (patchIndex % 3) * 0.24,
        angle: Math.atan2(outward.z, outward.x),
        drift: outward.multiplyScalar(0.018),
      });
    }
    for (const [edgeIndex, edge] of this.graph.edges.entries()) {
      const start = this.graphPositions[edge.start] ?? new THREE.Vector3();
      const end = this.graphPositions[edge.end] ?? start;
      const midpoint = start.clone().lerp(end, 0.5);
      const direction = end.clone().sub(start).normalize();
      if (direction.lengthSq() < 0.000001) direction.set(1, 0, 0);
      const profile = this.edgeProfiles[edgeIndex] ?? { lengthVariation: 0.5, junction: 0, hesitation: 0, tempo: 0.8, persistence: 0.6 };
      const lightColor = colorMix(cool, violet, profile.hesitation * 0.9);
      const drift = new THREE.Vector3(-direction.z, direction.y * 0.4, direction.x)
        .normalize()
        .multiplyScalar(0.008 + profile.hesitation * 0.014);
      points.push({
        position: midpoint,
        size: 0.042 + profile.junction * 0.06 + profile.hesitation * 0.035,
        alpha: 0.16 + profile.persistence * 0.26,
        color: lightColor,
        phase: 0.16 + edgeIndex / Math.max(1, this.graph.edges.length) * 0.5,
        stretch: 1.28 + profile.lengthVariation * 1.2 + profile.junction * 0.5,
        angle: Math.atan2(direction.z, direction.x),
        drift,
      });
      const outward = midpoint.clone().sub(bounds.center);
      if (outward.lengthSq() < 0.000001) outward.set(direction.z, 0, -direction.x);
      outward.normalize();
      points.push({
        position: midpoint.clone().addScaledVector(outward, 0.18 + profile.persistence * 0.24),
        size: 0.038 + profile.hesitation * 0.045,
        alpha: 0.11 + profile.persistence * 0.2,
        color: colorMix(warm, violet, profile.hesitation),
        phase: 0.34 + edgeIndex / Math.max(1, this.graph.edges.length) * 0.48,
        stretch: 1.4 + profile.hesitation * 1.2,
        angle: Math.atan2(outward.z, outward.x),
        drift: outward.multiplyScalar(0.012 + profile.persistence * 0.01),
      });
    }
    this.gaussianCloud = this.createPointCloud(points, 14.5);
  }

  private graphLinePositions(edgeIndices: readonly number[]): number[] {
    const positions: number[] = [];
    for (const edgeIndex of edgeIndices) {
      const edge = this.graph.edges[edgeIndex];
      if (!edge) continue;
      const start = this.graphPositions[edge.start];
      const end = this.graphPositions[edge.end];
      if (!start || !end) continue;
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
    return positions;
  }

  private makeGraphLines(edgeIndices: readonly number[], opacity: number, color: number, name: string): THREE.LineSegments {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = makeLineSegments(this.graphLinePositions(edgeIndices), material, name);
    this.studyGroup.add(lines);
    return lines;
  }

  private makeProfiledGraphLines(
    edgeIndices: readonly number[],
    opacity: number,
    color: number,
    name: string,
  ): ProfiledLine[] {
    const lines: ProfiledLine[] = [];
    for (const [lineIndex, edgeIndex] of edgeIndices.entries()) {
      const edge = this.graph.edges[edgeIndex];
      const start = edge ? this.graphPositions[edge.start] : undefined;
      const end = edge ? this.graphPositions[edge.end] : undefined;
      const profile = this.edgeProfiles[edgeIndex];
      if (!edge || !start || !end || !profile) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([
        start.x, start.y, start.z, end.x, end.y, end.z,
      ], 3));
      const material = new THREE.LineBasicMaterial({
        color: profiledColor(color, profile),
        transparent: true,
        opacity: opacity * (0.74 + profile.persistence * 0.26),
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      line.name = `${name}-${edgeIndex}`;
      line.renderOrder = 11;
      this.studyGroup.add(line);
      lines.push({
        line,
        material,
        profile,
        baseOpacity: opacity,
        phase: edgeIndices.length <= 1 ? 0 : lineIndex / (edgeIndices.length - 1),
      });
    }
    return lines;
  }

  private updateStudy(progress: number, elapsed: number): void {
    this.baseMaterial.opacity = this.activeStudy === "shadow" ? 0.095 : 0.07;
    const motifOpacity = this.activeStudy === "shadow" || this.activeStudy === "growth" || this.activeStudy === "matter" ? 0.6 : this.activeStudy === "gaussian" ? 0.74 : 0.34;
    for (const material of this.motifMaterials) material.opacity = motifOpacity;
    switch (this.activeStudy) {
      case "field": this.updateField(progress, elapsed); break;
      case "dust": this.updateDust(progress, elapsed); break;
      case "growth": this.updateGrowth(progress, elapsed); break;
      case "volume": this.updateVolume(progress, elapsed); break;
      case "shadow": this.updateShadow(progress); break;
      case "scan": this.updateScan(progress, elapsed); break;
      case "residue": this.updateResidue(progress); break;
      case "matter": this.updateMatter(progress, elapsed); break;
      case "gaussian": this.updateGaussian(progress, elapsed); break;
    }
    const stable = progress > 0.88;
    this.onFrame({ progress, stage: this.stageLabel(this.activeStudy, progress), stable });
  }

  private updateField(progress: number, elapsed: number): void {
    const cloud = this.fieldCloud;
    if (!cloud) return;
    const position = cloud.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < this.fieldSpillAmounts.length; index++) {
      const amount = this.fieldSpillAmounts[index] ?? 0;
      if (amount <= 0) continue;
      const outward = smooth((progress - 0.14 - (index - 2400) / 1200 * 0.22) / 0.66);
      const baseIndex = index * 3;
      const base = new THREE.Vector3(
        this.fieldBasePositions[baseIndex] ?? 0,
        this.fieldBasePositions[baseIndex + 1] ?? 0,
        this.fieldBasePositions[baseIndex + 2] ?? 0,
      );
      const direction = this.fieldSpillDirections[index] ?? new THREE.Vector3();
      const breathing = Math.sin(elapsed * 0.00075 + index * 0.11) * 0.012 * outward;
      position.setXYZ(
        index,
        base.x + direction.x * amount * outward + breathing * direction.z,
        base.y + direction.y * amount * outward,
        base.z + direction.z * amount * outward - breathing * direction.x,
      );
    }
    position.needsUpdate = true;
    this.updatePointCloud(cloud, smooth(progress * 1.45), elapsed);
  }

  private updateDust(progress: number, elapsed: number): void {
    const cloud = this.dustCloud;
    if (!cloud) return;
    const positions = cloud.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < this.dustStart.length; index++) {
      const tempo = this.dustTempo[index] ?? 0.8;
      const travel = smooth((progress * (1.16 + tempo * 0.36) - (index / Math.max(1, this.dustStart.length)) * 0.58) / 0.68);
      const position = this.dustStart[index]!.clone().lerp(this.dustEnd[index]!, travel);
      position.z += Math.sin(elapsed * 0.0014 + index * 0.31) * this.dustBend[index]! * (0.3 + travel);
      position.x += Math.cos(elapsed * 0.0011 + index * 0.17) * 0.018 * travel;
      positions.setXYZ(index, position.x, position.y, position.z);
    }
    positions.needsUpdate = true;
    this.updatePointCloud(cloud, 1, elapsed);
  }

  private updateGrowth(progress: number, elapsed: number): void {
    for (const stroke of this.growthStrokes) {
      const amount = smooth((progress - 0.1 - stroke.phase) / (0.34 + stroke.hesitation * 0.18));
      const curveAmount = clamp01(amount);
      const first = stroke.start;
      const second = stroke.start.clone().lerp(stroke.control, curveAmount);
      const current = stroke.start.clone().lerp(stroke.end, curveAmount);
      second.lerp(current, curveAmount);
      stroke.position.setXYZ(0, first.x, first.y, first.z);
      stroke.position.setXYZ(1, second.x, second.y, second.z);
      stroke.position.setXYZ(2, current.x, current.y, current.z);
      stroke.position.needsUpdate = true;
      const material = stroke.line.material as THREE.LineBasicMaterial;
      const hesitationPulse = 0.9 + Math.sin(elapsed * (0.001 + stroke.tempo * 0.0008) + stroke.phase * 17) * 0.1;
      material.opacity = (0.08 + curveAmount * 0.68) * hesitationPulse;
    }
    if (this.growthGraph) {
      this.growthGraph.visible = progress > 0.63;
      (this.growthGraph.material as THREE.LineBasicMaterial).opacity = lerpNumber(0, 0.18, (progress - 0.63) / 0.22);
    }
  }

  private updateVolume(progress: number, elapsed: number): void {
    if (this.volumeCloud) this.updatePointCloud(this.volumeCloud, progress, elapsed);
    const massOpacity = lerpNumber(0, 0.075, (progress - 0.32) / 0.5);
    for (const material of this.volumeMassMaterials) material.opacity = massOpacity;
  }

  private updateShadow(progress: number): void {
    const canvas = this.shadowCanvas;
    const texture = this.shadowTexture;
    if (!canvas || !texture) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const bounds = this.sourceBounds();
    const scaleX = canvas.width / Math.max(0.1, bounds.size.x * 1.28);
    const scaleZ = canvas.height / Math.max(0.1, bounds.size.z * 1.18);
    const toCanvas = (point: THREE.Vector3): [number, number] => [
      canvas.width * 0.5 + (point.x - bounds.center.x) * scaleX,
      canvas.height * 0.5 - (point.z - bounds.center.z) * scaleZ,
    ];
    const lightCycle = progress * Math.PI * 2.1;
    const lightAngle = -0.7 + lightCycle + Math.sin(lightCycle * 0.5) * 0.14;
    const offsetX = Math.cos(lightAngle) * canvas.width * 0.1;
    const offsetY = Math.sin(lightAngle) * canvas.height * 0.08;
    const overlapOffsetX = offsetX * 0.78;
    const overlapOffsetY = offsetY * 0.78;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.globalCompositeOperation = "source-over";
    context.filter = `blur(${10 + Math.abs(Math.sin(progress * Math.PI * 2)) * 7}px)`;
    context.lineCap = "round";
    for (const [edgeIndex, edge] of this.graph.edges.entries()) {
      const profile = this.edgeProfiles[edgeIndex];
      if (!profile) continue;
      context.lineWidth = 6 + profile.hesitation * 12;
      context.strokeStyle = `rgba(104, 72, 122, ${0.16 + profile.persistence * 0.16})`;
      const start = this.graphPositions[edge.start];
      const end = this.graphPositions[edge.end];
      if (!start || !end) continue;
      const a = toCanvas(start);
      const b = toCanvas(end);
      context.beginPath();
      context.moveTo(a[0] + overlapOffsetX, a[1] + overlapOffsetY);
      context.lineTo(b[0] + overlapOffsetX, b[1] + overlapOffsetY);
      context.stroke();
    }
    context.filter = "none";
    for (const [edgeIndex, edge] of this.graph.edges.entries()) {
      const profile = this.edgeProfiles[edgeIndex];
      if (!profile) continue;
      context.lineWidth = 1.2 + profile.hesitation * 2;
      context.strokeStyle = `rgba(224, 173, 130, ${0.16 + profile.persistence * 0.2})`;
      if (!edge) continue;
      const start = this.graphPositions[edge.start];
      const end = this.graphPositions[edge.end];
      if (!start || !end) continue;
      const a = toCanvas(start);
      const b = toCanvas(end);
      context.beginPath();
      context.moveTo(a[0] + offsetX, a[1] + offsetY);
      context.lineTo(b[0] + offsetX, b[1] + offsetY);
      context.stroke();
    }
    context.fillStyle = "rgba(228, 162, 126, 0.34)";
    for (const point of this.motifCenters) {
      const [x, y] = toCanvas(point);
      context.beginPath();
      context.arc(x + offsetX, y + offsetY, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    texture.needsUpdate = true;
    if (this.shadowSprite) {
      (this.shadowSprite.material as THREE.SpriteMaterial).opacity = 0.58 + Math.abs(Math.sin(progress * Math.PI * 2.1)) * 0.32;
    }
  }

  private updateScan(progress: number, elapsed: number): void {
    const cloud = this.scanCloud;
    const band = this.scanBand;
    const atmosphere = this.scanAtmosphere;
    if (!cloud || !band || !atmosphere) return;
    const bounds = this.sourceBounds();
    const scanAmount = smooth(Math.min(1, progress / 0.78));
    const scanZ = lerpNumber(bounds.min.z - 0.12, bounds.max.z + 0.12, scanAmount);
    const bandPosition = band.geometry.getAttribute("position") as THREE.BufferAttribute;
    bandPosition.setZ(0, scanZ);
    bandPosition.setZ(1, scanZ);
    bandPosition.needsUpdate = true;
    const position = cloud.geometry.getAttribute("position") as THREE.BufferAttribute;
    const alpha = cloud.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    let outputIndex = 0;
    for (const edge of this.graph.edges) {
      const start = this.graphPositions[edge.start];
      const end = this.graphPositions[edge.end];
      const z0 = start?.z ?? 0;
      const z1 = end?.z ?? 0;
      const crosses = (z0 <= scanZ && scanZ <= z1) || (z1 <= scanZ && scanZ <= z0);
      if (crosses && Math.abs(z1 - z0) > 0.00001 && start && end) {
        const amount = (scanZ - z0) / (z1 - z0);
        const point = start.clone().lerp(end, amount);
        position.setXYZ(outputIndex, point.x, point.y, point.z);
        alpha.setX(outputIndex, 0.48);
      } else {
        position.setXYZ(outputIndex, 0, 0, -100);
        alpha.setX(outputIndex, 0);
      }
      outputIndex++;
    }
    for (const node of this.graphPositions) {
      const visible = Math.abs(node.z - scanZ) < 0.07;
      position.setXYZ(outputIndex, node.x, node.y, node.z);
      alpha.setX(outputIndex, visible ? 0.85 : 0);
      outputIndex++;
    }
    position.needsUpdate = true;
    alpha.needsUpdate = true;
    this.updatePointCloud(atmosphere, smooth(progress * 1.18), elapsed);
    for (const item of this.scanResidueLines) {
      const reveal = smooth((progress - 0.16 - item.phase * 0.4) / 0.36);
      const pulse = 0.88 + Math.sin(elapsed * (0.0009 + item.profile.tempo * 0.0008) + item.phase * 12) * 0.12;
      item.material.opacity = item.baseOpacity * (0.18 + reveal * 0.82) * (0.65 + item.profile.persistence * 0.35) * pulse;
    }
    this.updatePointCloud(cloud, 1, elapsed);
  }

  private updateResidue(progress: number): void {
    const updateLines = (
      lines: readonly ProfiledLine[],
      start: number,
      span: number,
      amountScale: (reveal: number) => number,
      elapsed: number,
    ): void => {
      for (const item of lines) {
        const reveal = smooth((progress - start - item.phase * span) / (0.08 + item.profile.hesitation * 0.06));
        const pulse = 0.9 + Math.sin(elapsed * (0.0012 + item.profile.tempo * 0.0007) + item.profile.hesitation * 13) * 0.1;
        item.material.opacity = item.baseOpacity * amountScale(reveal) * (0.7 + item.profile.persistence * 0.3) * pulse;
      }
    };
    updateLines(this.residueProposalLines, 0.02, 0.27, (reveal) => reveal, progress * 9000);
    const rejectFade = progress < 0.3 ? 0 : 0.16 + (1 - smooth((progress - 0.31) / 0.24)) * 0.36;
    updateLines(this.residueRejectedLines, 0.2, 0.2, (reveal) => reveal * rejectFade, progress * 9000);
    updateLines(this.residueRevisedLines, 0.32, 0.28, (reveal) => reveal, progress * 9000);
    updateLines(this.residueFinalLines, 0.58, 0.3, (reveal) => reveal, progress * 9000);
    if (this.residueRemains) this.updatePointCloud(this.residueRemains, Math.max(0.38, progress * 1.25), progress * 9000);
  }

  private updateMatter(progress: number, elapsed: number): void {
    for (const tube of this.matterTubes) {
      const visible = smooth((progress - 0.08 - tube.phase) / 0.36);
      tube.mesh.visible = visible > 0.01;
      const pulse = 0.9 + Math.sin(elapsed * (0.001 + tube.tempo * 0.0008) + tube.phase * 19) * 0.1;
      tube.material.opacity = visible * (0.22 + tube.persistence * 0.28) * pulse;
    }
    if (this.matterDust) this.updatePointCloud(this.matterDust, progress, elapsed);
  }

  private updateGaussian(progress: number, elapsed: number): void {
    if (this.gaussianCloud) this.updatePointCloud(this.gaussianCloud, smooth(progress * 1.18), elapsed);
  }

  private stageLabel(study: VisualStudyId, progress: number): string {
    if (progress > 0.88) return "STUDY STABLE";
    if (progress < 0.14) return "SOURCE / READY";
    switch (study) {
      case "field": return progress < 0.58 ? "FIELD / INFLUENCE RISING" : "FIELD / CONCENTRATION";
      case "dust": return progress < 0.58 ? "DUST / PARTICLES IN MOTION" : "DUST / RELATIONS GATHER";
      case "growth": return progress < 0.22 ? "MUTUAL SUPPORT / FLOWERS REMAIN" : progress < 0.62 ? "MUTUAL SUPPORT / STEMS SEARCH" : "MUTUAL SUPPORT / HELD TOGETHER";
      case "volume": return progress < 0.6 ? "VOLUME / OCCUPIED CLOUD" : "VOLUME / DENSITY SETTLES";
      case "shadow": return progress < 0.35 ? "PERMANENT / OBJECT REMAINS" : progress < 0.72 ? "PERMANENT / OVERLAP ACCUMULATES" : "PERMANENT / LIGHT DRIFTS";
      case "scan": return progress < 0.32 ? "SCAN / VOLUME OPENS" : progress < 0.76 ? "SCAN / DEPTH SLICE" : "SCAN / RESIDUE APPEARS";
      case "residue": return progress < 0.28 ? "HAND REMAINS / PROPOSE" : progress < 0.46 ? "HAND REMAINS / HESITATE" : progress < 0.68 ? "HAND REMAINS / REVISE" : "HAND REMAINS / STILL THERE";
      case "matter": return progress < 0.55 ? "SUPPORT BECOMES FORM / FIBERS" : "SUPPORT BECOMES FORM / BOUNDARY SOFTENS";
      case "gaussian": return progress < 0.26 ? "GAUSSIAN LIGHT / FLOWERS GLOW" : progress < 0.62 ? "GAUSSIAN LIGHT / OVERLAP DEEPENS" : "GAUSSIAN LIGHT / LIGHT LEAKS OUTWARD";
    }
  }
}
