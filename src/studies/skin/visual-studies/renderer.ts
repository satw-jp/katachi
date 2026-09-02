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
}

interface MatterTube {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly phase: number;
}

const POINT_VERTEX_SHADER = /* glsl */ `
  attribute float aPointSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uPointScale;
  uniform float uProgress;
  varying float vAlpha;
  varying float vPhase;
  varying vec3 vColor;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vPhase = aPhase;
    vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    gl_PointSize = clamp(aPointSize * uPointScale * (120.0 / max(1.0, -modelViewPosition.z)), 1.0, 34.0);
  }
`;

const POINT_FRAGMENT_SHADER = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  varying float vAlpha;
  varying float vPhase;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float distanceToCenter = length(point);
    if (distanceToCenter > 1.0) discard;
    float edge = smoothstep(1.0, 0.14, distanceToCenter);
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
  private readonly baseMaterial = new THREE.LineBasicMaterial({
    color: 0xc4d7ce,
    transparent: true,
    opacity: 0.055,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly motifMaterial = new THREE.MeshBasicMaterial({
    color: 0xd4bc69,
    transparent: true,
    opacity: 0.34,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private activeStudy: VisualStudyId = "field";
  private startedAt = performance.now();
  private animationFrame = 0;
  private destroyed = false;
  private fieldCloud: PointCloud | null = null;
  private dustCloud: PointCloud | null = null;
  private dustStart: THREE.Vector3[] = [];
  private dustEnd: THREE.Vector3[] = [];
  private dustBend: number[] = [];
  private volumeCloud: PointCloud | null = null;
  private volumeMassMaterials: THREE.MeshBasicMaterial[] = [];
  private growthStrokes: GrowthStroke[] = [];
  private growthGraph: THREE.LineSegments | null = null;
  private shadowSprite: THREE.Sprite | null = null;
  private shadowCanvas: HTMLCanvasElement | null = null;
  private shadowTexture: THREE.CanvasTexture | null = null;
  private scanCloud: PointCloud | null = null;
  private scanPlane: THREE.Mesh | null = null;
  private scanBand: THREE.Line | null = null;
  private residueProposal: THREE.LineSegments | null = null;
  private residueRejected: THREE.LineSegments | null = null;
  private residueRevised: THREE.LineSegments | null = null;
  private residueFinal: THREE.LineSegments | null = null;
  private residueMaterials: THREE.LineBasicMaterial[] = [];
  private matterTubes: MatterTube[] = [];
  private matterDust: PointCloud | null = null;
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
    const duration = this.activeStudy === "shadow" ? 10_000 : 9_200;
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
    for (const patch of this.source.patterns) {
      for (const point of patch.points) {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.018, point.r * 0.16), 8, 6), this.motifMaterial);
        sphere.position.set(point.x, point.y, point.z);
        sphere.renderOrder = 4;
        this.motifGroup.add(sphere);
      }
    }
  }

  private clearStudyObjects(): void {
    for (const child of [...this.studyGroup.children]) {
      this.studyGroup.remove(child);
      disposeObject(child);
    }
    this.fieldCloud = null;
    this.dustCloud = null;
    this.dustStart = [];
    this.dustEnd = [];
    this.dustBend = [];
    this.volumeCloud = null;
    this.volumeMassMaterials = [];
    this.growthStrokes = [];
    this.growthGraph = null;
    this.shadowSprite = null;
    this.shadowCanvas = null;
    this.shadowTexture = null;
    this.scanCloud = null;
    this.scanPlane = null;
    this.scanBand = null;
    this.residueProposal = null;
    this.residueRejected = null;
    this.residueRevised = null;
    this.residueFinal = null;
    this.residueMaterials = [];
    this.matterTubes = [];
    this.matterDust = null;
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
    }
  }

  private createPointCloud(points: readonly PointDatum[], pointScale = 8): PointCloud {
    const positions = new Float32Array(points.length * 3);
    const sizes = new Float32Array(points.length);
    const alphas = new Float32Array(points.length);
    const phases = new Float32Array(points.length);
    const colors = new Float32Array(points.length * 3);
    for (const [index, point] of points.entries()) {
      positions[index * 3] = point.position.x;
      positions[index * 3 + 1] = point.position.y;
      positions[index * 3 + 2] = point.position.z;
      sizes[index] = point.size;
      alphas[index] = point.alpha;
      phases[index] = point.phase ?? 0;
      colors[index * 3] = point.color.r;
      colors[index * 3 + 1] = point.color.g;
      colors[index * 3 + 2] = point.color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPointSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
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
    for (let index = 0; index < 3200; index++) {
      const position = this.sampleWithinSource(index);
      const graphDistance = this.nearestDistance(position, this.graphPositions);
      const motifDistance = this.nearestDistance(position, this.motifCenters);
      const graphInfluence = Math.exp(-graphDistance * 3.9);
      const motifInfluence = Math.exp(-motifDistance * 5.4);
      const influence = clamp01(graphInfluence * 0.72 + motifInfluence * 0.28);
      fieldPoints.push({
        position,
        size: 0.024 + influence * 0.07 + seeded(index, 11) * 0.028,
        alpha: 0.09 + influence * 0.55,
        color: colorMix(cool, warm, influence),
        phase: 0.08 + seeded(index, 12) * 0.72,
      });
    }
    this.fieldCloud = this.createPointCloud(fieldPoints, 9.2);
  }

  private buildDust(): void {
    const dust: PointDatum[] = [];
    const count = Math.min(1800, Math.max(900, this.graph.nodes.length * 6));
    const originPool = this.motifCenters.length > 0 ? this.motifCenters : this.graphPositions;
    for (let index = 0; index < count; index++) {
      const origin = originPool[index % originPool.length]?.clone() ?? new THREE.Vector3();
      const target = this.graphPositions[(index * 7 + Math.floor(index / 11)) % Math.max(1, this.graphPositions.length)]?.clone() ?? origin.clone();
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
      dust.push({
        position: start,
        size: 0.028 + seeded(index, 27) * 0.045,
        alpha: 0.24 + seeded(index, 28) * 0.58,
        color: colorMix(new THREE.Color(0xc4d9d2), new THREE.Color(0xe4c96d), seeded(index, 29)),
        phase: 0.04 + (index / count) * 0.75,
      });
    }
    this.dustCloud = this.createPointCloud(dust, 12.5);
  }

  private buildGrowth(): void {
    const source = this.motifCenters.length > 0 ? this.motifCenters : [new THREE.Vector3()];
    const strokes: GrowthStroke[] = [];
    const stride = Math.max(1, Math.floor(source.length / 30));
    for (let index = 0; index < source.length; index += stride) {
      const start = source[index]?.clone() ?? new THREE.Vector3();
      const targetIndex = (index * 13 + 7) % Math.max(1, this.graphPositions.length);
      const end = this.graphPositions[targetIndex]?.clone() ?? start.clone();
      const control = start.clone().lerp(end, 0.48);
      control.x += (seeded(index, 31) - 0.5) * 0.38;
      control.y += (seeded(index, 32) - 0.5) * 0.38;
      control.z += (seeded(index, 33) - 0.5) * 0.16;
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
        color: colorMix(new THREE.Color(0xd5c86e), new THREE.Color(0x9ce1b2), index / Math.max(1, source.length)),
        transparent: true,
        opacity: 0.74,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 12;
      this.studyGroup.add(line);
      strokes.push({ start, control, end, line, position, phase: index / Math.max(1, source.length) * 0.54 });
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
    const bounds = this.sourceBounds();
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x8dd6c8,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(2, bounds.size.x * 1.8), Math.max(1, bounds.size.y * 2.6)), planeMaterial);
    this.scanPlane.position.set(bounds.center.x, bounds.center.y, bounds.min.z);
    this.scanPlane.renderOrder = 3;
    this.studyGroup.add(this.scanPlane);
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
    const rejectedIndices = this.graphEdgeOrder.filter((_, index) => index % 7 === 1).slice(0, 36);
    const revisedIndices = this.graphEdgeOrder.filter((_, index) => index % 3 !== 1).slice(0, Math.max(24, Math.floor(this.graph.edges.length * 0.46)));
    this.residueProposal = this.makeGraphLines(proposalIndices, 0, 0xe0ca68, "residue-proposals");
    this.residueRejected = this.makeGraphLines(rejectedIndices, 0, 0xe16b62, "residue-rejected");
    this.residueRevised = this.makeGraphLines(revisedIndices, 0, 0x82d5c7, "residue-revised");
    this.residueFinal = this.makeGraphLines(this.graphEdgeOrder, 0, 0xc4e6bf, "residue-final");
    const proposalMaterial = this.residueProposal.material as THREE.LineBasicMaterial;
    const rejectedMaterial = this.residueRejected.material as THREE.LineBasicMaterial;
    const revisedMaterial = this.residueRevised.material as THREE.LineBasicMaterial;
    const finalMaterial = this.residueFinal.material as THREE.LineBasicMaterial;
    this.residueMaterials = [proposalMaterial, rejectedMaterial, revisedMaterial, finalMaterial];
    this.residueMaterials.forEach((material) => { material.transparent = true; material.depthTest = false; material.depthWrite = false; });
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
    const seedCount = Math.min(18, Math.max(8, this.graph.nodes.length));
    for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
      let nodeIndex = Math.floor(seedIndex * this.graph.nodes.length / seedCount);
      const path: THREE.Vector3[] = [];
      const visited = new Set<number>();
      for (let step = 0; step < 8; step++) {
        path.push((this.graphPositions[nodeIndex] ?? new THREE.Vector3()).clone());
        const options = (incident.get(nodeIndex) ?? []).filter((edgeIndex) => !visited.has(edgeIndex));
        const edgeIndex = options[(seedIndex + step * 3) % Math.max(1, options.length)];
        if (edgeIndex === undefined) break;
        visited.add(edgeIndex);
        const edge = this.graph.edges[edgeIndex];
        nodeIndex = edge.start === nodeIndex ? edge.end : edge.start;
      }
      if (path.length < 3) continue;
      const curve = new THREE.CatmullRomCurve3(path, false, "centripetal", 0.55);
      const radius = 0.018 + (seeded(seedIndex, 51) * 0.018);
      const geometry = new THREE.TubeGeometry(curve, 42, radius, 6, false);
      const material = new THREE.MeshBasicMaterial({
        color: colorMix(new THREE.Color(0xc7d58a), new THREE.Color(0xd49d91), seeded(seedIndex, 52)),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 10;
      this.studyGroup.add(mesh);
      tubes.push({ mesh, material, phase: seedIndex / seedCount * 0.72 });
    }
    this.matterTubes = tubes;
    const granularPoints: PointDatum[] = [];
    for (const [index, midpoint] of this.edgeMidpoints.entries()) {
      for (let sample = 0; sample < 4; sample++) {
        const position = midpoint.clone().add(new THREE.Vector3(
          (seeded(index * 4 + sample, 53) - 0.5) * 0.12,
          (seeded(index * 4 + sample, 54) - 0.5) * 0.12,
          (seeded(index * 4 + sample, 55) - 0.5) * 0.12,
        ));
        granularPoints.push({
          position,
          size: 0.026 + seeded(index * 4 + sample, 56) * 0.04,
          alpha: 0.14 + seeded(index * 4 + sample, 57) * 0.24,
          color: new THREE.Color(0xd4b486),
          phase: 0.18 + index / Math.max(1, this.edgeMidpoints.length) * 0.72,
        });
      }
    }
    this.matterDust = this.createPointCloud(granularPoints, 9);
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

  private updateStudy(progress: number, elapsed: number): void {
    this.baseMaterial.opacity = this.activeStudy === "shadow" ? 0.018 : 0.055;
    this.motifMaterial.opacity = this.activeStudy === "shadow" ? 0.045 : this.activeStudy === "growth" ? 0.58 : 0.3;
    switch (this.activeStudy) {
      case "field": this.updateField(progress, elapsed); break;
      case "dust": this.updateDust(progress, elapsed); break;
      case "growth": this.updateGrowth(progress, elapsed); break;
      case "volume": this.updateVolume(progress, elapsed); break;
      case "shadow": this.updateShadow(progress); break;
      case "scan": this.updateScan(progress, elapsed); break;
      case "residue": this.updateResidue(progress); break;
      case "matter": this.updateMatter(progress, elapsed); break;
    }
    const stable = progress > 0.88;
    this.onFrame({ progress, stage: this.stageLabel(this.activeStudy, progress), stable });
  }

  private updateField(progress: number, elapsed: number): void {
    if (this.fieldCloud) this.updatePointCloud(this.fieldCloud, smooth(progress * 1.45), elapsed);
  }

  private updateDust(progress: number, elapsed: number): void {
    const cloud = this.dustCloud;
    if (!cloud) return;
    const positions = cloud.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < this.dustStart.length; index++) {
      const travel = smooth((progress * 1.42 - (index / Math.max(1, this.dustStart.length)) * 0.62) / 0.72);
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
      const amount = smooth((progress - 0.13 - stroke.phase) / 0.62);
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
      material.opacity = 0.25 + curveAmount * 0.55;
    }
    if (this.growthGraph) {
      this.growthGraph.visible = progress > 0.68;
      (this.growthGraph.material as THREE.LineBasicMaterial).opacity = lerpNumber(0, 0.13, (progress - 0.68) / 0.2);
    }
    void elapsed;
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
    context.clearRect(0, 0, canvas.width, canvas.height);
    const edgeCount = Math.floor(smooth(progress * 1.25) * this.graphEdgeOrder.length);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.filter = "blur(15px)";
    context.lineCap = "round";
    context.lineWidth = 8;
    context.strokeStyle = "rgba(126, 169, 163, 0.22)";
    for (const edgeIndex of this.graphEdgeOrder.slice(0, edgeCount)) {
      const edge = this.graph.edges[edgeIndex];
      if (!edge) continue;
      const start = this.graphPositions[edge.start];
      const end = this.graphPositions[edge.end];
      if (!start || !end) continue;
      const a = toCanvas(start);
      const b = toCanvas(end);
      context.beginPath();
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
      context.stroke();
    }
    context.filter = "none";
    context.lineWidth = 2.4;
    context.strokeStyle = "rgba(190, 216, 204, 0.17)";
    for (const edgeIndex of this.graphEdgeOrder.slice(0, edgeCount)) {
      const edge = this.graph.edges[edgeIndex];
      if (!edge) continue;
      const start = this.graphPositions[edge.start];
      const end = this.graphPositions[edge.end];
      if (!start || !end) continue;
      const a = toCanvas(start);
      const b = toCanvas(end);
      context.beginPath();
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
      context.stroke();
    }
    context.fillStyle = "rgba(218, 204, 138, 0.25)";
    for (const [index, point] of this.motifCenters.entries()) {
      if (index / Math.max(1, this.motifCenters.length) > progress * 1.1) continue;
      const [x, y] = toCanvas(point);
      context.beginPath();
      context.arc(x, y, 4 + (index % 3) * 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    texture.needsUpdate = true;
    if (this.shadowSprite) (this.shadowSprite.material as THREE.SpriteMaterial).opacity = lerpNumber(0.25, 0.95, progress);
  }

  private updateScan(progress: number, elapsed: number): void {
    const cloud = this.scanCloud;
    const plane = this.scanPlane;
    const band = this.scanBand;
    if (!cloud || !plane || !band) return;
    const bounds = this.sourceBounds();
    const scanAmount = smooth(Math.min(1, progress / 0.78));
    const scanZ = lerpNumber(bounds.min.z - 0.12, bounds.max.z + 0.12, scanAmount);
    plane.position.z = scanZ;
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
    this.updatePointCloud(cloud, 1, elapsed);
  }

  private updateResidue(progress: number): void {
    const [proposal, rejected, revised, final] = this.residueMaterials;
    if (!proposal || !rejected || !revised || !final) return;
    proposal.opacity = lerpNumber(0.05, 0.78, (progress - 0.05) / 0.18);
    rejected.opacity = progress < 0.32 ? 0 : lerpNumber(0.92, 0, (progress - 0.32) / 0.2);
    revised.opacity = lerpNumber(0, 0.76, (progress - 0.42) / 0.2);
    final.opacity = lerpNumber(0, 0.34, (progress - 0.68) / 0.2);
  }

  private updateMatter(progress: number, elapsed: number): void {
    for (const tube of this.matterTubes) {
      const visible = smooth((progress - 0.08 - tube.phase) / 0.45);
      tube.mesh.visible = visible > 0.01;
      tube.material.opacity = visible * 0.42;
    }
    if (this.matterDust) this.updatePointCloud(this.matterDust, progress, elapsed);
  }

  private stageLabel(study: VisualStudyId, progress: number): string {
    if (progress > 0.88) return "STUDY STABLE";
    if (progress < 0.14) return "SOURCE / READY";
    switch (study) {
      case "field": return progress < 0.58 ? "FIELD / INFLUENCE RISING" : "FIELD / CONCENTRATION";
      case "dust": return progress < 0.58 ? "DUST / PARTICLES IN MOTION" : "DUST / RELATIONS GATHER";
      case "growth": return progress < 0.28 ? "GROWTH / MOTIF SEEDS" : progress < 0.7 ? "GROWTH / STEMS EXTENDING" : "GROWTH / CONNECTIONS";
      case "volume": return progress < 0.6 ? "VOLUME / OCCUPIED CLOUD" : "VOLUME / DENSITY SETTLES";
      case "shadow": return progress < 0.6 ? "SHADOW / PROJECTION" : "SHADOW / NEGATIVE SPACE";
      case "scan": return progress < 0.76 ? "SCAN / DEPTH SLICE" : "SCAN / LAST INTERSECTION";
      case "residue": return progress < 0.32 ? "RESIDUE / PROPOSE" : progress < 0.48 ? "RESIDUE / REJECT" : progress < 0.7 ? "RESIDUE / REVISE" : "RESIDUE / ACCEPT";
      case "matter": return progress < 0.55 ? "MATTER / FIBERS EMERGE" : "MATTER / SOFT STRUCTURE";
    }
  }
}
