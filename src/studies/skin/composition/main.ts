import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";
import {
  DEFAULT_COMPOSITION_RECIPE,
  LOCKED_HOST_INPUT,
  type CompositionBranchGraph,
  type CompositionFlower,
  type CompositionHost,
  type CompositionRecipe,
} from "./compositionModel.ts";
import { compositionCommands } from "./commands.ts";
import { loadMotifPrototype, type MotifPrototype } from "./motifSource.ts";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("SKIN Composition app root is missing");

root.innerHTML = `
  <main class="composition-app">
    <header class="composition-header">
      <div>
        <p class="composition-eyebrow">KATACHI / SKIN REBUILD</p>
        <h1>Composition Flow <span>v0</span></h1>
      </div>
      <p class="composition-scope">独立Composition · 機能確認用 · 印刷準備ではありません</p>
    </header>
    <div class="composition-layout">
      <section class="composition-stage" aria-label="Composition 3D view">
        <div id="composition-viewport" class="composition-viewport" aria-label="3D composition preview"></div>
        <div class="composition-legend" aria-label="表示凡例">
          <span><i class="legend-host"></i>MOCOMOCO Host</span>
          <span><i class="legend-flower"></i>D BACKARC flower</span>
          <span><i class="legend-branch"></i>Shared branch draft</span>
        </div>
        <div id="composition-overlay" class="composition-overlay">MOCOMOCO Hostを読み込んでください</div>
      </section>
      <aside class="composition-controls" aria-label="Composition steps">
        <section class="composition-step">
          <div class="step-heading"><span>01</span><h2>Host</h2></div>
          <p>固定したMOCOMOCO STLを読み込みます。</p>
          <button id="load-host" class="primary">MOCOMOCO STLを読み込む</button>
          <input id="host-file" type="file" accept=".stl,model/stl" hidden />
          <output id="host-status" aria-live="polite">未読込</output>
        </section>
        <section class="composition-step">
          <div class="step-heading"><span>02</span><h2>Flower source</h2></div>
          <p>D BACKARCのNPZとframe JSONを一組で読み込みます。</p>
          <button id="load-motif" class="secondary">NPZ + frameを読み込む</button>
          <input id="motif-files" type="file" accept=".npz,.json,application/zip,application/json" multiple hidden />
          <output id="motif-status" aria-live="polite">未読込</output>
        </section>
        <section class="composition-step">
          <div class="step-heading"><span>03</span><h2>Flowers</h2></div>
          <div class="compact-fields">
            <label>花数
              <select id="flower-count"><option value="64" selected>64</option><option value="32">32</option></select>
            </label>
            <label>Scale
              <input id="flower-scale" type="number" min="0.1" max="4" step="0.1" value="1" />
            </label>
          </div>
          <button id="place-flowers" class="secondary" disabled>花を新規配置</button>
          <output id="flower-status" aria-live="polite">Hostとflower sourceの読込後に配置できます</output>
        </section>
        <section class="composition-step">
          <div class="step-heading"><span>04</span><h2>Shared branches</h2></div>
          <div class="compact-fields">
            <label>枝径 mm
              <input id="branch-diameter" type="number" min="0.2" max="10" step="0.1" value="3" />
            </label>
            <label>Inset mm
              <input id="branch-inset" type="number" min="1" max="30" step="0.5" value="8" />
            </label>
          </div>
          <button id="build-branches" class="secondary" disabled>共有枝を生成</button>
          <output id="branch-status" aria-live="polite">花配置後に生成できます</output>
        </section>
        <section class="composition-step save-step">
          <div class="step-heading"><span>05</span><h2>Save / restore</h2></div>
          <label class="visibility-toggle"><input id="show-host" type="checkbox" checked /> Hostを表示</label>
          <div class="file-actions">
            <button id="save-project" class="primary" disabled>.skincompを保存</button>
            <button id="open-project" class="secondary">.skincompを開く</button>
            <input id="project-file" type="file" accept=".skincomp,application/json" hidden />
          </div>
          <output id="project-status" aria-live="polite">花と枝の生成後に保存できます</output>
        </section>
        <p class="composition-limit">枝はpermanent-structure draftです。内包・衝突・強度・取り外し・fabricationは未検証です。STL/3MF/G-code出力や印刷はありません。</p>
        <p id="composition-error" class="composition-error" role="status" hidden></p>
      </aside>
    </div>
  </main>
`;

