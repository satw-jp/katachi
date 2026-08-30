import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import manifest from "../manifest.json";
import {
  DEFAULT_SKIN_REBUILD_SETTINGS,
  buildSkinRebuildFinalMesh,
  buildSkinRebuildProject,
  exportSkinRebuildStl,
  graphSegments,
  type SkinRebuildProject,
  type SkinRebuildRuntimeBuild,
  type SkinRebuildSettings,
} from "./model.ts";
import {
  captureSkinRebuildFkei,
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
  serializeSkinRebuildFkei,
} from "./fkei.ts";
import "./style.css";

const RUNNING_APP_COMMIT = import.meta.env.VITE_GIT_COMMIT as string;
const SAMPLE_URL = "./samples/skin-rebuild-first-print.fkei";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("SKIN REBUILD app root is missing");

app.innerHTML = `
  <div class="rebuild-app">
    <header class="rebuild-header">
      <div>
        <p class="eyebrow">KATACHI / FIRST PRINT PIPELINE</p>
        <h1>SKIN REBUILD</h1>
      </div>
      <div class="version">v${manifest.version}<span>${manifest.updatedAt}</span></div>
    </header>
    <aside class="rebuild-panel">
      <section class="intro">
        <p>ベースは型。印刷されるのは表面パターン、DryWeb、内部ラティスです。</p>
        <button id="rebuild-all" class="primary">全工程を再生成</button>
      </section>

      <section class="controls" aria-label="生成条件">
        <label>ベースの伸び <output id="base-stretch-value"></output>
          <input id="base-stretch" type="range" min="1.8" max="4.4" step="0.1" />
        </label>
        <label>表面パターン数 <output id="pattern-count-value"></output>
          <input id="pattern-count" type="range" min="20" max="72" step="1" />
        </label>
        <label>糸の直径 <output id="strut-value"></output>
          <input id="strut" type="range" min="1.6" max="4" step="0.1" />
        </label>
      </section>

      <nav class="steps" aria-label="SKIN REBUILD工程">
        <button data-stage="1"><span>1</span><strong>ベース形状</strong><small id="step-1-fact"></small></button>
        <button data-stage="2"><span>2</span><strong>表面パターン</strong><small id="step-2-fact"></small></button>
        <button data-stage="3"><span>3</span><strong>DryWeb</strong><small id="step-3-fact"></small></button>
        <button data-stage="4"><span>4</span><strong>内外判定</strong><small id="step-4-fact"></small></button>
        <button data-stage="5"><span>5</span><strong>最下端点</strong><small id="step-5-fact"></small></button>
        <button data-stage="6"><span>6</span><strong>内部ラティス</strong><small id="step-6-fact"></small></button>
      </nav>

      <section class="files">
        <button id="save-fkei">7 · .fkei を保存</button>
        <button id="open-fkei">.fkei を開く</button>
        <input id="open-fkei-input" type="file" accept=".fkei,application/json" hidden />
        <button id="export-stl" class="primary">STLを書き出す</button>
      </section>
      <p id="status" class="status" role="status">準備中…</p>
      <p class="honesty">画面の45°判定と水密検査はスライサー／実物の成功保証ではありません。Bambu等でSlice Previewを確認してください。</p>
    </aside>
    <main class="viewport-wrap">
      <div id="viewport" class="viewport" aria-label="3D preview"></div>
      <div class="legend">
        <span><i class="pattern"></i>Surface Pattern</span>
        <span><i class="dry"></i>DryWeb</span>
        <span><i class="risk"></i>Overhang</span>
        <span><i class="lattice"></i>Lattice</span>
      </div>
      <div id="stage-title" class="stage-title"></div>
    </main>
  </div>
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element ${selector}`);
  return element;
}

