import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type HostAxis,
  type HostHandedness,
  type HostSurfaceHit,
  type ImportedHostInstance,
  type ImportedHostSource,
} from "./externalStlHost.ts";
import { characterizeHostMesh, type HostMeshDiagnostics } from "./externalStlHostDiagnostics.ts";

type Elements = {
  file: HTMLInputElement;
  mm: HTMLInputElement;
  upAxis: HTMLSelectElement;
  handedness: HTMLSelectElement;
  tx: HTMLInputElement;
  ty: HTMLInputElement;
  tz: HTMLInputElement;
  rotationZ: HTMLInputElement;
  scale: HTMLInputElement;
  hostVisible: HTMLInputElement;
  wireframe: HTMLInputElement;
  normals: HTMLInputElement;
  apply: HTMLButtonElement;
  status: HTMLElement;
  metadata: HTMLElement;
  diagnostics: HTMLElement;
  console: HTMLElement;
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("External STL Host lab root is missing");

const elements = buildUi(app);
const main = document.querySelector<HTMLElement>("main");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11161b);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
camera.position.set(0, 0, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(1, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
main?.append(renderer.domElement);
renderer.domElement.id = "viewport";
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
const hostRoot = new THREE.Group();
scene.add(hostRoot);
const normalRoot = new THREE.Group();
scene.add(normalRoot);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x263038, 2.2));
const directional = new THREE.DirectionalLight(0xffffff, 2.4);
directional.position.set(2, 3, 4);
scene.add(directional);

let source: ImportedHostSource | null = null;
let instance: ImportedHostInstance | null = null;
let rawDiagnostics: HostMeshDiagnostics | null = null;
let metricDiagnostics: HostMeshDiagnostics | null = null;
let hostMesh: THREE.Mesh | null = null;
let normalLines: THREE.LineSegments | null = null;
let lastBytes: ArrayBuffer | null = null;

const consoleErrors: string[] = [];
const consoleWarnings: string[] = [];
const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
console.error = (...args: unknown[]) => { consoleErrors.push(args.map(String).join(" ")); originalConsoleError(...args); refreshConsole(); };
console.warn = (...args: unknown[]) => { consoleWarnings.push(args.map(String).join(" ")); originalConsoleWarn(...args); refreshConsole(); };
window.addEventListener("error", (event) => { consoleErrors.push(event.message); refreshConsole(); });
window.addEventListener("unhandledrejection", (event) => { consoleErrors.push(String(event.reason)); refreshConsole(); });

elements.file.addEventListener("change", () => {
  const file = elements.file.files?.[0];
  if (file) void loadFile(file);
});
elements.apply.addEventListener("click", () => { void activateMetricHost(); });
for (const control of [elements.hostVisible, elements.wireframe, elements.normals]) {
  control.addEventListener("change", refreshPresentation);
}
for (const control of [elements.tx, elements.ty, elements.tz, elements.rotationZ, elements.scale]) {
  control.addEventListener("change", () => { void activateMetricHost(); });
}

