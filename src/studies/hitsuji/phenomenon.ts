import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import manifest from "./manifest.json";
import { createVersionRow } from "../../lib/ui/version.ts";
import {
  createPhaseField,
  PHASE_SIZE,
  type PhaseFieldConditionMode,
} from "./deformation.ts";
import { createVolumeMask, type VolumeMask } from "./volumeMask.ts";
import { shouldDisplayPoint } from "./pointSampling.ts";
import { countBoundaryVoxels, fillSurfaceField, type SurfacePhase } from "./volumeSurface.ts";
import "./phenomenon.css";

type ViewMode = "fog" | "points" | "slice" | "surface";
type PhaseView = "both" | "positive" | "negative";
type SheepRelation = "independent" | "reference" | "inside" | "outside" | "surface";
type CouplingMode = "after" | "during";
type WindMode = "none" | "uniform" | "curved" | "pulsing";

interface PhenomenonParams {
  seed: number;
  steps: number;
  threshold: number;
  viewMode: ViewMode;
  phaseView: PhaseView;
  slice: number;
  relation: SheepRelation;
  coupling: CouplingMode;
  windMode: WindMode;
  windAngle: number;
  windStrength: number;
  windCurl: number;
  pulseCycles: number;
  cohesion: number;
  pointFraction: number;
}

interface FieldRenderStats {
  visiblePoints: number;
  triangles: number;
  boundaryVoxels: number;
}