const viewport = requiredElement<HTMLDivElement>("#viewport");
const status = requiredElement<HTMLParagraphElement>("#status");
const stageTitle = requiredElement<HTMLDivElement>("#stage-title");
const baseStretchInput = requiredElement<HTMLInputElement>("#base-stretch");
const patternCountInput = requiredElement<HTMLInputElement>("#pattern-count");
const strutInput = requiredElement<HTMLInputElement>("#strut");
const baseStretchValue = requiredElement<HTMLOutputElement>("#base-stretch-value");
const patternCountValue = requiredElement<HTMLOutputElement>("#pattern-count-value");
const strutValue = requiredElement<HTMLOutputElement>("#strut-value");
const fileInput = requiredElement<HTMLInputElement>("#open-fkei-input");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d11);
scene.fog = new THREE.FogExp2(0x0b0d11, 0.035);
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.position.set(6.2, 4.2, 5.4);
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.minDistance = 2;
controls.maxDistance = 14;

scene.add(new THREE.HemisphereLight(0xdceaff, 0x15110f, 1.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(4, 5, 6);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x62c5d9, 2.1);
rimLight.position.set(-4, -1, 3);
scene.add(rimLight);

const grid = new THREE.GridHelper(8, 20, 0x343b46, 0x1b2028);
grid.rotation.x = Math.PI / 2;
grid.position.z = -2.25;
scene.add(grid);

const content = new THREE.Group();
scene.add(content);
const baseGroup = new THREE.Group();
const patternGroup = new THREE.Group();
const dryWebGroup = new THREE.Group();
const classificationGroup = new THREE.Group();
const lowestGroup = new THREE.Group();
const latticeGroup = new THREE.Group();
content.add(baseGroup, patternGroup, dryWebGroup, classificationGroup, lowestGroup, latticeGroup);

const sphereCache = new Map<number, THREE.SphereGeometry>();
function sphereGeometry(segments = 16): THREE.SphereGeometry {
  const cached = sphereCache.get(segments);
  if (cached) return cached;
  const geometry = new THREE.SphereGeometry(1, segments, Math.max(8, Math.floor(segments * 0.7)));
  sphereCache.set(segments, geometry);
  return geometry;
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    const mesh = child as THREE.Mesh;
    if (mesh.geometry && ![...sphereCache.values()].includes(mesh.geometry as THREE.SphereGeometry)) mesh.geometry.dispose();
  }
}

function addSphere(group: THREE.Group, position: { x: number; y: number; z: number }, radius: number, material: THREE.Material, segments = 14): void {
  const mesh = new THREE.Mesh(sphereGeometry(segments), material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.scale.setScalar(radius);
  group.add(mesh);
}

function addCylinder(
  group: THREE.Group,
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  radius: number,
  material: THREE.Material,
): void {
  const a = new THREE.Vector3(start.x, start.y, start.z);
  const b = new THREE.Vector3(end.x, end.y, end.z);
  const direction = b.clone().sub(a);
  const distance = direction.length();
  if (distance <= 1e-8) return;
  const geometry = new THREE.CylinderGeometry(radius, radius, distance, 9, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(mesh);
}

const materials = {
  base: new THREE.MeshPhysicalMaterial({ color: 0x5e7185, transparent: true, opacity: 0.11, roughness: 0.8, depthWrite: false }),
  pattern: new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.55, metalness: 0.05 }),
  dry: new THREE.MeshStandardMaterial({ color: 0x4ea5aa, roughness: 0.45, metalness: 0.15 }),
  inside: new THREE.MeshBasicMaterial({ color: 0x5bd2a7 }),
  outside: new THREE.MeshBasicMaterial({ color: 0xd9a55a }),
  risk: new THREE.MeshBasicMaterial({ color: 0xff675f }),
  safe: new THREE.MeshBasicMaterial({ color: 0x6b7684 }),
  lattice: new THREE.MeshStandardMaterial({ color: 0xb492ff, roughness: 0.35, metalness: 0.1 }),
};

let current: SkinRebuildRuntimeBuild | null = null;
let visibleStage = 6;
let busy = false;

