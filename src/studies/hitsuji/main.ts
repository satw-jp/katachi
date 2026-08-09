import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import manifest from "./manifest.json";
import { createVersionRow } from "../../lib/ui/version.ts";
import {
  buildVariantGeometry,
  createPhaseField,
  type HitsujiParams,
  type HitsujiVariant,
} from "./deformation.ts";
import { HitsujiRenderer } from "./renderer.ts";
import "./style.css";

const DEFAULT_MODEL = `${import.meta.env.BASE_URL}models/hitsuji/hitsuji_260304.glb`;
const STORAGE_KEY = "katachi:hitsuji:v2";
const LEGACY_STORAGE_KEY = "katachi:hitsuji:v1";
const FLOW_DENSITY_MAX = 8;
const VARIANTS: HitsujiVariant[] = ["original", "differential-growth", "phase-separation", "flow-wool"];
const DEFAULT_PARAMS: HitsujiParams = {
  seed: 260304,
  differential: { amount: 0.72, patchScale: 1, contrast: 1, roughness: 0.35 },
  phase: { voidFraction: 0.34, domainScale: 1, steps: 34, inflation: 0.38, innerDepth: 0.24 },
  flow: { height: 0.82, density: 1, curl: 1, sharpness: 7 },
};

interface HitsujiRecipe {
  formatVersion: 2;
  studyId: "hitsuji";
  source: string;
  params: HitsujiParams;
}

interface LegacyHitsujiParams {
  seed?: number;
  strength?: number;
  scale?: number;
}

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

function loadStoredParams(): HitsujiParams {
  const fallback = structuredClone(DEFAULT_PARAMS);
  const finite = (value: unknown, fallbackValue: number, min: number, max: number) =>
    Number.isFinite(value) ? THREE.MathUtils.clamp(Number(value), min, max) : fallbackValue;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) ?? "";
    const parsed = JSON.parse(raw) as Partial<HitsujiParams> & LegacyHitsujiParams;
    if (!parsed.differential || !parsed.phase || !parsed.flow) {
      const legacyStrength = finite(parsed.strength, 0.82, 0, 1.5);
      const legacyScale = finite(parsed.scale, 1, 0.5, 2.2);
      return {
        ...fallback,
        seed: Number.isFinite(parsed.seed) ? Math.trunc(parsed.seed!) : fallback.seed,
        differential: { ...fallback.differential, amount: legacyStrength, patchScale: legacyScale },
        phase: { ...fallback.phase, domainScale: legacyScale },
        flow: { ...fallback.flow, height: legacyStrength, density: legacyScale },
      };
    }
    return {
      seed: Number.isFinite(parsed.seed) ? Math.trunc(parsed.seed!) : fallback.seed,
      differential: {
        amount: finite(parsed.differential.amount, fallback.differential.amount, 0, 1.5),
        patchScale: finite(parsed.differential.patchScale, fallback.differential.patchScale, 0.4, 3),
        contrast: finite(parsed.differential.contrast, fallback.differential.contrast, 0.25, 2.5),
        roughness: finite(parsed.differential.roughness, fallback.differential.roughness, 0, 1),
      },
      phase: {
        voidFraction: finite(parsed.phase.voidFraction, fallback.phase.voidFraction, 0, 0.75),
        domainScale: finite(parsed.phase.domainScale, fallback.phase.domainScale, 0.4, 2.8),
        steps: Math.round(finite(parsed.phase.steps, fallback.phase.steps, 0, 80)),
        inflation: finite(parsed.phase.inflation, fallback.phase.inflation, 0, 1.2),
        innerDepth: finite(parsed.phase.innerDepth, fallback.phase.innerDepth, 0, 1.2),
      },
      flow: {
        height: finite(parsed.flow.height, fallback.flow.height, 0, 1.5),
        density: finite(parsed.flow.density, fallback.flow.density, 0.5, FLOW_DENSITY_MAX),
        curl: finite(parsed.flow.curl, fallback.flow.curl, 0, 2),
        sharpness: finite(parsed.flow.sharpness, fallback.flow.sharpness, 1, 12),
      },
    };
  } catch {
    return fallback;
  }
}

let params = loadStoredParams();
let sourceLabel = "作者の hitsuji_260304.glb";
let baseGeometry: THREE.BufferGeometry | null = null;
let rebuildFrame = 0;