function buildUi(root: HTMLElement): Elements {
  root.innerHTML = `
    <aside>
      <h1>SKIN External STL Host Lab</h1>
      <p>Phase 2 diagnostic preview. The STL is Host / Shape Intent only. No persistence, V6 placement, shell, or BODY generation.</p>
      <h2>Source</h2>
      <label>Select STL<input id="stl-file" type="file" accept=".stl,model/stl" /></label>
      <div id="status" class="status">Select the author-provided Usagi STL.</div>
      <pre id="metadata" class="meta">No source loaded.</pre>
      <h2>Explicit interpretation</h2>
      <div class="row">
        <label>mm / source unit<input id="mm" type="number" min="0.0000001" step="any" placeholder="required" /></label>
        <label>up axis<select id="up-axis"><option value="y">+Y</option><option value="z">+Z</option><option value="x">+X</option></select></label>
      </div>
      <div class="row">
        <label>handedness<select id="handedness"><option value="right">right</option><option value="left">left</option></select></label>
        <label>&nbsp;<button id="apply" type="button">Activate metric Host</button></label>
      </div>
      <h2>Instance transform</h2>
      <div class="row">
        <label>translation X<input id="tx" type="number" step="any" value="0" /></label>
        <label>translation Y<input id="ty" type="number" step="any" value="0" /></label>
      </div>
      <div class="row">
        <label>translation Z<input id="tz" type="number" step="any" value="0" /></label>
        <label>rotation Z°<input id="rotation-z" type="number" step="any" value="0" /></label>
      </div>
      <label>uniform scale<input id="scale" type="number" min="0.000001" step="any" value="1" /></label>
      <h2>Preview</h2>
      <label class="check"><input id="host-visible" type="checkbox" checked /> Host ON</label>
      <label class="check"><input id="wireframe" type="checkbox" /> wireframe</label>
      <label class="check"><input id="normals" type="checkbox" /> sparse geometric normals</label>
      <h2>Derived diagnostics</h2>
      <pre id="diagnostics" class="meta">No metric Host active.</pre>
      <h2>Browser gate</h2>
      <pre id="console" class="meta">console errors: 0\nconsole warnings: 0</pre>
    </aside>
    <main><div id="legend">Drag to orbit · wheel to zoom</div></main>`;
  return {
    file: root.querySelector<HTMLInputElement>("#stl-file")!,
    mm: root.querySelector<HTMLInputElement>("#mm")!,
    upAxis: root.querySelector<HTMLSelectElement>("#up-axis")!,
    handedness: root.querySelector<HTMLSelectElement>("#handedness")!,
    tx: root.querySelector<HTMLInputElement>("#tx")!,
    ty: root.querySelector<HTMLInputElement>("#ty")!,
    tz: root.querySelector<HTMLInputElement>("#tz")!,
    rotationZ: root.querySelector<HTMLInputElement>("#rotation-z")!,
    scale: root.querySelector<HTMLInputElement>("#scale")!,
    hostVisible: root.querySelector<HTMLInputElement>("#host-visible")!,
    wireframe: root.querySelector<HTMLInputElement>("#wireframe")!,
    normals: root.querySelector<HTMLInputElement>("#normals")!,
    apply: root.querySelector<HTMLButtonElement>("#apply")!,
    status: root.querySelector<HTMLElement>("#status")!,
    metadata: root.querySelector<HTMLElement>("#metadata")!,
    diagnostics: root.querySelector<HTMLElement>("#diagnostics")!,
    console: root.querySelector<HTMLElement>("#console")!,
  };
}

