import * as THREE from "three";
import { coinBulgeSides, type SkinParams } from "./field.ts";

const TAU = Math.PI * 2;

export interface FlowerConnectionPreviewModel {
  mode: "separate" | "fused";
  expansion: number;
  flowerScale: number;
  centerGap: number;
  overlap: number;
}

/** A small explanatory model for the Step 4 preview. It deliberately shows
 * the direction of the authored control rather than pretending to reproduce
 * the later curved-surface packing result. */
export function flowerConnectionPreviewModel(params: SkinParams): FlowerConnectionPreviewModel {
  const expansion = Math.max(0, Math.min(2, params.flowerExpansion));
  const fused = params.surfaceGenerationMode === "randomPack" && params.flowerConnectionMode === "fused";
  const flowerScale = fused ? 0.88 + expansion * 0.16 : 0.88;
  const centerGap = fused ? Math.max(0, 18 - expansion * 13) : 24;
  return {
    mode: fused ? "fused" : "separate",
    expansion,
    flowerScale,
    centerGap,
    overlap: fused ? Math.max(0, expansion - 0.55) : 0,
  };
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rotation = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), rotation, 0, TAU);
}

function drawCoin(ctx: CanvasRenderingContext2D, p: SkinParams, cx: number, cy: number, size: number): void {
  const irregularity = p.irregularity;
  const hole = Math.max(0, Math.min(0.95, p.coinHoleRatio ?? 0));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    const wobble = 1 + irregularity * (0.08 * Math.sin(a * 3 + 0.7) + 0.055 * Math.sin(a * 5 - 0.4));
    const r = size * wobble;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.88;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (hole > 1e-6) {
    // Opposite winding + even-odd fill makes the preview an actual annulus,
    // not a dark dot painted on top of a solid coin.
    for (let i = 64; i >= 0; i--) {
      const a = (i / 64) * TAU;
      const x = Math.cos(a) * size * hole;
      const y = Math.sin(a) * size * hole * 0.88;
      if (i === 64) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  const bulge = Math.min(1, p.coinBulge / 0.32);
  const balance = Math.max(-1, Math.min(1, p.coinBulgeBalance));
  const highlightShift = -size * (0.28 + balance * 0.12);
  const gradient = ctx.createRadialGradient(highlightShift, -size * 0.32, size * 0.08, 0, 0, size * 1.18);
  gradient.addColorStop(0, `rgba(255,250,218,${0.95 + bulge * 0.05})`);
  gradient.addColorStop(0.55, "#d7aa64");
  gradient.addColorStop(1, bulge > 0 ? "#75431f" : "#9a6835");
  ctx.fillStyle = gradient;
  ctx.shadowColor = `rgba(0,0,0,${0.2 + bulge * 0.35})`;
  ctx.shadowBlur = 10 + bulge * 20;
  ctx.shadowOffsetY = 5 + bulge * 8;
  ctx.fill("evenodd");
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,235,190,0.72)";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (hole > 1e-6) {
    ctx.beginPath();
    ctx.ellipse(0, 0, size * hole, size * hole * 0.88, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlatRing(ctx: CanvasRenderingContext2D, p: SkinParams, cx: number, cy: number, size: number): void {
  const n = Math.max(4, Math.round(p.ringNodeCount));
  const hole = Math.max(0.08, Math.min(0.82, p.flatRingHoleRatio));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#d9b06b";
  ctx.strokeStyle = "rgba(255,239,202,0.75)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const orbit = size * (0.48 + hole * 0.38);
    const node = size * (0.53 - hole * 0.38) * (1 + p.ringWobbleR * 0.08 * Math.sin(i * 1.71));
    ellipse(ctx, Math.cos(a) * orbit, Math.sin(a) * orbit * 0.86, node, node * 0.9);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawRing3d(ctx: CanvasRenderingContext2D, p: SkinParams, cx: number, cy: number, size: number, orbitScale = 1): void {
  const n = Math.max(4, Math.round(p.ringNodeCount));
  const tube = size * (0.11 + Math.min(0.25, p.ringTubeR) * 0.9);
  const drawHalf = (back: boolean) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const isBack = Math.sin(a) < 0;
      if (isBack !== back) continue;
      const wobble = 1 + p.ringWobblePos * 0.08 * Math.sin(i * 2.37 + 0.4);
      const x = cx + Math.cos(a) * size * 0.72 * wobble * orbitScale;
      const y = cy + Math.sin(a) * size * 0.42 * wobble * orbitScale;
      const rr = tube * (1 + p.ringWobbleR * 0.12 * Math.sin(i * 1.91));
      const gradient = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.35, rr * 0.1, x, y, rr);
      gradient.addColorStop(0, back ? "#d9c9a8" : "#fff1c9");
      gradient.addColorStop(1, back ? "#68553c" : "#a66f32");
      ellipse(ctx, x, y, rr, rr);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = back ? "rgba(255,255,255,0.15)" : "rgba(255,245,210,0.7)";
      ctx.stroke();
    }
  };
  drawHalf(true);
  drawHalf(false);
}

function drawFlower(ctx: CanvasRenderingContext2D, p: SkinParams, cx: number, cy: number, size: number): void {
  const petals = Math.max(3, Math.round(p.flowerPetalCount));
  const opening = (p.flowerOpening - 0.72) / 0.5;
  const cup = Math.max(-0.18, Math.min(0.5, p.flowerCupping));
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU - Math.PI / 2;
    const growth = 1 + p.flowerGrowthDifference * 0.45 * Math.sin(i * 2.17 + 0.6);
    const radial = size * (0.42 + opening * 0.14) * growth;
    const px = cx + Math.cos(a) * radial;
    const py = cy + Math.sin(a) * radial * (0.9 - cup * 0.18);
    const length = size * (0.58 + opening * 0.15) * growth;
    const width = size * (0.2 + p.flowerNeck * 0.2);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a + Math.PI / 2);
    const gradient = ctx.createRadialGradient(-width * 0.3, -length * 0.25, width * 0.1, 0, 0, length * 0.72);
    gradient.addColorStop(0, "#fff0dc");
    gradient.addColorStop(0.62, "#e89a86");
    gradient.addColorStop(1, cup > 0.12 ? "#7e3440" : "#a84f59");
    ellipse(ctx, 0, 0, width, length * 0.5);
    ctx.fillStyle = gradient;
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 8 + Math.max(0, cup) * 14;
    ctx.shadowOffsetY = 3 + Math.max(0, cup) * 7;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,231,220,0.68)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }
  if (p.flowerShowCore) {
    const core = size * (0.2 + p.flowerCoreSize * 0.25);
    const lift = Math.max(-0.12, Math.min(0.5, p.flowerCoreLift));
    const gradient = ctx.createRadialGradient(cx - core * 0.3, cy - core * 0.35, core * 0.1, cx, cy, core);
    gradient.addColorStop(0, "#fff3ad");
    gradient.addColorStop(1, lift > 0.1 ? "#9f5628" : "#c88135");
    ellipse(ctx, cx, cy - lift * size * 0.08, core, core * 0.92);
    ctx.fillStyle = gradient;
    ctx.shadowColor = "rgba(0,0,0,0.36)";
    ctx.shadowBlur = 8 + Math.max(0, lift) * 18;
    ctx.shadowOffsetY = 3 + Math.max(0, lift) * 8;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,245,190,0.8)";
    ctx.stroke();
  }
}