const app = document.getElementById("app")!;
const viewport = element("div");
viewport.id = "viewport";
const panel = element("aside", "panel");
app.append(viewport, panel);
const renderer = new HitsujiRenderer(viewport);

panel.appendChild(element("div", "panel-title", "羊に原理を作用させる"));
panel.appendChild(createVersionRow(manifest.version, manifest.updatedAt));

const nav = element("nav", "nav-row");
const studiesLink = element("a", "nav-link", "← Study 一覧");
studiesLink.href = "studies.html";
const phenomenonLink = element("a", "nav-link", "現象を見る →");
phenomenonLink.href = "hitsuji-field.html";
nav.append(studiesLink, phenomenonLink);
panel.appendChild(nav);

panel.appendChild(
  element(
    "p",
    "hint",
    "同じ羊・同じ尺度・同じ視点で、加工前／差分成長／相分離／流れの違いを見る。画面をドラッグして4者を同時に回せます。",
  ),
);

panel.appendChild(element("div", "section-label", "入力（元データは変更しない）"));
const fileInput = element("input");
fileInput.type = "file";
fileInput.accept = ".glb,model/gltf-binary";
fileInput.setAttribute("aria-label", "比較するGLBを選ぶ");
panel.appendChild(fileInput);

function addRange(
  parent: HTMLElement,
  id: string,
  labelText: string,
  min: number,
  max: number,
  step: number,
  value: () => number,
  apply: (next: number) => void,
): void {
  const row = element("div", "control-row");
  const label = element("label", undefined, labelText);
  const input = element("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value());
  const out = element("output", undefined, value().toFixed(step < 1 ? 2 : 0));
  label.htmlFor = id;
  input.id = id;
  input.addEventListener("input", () => {
    const next = Number(input.value);
    apply(next);
    out.value = next.toFixed(step < 1 ? 2 : 0);
    scheduleRebuild();
  });
  row.append(label, input, out);
  parent.appendChild(row);
}

function addPrincipleSection(title: string, note: string): HTMLDetailsElement {
  const details = element("details", "principle-controls");
  details.open = true;
  details.appendChild(element("summary", undefined, title));
  details.appendChild(element("p", "principle-note", note));
  panel.appendChild(details);
  return details;
}

function addStageLabel(parent: HTMLElement, step: number, title: string): void {
  parent.appendChild(element("div", "stage-label", `${step}　${title}`));
}

const seedRow = element("div", "control-row");
const seedLabel = element("label", undefined, "Seed");
const seedInput = element("input");
seedInput.type = "number";
seedInput.value = String(params.seed);
seedInput.id = "seed-input";
seedLabel.htmlFor = seedInput.id;
seedInput.addEventListener("change", () => {
  params.seed = Math.trunc(Number(seedInput.value) || 0);
  seedInput.value = String(params.seed);
  scheduleRebuild();
});
seedRow.append(seedLabel, seedInput, element("span"));
panel.appendChild(seedRow);

const growthSection = addPrincipleSection("差分成長", "場所ごとの成長量の差を、膨らみの分布として制御する。");
addStageLabel(growthSection, 1, "場をつくる");
addRange(growthSection, "growth-scale", "成長域の細かさ", 0.4, 3, 0.01, () => params.differential.patchScale, (value) => {
  params.differential.patchScale = value;
});
addRange(growthSection, "growth-roughness", "表面のむら", 0, 1, 0.01, () => params.differential.roughness, (value) => {
  params.differential.roughness = value;
});
addStageLabel(growthSection, 2, "表面で読む");
addRange(growthSection, "growth-contrast", "成長差", 0.25, 2.5, 0.01, () => params.differential.contrast, (value) => {
  params.differential.contrast = value;
});
addStageLabel(growthSection, 3, "形へ作用");
addRange(growthSection, "growth-amount", "成長量", 0, 1.5, 0.01, () => params.differential.amount, (value) => {
  params.differential.amount = value;
});

const phaseSection = addPrincipleSection("相分離", "二相の片方を残し、もう片方を表面から除いて穴にする。");
addStageLabel(phaseSection, 1, "場をつくる");
addRange(phaseSection, "phase-scale", "相の大きさ", 0.4, 2.8, 0.01, () => params.phase.domainScale, (value) => {
  params.phase.domainScale = value;
});
addRange(phaseSection, "phase-steps", "まとまりの時間", 0, 80, 1, () => params.phase.steps, (value) => {
  params.phase.steps = Math.round(value);
});
addStageLabel(phaseSection, 2, "表面で読む");
addRange(phaseSection, "phase-void", "穴の量", 0, 0.75, 0.01, () => params.phase.voidFraction, (value) => {
  params.phase.voidFraction = value;
});
addStageLabel(phaseSection, 3, "形へ作用");
addRange(phaseSection, "phase-inflation", "外側への膨らみ", 0, 1.2, 0.01, () => params.phase.inflation, (value) => {
  params.phase.inflation = value;
});
addRange(phaseSection, "phase-inner-depth", "内側への厚み", 0, 1.2, 0.01, () => params.phase.innerDepth, (value) => {
  params.phase.innerDepth = value;
});

const flowSection = addPrincipleSection("流れに沿う羊毛化", "曲がる方向場に沿った稜線を、表面の盛り上がりとして制御する。");
addStageLabel(flowSection, 1, "場をつくる");
addRange(flowSection, "flow-density", "毛束の密度", 0.5, FLOW_DENSITY_MAX, 0.01, () => params.flow.density, (value) => {
  params.flow.density = value;
});
addRange(flowSection, "flow-curl", "流れの曲がり", 0, 2, 0.01, () => params.flow.curl, (value) => {
  params.flow.curl = value;
});
addStageLabel(flowSection, 2, "表面で読む");
addRange(flowSection, "flow-sharpness", "稜線の細さ", 1, 12, 0.1, () => params.flow.sharpness, (value) => {
  params.flow.sharpness = value;
});
addStageLabel(flowSection, 3, "形へ作用");
addRange(flowSection, "flow-height", "毛束の高さ", 0, 1.5, 0.01, () => params.flow.height, (value) => {
  params.flow.height = value;
});

const viewButtons = element("div", "button-row");
const resetParams = element("button", undefined, "全パラメータを初期値へ");
resetParams.type = "button";
resetParams.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PARAMS));
  location.reload();
});
const resetView = element("button", undefined, "視点を戻す");
resetView.type = "button";
resetView.addEventListener("click", () => renderer.resetView());
const rotateButton = element("button", undefined, "自動回転");
rotateButton.type = "button";
let autoRotate = false;
rotateButton.addEventListener("click", () => {
  autoRotate = !autoRotate;
  renderer.setAutoRotate(autoRotate);
  rotateButton.classList.toggle("primary", autoRotate);
  rotateButton.textContent = autoRotate ? "回転を止める" : "自動回転";
});
viewButtons.append(resetParams, resetView, rotateButton);
panel.appendChild(viewButtons);

