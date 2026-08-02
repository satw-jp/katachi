import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import manifest from "./manifest.json";
import { createVersionRow } from "../../lib/ui/version.ts";
import { createVolumeMask } from "../hitsuji/volumeMask.ts";
import {
  DEFAULT_TANGLE_PARAMS,
  generateContainedPaths,
  type ContainedPathStats,
  type TangleParams,
  type VoxelDomain,
} from "./path.ts";
import { TangleRenderer, type TangleRenderStats } from "./renderer.ts";
import { generateWeavePatterns, type WeavePattern } from "./weavePatterns.ts";
import "./style.css";

interface TangleRecipe {
  formatVersion: 7;
  studyId: "tangle";
  source: string;
  params: TangleParams;
}

const STORAGE_KEY = "katachi:tangle:v7";
const DEFAULT_MODEL = `${import.meta.env.BASE_URL}models/hitsuji/hitsuji_260304.glb`;
const DOMAIN_SIZE = 40;
const DOMAIN_EXTENT = 1.22;

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

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Number(value))) : fallback;
}

function sanitizeParams(value: Partial<TangleParams>): TangleParams {
  return {
    seed: Math.trunc(clamp(value.seed, DEFAULT_TANGLE_PARAMS.seed, 0, 999999999)),
    pathCount: Math.round(clamp(value.pathCount, DEFAULT_TANGLE_PARAMS.pathCount, 1, 36)),
    curvature: clamp(value.curvature, DEFAULT_TANGLE_PARAMS.curvature, 0, 1),
    fusion: clamp(value.fusion, DEFAULT_TANGLE_PARAMS.fusion, 0, 1),
    spacing: clamp(value.spacing, DEFAULT_TANGLE_PARAMS.spacing, 0.015, 0.24),
    boundaryFreedom: clamp(value.boundaryFreedom, DEFAULT_TANGLE_PARAMS.boundaryFreedom, 0, 1),
    pathLength: clamp(value.pathLength, DEFAULT_TANGLE_PARAMS.pathLength, 1, 200),
    tubeRadius: clamp(value.tubeRadius, DEFAULT_TANGLE_PARAMS.tubeRadius, 0.01, 0.06),
    fillPriority: clamp(value.fillPriority, DEFAULT_TANGLE_PARAMS.fillPriority, 0, 1),
  };
}