export function renderFlowerConnectionPreview(
  canvas: HTMLCanvasElement,
  p: SkinParams,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#171b22");
  bg.addColorStop(1, "#0d1015");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  if (p.patchShape !== "flower" || p.surfaceGenerationMode !== "randomPack") {
    ctx.fillStyle = "rgba(255,255,255,0.68)";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("接続図はランダムPACKの花を選ぶと表示されます", 24, height / 2);
    return;
  }
  drawFlowerConnectionDiagram(ctx, p, width, height);
}

function drawFlowerConnectionDiagram(
  ctx: CanvasRenderingContext2D,
  p: SkinParams,
  width: number,
  height: number,
): void {
  const model = flowerConnectionPreviewModel(p);
  const panelTop = 10;
  const panelHeight = height - 20;
  ctx.save();
  ctx.fillStyle = "rgba(6,9,13,0.88)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(12, panelTop, width - 24, panelHeight, 8);
  ctx.fill();
  ctx.stroke();

  const label = model.mode === "fused"
    ? `一体の花（融合）  ${model.expansion.toFixed(2)}`
    : "離して並べる  （融合なし）";
  ctx.fillStyle = model.mode === "fused" ? "#8ce7d8" : "rgba(255,255,255,0.72)";
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText(label, 24, panelTop + 25);
  ctx.fillStyle = "rgba(255,255,255,0.52)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("ランダムPACKで隣り合う花の関係", 24, panelTop + 47);

  const flowerSize = panelHeight * 0.18 * model.flowerScale;
  const pairWidth = flowerSize * 4 + model.centerGap;
  const startX = width - 26 - pairWidth;
  const centerY = panelTop + panelHeight * 0.58;
  if (model.mode === "fused" && model.overlap > 0) {
    const glow = ctx.createRadialGradient(width - 26 - pairWidth / 2, centerY, 2, width - 26 - pairWidth / 2, centerY, flowerSize * 1.05);
    glow.addColorStop(0, `rgba(90,232,209,${Math.min(0.58, 0.18 + model.overlap * 0.22)})`);
    glow.addColorStop(1, "rgba(90,232,209,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(startX - flowerSize, centerY - flowerSize, pairWidth + flowerSize * 2, flowerSize * 2);
  }
  drawFlower(ctx, p, startX + flowerSize, centerY, flowerSize);
  drawFlower(ctx, p, startX + flowerSize * 3 + model.centerGap, centerY, flowerSize);
  ctx.restore();
}

interface PreviewSphere {
  x: number;
  y: number;
  z: number;
  r: number;
  core?: boolean;
}

function previewSpheres(params: SkinParams, ringOrbitScale = 1): PreviewSphere[] {
  if (params.patchShape === "flatRing" || params.patchShape === "ring3d") {
    const count = Math.max(4, Math.round(params.ringNodeCount));
    const flat = params.patchShape === "flatRing";
    const orbit = flat ? 0.62 + params.flatRingHoleRatio * 0.34 : 0.78;
    const baseRadius = flat ? Math.max(0.12, 0.52 - params.flatRingHoleRatio * 0.34) : 0.16 + params.ringTubeR * 1.55;
    return Array.from({ length: count }, (_, index) => {
      const a = (index / count) * TAU;
      const positionWobble = flat ? 1 : 1 + params.ringWobblePos * 0.1 * Math.sin(index * 2.37 + 0.4);
      const orbitScale = flat ? 1 : ringOrbitScale;
      return {
        x: Math.cos(a) * orbit * positionWobble * orbitScale,
        y: Math.sin(a) * orbit * positionWobble * orbitScale,
        z: flat ? 0 : Math.sin(a * 2) * 0.16 * orbitScale,
        r: baseRadius * (1 + params.ringWobbleR * 0.12 * Math.sin(index * 1.91)),
      };
    });
  }
  if (params.patchShape === "coin") {
    const hole = Math.max(0, Math.min(0.95, params.coinHoleRatio ?? 0));
    const sides = coinBulgeSides(params.coinBulge, params.coinBulgeBalance);
    const averageBulge = (sides.front + sides.back) / 2;
    const zShift = (sides.front - sides.back) * 1.45;
    if (hole > 1e-6) {
      const tube = Math.max(0.055, (1 - hole) * 0.5);
      const orbit = 1 - tube;
      const count = Math.max(16, Math.min(96, Math.ceil((Math.PI * 2 * orbit) / (tube * 1.65))));
      return Array.from({ length: count }, (_, index) => {
        const a = (index / count) * TAU;
        const uneven = params.irregularity * (1 - hole) * 0.12;
        const wave = 1 + uneven * (0.58 * Math.sin(a * 3 + 0.7) + 0.42 * Math.sin(a * 5 - 0.4));
        return {
          x: Math.cos(a) * orbit * wave,
          y: Math.sin(a) * orbit * wave,
          z: Math.sin(a * 3) * uneven * 0.1 + zShift * 0.45,
          r: tube + averageBulge * 0.45,
        };
      });
    }
    const edgeCount = 15;
    const spheres: PreviewSphere[] = [{
      x: 0, y: 0, z: zShift, r: 0.58 + averageBulge * 0.9,
    }];
    for (let index = 0; index < edgeCount; index++) {
      const a = (index / edgeCount) * TAU;
      const wobble = 1 + params.irregularity * (0.08 * Math.sin(a * 3 + 0.7) + 0.055 * Math.sin(a * 5 - 0.4));
      spheres.push({
        x: Math.cos(a) * 0.64 * wobble,
        y: Math.sin(a) * 0.64 * wobble,
        z: Math.sin(a * 3) * params.irregularity * 0.035 + zShift * 0.35,
        r: 0.28 + averageBulge * 0.32,
      });
    }
    return spheres;
  }
  const petals = Math.max(3, Math.round(params.flowerPetalCount));
  const opening = (params.flowerOpening - 0.72) / 0.5;
  const spheres: PreviewSphere[] = [];
  for (let index = 0; index < petals; index++) {
    const a = (index / petals) * TAU;
    const growth = 1 + params.flowerGrowthDifference * 0.4 * Math.sin(index * 2.17 + 0.6);
    for (let segment = 0; segment < 3; segment++) {
      const t = (segment + 1) / 3;
      const distance = (0.26 + opening * 0.08 + t * 0.58) * growth;
      spheres.push({
        x: Math.cos(a) * distance,
        y: Math.sin(a) * distance,
        z: params.flowerCupping * t * 0.42,
        r: (0.25 - segment * 0.025 + params.flowerNeck * 0.05) * growth,
      });
    }
  }
  if (params.flowerShowCore) {
    spheres.push({ x: 0, y: 0, z: params.flowerCoreLift * 0.45, r: 0.28 + params.flowerCoreSize * 0.22, core: true });
  }
  return spheres;
}

class MotifPreview3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.01, 100);
  private readonly group = new THREE.Group();
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xdca47f, roughness: 0.62, metalness: 0.02 });
  private readonly coreMaterial = new THREE.MeshStandardMaterial({ color: 0xe7bd55, roughness: 0.55, metalness: 0.03 });
  private dragging = false;
  private previousX = 0;
  private previousY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.setClearColor(0x10131a, 1);
    this.camera.position.set(0, 0, 4.2);
    this.scene.add(new THREE.HemisphereLight(0xfff2dd, 0x1b2940, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 4, 5);
    const basePlane = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 64),
      new THREE.MeshStandardMaterial({ color: 0x50616d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, roughness: 1 }),
    );
    basePlane.position.z = -0.18;
    this.scene.add(key, basePlane, this.group);
    this.group.rotation.set(-0.48, 0.58, 0.08);
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.previousX = event.clientX;
      this.previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      this.group.rotation.y += (event.clientX - this.previousX) * 0.012;
      this.group.rotation.x += (event.clientY - this.previousY) * 0.012;
      this.previousX = event.clientX;
      this.previousY = event.clientY;
      this.render();
    });
    const stopDrag = (event: PointerEvent) => {
      this.dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerup", stopDrag);
    canvas.addEventListener("pointercancel", stopDrag);
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.camera.position.z = Math.max(2.4, Math.min(6.2, this.camera.position.z + event.deltaY * 0.004));
      this.render();
    }, { passive: false });
  }

  update(params: SkinParams, ringOrbitScale = 1): void {
    for (const child of [...this.group.children]) this.group.remove(child);
    for (const sphere of previewSpheres(params, ringOrbitScale)) {
      const mesh = new THREE.Mesh(this.sphereGeometry, sphere.core ? this.coreMaterial : this.bodyMaterial);
      mesh.position.set(sphere.x, sphere.y, sphere.z);
      mesh.scale.setScalar(Math.max(0.03, sphere.r));
      this.group.add(mesh);
    }
    const placement = params.motifPlacement ?? "surface";
    this.group.position.z = placement === "inside" ? -0.48 : placement === "center" ? -0.12 : 0.22;
    this.render();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

const motifPreview3d = new WeakMap<HTMLCanvasElement, MotifPreview3D>();

export function enableMotifPreview3D(canvas: HTMLCanvasElement): void {
  if (motifPreview3d.has(canvas)) return;
  motifPreview3d.set(canvas, new MotifPreview3D(canvas));
}

export function renderMotifPreview(canvas: HTMLCanvasElement, params: SkinParams, ringOrbitScale = 1): void {
  const preview3d = motifPreview3d.get(canvas);
  if (preview3d) {
    preview3d.update(params, ringOrbitScale);
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#171b22");
  bg.addColorStop(1, "#0d1015");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  for (let r = 44; r < Math.min(w, h); r += 44) {
    ellipse(ctx, w / 2, h / 2 - 4, r, r);
    ctx.stroke();
  }

  const cx = w / 2;
  const cy = h / 2 - 4;
  const size = Math.min(w, h) * 0.27;
  if (params.patchShape === "coin") drawCoin(ctx, params, cx, cy, size);
  else if (params.patchShape === "flatRing") drawFlatRing(ctx, params, cx, cy, size);
  else if (params.patchShape === "ring3d") drawRing3d(ctx, params, cx, cy, size, ringOrbitScale);
  else drawFlower(ctx, params, cx, cy, size);
}