async function loadFile(file: File): Promise<void> {
  elements.status.className = "status";
  elements.status.textContent = "Reading exact source bytes…";
  try {
    lastBytes = await file.arrayBuffer();
    source = await createImportedHostSource(lastBytes, {
      filename: file.name,
      interpretation: {
        unitStatus: "unresolved",
        upAxis: elements.upAxis.value as HostAxis,
        handedness: elements.handedness.value as HostHandedness,
        importPolicyVersion: "stl-host-v0",
      },
    });
    rawDiagnostics = characterizeHostMesh(source.parseRawMesh());
    instance = null;
    metricDiagnostics = null;
    clearPreview();
    refreshMetadata();
    elements.diagnostics.textContent = "Source loaded. Enter mmPerSourceUnit and activate the metric Host.";
    elements.status.textContent = "Source retained; metric Host is not active until interpretation is explicit.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Load failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function activateMetricHost(): Promise<void> {
  if (!lastBytes || !source) {
    elements.status.className = "status error";
    elements.status.textContent = "Select the author-provided Usagi STL first.";
    return;
  }
  const mm = Number(elements.mm.value);
  if (!(mm > 0) || !Number.isFinite(mm)) {
    elements.status.className = "status error";
    elements.status.textContent = "Metric Host activation requires an explicit positive mmPerSourceUnit.";
    return;
  }
  try {
    source = await createImportedHostSource(lastBytes, {
      filename: source.filename,
      interpretation: {
        unitStatus: "explicit",
        mmPerSourceUnit: mm,
        upAxis: elements.upAxis.value as HostAxis,
        handedness: elements.handedness.value as HostHandedness,
        importPolicyVersion: "stl-host-v0",
      },
    });
    instance = createImportedHostInstance(source, readInstanceTransform());
    metricDiagnostics = characterizeHostMesh(instance.mesh);
    refreshMetadata();
    refreshPresentation();
    framePreview();
    elements.status.className = "status";
    elements.status.textContent = "Metric Host active with explicit candidate interpretation; physical unit acceptance is pending.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Activation failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function readInstanceTransform() {
  const radians = Number(elements.rotationZ.value) * Math.PI / 180;
  return {
    translation: { x: Number(elements.tx.value), y: Number(elements.ty.value), z: Number(elements.tz.value) },
    rotation: [0, 0, Math.sin(radians / 2), Math.cos(radians / 2)] as const,
    uniformScale: Number(elements.scale.value),
  };
}

function boundsText(bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): string {
  const width = bounds.max.x - bounds.min.x;
  const depth = bounds.max.y - bounds.min.y;
  const height = bounds.max.z - bounds.min.z;
  return `min=(${bounds.min.x.toFixed(3)}, ${bounds.min.y.toFixed(3)}, ${bounds.min.z.toFixed(3)})\nmax=(${bounds.max.x.toFixed(3)}, ${bounds.max.y.toFixed(3)}, ${bounds.max.z.toFixed(3)})\nsize=(${width.toFixed(3)}, ${depth.toFixed(3)}, ${height.toFixed(3)})\nlongest=${Math.max(width, depth, height).toFixed(3)}`;
}

function refreshMetadata(): void {
  if (!source || !rawDiagnostics) return;
  const metric = instance?.mesh;
  const lines = [
    `filename: ${source.filename}`,
    `sha256: ${source.sourceIdentity.sha256}`,
    `byteLength: ${source.sourceIdentity.byteLength}`,
    `format: ${source.format}`,
    "",
    "source bounds (source units):",
    boundsText(rawDiagnostics.sourceBounds),
  ];
  if (metric) {
    lines.push(
      "",
      `interpretation: ${source.interpretation.mmPerSourceUnit} mm/source-unit`,
      "interpretation status: CANDIDATE (author acceptance pending)",
      `up-axis: +${source.interpretation.upAxis}`,
      `handedness: ${source.interpretation.handedness}`,
      "",
      "interpreted instance bounds (mm):",
      boundsText(metric.bounds),
    );
  } else {
    lines.push("", "interpretation: unresolved; metric bounds unavailable");
  }
  elements.metadata.textContent = lines.join("\n");
  if (metricDiagnostics && instance) refreshDiagnostics(metricDiagnostics, instance);
}

function refreshDiagnostics(diagnostics: HostMeshDiagnostics, activeInstance: ImportedHostInstance): void {
  const topology = diagnostics.topology;
  const normals = diagnostics.normals;
  const closest = runClosestProbes(activeInstance);
  const rays = runRayProbes(activeInstance);
  const thresholds = normals.thresholds.map((item) => `>${item.thresholdDeg}°: ${item.count} (${(item.fraction * 100).toFixed(2)}%)`).join("; ");
  elements.diagnostics.textContent = [
    `triangles: ${topology.triangleCount}`,
    `valid: ${topology.validTriangleCount}`,
    `degenerate: ${topology.degenerateTriangleCount}`,
    `welded vertices: ${topology.weldedVertexCount}`,
    `weld tolerance: ${topology.weldTolerance}`,
    `components: ${topology.connectedComponentCount}`,
    `boundary edges: ${topology.boundaryEdgeCount}`,
    `non-manifold edges: ${topology.nonManifoldEdgeCount}`,
    `orientation issues: ${topology.orientationInconsistencyEdgeCount}`,
    `watertight diagnostic: ${topology.watertightDiagnostic}`,
    "",
    `adjacent edges: ${normals.adjacentEdgeCount}`,
    `dihedral median / p90 / p95 / max: ${formatNullable(normals.medianDihedralDeg)} / ${formatNullable(normals.p90DihedralDeg)} / ${formatNullable(normals.p95DihedralDeg)} / ${formatNullable(normals.maximumDihedralDeg)}°`,
    `dihedral thresholds: ${thresholds || "none"}`,
    `normal policy evidence: ${normalPolicy(diagnostics)}`,
    "",
    `closestSurface: ${closest.pass ? "PASS" : "FAIL"} (${closest.hits}/${closest.total} probes)`,
    `raycast: ${rays.pass ? "PASS" : "FAIL"} (${rays.hits}/${rays.total} camera probes hit)`,
  ].join("\n");
}

function formatNullable(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}

function normalPolicy(diagnostics: HostMeshDiagnostics): string {
  const p95 = diagnostics.normals.p95DihedralDeg ?? 0;
  const sharpFraction = diagnostics.normals.thresholds.find((item) => item.thresholdDeg === 45)?.fraction ?? 0;
  return p95 > 70 || sharpFraction > 0.1 ? "SMOOTH-DERIVED candidate; retain geometricNormal" : "GEOMETRIC candidate; inspect actual motif scale";
}

function probeHitValid(hit: HostSurfaceHit, triangleCount: number): boolean {
  return hit.triangleIndex >= 0
    && hit.triangleIndex < triangleCount
    && Number.isFinite(hit.distance)
    && Number.isFinite(hit.position.x)
    && Number.isFinite(hit.position.y)
    && Number.isFinite(hit.position.z)
    && Number.isFinite(hit.geometricNormal.x)
    && Number.isFinite(hit.geometricNormal.y)
    && Number.isFinite(hit.geometricNormal.z)
    && hit.barycentric.every((value) => value >= -1e-6 && value <= 1 + 1e-6);
}

function runClosestProbes(activeInstance: ImportedHostInstance): { pass: boolean; hits: number; total: number } {
  const bounds = activeInstance.mesh.bounds;
  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const length = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  const probes = [
    { x: bounds.min.x - length, y: center.y, z: center.z },
    { x: bounds.max.x + length, y: center.y, z: center.z },
    { x: center.x, y: bounds.min.y - length, z: center.z },
    { x: center.x, y: bounds.max.y + length, z: center.z },
    { x: center.x, y: center.y, z: bounds.min.z - length },
    { x: center.x, y: center.y, z: bounds.max.z + length },
    center,
  ];
  let hits = 0;
  for (const probe of probes) {
    const first = activeInstance.query.closestSurface(probe);
    const second = activeInstance.query.closestSurface(probe);
    if (first && second && probeHitValid(first, activeInstance.mesh.triangleCount)
      && first.triangleIndex === second.triangleIndex
      && first.position.x === second.position.x
      && first.position.y === second.position.y
      && first.position.z === second.position.z) hits += 1;
  }
  return { pass: hits === probes.length, hits, total: probes.length };
}

function runRayProbes(activeInstance: ImportedHostInstance): { pass: boolean; hits: number; total: number } {
  const bounds = activeInstance.mesh.bounds;
  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const length = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) * 2;
  const rays = [
    { origin: { x: bounds.min.x - length, y: center.y, z: center.z }, direction: { x: 1, y: 0, z: 0 } },
    { origin: { x: bounds.max.x + length, y: center.y, z: center.z }, direction: { x: -1, y: 0, z: 0 } },
    { origin: { x: center.x, y: bounds.min.y - length, z: center.z }, direction: { x: 0, y: 1, z: 0 } },
    { origin: { x: center.x, y: bounds.max.y + length, z: center.z }, direction: { x: 0, y: -1, z: 0 } },
    { origin: { x: center.x, y: center.y, z: bounds.min.z - length }, direction: { x: 0, y: 0, z: 1 } },
    { origin: { x: center.x, y: center.y, z: bounds.max.z + length }, direction: { x: 0, y: 0, z: -1 } },
  ];
  let hits = 0;
  for (const ray of rays) {
    const hit = activeInstance.query.raycast(ray);
    if (hit && probeHitValid(hit, activeInstance.mesh.triangleCount)) hits += 1;
  }
  return { pass: hits > 0, hits, total: rays.length };
}

function clearPreview(): void {
  if (hostMesh) {
    hostMesh.geometry.dispose();
    (hostMesh.material as THREE.Material).dispose();
    hostRoot.remove(hostMesh);
    hostMesh = null;
  }
  if (normalLines) {
    normalLines.geometry.dispose();
    (normalLines.material as THREE.Material).dispose();
    normalRoot.remove(normalLines);
    normalLines = null;
  }
}

function refreshPresentation(): void {
  if (!instance) {
    clearPreview();
    return;
  }
  clearPreview();
  const positions = new Float32Array(instance.mesh.positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  hostMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x9aaab3, roughness: 0.82, metalness: 0.04, wireframe: elements.wireframe.checked, side: THREE.DoubleSide }));
  hostMesh.visible = elements.hostVisible.checked;
  hostRoot.add(hostMesh);
  normalLines = buildNormalLines(instance);
  normalLines.visible = elements.normals.checked;
  normalRoot.add(normalLines);
}