const recipeButtons = element("div", "button-row");
const saveRecipe = element("button", undefined, "設定JSONを保存");
saveRecipe.type = "button";
const loadRecipeLabel = element("button", undefined, "設定JSONを読込");
loadRecipeLabel.type = "button";
const recipeInput = element("input");
recipeInput.type = "file";
recipeInput.accept = ".json,application/json";
recipeInput.hidden = true;
loadRecipeLabel.addEventListener("click", () => recipeInput.click());
recipeButtons.append(saveRecipe, loadRecipeLabel, recipeInput);
panel.appendChild(recipeButtons);

panel.appendChild(
  element(
    "div",
    "method-note",
    "差分成長と流れは法線方向変位の素描。相分離は外側の面・内側の面・穴の縁を接続した殻です。体積内で相分離した形ではなく、自己交差や印刷可能性の判定、加工形状の保存はまだ行いません。",
  ),
);
const status = element("div", "status", "作者の羊を読み込んでいます…");
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
panel.appendChild(status);

function scheduleRebuild(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  cancelAnimationFrame(rebuildFrame);
  rebuildFrame = requestAnimationFrame(rebuild);
}

function rebuild(): void {
  if (!baseGeometry) return;
  const startedAt = performance.now();
  status.textContent = "3つの作用を同じ羊へ計算中…";
  const phaseField = createPhaseField(params.seed, params.phase.steps);
  const geometries = {} as Record<HitsujiVariant, THREE.BufferGeometry>;
  for (const variant of VARIANTS) {
    geometries[variant] = buildVariantGeometry(baseGeometry, variant, params, phaseField);
  }
  renderer.setGeometries(geometries);
  const triangles = baseGeometry.index
    ? baseGeometry.index.count / 3
    : baseGeometry.getAttribute("position").count / 3;
  const phaseGeometry = geometries["phase-separation"];
  const phaseStats = phaseGeometry.userData.hitsujiPhase as { removedPercent?: number } | undefined;
  const removedPercent = phaseStats?.removedPercent ?? 0;
  status.textContent =
    `${sourceLabel} · ${triangles.toLocaleString("ja-JP")} triangles · ` +
    `相分離 ${params.phase.steps}stepで${removedPercent.toFixed(1)}%を開口 · Seed ${params.seed} · ` +
    `${Math.round(performance.now() - startedAt)}ms`;
}