function loadParams(): TangleParams {
  try {
    return sanitizeParams(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as Partial<TangleParams>);
  } catch {
    return { ...DEFAULT_TANGLE_PARAMS };
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let params = loadParams();
let rebuildTimer = 0;
let lastStats: TangleRenderStats | null = null;
let lastPathStats: ContainedPathStats | null = null;
let hostGeometry: THREE.BufferGeometry | null = null;
let domain: VoxelDomain | null = null;
let sourceLabel = "作者の hitsuji_260304.glb";
let comparisonMode = false;
let lastPatterns: WeavePattern[] = [];
let fillUntilCovered = false;

const app = document.getElementById("app")!;
const viewport = element("div");
viewport.id = "viewport";
const panel = element("aside", "panel");
app.append(viewport, panel);
const renderer = new TangleRenderer(viewport);

panel.appendChild(element("div", "panel-title", "軌跡を塊にする"));
panel.appendChild(createVersionRow(manifest.version, manifest.updatedAt));

const nav = element("nav", "nav-row");
const studiesLink = element("a", "nav-link", "← Study 一覧");
studiesLink.href = "studies.html";
const ringsLink = element("a", "nav-link", "輪の手 →");
ringsLink.href = "rings.html";
nav.append(studiesLink, ringsLink);
panel.append(nav);

panel.appendChild(
  element(
    "p",
    "intro",
    "選んだ形を発生領域にして、自己交差を避けながら軌跡を育てます。境界は厳守から越境まで操作でき、別の軌跡どうしは交差できます。",
  ),
);

const sourceBlock = element("div", "source-block");
const sourceTitle = element("div", "stage-label", "生成領域");
const sourceName = element("div", "source-name", sourceLabel);
const sourceButtons = element("div", "button-row");
const chooseHostButton = element("button", "primary", "STL / GLB を選ぶ");
chooseHostButton.type = "button";
const hostInput = element("input");
hostInput.type = "file";
hostInput.accept = ".stl,.glb,.gltf,model/stl,model/gltf-binary";
hostInput.hidden = true;
chooseHostButton.addEventListener("click", () => hostInput.click());
const defaultHostButton = element("button", undefined, "hitsujiに戻す");
defaultHostButton.type = "button";
sourceButtons.append(chooseHostButton, defaultHostButton, hostInput);
sourceBlock.append(sourceTitle, sourceName, sourceButtons);
panel.append(sourceBlock);

const controls: Array<{
  key: keyof Pick<
    TangleParams,
    | "pathCount"
    | "curvature"
    | "fusion"
    | "spacing"
    | "boundaryFreedom"
    | "pathLength"
    | "tubeRadius"
    | "fillPriority"
  >;
  input: HTMLInputElement;
  output: HTMLOutputElement;
}> = [];

function addRange(
  key: keyof Pick<
    TangleParams,
    | "pathCount"
    | "curvature"
    | "fusion"
    | "spacing"
    | "boundaryFreedom"
    | "pathLength"
    | "tubeRadius"
    | "fillPriority"
  >,
  labelText: string,
  min: number,
  max: number,
  step: number,
): void {
  const row = element("div", "control-row");
  const label = element("label", undefined, labelText);
  label.htmlFor = `tangle-${key}`;
  const input = element("input");
  input.id = `tangle-${key}`;
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(params[key]);
  const output = element("output");
  output.htmlFor = input.id;
  const updateOutput = () => {
    output.value =
      key === "pathCount"
        ? String(Math.round(Number(input.value)))
        : Number(input.value).toFixed(key === "tubeRadius" || key === "spacing" ? 3 : 2);
    output.textContent = output.value;
  };
  updateOutput();
  input.addEventListener("input", () => {
    if (key === "pathCount") fillUntilCovered = false;
    params[key] = key === "pathCount" ? Math.round(Number(input.value)) : Number(input.value);
    updateOutput();
    scheduleRebuild();
  });
  row.append(label, input, output);
  panel.append(row);
  controls.push({ key, input, output });
}

addRange("pathCount", "軌跡の本数", 1, 36, 1);
addRange("pathLength", "長さ上限（∞代用）", 1, 200, 1);
addRange("fillPriority", "未訪問を優先", 0, 1, 0.01);
addRange("tubeRadius", "線の太さ", 0.01, 0.06, 0.001);
addRange("curvature", "紐の柔らかさ", 0, 1, 0.01);
addRange("spacing", "自己交差の間隔", 0.015, 0.24, 0.005);
addRange("boundaryFreedom", "境界を越える", 0, 1, 0.01);
addRange("fusion", "融合の進行", 0, 1, 0.01);

const pathPresetButtons = element("div", "button-row");
const fillPresetButton = element("button", "primary", "一本で高充填");
fillPresetButton.type = "button";
fillPresetButton.addEventListener("click", () => {
  fillUntilCovered = false;
  params = sanitizeParams({
    ...params,
    pathCount: 1,
    pathLength: 24,
    fillPriority: 1,
    tubeRadius: 0.025,
    spacing: 0.015,
    boundaryFreedom: 0,
  });
  syncControls();
  scheduleRebuild();
});
const multiPresetButton = element("button", undefined, "既定の複数線");
multiPresetButton.type = "button";
multiPresetButton.addEventListener("click", () => {
  fillUntilCovered = false;
  params = { ...DEFAULT_TANGLE_PARAMS, seed: params.seed };
  syncControls();
  scheduleRebuild();
});
pathPresetButtons.append(fillPresetButton, multiPresetButton);
panel.append(pathPresetButtons);

const materialPresetButtons = element("div", "button-row");
const flexibleFillButton = element("button", undefined, "充填を最優先");
flexibleFillButton.type = "button";
flexibleFillButton.addEventListener("click", () => {
  fillUntilCovered = true;
  params = sanitizeParams({
    ...params,
    pathCount: 36,
    pathLength: 200,
    fillPriority: 1,
    tubeRadius: 0.018,
    curvature: 1,
    spacing: 0.015,
    boundaryFreedom: 0,
    fusion: 0.58,
  });
  syncControls();
  scheduleRebuild();
});
materialPresetButtons.append(flexibleFillButton);
panel.append(materialPresetButtons);

const comparisonButtons = element("div", "button-row");
const ordinaryViewButton = element("button", "primary", "軌跡と融合");
ordinaryViewButton.type = "button";
const compareViewButton = element("button", undefined, "編み方4案");
compareViewButton.type = "button";
ordinaryViewButton.addEventListener("click", () => {
  comparisonMode = false;
  renderer.setComparisonMode(false);
  ordinaryViewButton.classList.add("primary");
  compareViewButton.classList.remove("primary");
  scheduleRebuild();
});
compareViewButton.addEventListener("click", () => {
  comparisonMode = true;
  renderer.setComparisonMode(true);
  ordinaryViewButton.classList.remove("primary");
  compareViewButton.classList.add("primary");
  scheduleRebuild();
});
comparisonButtons.append(ordinaryViewButton, compareViewButton);
panel.append(comparisonButtons);

const seedRow = element("div", "control-row");
const seedLabel = element("label", undefined, "Seed");
seedLabel.htmlFor = "tangle-seed";
const seedInput = element("input");
seedInput.id = "tangle-seed";
seedInput.type = "number";
seedInput.min = "0";
seedInput.max = "999999999";
seedInput.step = "1";
seedInput.value = String(params.seed);
seedInput.addEventListener("change", () => {
  params.seed = sanitizeParams({ ...params, seed: Number(seedInput.value) }).seed;
  seedInput.value = String(params.seed);
  scheduleRebuild();
});
const randomizeButton = element("button", undefined, "変える");
randomizeButton.type = "button";
randomizeButton.addEventListener("click", () => {
  params.seed = Math.floor(Math.random() * 1_000_000_000);
  seedInput.value = String(params.seed);
  scheduleRebuild();
});
seedRow.append(seedLabel, seedInput, randomizeButton);
panel.append(seedRow);

const viewButtons = element("div", "button-row");
const rotateButton = element("button", "primary", "回転を止める");
rotateButton.type = "button";
let autoRotate = true;
rotateButton.addEventListener("click", () => {
  autoRotate = !autoRotate;
  renderer.setAutoRotate(autoRotate);
  rotateButton.classList.toggle("primary", autoRotate);
  rotateButton.textContent = autoRotate ? "回転を止める" : "回転する";
});
const resetViewButton = element("button", undefined, "視点を戻す");
resetViewButton.type = "button";
resetViewButton.addEventListener("click", () => renderer.resetView());
viewButtons.append(rotateButton, resetViewButton);
panel.append(viewButtons);

const recipeButtons = element("div", "button-row");
const saveButton = element("button", undefined, "設定JSON保存");
saveButton.type = "button";
saveButton.addEventListener("click", () => {
  const recipe: TangleRecipe = { formatVersion: 7, studyId: "tangle", source: sourceLabel, params };
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  downloadBlob(
    new Blob([`${JSON.stringify(recipe, null, 2)}\n`], { type: "application/json" }),
    `katachi-tangle-${stamp}.json`,
  );
});
const loadButton = element("button", undefined, "設定JSON読込");
loadButton.type = "button";
const loadInput = element("input");
loadInput.type = "file";
loadInput.accept = ".json,application/json";
loadInput.hidden = true;
loadButton.addEventListener("click", () => loadInput.click());
loadInput.addEventListener("change", async () => {
  const file = loadInput.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as Partial<TangleRecipe>;
    if (parsed.studyId !== "tangle" || !parsed.params) throw new Error("tangle の設定JSONではありません");
    params = sanitizeParams(parsed.params);
    syncControls();
    scheduleRebuild();
  } catch (error) {
    status.textContent = `設定を読み込めません: ${(error as Error).message}`;
  } finally {
    loadInput.value = "";
  }
});
recipeButtons.append(saveButton, loadButton, loadInput);
panel.append(recipeButtons);

panel.appendChild(
  element(
    "div",
    "method-note",
    "「紐の柔らかさ」は高いほど小さな折り返しを候補にできます。「充填を最優先」は太さ0.018・柔らかさ1・長さ上限200で、一本が行き止まるたびに別の紐を追加します。長さ200は材料制限ではなく、実質的な∞の代用です。自己交差は禁止し、別の紐との交差は許します。",
  ),
);
const status = element("div", "status", "軌跡と融合体を準備しています…");
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
panel.append(status);

function syncControls(): void {
  for (const control of controls) {
    control.input.value = String(params[control.key]);
    control.output.value =
      control.key === "pathCount"
        ? String(Math.round(params[control.key]))
        : params[control.key].toFixed(
            control.key === "tubeRadius" || control.key === "spacing" ? 3 : 2,
          );
    control.output.textContent = control.output.value;
  }
  seedInput.value = String(params.seed);
}

function rebuild(): void {
  if (!domain) {
    status.textContent = "生成領域を準備しています…";
    return;
  }
  if (comparisonMode) {
    const comparisonParams = sanitizeParams({
      ...params,
      pathCount: 1,
      fillPriority: 1,
      boundaryFreedom: 0,
    });
    const organic = generateContainedPaths(comparisonParams, domain);
    lastPathStats = organic.stats;
    lastPatterns = generateWeavePatterns(domain, organic.paths, comparisonParams.pathLength);
    renderer.setComparisonPatterns(lastPatterns, comparisonParams.tubeRadius);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    status.textContent =
      `同じ総延長${comparisonParams.pathLength.toFixed(1)}・` +
      `太さ${comparisonParams.tubeRadius.toFixed(3)}・` +
      `柔らかさ${comparisonParams.curvature.toFixed(2)} · ` +
      lastPatterns
        .map((pattern) => `${pattern.label} ${pattern.totalLength.toFixed(1)}/${pattern.paths.length}本`)
        .join(" · ") +
      ` · Seed ${params.seed}`;
    return;
  }
  let result: ReturnType<typeof generateContainedPaths>;
  if (fillUntilCovered) {
    result = generateContainedPaths({ ...params, pathCount: 6 }, domain);
    for (const pathCount of [12, 18, 24, 30, 36]) {
      if (result.stats.coverage >= 0.98) break;
      result = generateContainedPaths({ ...params, pathCount }, domain);
    }
    if (params.pathCount !== result.stats.requestedPaths) {
      params.pathCount = result.stats.requestedPaths;
      syncControls();
    }
  } else {
    result = generateContainedPaths(params, domain);
  }
  lastPathStats = result.stats;
  lastStats = renderer.setPaths(
    result.paths,
    params.fusion,
    params.boundaryFreedom,
    params.tubeRadius,
    domain,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  const fusionStage = params.fusion < 0.12 ? "独立" : params.fusion < 0.92 ? "融合途中" : "一体化";
  const outsidePercent =
    result.stats.points > 0
      ? Math.round((result.stats.outsidePoints / result.stats.points) * 100)
      : 0;
  status.textContent =
    `${fillUntilCovered ? "充填優先 · " : ""}${result.stats.grownPaths}/${result.stats.requestedPaths}本 · ` +
    `材料 ${Math.round(result.stats.coverage * 100)}% · ` +
    `到達 ${Math.round(result.stats.reachCoverage * 100)}% · ` +
    `境界外 ${outsidePercent}% · ` +
    `平均長 ${result.stats.averageLength.toFixed(1)}/${result.stats.targetLength.toFixed(1)} · ` +
    `${fusionStage} · ` +
    `自己交差拒否 ${result.stats.rejectedSelfIntersection.toLocaleString("ja-JP")} · ` +
    `${lastStats.triangles.toLocaleString("ja-JP")} triangles · ` +
    `Seed ${params.seed} · ${Math.round(lastStats.elapsedMs)}ms`;
}

function scheduleRebuild(): void {
  window.clearTimeout(rebuildTimer);
  status.textContent = "軌跡と融合体を更新しています…";
  rebuildTimer = window.setTimeout(rebuild, 90);
}

function normalizeGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = source.clone();
  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute("position", geometry.getAttribute("position").clone());
  if (geometry.getIndex()) positionOnly.setIndex(geometry.getIndex()!.clone());
  geometry.dispose();
  geometry = mergeVertices(positionOnly, 1e-5);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box || box.isEmpty()) throw new Error("形状の大きさを読み取れません");
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!(longest > 0)) throw new Error("形状の大きさが0です");
  const scale = 2.02 / longest;
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function geometryFromGltf(gltf: { scene: THREE.Group }): THREE.BufferGeometry {
  gltf.scene.updateMatrixWorld(true);
  let sourceMesh: THREE.Mesh | null = null;
  gltf.scene.traverse((object) => {
    if (!sourceMesh && (object as THREE.Mesh).isMesh) sourceMesh = object as THREE.Mesh;
  });
  if (!sourceMesh) throw new Error("GLB内にメッシュがありません");
  const geometry = (sourceMesh as THREE.Mesh).geometry.clone();
  geometry.applyMatrix4((sourceMesh as THREE.Mesh).matrixWorld);
  return geometry;
}