function required<T extends Element>(selector: string): T {
  const element = root!.querySelector<T>(selector);
  if (!element) throw new Error(`Missing composition UI element ${selector}`);
  return element;
}

const viewport = required<HTMLDivElement>("#composition-viewport");
const overlay = required<HTMLDivElement>("#composition-overlay");
const hostInput = required<HTMLInputElement>("#host-file");
const motifInput = required<HTMLInputElement>("#motif-files");
const projectInput = required<HTMLInputElement>("#project-file");
const hostStatus = required<HTMLOutputElement>("#host-status");
const motifStatus = required<HTMLOutputElement>("#motif-status");
const flowerStatus = required<HTMLOutputElement>("#flower-status");
const branchStatus = required<HTMLOutputElement>("#branch-status");
const projectStatus = required<HTMLOutputElement>("#project-status");
const errorStatus = required<HTMLParagraphElement>("#composition-error");
const flowerCountInput = required<HTMLSelectElement>("#flower-count");
const flowerScaleInput = required<HTMLInputElement>("#flower-scale");
const branchDiameterInput = required<HTMLInputElement>("#branch-diameter");
const branchInsetInput = required<HTMLInputElement>("#branch-inset");
const showHostInput = required<HTMLInputElement>("#show-host");
const placeButton = required<HTMLButtonElement>("#place-flowers");
const branchButton = required<HTMLButtonElement>("#build-branches");
const saveButton = required<HTMLButtonElement>("#save-project");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1218);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 3000);
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("aria-label", "MOCOMOCO flower and branch preview");
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 96);
controls.minDistance = 40;
controls.maxDistance = 1000;

scene.add(new THREE.HemisphereLight(0xe7efff, 0x26202a, 2));
const keyLight = new THREE.DirectionalLight(0xffe6ce, 3.2);
keyLight.position.set(240, -260, 380);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x83d5dc, 1.6);
fillLight.position.set(-280, 180, 150);
scene.add(fillLight);
const grid = new THREE.GridHelper(260, 26, 0x303943, 0x1b242d);
grid.rotation.x = Math.PI / 2;
grid.position.z = 0;
scene.add(grid);

const content = new THREE.Group();
scene.add(content);
const hostGroup = new THREE.Group();
const flowerGroup = new THREE.Group();
const branchGroup = new THREE.Group();
content.add(hostGroup, flowerGroup, branchGroup);
const hostMaterial = new THREE.MeshBasicMaterial({ color: 0x8fa2ad, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
const flowerMaterial = new THREE.MeshStandardMaterial({ color: 0xe9b48b, roughness: 0.48, metalness: 0.03, side: THREE.DoubleSide });
const branchMaterial = new THREE.MeshStandardMaterial({ color: 0x63c9c2, roughness: 0.38, metalness: 0.12 });
const axis = new THREE.AxesHelper(24);
axis.position.set(-115, -125, 2);
scene.add(axis);

let activeHost: CompositionHost | null = null;
let activeMotif: MotifPrototype | null = null;
let activeRecipe: CompositionRecipe = Object.freeze({ ...DEFAULT_COMPOSITION_RECIPE });
let activeFlowers: readonly CompositionFlower[] = Object.freeze([]);
let activeBranches: CompositionBranchGraph | null = null;
let currentHostMesh: THREE.Mesh | null = null;

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) group.remove(child);
}

function fitHost(): void {
  if (!activeHost) return;
  const [tx, ty, tz] = LOCKED_HOST_INPUT.translation;
  const min = activeHost.rawMesh.bounds.min;
  const max = activeHost.rawMesh.bounds.max;
  const center = new THREE.Vector3(
    (min.x + max.x) * 0.5 + tx,
    (min.y + max.y) * 0.5 + ty,
    (min.z + max.z) * 0.5 + tz,
  );
  controls.target.copy(center);
  camera.position.set(center.x + 290, center.y - 360, center.z + 250);
  camera.near = 0.1;
  camera.far = 3000;
  camera.updateProjectionMatrix();
  controls.update();
}