function buildNormalLines(activeInstance: ImportedHostInstance): THREE.LineSegments {
  const count = Math.min(activeInstance.mesh.triangleCount, 1500);
  const values: number[] = [];
  for (let triangle = 0; triangle < count; triangle += 1) {
    const offset = triangle * 9;
    const cx = (activeInstance.mesh.positions[offset] + activeInstance.mesh.positions[offset + 3] + activeInstance.mesh.positions[offset + 6]) / 3;
    const cy = (activeInstance.mesh.positions[offset + 1] + activeInstance.mesh.positions[offset + 4] + activeInstance.mesh.positions[offset + 7]) / 3;
    const cz = (activeInstance.mesh.positions[offset + 2] + activeInstance.mesh.positions[offset + 5] + activeInstance.mesh.positions[offset + 8]) / 3;
    const normalOffset = triangle * 3;
    const length = Math.max(activeInstance.mesh.bounds.max.x - activeInstance.mesh.bounds.min.x, activeInstance.mesh.bounds.max.y - activeInstance.mesh.bounds.min.y, activeInstance.mesh.bounds.max.z - activeInstance.mesh.bounds.min.z) * 0.012;
    values.push(cx, cy, cz, cx + activeInstance.mesh.geometricNormals[normalOffset] * length, cy + activeInstance.mesh.geometricNormals[normalOffset + 1] * length, cz + activeInstance.mesh.geometricNormals[normalOffset + 2] * length);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffc857 }));
}

function framePreview(): void {
  if (!instance) return;
  const bounds = instance.mesh.bounds;
  const center = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  );
  const size = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size * 1.25, size * 0.8, size * 1.45));
  camera.near = Math.max(size / 10000, 0.001);
  camera.far = Math.max(size * 100, 100);
  camera.updateProjectionMatrix();
}

function refreshConsole(): void {
  elements.console.textContent = `console errors: ${consoleErrors.length}${consoleErrors.length ? `\n${consoleErrors.slice(-3).join("\n")}` : ""}\nconsole warnings: ${consoleWarnings.length}${consoleWarnings.length ? `\n${consoleWarnings.slice(-3).join("\n")}` : ""}`;
}

function resize(): void {
  const width = Math.max(1, Math.floor(main?.getBoundingClientRect().width || window.innerWidth));
  const height = Math.max(1, Math.floor(window.innerHeight));
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", resize);
if (main && "ResizeObserver" in window) new ResizeObserver(resize).observe(main);
resize();
requestAnimationFrame(resize);
refreshConsole();
const animate = () => {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};
animate();