function settingsFromUi(): SkinRebuildSettings {
  return {
    ...DEFAULT_SKIN_REBUILD_SETTINGS,
    baseStretch: Number(baseStretchInput.value),
    patternCount: Number(patternCountInput.value),
    strutDiameterMm: Number(strutInput.value),
  };
}

function syncSettingsUi(settings: SkinRebuildSettings): void {
  baseStretchInput.value = String(settings.baseStretch);
  patternCountInput.value = String(settings.patternCount);
  strutInput.value = String(settings.strutDiameterMm);
  baseStretchValue.value = settings.baseStretch.toFixed(1);
  patternCountValue.value = String(settings.patternCount);
  strutValue.value = `${settings.strutDiameterMm.toFixed(1)} mm`;
}

for (const input of [baseStretchInput, patternCountInput, strutInput]) {
  input.addEventListener("input", () => syncSettingsUi(settingsFromUi()));
}
syncSettingsUi(DEFAULT_SKIN_REBUILD_SETTINGS);

function updateFacts(project: SkinRebuildProject): void {
  requiredElement("#step-1-fact").textContent = `${project.base.host.length} metaballs`;
  requiredElement("#step-2-fact").textContent = `${project.audit.realizedPatternCount} patterns`;
  requiredElement("#step-3-fact").textContent = `${project.audit.dryWebNodeCount} nodes / ${project.audit.dryWebEdgeCount} edges`;
  requiredElement("#step-4-fact").textContent = `${project.audit.classifiedInsideCount}/${project.audit.realizedPatternCount} inside confirmed`;
  requiredElement("#step-5-fact").textContent = `${project.audit.overhangTargetCount} overhang targets`;
  requiredElement("#step-6-fact").textContent = `${project.audit.supportedTargetCount} supported · max ${project.audit.maximumLatticeAngleDeg.toFixed(1)}°`;
}

function renderProject(project: SkinRebuildProject): void {
  for (const group of [baseGroup, patternGroup, dryWebGroup, classificationGroup, lowestGroup, latticeGroup]) clearGroup(group);
  for (const ball of project.base.host) addSphere(baseGroup, ball, ball.r, materials.base, 22);
  for (const patch of project.patterns) for (const point of patch.points) addSphere(patternGroup, point, point.r, materials.pattern, 14);
  for (const segment of graphSegments(project.dryWeb)) addCylinder(dryWebGroup, segment.start, segment.end, segment.radius * 0.82, materials.dry);
  for (const side of project.patternSides) {
    addSphere(classificationGroup, side.insidePosition, 0.035, materials.inside, 10);
    addSphere(classificationGroup, side.outsidePosition, 0.025, materials.outside, 10);
  }
  for (const point of project.lowestPoints) {
    if (point.needsSupport) addSphere(lowestGroup, point.position, 0.055, materials.risk, 12);
    else if (point.plateContact) addSphere(lowestGroup, point.position, 0.025, materials.safe, 10);
  }
  for (const segment of graphSegments(project.lattice)) addCylinder(latticeGroup, segment.start, segment.end, segment.radius, materials.lattice);
  updateStage(visibleStage);
  updateFacts(project);
}