function normalizedGeometryFromGltf(gltf: { scene: THREE.Group }): THREE.BufferGeometry {
  gltf.scene.updateMatrixWorld(true);
  const sourceMeshes: THREE.Mesh[] = [];
  gltf.scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) sourceMeshes.push(object as THREE.Mesh);
  });
  const sourceMesh = sourceMeshes[0];
  if (!sourceMesh) throw new Error("GLB内にメッシュがありません");

  let geometry = sourceMesh.geometry.clone();
  geometry.applyMatrix4(sourceMesh.matrixWorld);
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();

  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = 2.05 / Math.max(size.x, size.y, size.z);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.translate(0, -1.08 - geometry.boundingBox!.min.y, 0);
  // The GLB stores every triangle corner separately. Displacing those corners
  // along even slightly different normals opens microscopic cracks. Weld only
  // identical positions into a comparison topology, then derive one smooth
  // normal per shared vertex. UV/material seams are intentionally irrelevant:
  // every panel uses the same neutral study material.
  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute("position", geometry.getAttribute("position").clone());
  if (geometry.getIndex()) positionOnly.setIndex(geometry.getIndex()!.clone());
  const welded = mergeVertices(positionOnly, 1e-5);
  geometry.dispose();
  geometry = welded;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function loadArrayBuffer(buffer: ArrayBuffer, label: string): void {
  status.textContent = `${label} を解析中…`;
  new GLTFLoader().parse(
    buffer,
    "",
    (gltf) => {
      baseGeometry?.dispose();
      baseGeometry = normalizedGeometryFromGltf(gltf);
      sourceLabel = label;
      scheduleRebuild();
    },
    (error) => {
      status.textContent = `読込に失敗しました: ${String(error)}`;
    },
  );
}

async function loadDefaultModel(): Promise<void> {
  try {
    const response = await fetch(DEFAULT_MODEL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    loadArrayBuffer(await response.arrayBuffer(), sourceLabel);
  } catch (error) {
    status.textContent = `作者の羊を読み込めませんでした: ${(error as Error).message}`;
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    loadArrayBuffer(await file.arrayBuffer(), file.name);
  } catch (error) {
    status.textContent = `読込に失敗しました: ${(error as Error).message}`;
  }
});

saveRecipe.addEventListener("click", () => {
  const recipe: HitsujiRecipe = {
    formatVersion: 2,
    studyId: "hitsuji",
    source: sourceLabel,
    params: { ...params },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hitsuji-principles-seed-${params.seed}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

recipeInput.addEventListener("change", async () => {
  const file = recipeInput.files?.[0];
  if (!file) return;
  try {
    const recipe = JSON.parse(await file.text()) as {
      formatVersion?: number;
      studyId?: string;
      params?: HitsujiParams | LegacyHitsujiParams;
    };
    if (recipe.studyId !== "hitsuji" || !recipe.params || (recipe.formatVersion !== 1 && recipe.formatVersion !== 2)) {
      throw new Error("hitsuji の設定JSONではありません");
    }
    if (recipe.formatVersion === 1) {
      const legacy = recipe.params as LegacyHitsujiParams;
      const legacyStrength = Number.isFinite(legacy.strength) ? Number(legacy.strength) : 0.82;
      const legacyScale = Number.isFinite(legacy.scale) ? Number(legacy.scale) : 1;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...params,
          seed: Number.isFinite(legacy.seed) ? Math.trunc(Number(legacy.seed)) : params.seed,
          differential: { ...params.differential, amount: legacyStrength, patchScale: legacyScale },
          phase: { ...params.phase, domainScale: legacyScale },
          flow: { ...params.flow, height: legacyStrength, density: legacyScale },
        }),
      );
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe.params));
    }
    location.reload();
  } catch (error) {
    status.textContent = `設定JSONを読めませんでした: ${(error as Error).message}`;
  }
});

void loadDefaultModel();