const STORAGE_KEY = "katachi:hitsuji:phenomenon:v1";
const DEFAULT_MODEL = `${import.meta.env.BASE_URL}models/hitsuji/hitsuji_260304.glb`;
const DEFAULT_PARAMS: PhenomenonParams = {
  seed: 260304,
  steps: 34,
  threshold: 0.65,
  viewMode: "fog",
  phaseView: "positive",
  slice: Math.floor(PHASE_SIZE / 2),
  relation: "independent",
  coupling: "after",
  windMode: "uniform",
  windAngle: 0,
  windStrength: 0.22,
  windCurl: 0.85,
  pulseCycles: 3,
  cohesion: 1,
  pointFraction: 1,
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadParams(): PhenomenonParams {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as Partial<PhenomenonParams> & {
      showSheep?: boolean;
    };
    const finite = (value: unknown, fallback: number, min: number, max: number) =>
      Number.isFinite(value) ? THREE.MathUtils.clamp(Number(value), min, max) : fallback;
    const modes: ViewMode[] = ["fog", "points", "slice", "surface"];
    const phases: PhaseView[] = ["both", "positive", "negative"];
    const relations: SheepRelation[] = ["independent", "reference", "inside", "outside", "surface"];
    const couplings: CouplingMode[] = ["after", "during"];
    const windModes: WindMode[] = ["none", "uniform", "curved", "pulsing"];
    return {
      seed: Number.isFinite(parsed.seed) ? Math.trunc(parsed.seed!) : DEFAULT_PARAMS.seed,
      steps: Math.round(finite(parsed.steps, DEFAULT_PARAMS.steps, 0, 80)),
      threshold: finite(parsed.threshold, DEFAULT_PARAMS.threshold, 0, 0.9),
      viewMode: modes.includes(parsed.viewMode as ViewMode) ? (parsed.viewMode as ViewMode) : DEFAULT_PARAMS.viewMode,
      phaseView: phases.includes(parsed.phaseView as PhaseView)
        ? (parsed.phaseView as PhaseView)
        : DEFAULT_PARAMS.phaseView,
      slice: Math.round(finite(parsed.slice, DEFAULT_PARAMS.slice, 0, PHASE_SIZE - 1)),
      relation: relations.includes(parsed.relation as SheepRelation)
        ? (parsed.relation as SheepRelation)
        : parsed.showSheep === true
          ? "reference"
          : DEFAULT_PARAMS.relation,
      coupling: couplings.includes(parsed.coupling as CouplingMode)
        ? (parsed.coupling as CouplingMode)
        : DEFAULT_PARAMS.coupling,
      windMode: windModes.includes(parsed.windMode as WindMode)
        ? (parsed.windMode as WindMode)
        : DEFAULT_PARAMS.windMode,
      windAngle: finite(parsed.windAngle, DEFAULT_PARAMS.windAngle, -180, 180),
      windStrength: finite(parsed.windStrength, DEFAULT_PARAMS.windStrength, 0, 0.9),
      windCurl: finite(parsed.windCurl, DEFAULT_PARAMS.windCurl, 0, 1.5),
      pulseCycles: Math.round(finite(parsed.pulseCycles, DEFAULT_PARAMS.pulseCycles, 1, 6)),
      cohesion: finite(parsed.cohesion, DEFAULT_PARAMS.cohesion, 0, 2),
      pointFraction: finite(parsed.pointFraction, DEFAULT_PARAMS.pointFraction, 0.05, 1),
    };
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

function createPointTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.78)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

class PhenomenonRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.PointsMaterial;
  private readonly points: THREE.Points;
  private readonly pointTexture = createPointTexture();
  private readonly surfaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xe7e1d3,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  private readonly surface = new MarchingCubes(
    PHASE_SIZE,
    this.surfaceMaterial,
    false,
    false,
    50_000,
  );
  private sheep: THREE.Mesh | null = null;
  private volumeMask: VolumeMask | null = null;
  private frame = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x101114);
    this.scene.fog = new THREE.FogExp2(0x101114, 0.055);
    this.camera.position.set(3.25, 2.35, 3.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 9;

    this.material = new THREE.PointsMaterial({
      map: this.pointTexture,
      alphaTest: 0.015,
      transparent: true,
      vertexColors: true,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
    const surfaceScale = (2.12 * PHASE_SIZE) / (2 * (PHASE_SIZE - 1));
    const surfaceOffset = surfaceScale - 1.06;
    this.surface.scale.setScalar(surfaceScale);
    this.surface.position.setScalar(surfaceOffset);
    this.surface.visible = false;
    this.scene.add(this.surface);

    this.scene.add(new THREE.HemisphereLight(0xf5f1e8, 0x202632, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x91a8c2, 1.1);
    rimLight.position.set(-4, 1, -3);
    this.scene.add(rimLight);

    const bounds = new THREE.Box3(
      new THREE.Vector3(-1.12, -1.12, -1.12),
      new THREE.Vector3(1.12, 1.12, 1.12),
    );
    this.scene.add(new THREE.Box3Helper(bounds, 0x44474d));
    const axes = new THREE.AxesHelper(1.35);
    (axes.material as THREE.Material).transparent = true;
    (axes.material as THREE.Material).opacity = 0.28;
    this.scene.add(axes);

    this.render = this.render.bind(this);
    this.render();
  }

  setField(field: Float32Array, params: PhenomenonParams): FieldRenderStats {
    const positions: number[] = [];
    const colors: number[] = [];
    const positive = new THREE.Color(0xe7e1d3);
    const negative = new THREE.Color(0x7890a7);
    const color = new THREE.Color();

    for (let z = 0; z < PHASE_SIZE; z++) {
      if (params.viewMode === "slice" && z !== params.slice) continue;
      for (let y = 0; y < PHASE_SIZE; y++) {
        for (let x = 0; x < PHASE_SIZE; x++) {
          const index = x + PHASE_SIZE * (y + PHASE_SIZE * z);
          const value = field[index];
          if (params.coupling === "after") {
            if (params.relation === "inside" && this.volumeMask?.inside[index] !== 1) continue;
            if (params.relation === "outside" && this.volumeMask?.inside[index] !== 0) continue;
            if (params.relation === "surface" && (this.volumeMask?.distanceToSurface[index] ?? 255) > 2) continue;
          }
          if (Math.abs(value) < params.threshold) continue;
          if (params.phaseView === "positive" && value < 0) continue;
          if (params.phaseView === "negative" && value >= 0) continue;
          if (params.viewMode !== "surface" && !shouldDisplayPoint(index, params.seed, params.pointFraction)) continue;
          const jitter = params.viewMode === "fog" ? 0.055 : 0;
          const random = (offset: number) => {
            const raw = Math.sin((index * 3 + offset) * 12.9898) * 43758.5453;
            return raw - Math.floor(raw) - 0.5;
          };
          positions.push(
            (x / (PHASE_SIZE - 1) - 0.5) * 2.12 + random(1) * jitter,
            (y / (PHASE_SIZE - 1) - 0.5) * 2.12 + random(2) * jitter,
            (z / (PHASE_SIZE - 1) - 0.5) * 2.12 + random(3) * jitter,
          );
          const intensity = THREE.MathUtils.clamp(
            (Math.abs(value) - params.threshold) / Math.max(0.001, 1 - params.threshold),
            0,
            1,
          );
          color.copy(value >= 0 ? positive : negative).multiplyScalar(0.62 + intensity * 0.55);
          colors.push(color.r, color.g, color.b);
        }
      }
    }

    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.computeBoundingSphere();
    this.material.size = params.viewMode === "fog" ? 0.19 : params.viewMode === "slice" ? 0.065 : 0.038;
    this.material.opacity = params.viewMode === "fog" ? 0.15 : 0.9;
    this.material.blending = params.viewMode === "fog" ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.material.depthWrite = params.viewMode !== "fog";
    this.material.needsUpdate = true;
    this.points.visible = params.viewMode !== "surface";
    this.surface.visible = params.viewMode === "surface";

    let triangles = 0;
    let boundaryVoxels = 0;
    if (params.viewMode === "surface") {
      let include: Uint8Array | undefined;
      if (params.coupling === "after" && this.volumeMask) {
        include = new Uint8Array(field.length);
        for (let index = 0; index < include.length; index++) {
          include[index] =
            params.relation === "inside"
              ? this.volumeMask.inside[index]
              : params.relation === "outside"
                ? this.volumeMask.inside[index] === 0
                  ? 1
                  : 0
                : params.relation === "surface"
                  ? this.volumeMask.distanceToSurface[index] <= 2
                    ? 1
                    : 0
                  : 1;
        }
      }
      const phase: SurfacePhase = params.phaseView === "negative" ? "negative" : "positive";
      fillSurfaceField(this.surface.field, field, {
        phase,
        threshold: params.threshold,
        include,
      });
      this.surface.isolation = params.threshold;
      this.surface.update();
      triangles = this.surface.count / 3;
      boundaryVoxels = countBoundaryVoxels(this.surface.field, PHASE_SIZE, params.threshold);
    }
    return {
      visiblePoints: positions.length / 3,
      triangles,
      boundaryVoxels,
    };
  }

  async loadSheep(url: string): Promise<THREE.BufferGeometry> {
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    let source: THREE.Mesh | null = null;
    gltf.scene.traverse((object) => {
      if (!source && (object as THREE.Mesh).isMesh) source = object as THREE.Mesh;
    });
    if (!source) throw new Error("GLB内にメッシュがありません");
    const meshSource = source as THREE.Mesh;
    const geometry = meshSource.geometry.clone();
    geometry.applyMatrix4(meshSource.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = 2 / Math.max(size.x, size.y, size.z);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
    });
    this.sheep = new THREE.Mesh(geometry, material);
    this.scene.add(this.sheep);
    return geometry;
  }

  setVolumeMask(mask: VolumeMask): void {
    this.volumeMask = mask;
  }

  setSheepRelation(relation: SheepRelation): void {
    if (this.sheep) {
      this.sheep.visible = relation === "reference" || relation === "outside" || relation === "surface";
    }
  }

  resetView(): void {
    this.camera.position.set(3.25, 2.35, 3.8);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private render(): void {
    this.frame = requestAnimationFrame(this.render);
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    if (
      this.renderer.domElement.width !== Math.round(width * this.renderer.getPixelRatio()) ||
      this.renderer.domElement.height !== Math.round(height * this.renderer.getPixelRatio())
    ) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.surface.geometry.dispose();
    this.surfaceMaterial.dispose();
    this.pointTexture.dispose();
    if (this.sheep) {
      this.sheep.geometry.dispose();
      (this.sheep.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
  }
}

let params = loadParams();
let rebuildFrame = 0;
let playTimer: number | null = null;
let volumeMask: VolumeMask | null = null;

const app = document.getElementById("app")!;
const viewport = element("div");
viewport.id = "viewport";
const panel = element("aside", "panel");
app.append(viewport, panel);
const phenomenonRenderer = new PhenomenonRenderer(viewport);

panel.appendChild(element("div", "panel-title", "相分離を現象として見る"));
panel.appendChild(createVersionRow(manifest.version, manifest.updatedAt));
const nav = element("nav", "nav-row");
const comparisonLink = element("a", "nav-link", "← 4者比較");
comparisonLink.href = "hitsuji.html";
const studiesLink = element("a", "nav-link", "Study 一覧");
studiesLink.href = "studies.html";
nav.append(comparisonLink, studiesLink);
panel.append(nav);
panel.appendChild(
  element(
    "p",
    "hint",
    "3D相分離場を霧・点・断面で観察し、同じ場を境界面として形状化する。羊は参照だけでなく、内側・外側・表面という現象の条件にもできます。",
  ),
);

function saveAndRebuild(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  cancelAnimationFrame(rebuildFrame);
  rebuildFrame = requestAnimationFrame(rebuild);
}

function addRange(
  id: string,
  labelText: string,
  min: number,
  max: number,
  step: number,
  value: () => number,
  apply: (next: number) => void,
  format?: (next: number) => string,
): { row: HTMLDivElement; input: HTMLInputElement; output: HTMLOutputElement } {
  const row = element("div", "control-row");
  const label = element("label", undefined, labelText);
  const input = element("input");
  const output = element("output");
  input.type = "range";
  input.id = id;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value());
  const formatValue = format ?? ((next: number) => next.toFixed(step < 1 ? 2 : 0));
  output.value = formatValue(value());
  output.textContent = output.value;
  label.htmlFor = id;
  input.addEventListener("input", () => {
    const next = Number(input.value);
    apply(next);
    output.value = formatValue(next);
    output.textContent = output.value;
    saveAndRebuild();
  });
  row.append(label, input, output);
  panel.append(row);
  return { row, input, output };
}

panel.appendChild(element("div", "stage-label", "1　現象を発生させる"));
const seedRow = element("div", "control-row");
const seedLabel = element("label", undefined, "Seed");
const seedInput = element("input");
seedInput.type = "number";
seedInput.id = "phenomenon-seed";
seedInput.value = String(params.seed);
seedLabel.htmlFor = seedInput.id;
seedInput.addEventListener("change", () => {
  params.seed = Math.trunc(Number(seedInput.value) || 0);
  seedInput.value = String(params.seed);
  saveAndRebuild();
});
seedRow.append(seedLabel, seedInput, element("span"));
panel.append(seedRow);

const timeControl = addRange("phenomenon-time", "まとまりの時間", 0, 80, 1, () => params.steps, (value) => {
  params.steps = Math.round(value);
});
const playButton = element("button", undefined, "時間を再生");
playButton.type = "button";

panel.appendChild(element("div", "stage-label", "2　風で運ぶ"));
const windRow = element("div", "select-row");
const windLabel = element("label", undefined, "風");
const windSelect = element("select");
windSelect.id = "wind-mode";
windLabel.htmlFor = windSelect.id;
for (const [value, label] of [
  ["none", "風なし"],
  ["uniform", "一方向の風"],
  ["curved", "曲がる風"],
  ["pulsing", "脈動する風"],
] as const) {
  const option = element("option", undefined, label);
  option.value = value;
  option.selected = params.windMode === value;
  windSelect.append(option);
}
windRow.append(windLabel, windSelect);
panel.append(windRow);
const windAngleControl = addRange("wind-angle", "風向", -180, 180, 1, () => params.windAngle, (value) => {
  params.windAngle = value;
});
const windStrengthControl = addRange(
  "wind-strength",
  "運ばれる強さ",
  0,
  0.9,
  0.01,
  () => params.windStrength,
  (value) => {
    params.windStrength = value;
  },
);
const windCurlControl = addRange(
  "wind-curl",
  "風の曲がり",
  0,
  1.5,
  0.05,
  () => params.windCurl,
  (value) => {
    params.windCurl = value;
  },
);
const pulseCyclesControl = addRange(
  "wind-pulse-cycles",
  "脈動の回数",
  1,
  6,
  1,
  () => params.pulseCycles,
  (value) => {
    params.pulseCycles = Math.round(value);
  },
);
addRange(
  "phase-cohesion",
  "まとまり直す速さ",
  0,
  2,
  0.05,
  () => params.cohesion,
  (value) => {
    params.cohesion = value;
  },
);
function applyWindMode(): void {
  const hidden = params.windMode === "none";
  windAngleControl.row.hidden = hidden;
  windStrengthControl.row.hidden = hidden;
  windCurlControl.row.hidden = params.windMode !== "curved";
  pulseCyclesControl.row.hidden = params.windMode !== "pulsing";
}
windSelect.addEventListener("change", () => {
  params.windMode = windSelect.value as WindMode;
  applyWindMode();
  saveAndRebuild();
});
applyWindMode();

panel.appendChild(element("div", "stage-label", "3　現象の見方を選ぶ"));
const viewRow = element("div", "select-row");
const viewLabel = element("label", undefined, "表示");
const viewSelect = element("select");
viewSelect.id = "view-mode";
viewLabel.htmlFor = viewSelect.id;
for (const [value, label] of [
  ["fog", "霧"],
  ["points", "点"],
  ["slice", "断面"],
  ["surface", "境界面"],
] as const) {
  const option = element("option", undefined, label);
  option.value = value;
  option.selected = params.viewMode === value;
  viewSelect.append(option);
}
viewSelect.addEventListener("change", () => {
  params.viewMode = viewSelect.value as ViewMode;
  if (params.viewMode === "surface" && params.phaseView === "both") {
    params.phaseView = "positive";
    phaseSelect.value = params.phaseView;
  }
  sliceControl.row.hidden = params.viewMode !== "slice";
  pointFractionControl.row.hidden = params.viewMode === "surface";
  saveAndRebuild();
});
viewRow.append(viewLabel, viewSelect);
panel.append(viewRow);

const phaseRow = element("div", "select-row");
const phaseLabel = element("label", undefined, "見る相");
const phaseSelect = element("select");
phaseSelect.id = "phase-view";
phaseLabel.htmlFor = phaseSelect.id;
for (const [value, label] of [
  ["both", "両方"],
  ["positive", "相 A"],
  ["negative", "相 B"],
] as const) {
  const option = element("option", undefined, label);
  option.value = value;
  option.selected = params.phaseView === value;
  phaseSelect.append(option);
}
phaseSelect.addEventListener("change", () => {
  params.phaseView = phaseSelect.value as PhaseView;
  if (params.viewMode === "surface" && params.phaseView === "both") {
    params.phaseView = "positive";
    phaseSelect.value = params.phaseView;
  }
  saveAndRebuild();
});
phaseRow.append(phaseLabel, phaseSelect);
panel.append(phaseRow);

addRange("density-threshold", "見える密度", 0, 0.9, 0.01, () => params.threshold, (value) => {
  params.threshold = value;
});
const pointFractionControl = addRange(
  "point-fraction",
  "表示する点の割合",
  0.05,
  1,
  0.05,
  () => params.pointFraction,
  (value) => {
    params.pointFraction = value;
  },
  (value) => `${Math.round(value * 100)}%`,
);
const sliceControl = addRange("slice-position", "断面の位置", 0, PHASE_SIZE - 1, 1, () => params.slice, (value) => {
  params.slice = Math.round(value);
});
sliceControl.row.hidden = params.viewMode !== "slice";
pointFractionControl.row.hidden = params.viewMode === "surface";

panel.appendChild(element("div", "stage-label", "4　羊との関係を選ぶ"));
const relationRow = element("div", "select-row");
const relationLabel = element("label", undefined, "羊との関係");
const relationSelect = element("select");
relationSelect.id = "sheep-relation";
relationLabel.htmlFor = relationSelect.id;
for (const [value, label] of [
  ["independent", "羊を使わない"],
  ["reference", "透明な参照だけ"],
  ["inside", "羊の内側で起こす"],
  ["outside", "羊を空洞として避ける"],
  ["surface", "羊の表面から発生"],
] as const) {
  const option = element("option", undefined, label);
  option.value = value;
  option.selected = params.relation === value;
  relationSelect.append(option);
}
relationRow.append(relationLabel, relationSelect);
panel.append(relationRow);
const relationNote = element("p", "relation-note");
panel.append(relationNote);

const RELATION_NOTES_AFTER: Record<SheepRelation, string> = {
  independent: "相分離は空間だけで起きる。羊の輪郭から完全に離して現象を見る。",
  reference: "現象は変えず、羊を透明に重ねて大きさと位置だけを比べる。",
  inside: "羊の内側と判定したボクセルだけを残す。これは「切り取る」に相当する。",
  outside: "羊の内側を除き、空洞・障害物として扱う。現象は羊の外側に残る。",
  surface: "羊の表面から2ボクセル以内だけを残し、表面を発生源の帯として使う。",
};

const RELATION_NOTES_DURING: Record<SheepRelation, string> = {
  independent: "羊の条件がないため、「後から選ぶ」と同じ空間相分離になる。",
  reference: "羊は透明参照だけなので、時間発展には影響しない。",
  inside: "羊の内側だけで相がまとまり、境界の外へ値が漏れない。",
  outside: "羊の内側を停止領域にし、外側の相だけが羊を避けながらまとまる。",
  surface: "羊の表面帯を相Aの発生源として固定し、周囲の相がそこから時間変化する。",
};

function applyRelation(): void {
  relationNote.textContent =
    (params.coupling === "during" ? RELATION_NOTES_DURING : RELATION_NOTES_AFTER)[params.relation];
  phenomenonRenderer.setSheepRelation(params.relation);
}

relationSelect.addEventListener("change", () => {
  params.relation = relationSelect.value as SheepRelation;
  applyRelation();
  saveAndRebuild();
});
applyRelation();

const couplingRow = element("div", "select-row");
const couplingLabel = element("label", undefined, "効かせる段階");
const couplingSelect = element("select");
couplingSelect.id = "coupling-mode";
couplingLabel.htmlFor = couplingSelect.id;
for (const [value, label] of [
  ["after", "後から選ぶ"],
  ["during", "時間発展に入れる"],
] as const) {
  const option = element("option", undefined, label);
  option.value = value;
  option.selected = params.coupling === value;
  couplingSelect.append(option);
}
couplingSelect.addEventListener("change", () => {
  params.coupling = couplingSelect.value as CouplingMode;
  applyRelation();
  saveAndRebuild();
});
couplingRow.append(couplingLabel, couplingSelect);
panel.insertBefore(couplingRow, relationNote);

const buttons = element("div", "button-row");
const resetViewButton = element("button", undefined, "視点を戻す");
resetViewButton.type = "button";
resetViewButton.addEventListener("click", () => phenomenonRenderer.resetView());
buttons.append(playButton, resetViewButton);
panel.append(buttons);
panel.appendChild(
  element(
    "div",
    "method-note",
    "毎反復で「風が相を運ぶ → 相がまとまり直す」の順に計算します。境界面は表示点を固めず、24³の全相場から選んだ相の等値面を抽出します。計算箱の端に触れた面は閉じず、切断として残します。",
  ),
);
const status = element("div", "status", "3D相分離場を準備しています…");
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
panel.append(status);

function setPlaying(playing: boolean): void {
  if (playTimer !== null) {
    window.clearInterval(playTimer);
    playTimer = null;
  }
  playButton.classList.toggle("primary", playing);
  playButton.textContent = playing ? "時間を止める" : "時間を再生";
  if (!playing) return;
  playTimer = window.setInterval(() => {
    params.steps = params.steps >= 80 ? 0 : params.steps + 1;
    timeControl.input.value = String(params.steps);
    timeControl.output.value = String(params.steps);
    timeControl.output.textContent = String(params.steps);
    saveAndRebuild();
  }, 180);
}

playButton.addEventListener("click", () => setPlaying(playTimer === null));

function rebuild(): void {
  const startedAt = performance.now();
  const conditionMode: PhaseFieldConditionMode | null =
    params.relation === "inside" || params.relation === "outside" || params.relation === "surface"
      ? params.relation
      : null;
  const condition =
    params.coupling === "during" && conditionMode && volumeMask
      ? { mode: conditionMode, inside: volumeMask.inside, distanceToSurface: volumeMask.distanceToSurface }
      : undefined;
  const angle = THREE.MathUtils.degToRad(params.windAngle);
  const windStrength = params.windMode === "none" ? 0 : params.windStrength;
  const field = createPhaseField(params.seed, params.steps, condition, {
    windMode: params.windMode === "none" ? "uniform" : params.windMode,
    windX: Math.cos(angle) * windStrength,
    windZ: Math.sin(angle) * windStrength,
    curl: params.windCurl,
    pulseCycles: params.pulseCycles,
    cohesion: params.cohesion,
  });
  const renderStats = phenomenonRenderer.setField(field, params);
  const couplingLabel = params.coupling === "during" && condition ? "時間発展" : "後処理";
  const windNames: Record<WindMode, string> = {
    none: "風なし",
    uniform: "一方向",
    curved: "曲がる",
    pulsing: "脈動",
  };
  const windLabel =
    params.windMode === "none"
      ? "風なし"
      : `${windNames[params.windMode]} ${params.windAngle}° / ${params.windStrength.toFixed(2)}`;
  const geometryLabel =
    params.viewMode === "surface"
      ? `${renderStats.triangles.toLocaleString("ja-JP")} triangles · 箱の端 ${renderStats.boundaryVoxels.toLocaleString("ja-JP")} voxels`
      : `${renderStats.visiblePoints.toLocaleString("ja-JP")} / ${field.length.toLocaleString("ja-JP")} points · 表示 ${Math.round(params.pointFraction * 100)}%`;
  status.textContent =
    `${geometryLabel} · ` +
    `${params.steps} step · ${windLabel} · ${couplingLabel} · ` +
    `Seed ${params.seed} · ` +
    `${Math.round(performance.now() - startedAt)}ms`;
}

void phenomenonRenderer
  .loadSheep(DEFAULT_MODEL)
  .then((geometry) => {
    status.textContent = "羊を3D格子の条件へ変換中…";
    volumeMask = createVolumeMask(geometry, PHASE_SIZE);
    phenomenonRenderer.setVolumeMask(volumeMask);
    applyRelation();
    saveAndRebuild();
  })
  .catch((error) => {
    status.textContent = `羊の参照を読み込めませんでした: ${(error as Error).message}`;
  });
saveAndRebuild();

window.addEventListener("beforeunload", () => {
  setPlaying(false);
  phenomenonRenderer.dispose();
});