const stageNames = ["", "BASE SHAPE", "SURFACE PATTERN", "DRYWEB", "INSIDE / OUTSIDE", "OVERHANG LOWEST POINTS", "INTERNAL LATTICE"];
function updateStage(stage: number): void {
  visibleStage = Math.max(1, Math.min(6, Math.round(stage)));
  baseGroup.visible = true;
  patternGroup.visible = visibleStage >= 2;
  dryWebGroup.visible = visibleStage >= 3;
  classificationGroup.visible = visibleStage === 4;
  lowestGroup.visible = visibleStage >= 5;
  latticeGroup.visible = visibleStage >= 6;
  stageTitle.textContent = `${visibleStage} / ${stageNames[visibleStage]}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-stage]")) {
    button.classList.toggle("active", Number(button.dataset.stage) === visibleStage);
    button.classList.toggle("complete", Number(button.dataset.stage) <= visibleStage);
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-stage]")) {
  button.addEventListener("click", () => updateStage(Number(button.dataset.stage)));
}

async function rebuild(settings: SkinRebuildSettings): Promise<void> {
  if (busy) return;
  busy = true;
  status.dataset.kind = "working";
  status.textContent = "ベース → パターン → DryWeb → 最下端 → ラティスを再生成中…";
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const next = buildSkinRebuildProject(settings);
    current = next;
    visibleStage = 6;
    renderProject(next.project);
    syncSettingsUi(next.project.settings);
    status.dataset.kind = "ok";
    status.textContent = `生成完了 · ${next.project.audit.supportedTargetCount}/${next.project.audit.overhangTargetCount} targets supported`;
  } catch (error) {
    status.dataset.kind = "error";
    status.textContent = `生成失敗: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    busy = false;
  }
}

requiredElement<HTMLButtonElement>("#rebuild-all").addEventListener("click", () => void rebuild(settingsFromUi()));

function download(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

requiredElement<HTMLButtonElement>("#save-fkei").addEventListener("click", () => {
  if (!current || busy) return;
  try {
    const document = captureSkinRebuildFkei(current.project, { appVersion: manifest.version, generatorCommit: RUNNING_APP_COMMIT });
    const text = serializeSkinRebuildFkei(document);
    download(text, "skin-rebuild-first-print.fkei", "application/json");
    status.dataset.kind = "ok";
    status.textContent = `.fkei 保存完了 · ${(new TextEncoder().encode(text).length / 1024).toFixed(0)} KB`;
  } catch (error) {
    status.dataset.kind = "error";
    status.textContent = `.fkei 保存失敗: ${error instanceof Error ? error.message : String(error)}`;
  }
});

async function openFkeiText(text: string, source: string): Promise<void> {
  // Parse and validate everything before replacing the live project.
  const document = parseSkinRebuildFkei(text);
  const project = projectFromSkinRebuildFkei(document);
  current = { project, analysisMesh: buildSkinRebuildFinalMesh(project, project.settings.analysisResolution) };
  syncSettingsUi(project.settings);
  visibleStage = 6;
  renderProject(project);
  status.dataset.kind = "ok";
  status.textContent = `${source}を復元 · ${project.audit.supportedTargetCount}/${project.audit.overhangTargetCount} targets supported`;
}

requiredElement<HTMLButtonElement>("#open-fkei").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file || busy) return;
  busy = true;
  status.dataset.kind = "working";
  status.textContent = `${file.name} を検証中…`;
  try {
    await openFkeiText(await file.text(), file.name);
  } catch (error) {
    status.dataset.kind = "error";
    status.textContent = `.fkei Open失敗（現在状態は保持）: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    busy = false;
  }
});

requiredElement<HTMLButtonElement>("#export-stl").addEventListener("click", async () => {
  if (!current || busy) return;
  busy = true;
  status.dataset.kind = "working";
  status.textContent = `STLを生成・水密検査中（resolution ${current.project.settings.exportResolution}）…`;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const artifact = exportSkinRebuildStl(current.project);
    download(artifact.stl, "skin-rebuild-first-print.stl", "model/stl");
    const size = artifact.mesh.mmBounds.size;
    status.dataset.kind = "ok";
    status.textContent = `STL保存完了 · ${artifact.mesh.triangles.length.toLocaleString()} triangles · ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm · 1 component`;
  } catch (error) {
    status.dataset.kind = "error";
    status.textContent = `STL出力停止: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    busy = false;
  }
});

function resize(): void {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
resize();

function frame(): void {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

async function start(): Promise<void> {
  try {
    const response = await fetch(SAMPLE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await openFkeiText(await response.text(), "同梱サンプル");
  } catch {
    await rebuild(DEFAULT_SKIN_REBUILD_SETTINGS);
  }
}
void start();