function renderHost(): void {
  clearGroup(hostGroup);
  currentHostMesh = null;
  if (!activeHost) return;
  const positions = new Float32Array(activeHost.rawMesh.positions.length);
  for (let index = 0; index < positions.length; index += 1) positions[index] = activeHost.rawMesh.positions[index];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, hostMaterial);
  mesh.position.set(3.092479705810547, -3.7586593627929688, 196.83554077148438);
  mesh.visible = showHostInput.checked;
  hostGroup.add(mesh);
  currentHostMesh = mesh;
}

function clearFlowers(): void {
  clearGroup(flowerGroup);
}

function renderFlowers(): void {
  clearFlowers();
  if (!activeMotif || activeFlowers.length === 0) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(activeMotif.vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(activeMotif.indices, 1));
  geometry.computeVertexNormals();
  const instances = new THREE.InstancedMesh(geometry, flowerMaterial, activeFlowers.length);
  instances.name = "D BACKARC flower instances";
  const matrix = new THREE.Matrix4();
  const translation = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const anchorShift = new THREE.Matrix4();
  for (let index = 0; index < activeFlowers.length; index += 1) {
    const flower = activeFlowers[index];
    translation.set(...flower.position);
    rotation.set(...flower.rotation);
    scale.setScalar(flower.scale);
    matrix.compose(translation, rotation, scale);
    anchorShift.makeTranslation(-activeMotif.anchorLocal[0], -activeMotif.anchorLocal[1], -activeMotif.anchorLocal[2]);
    matrix.multiply(anchorShift);
    instances.setMatrixAt(index, matrix);
  }
  instances.instanceMatrix.needsUpdate = true;
  instances.visible = true;
  flowerGroup.add(instances);
}

function renderBranches(): void {
  clearGroup(branchGroup);
  if (!activeBranches) return;
  const byId = new Map(activeBranches.nodes.map((node) => [node.id, node]));
  const radius = activeBranches.diameterMm * 0.5;
  const geometry = new THREE.CylinderGeometry(radius, radius, 1, 10, 1, false);
  for (const edge of activeBranches.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const a = new THREE.Vector3(...from.position);
    const b = new THREE.Vector3(...to.position);
    const direction = b.clone().sub(a);
    const length = direction.length();
    if (length <= 1e-9) continue;
    const mesh = new THREE.Mesh(geometry, branchMaterial);
    mesh.position.copy(a.add(b).multiplyScalar(0.5));
    mesh.scale.y = length;
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.name = edge.id;
    branchGroup.add(mesh);
  }
}

function updateEvidenceAttributes(): void {
  root!.dataset.hostTriangles = String(activeHost?.rawMesh.triangleCount ?? 0);
  root!.dataset.flowerCount = String(activeFlowers.length);
  root!.dataset.branchNodeCount = String(activeBranches?.nodes.length ?? 0);
  root!.dataset.branchEdgeCount = String(activeBranches?.edges.length ?? 0);
  root!.dataset.showHost = String(showHostInput.checked);
  overlay.hidden = Boolean(activeHost);
}

function refreshUi(): void {
  const hasInputs = activeHost !== null && activeMotif !== null;
  placeButton.disabled = !hasInputs;
  branchButton.disabled = activeFlowers.length === 0;
  saveButton.disabled = !activeHost || !activeMotif || activeFlowers.length === 0 || activeBranches === null;
  if (activeHost) {
    hostStatus.textContent = `${activeHost.rawMesh.triangleCount.toLocaleString()} triangles · SHA ${activeHost.sourceHash.slice(0, 12)}…`;
    hostStatus.dataset.state = "current";
  }
  if (activeMotif) {
    motifStatus.textContent = `${activeMotif.sourceVertexCount.toLocaleString()} vertices · ${activeMotif.sourceFaceCount.toLocaleString()} faces · motif 63`;
    motifStatus.dataset.state = "current";
  }
  if (activeFlowers.length > 0) {
    flowerStatus.textContent = `${activeFlowers.length} newly sampled flowers · scale ${activeRecipe.flowerScale.toFixed(2)} · seed ${activeRecipe.seed}`;
    flowerStatus.dataset.state = "current";
  }
  if (activeBranches) {
    branchStatus.textContent = `${activeBranches.nodes.length} nodes · ${activeBranches.edges.length} edges · Ø ${activeBranches.diameterMm.toFixed(2)} mm · current`;
    branchStatus.dataset.state = "current";
  }
  if (saveButton.disabled) projectStatus.textContent = "花と枝の生成後に保存できます";
  root!.dataset.recipeBranchDiameter = activeBranches ? String(activeBranches.diameterMm) : "";
  updateEvidenceAttributes();
}