function applyHost(geometry: THREE.BufferGeometry, label: string): void {
  hostGeometry?.dispose();
  hostGeometry = normalizeGeometry(geometry);
  const mask = createVolumeMask(hostGeometry, DOMAIN_SIZE, DOMAIN_EXTENT);
  domain = {
    size: DOMAIN_SIZE,
    extent: DOMAIN_EXTENT,
    inside: mask.inside,
    distanceToSurface: mask.distanceToSurface,
  };
  sourceLabel = label;
  sourceName.textContent = label;
  renderer.setHostGeometry(hostGeometry);
  scheduleRebuild();
}

async function loadDefaultHost(): Promise<void> {
  status.textContent = "hitsuji の内側を準備しています…";
  try {
    const gltf = await new GLTFLoader().loadAsync(DEFAULT_MODEL);
    applyHost(geometryFromGltf(gltf), "作者の hitsuji_260304.glb");
  } catch (error) {
    status.textContent = `hitsujiを読み込めません: ${(error as Error).message}`;
  }
}

function parseGltf(buffer: ArrayBuffer): Promise<{ scene: THREE.Group }> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, "", resolve, reject);
  });
}

hostInput.addEventListener("change", async () => {
  const file = hostInput.files?.[0];
  if (!file) return;
  status.textContent = `${file.name} の内側を準備しています…`;
  try {
    const buffer = await file.arrayBuffer();
    const geometry = file.name.toLowerCase().endsWith(".stl")
      ? new STLLoader().parse(buffer)
      : geometryFromGltf(await parseGltf(buffer));
    applyHost(geometry, file.name);
    geometry.dispose();
  } catch (error) {
    status.textContent = `形状を読み込めません: ${(error as Error).message}`;
  } finally {
    hostInput.value = "";
  }
});

defaultHostButton.addEventListener("click", () => void loadDefaultHost());
void loadDefaultHost();

(window as unknown as {
  __tangle: {
    getParams: () => TangleParams;
    setParams: (next: Partial<TangleParams>) => void;
    getStats: () => { render: TangleRenderStats | null; paths: ContainedPathStats | null };
  };
}).__tangle = {
  getParams: () => ({ ...params }),
  setParams: (next) => {
    fillUntilCovered = false;
    params = sanitizeParams({ ...params, ...next });
    syncControls();
    scheduleRebuild();
  },
  getStats: () => ({ render: lastStats, paths: lastPathStats }),
};

window.addEventListener("beforeunload", () => {
  window.clearTimeout(rebuildTimer);
  renderer.dispose();
});