function setError(message: string | null): void {
  errorStatus.hidden = message === null;
  errorStatus.textContent = message ?? "";
  if (message) errorStatus.dataset.state = "error";
  else delete errorStatus.dataset.state;
}

function updateScene(): void {
  renderHost();
  renderFlowers();
  renderBranches();
  refreshUi();
}

function recipeFromInputs(): CompositionRecipe {
  const count = Number(flowerCountInput.value);
  const scale = Number(flowerScaleInput.value);
  if (!Number.isInteger(count) || count < 1) throw new Error("花数は正の整数にしてください");
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Flower scaleは正数にしてください");
  return Object.freeze({ ...activeRecipe, flowerCount: count, flowerScale: scale });
}

function branchParametersFromInputs(): { diameter: number; inset: number } {
  const diameter = Number(branchDiameterInput.value);
  const inset = Number(branchInsetInput.value);
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error("枝径は正数にしてください");
  if (!Number.isFinite(inset) || inset <= 0) throw new Error("Insetは正数にしてください");
  return { diameter, inset };
}

function downloadProject(text: string): void {
  const blob = new Blob([text], { type: "application/vnd.katachi.skin.composition+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `skin-composition-mocomoco-${activeRecipe.flowerCount}.skincomp`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

required<HTMLButtonElement>("#load-host").onclick = () => hostInput.click();
hostInput.onchange = async () => {
  const file = hostInput.files?.[0];
  hostInput.value = "";
  if (!file) return;
  setError(null);
  hostStatus.textContent = "読み込み・SHA・座標を検証中…";
  try {
    const candidate = await compositionCommands.loadHost(await file.arrayBuffer(), file.name);
    activeHost = candidate;
    activeFlowers = Object.freeze([]);
    activeBranches = null;
    activeRecipe = Object.freeze({ ...DEFAULT_COMPOSITION_RECIPE });
    branchStatus.textContent = "花配置後に生成できます";
    flowerStatus.textContent = "Hostとflower sourceの読込後に配置できます";
    projectStatus.textContent = "花と枝の生成後に保存できます";
    fitHost();
    updateScene();
  } catch (error) {
    hostStatus.textContent = "読込失敗 · 現在のCompositionは保持されています";
    setError(error instanceof Error ? error.message : String(error));
    refreshUi();
  }
};

required<HTMLButtonElement>("#load-motif").onclick = () => motifInput.click();
motifInput.onchange = async () => {
  const files = Array.from(motifInput.files ?? []);
  motifInput.value = "";
  if (files.length !== 2) {
    setError("NPZとframe JSONを同時に2ファイル選択してください");
    return;
  }
  const motifFile = files.find((file) => file.name === "motif_63_D_BACKARC.npz");
  const frameFile = files.find((file) => file.name === "patch_identity.json");
  if (!motifFile || !frameFile) {
    setError("固定名のmotif_63_D_BACKARC.npzとpatch_identity.jsonを選択してください");
    return;
  }
  setError(null);
  motifStatus.textContent = "NPZ/frame・hash・local frameを検証中…";
  try {
    const candidate = await loadMotifPrototype(await motifFile.arrayBuffer(), await frameFile.arrayBuffer());
    activeMotif = candidate;
    activeFlowers = Object.freeze([]);
    activeBranches = null;
    flowerStatus.textContent = "source読込完了 · 花配置で実データから新規生成";
    branchStatus.textContent = "花配置後に生成できます";
    projectStatus.textContent = "花と枝の生成後に保存できます";
    updateScene();
  } catch (error) {
    motifStatus.textContent = "読込失敗 · 現在のCompositionは保持されています";
    setError(error instanceof Error ? error.message : String(error));
    refreshUi();
  }
};

placeButton.onclick = () => {
  if (!activeHost || !activeMotif) return;
  setError(null);
  flowerStatus.textContent = "実Host表面から花の接続位置を計算中…";
  try {
    const recipe = recipeFromInputs();
    const candidate = compositionCommands.placeFlowers(activeHost, recipe);
    activeRecipe = recipe;
    activeFlowers = candidate;
    activeBranches = null;
    branchStatus.textContent = "花配置を更新 · 共有枝は未生成";
    projectStatus.textContent = "現在の花に枝を生成すると保存できます";
    updateScene();
  } catch (error) {
    flowerStatus.textContent = "配置失敗 · 前回の成功状態を保持しています";
    setError(error instanceof Error ? error.message : String(error));
    refreshUi();
  }
};

branchButton.onclick = () => {
  if (activeFlowers.length === 0) return;
  setError(null);
  branchStatus.textContent = "relay MSTと接続edgeを計算中…";
  try {
    const parameters = branchParametersFromInputs();
    const candidateRecipe = Object.freeze({ ...activeRecipe, branchDiameterMm: parameters.diameter, insetMm: parameters.inset });
    const candidateGraph = compositionCommands.buildBranches(activeFlowers, parameters.diameter, parameters.inset);
    activeRecipe = candidateRecipe;
    activeBranches = candidateGraph;
    projectStatus.textContent = "このCompositionを保存できます";
    updateScene();
  } catch (error) {
    branchStatus.textContent = "生成失敗 · 前回の成功状態を保持しています";
    setError(error instanceof Error ? error.message : String(error));
    refreshUi();
  }
};

showHostInput.onchange = () => {
  if (currentHostMesh) currentHostMesh.visible = showHostInput.checked;
  updateEvidenceAttributes();
};

saveButton.onclick = async () => {
  if (!activeHost || !activeMotif || activeFlowers.length === 0 || !activeBranches) return;
  setError(null);
  projectStatus.textContent = "自己完結packageを検証・保存中…";
  try {
    const projectText = await compositionCommands.saveComposition({
      host: activeHost,
      motif: activeMotif,
      recipe: activeRecipe,
      flowers: activeFlowers,
      branches: activeBranches,
      presentation: Object.freeze({ showHost: showHostInput.checked }),
    });
    downloadProject(projectText);
    projectStatus.textContent = `.skincomp保存 · ${(projectText.length / (1024 * 1024)).toFixed(1)} MB · SHA検証可能`;
  } catch (error) {
    projectStatus.textContent = "保存失敗";
    setError(error instanceof Error ? error.message : String(error));
  }
};

required<HTMLButtonElement>("#open-project").onclick = () => projectInput.click();
projectInput.onchange = async () => {
  const file = projectInput.files?.[0];
  projectInput.value = "";
  if (!file) return;
  setError(null);
  projectStatus.textContent = "fresh projectを検証中…";
  try {
    const candidate = await compositionCommands.restoreComposition(await file.text());
    activeHost = candidate.host;
    activeMotif = candidate.motif;
    activeRecipe = candidate.recipe;
    activeFlowers = candidate.flowers;
    activeBranches = candidate.branches;
    showHostInput.checked = candidate.presentation.showHost;
    flowerCountInput.value = String(candidate.recipe.flowerCount);
    flowerScaleInput.value = String(candidate.recipe.flowerScale);
    branchDiameterInput.value = String(candidate.recipe.branchDiameterMm);
    branchInsetInput.value = String(candidate.recipe.insetMm);
    fitHost();
    updateScene();
    projectStatus.textContent = `fresh restore · ${candidate.flowers.length} flowers · ${candidate.branches.edges.length} edges · package hash valid`;
  } catch (error) {
    projectStatus.textContent = "復元拒否 · 現在のCompositionは変更されていません";
    setError(error instanceof Error ? error.message : String(error));
  }
};

function resize(): void {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
resize();
function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
refreshUi();
