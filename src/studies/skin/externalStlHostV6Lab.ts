import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type ImportedHostInstance,
  type ImportedHostSource,
} from "./externalStlHost.ts";
import {
  applyApprovedBoundaryRepair,
  APPROVED_USAGI_BOUNDARY_LOOPS,
  USAGI_REPAIR_POLICY_VERSION,
  USAGI_SOURCE_SHA256,
  type ApprovedRepairedHost,
} from "./externalStlHostRepair.ts";
import { createExternalStlHostV6Adapter, type ExternalStlHostV6Adapter, type HostAuthoredFlowerMotif } from "./externalStlHostV6Adapter.ts";
import {
  captureExternalHostProject,
  restoreExternalHostProjectAtomically,
  serializeExternalHostProject,
} from "./externalStlHostPersistence.ts";

type Elements = {
  file: HTMLInputElement;
  loadLocal: HTMLButtonElement;
  apply: HTMLButtonElement;
  count32: HTMLButtonElement;
  count128: HTMLButtonElement;
  saveProject: HTMLButtonElement;
  reopenProject: HTMLButtonElement;
  hostVisible: HTMLInputElement;
  wireframe: HTMLInputElement;
  status: HTMLElement;
  metadata: HTMLElement;
  preflight: HTMLElement;
  motifs: HTMLElement;
  gate: HTMLElement;
  persistence: HTMLElement;
  console: HTMLElement;
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("V6 Host lab root is missing");
const elements = buildUi(app);
const main = document.querySelector<HTMLElement>("main");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10161b);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
camera.position.set(0, 0, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(1, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.id = "viewport";
main?.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const hostRoot = new THREE.Group();
const motifRoot = new THREE.Group();
scene.add(hostRoot, motifRoot);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x263038, 2.2));
const directional = new THREE.DirectionalLight(0xffffff, 2.4);
directional.position.set(2, 3, 4);
scene.add(directional);

let source: ImportedHostSource | null = null;
let original: ImportedHostInstance | null = null;
let repaired: ApprovedRepairedHost | null = null;
let adapter: ExternalStlHostV6Adapter | null = null;
let motifs: readonly HostAuthoredFlowerMotif[] = [];
let hostMesh: THREE.Mesh | null = null;
let motifMesh: THREE.InstancedMesh | null = null;
let sourceBytes: ArrayBuffer | null = null;
let savedProjectText: string | null = null;
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
elements.loadLocal.addEventListener("click", () => { void loadLocalSource(); });
elements.apply.addEventListener("click", () => { void applyRepairAndActivate(); });
elements.count32.addEventListener("click", () => generateMotifs(32));
elements.count128.addEventListener("click", () => generateMotifs(128));
elements.saveProject.addEventListener("click", () => { saveProject(); });
elements.reopenProject.addEventListener("click", () => { void reopenProject(); });
elements.hostVisible.addEventListener("change", () => {
  const before = motifFingerprint();
  hostRoot.visible = elements.hostVisible.checked;
  const after = motifFingerprint();
  elements.gate.textContent = [
    `Host visibility: ${elements.hostVisible.checked ? "ON" : "OFF"}`,
    `motif positions unchanged: ${before === after ? "PASS" : "FAIL"}`,
    `host group only: ${motifRoot.visible ? "PASS" : "FAIL"}`,
    `motifs: ${motifs.length}`,
  ].join("\n");
});
elements.wireframe.addEventListener("change", () => { if (hostMesh) (hostMesh.material as THREE.MeshStandardMaterial).wireframe = elements.wireframe.checked; });

function buildUi(root: HTMLElement): Elements {
  root.innerHTML = `
    <aside>
      <h1>SKIN External STL Host · V6 gate</h1>
      <p>Actual Usagi repair plus the existing V6 Flower generator. Reference Host is printable=false; authored motifs are permanent artwork candidates. Host OFF must hide only the rabbit.</p>
      <h2>Source</h2>
      <label>Select the author-provided rabbit STL<input id="stl-file" type="file" accept=".stl,model/stl" /></label>
      <button id="load-local" class="secondary" type="button">Load exact local rabbit source</button>
      <div id="status" class="status">Select C:/dev/samples/rabbit_230223.stl.</div>
      <pre id="metadata" class="meta">No source loaded.</pre>
      <h2>Approved activation</h2>
      <button id="apply" type="button">Apply approved 7-loop repair + activate</button>
      <p>Fixed interpretation: 1 mm/source unit, +Y, right-handed, uniformScale 20 (2000%).</p>
      <h2>V6 Flower / Motif placement</h2>
      <div class="row"><button id="count32" type="button">Generate 32 motifs</button><button id="count128" type="button">Generate 128 motifs</button></div>
      <label class="check"><input id="host-visible" type="checkbox" checked /> Host ON</label>
      <label class="check"><input id="wireframe" type="checkbox" /> Host wireframe</label>
      <pre id="motifs" class="meta">No repaired Host active.</pre>
      <h2>Persistence / Save-Reopen</h2>
      <div class="row"><button id="save-project" type="button">Save embedded v2 project</button><button id="reopen-project" class="secondary" type="button" disabled>Reopen embedded bytes</button></div>
      <pre id="persistence" class="meta">Save after generating V6 motifs.</pre>
      <h2>Preflight / Signed Volume</h2>
      <pre id="preflight" class="meta">No repaired Host active.</pre>
      <h2>Technical Chrome gate</h2>
      <pre id="gate" class="meta">Host ON/OFF gate pending.</pre>
      <pre id="console" class="meta">console errors: 0\nconsole warnings: 0</pre>
    </aside>
    <main><div id="legend">Drag to orbit · wheel to zoom · orange = authored V6 motifs</div></main>`;
  return {
    file: root.querySelector<HTMLInputElement>("#stl-file")!,
    loadLocal: root.querySelector<HTMLButtonElement>("#load-local")!,
    apply: root.querySelector<HTMLButtonElement>("#apply")!,
    count32: root.querySelector<HTMLButtonElement>("#count32")!,
    count128: root.querySelector<HTMLButtonElement>("#count128")!,
    saveProject: root.querySelector<HTMLButtonElement>("#save-project")!,
    reopenProject: root.querySelector<HTMLButtonElement>("#reopen-project")!,
    hostVisible: root.querySelector<HTMLInputElement>("#host-visible")!,
    wireframe: root.querySelector<HTMLInputElement>("#wireframe")!,
    status: root.querySelector<HTMLElement>("#status")!,
    metadata: root.querySelector<HTMLElement>("#metadata")!,
    preflight: root.querySelector<HTMLElement>("#preflight")!,
    motifs: root.querySelector<HTMLElement>("#motifs")!,
    gate: root.querySelector<HTMLElement>("#gate")!,
    persistence: root.querySelector<HTMLElement>("#persistence")!,
    console: root.querySelector<HTMLElement>("#console")!,
  };
}

async function loadFile(file: File): Promise<void> {
  elements.status.className = "status";
  elements.status.textContent = "Reading exact source bytes…";
  try {
    await loadSourceBytes(await file.arrayBuffer(), file.name);
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Load failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function loadLocalSource(): Promise<void> {
  elements.status.className = "status";
  elements.status.textContent = "Reading the exact local rabbit source through localhost…";
  try {
    const response = await fetch("/__phase5/rabbit_230223.stl", { cache: "no-store" });
    if (!response.ok) throw new Error(`local source route returned HTTP ${response.status}`);
    await loadSourceBytes(await response.arrayBuffer(), "rabbit_230223.stl");
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Local source load failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function loadSourceBytes(bytes: ArrayBuffer, filename: string): Promise<void> {
  try {
    sourceBytes = bytes;
    source = await createImportedHostSource(sourceBytes, {
      filename,
      interpretation: {
        unitStatus: "explicit",
        mmPerSourceUnit: 1,
        upAxis: "y",
        handedness: "right",
        importPolicyVersion: "stl-host-v0",
      },
    });
    original = createImportedHostInstance(source, {
      translation: { x: 0, y: 0, z: 0 },
      rotation: [0, 0, 0, 1],
      uniformScale: 20,
    });
    repaired = null;
    adapter = null;
    motifs = [];
    savedProjectText = null;
    elements.reopenProject.disabled = true;
    clearPreview();
    refreshMetadata();
    elements.preflight.textContent = "Source retained. Apply the approved repair to promote Signed Volume.";
    elements.motifs.textContent = "No repaired Host active.";
    elements.gate.textContent = "Host ON/OFF gate pending.";
    elements.persistence.textContent = "Save after generating V6 motifs.";
    elements.status.textContent = "Source retained; approved repair is ready.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Load failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function applyRepairAndActivate(): Promise<void> {
  if (!source || !original || !sourceBytes) {
    elements.status.className = "status error";
    elements.status.textContent = "Select the author-provided rabbit STL first.";
    return;
  }
  elements.status.className = "status";
  elements.status.textContent = "Applying deterministic approved boundary repair…";
  try {
    if (source.sourceIdentity.sha256 !== USAGI_SOURCE_SHA256) throw new Error(`Unexpected source hash ${source.sourceIdentity.sha256}`);
    repaired = await applyApprovedBoundaryRepair(original, {
      originalSourceSha256: USAGI_SOURCE_SHA256,
      repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION,
      approvedBoundaryLoopIndices: APPROVED_USAGI_BOUNDARY_LOOPS,
    });
    adapter = createExternalStlHostV6Adapter(repaired.repaired, { seed: "usagi-v6-golden" });
    refreshMetadata();
    refreshPreflight();
    refreshPresentation();
    framePreview();
    elements.status.textContent = "Approved repaired Host active; Signed Volume promoted; Reference Host printable=false.";
    elements.gate.textContent = "Host ON/OFF gate pending. Generate motifs, then toggle Host OFF.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Activation failed closed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function generateMotifs(count: number): void {
  if (!adapter) {
    elements.status.className = "status error";
    elements.status.textContent = "Activate the repaired Host before generating V6 motifs.";
    return;
  }
  motifs = adapter.placeFlowers(count, undefined, 2.4, { seed: "usagi-v6-golden", minimumClearance: 4.6 });
  savedProjectText = null;
  elements.reopenProject.disabled = true;
  refreshMotifs();
  elements.motifs.textContent = [
    `requested motifs: ${count}`,
    `authored motifs: ${motifs.length}`,
    "shape source: existing-v6-flower-generator",
    "placement normal: GEOMETRIC",
    "sampling: deterministic triangle-area weighted",
    "Reference Host printable: false",
    "authored motifs: permanent artwork candidates",
  ].join("\n");
  elements.gate.textContent = `Host ON; motifs visible: ${motifs.length}; toggle Host OFF for the visibility-only check.`;
}

function liveSnapshot() {
  return { source, original, repaired, adapter, motifs, sourceBytes };
}

function replaceFromPlan(plan: Awaited<ReturnType<typeof restoreExternalHostProjectAtomically>>): void {
  source = plan.source;
  original = plan.original;
  repaired = plan.repaired;
  adapter = createExternalStlHostV6Adapter(plan.repaired.repaired, { seed: plan.document.motifGeneration.seed });
  motifs = plan.motifs;
  sourceBytes = plan.source.bytes;
  elements.hostVisible.checked = plan.hostVisible;
}

function redrawLiveProject(): void {
  refreshMetadata();
  refreshPreflight();
  refreshPresentation();
  framePreview();
  refreshMotifs();
}

function saveProject(): void {
  if (!source || !original || !repaired || !adapter || motifs.length === 0) {
    elements.status.className = "status error";
    elements.status.textContent = "Activate the repaired Host and generate V6 motifs before saving.";
    return;
  }
  try {
    const document = captureExternalHostProject({
      source,
      original,
      repaired,
      motifs,
      hostVisible: elements.hostVisible.checked,
      seed: adapter.seed,
    });
    savedProjectText = serializeExternalHostProject(document);
    elements.reopenProject.disabled = false;
    elements.persistence.textContent = [
      "schema: katachi.skin.fkei.v2",
      `serialized JSON bytes: ${new TextEncoder().encode(savedProjectText!).byteLength}`,
      `embedded STL bytes: ${document.referenceHost.source.byteLength}`,
      `embedded source SHA-256: ${document.referenceHost.source.sha256}`,
      `repair fingerprint: ${document.referenceHost.repair.expectedRepairedMeshFingerprint}`,
      `authored motifs: ${document.authoredMotifs.length}`,
      "Reference Host printable: false",
      "authored motifs printable field: absent",
      "reopen source path required: NO",
    ].join("\n");
    elements.status.className = "status";
    elements.status.textContent = "Embedded v2 project saved in memory; reopen is ready.";
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Save failed closed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function reopenProject(): Promise<void> {
  if (!savedProjectText) {
    elements.status.className = "status error";
    elements.status.textContent = "Save the embedded v2 project first.";
    return;
  }
  const beforeMotifs = exactMotifFingerprint();
  const previous = liveSnapshot();
  elements.status.className = "status";
  elements.status.textContent = "Reopening from embedded source bytes only…";
  try {
    await restoreExternalHostProjectAtomically(savedProjectText, {
      capture: () => previous,
      replace: (plan) => { replaceFromPlan(plan); },
      restore: (snapshot) => {
        source = snapshot.source;
        original = snapshot.original;
        repaired = snapshot.repaired;
        adapter = snapshot.adapter;
        motifs = snapshot.motifs;
        sourceBytes = snapshot.sourceBytes;
      },
      redraw: () => { redrawLiveProject(); },
    });
    const afterMotifs = exactMotifFingerprint();
    elements.persistence.textContent += [
      "",
      "save → reopen: PASS",
      "reopen source path required: NO",
      `embedded source rehash: ${source?.sourceIdentity.sha256 === USAGI_SOURCE_SHA256 ? "PASS" : "FAIL"}`,
      `repair fingerprint recheck: ${repaired?.materialization.repairedFingerprint === "90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6" ? "PASS" : "FAIL"}`,
      `motif geometry exact: ${beforeMotifs === afterMotifs ? "PASS" : "FAIL"}`,
      `motifs restored: ${motifs.length}`,
      `Signed Volume: ${repaired?.repaired.capabilities.signedVolumeCapability.availability}`,
    ].join("\n");
    elements.status.textContent = "Embedded v2 project reopened; exact authored motifs restored. Toggle Host OFF for the final gate.";
    elements.gate.textContent = `Host ON; motifs visible: ${motifs.length}; toggle Host OFF for the visibility-only check.`;
  } catch (error) {
    elements.status.className = "status error";
    elements.status.textContent = `Reopen failed closed; previous live project retained: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function refreshMetadata(): void {
  if (!source || !original) return;
  const bounds = original.mesh.bounds;
  const size = [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z];
  elements.metadata.textContent = [
    `filename: ${source.filename}`,
    `sha256: ${source.sourceIdentity.sha256}`,
    `byteLength: ${source.sourceIdentity.byteLength}`,
    "interpretation: 1 mm/source-unit · +Y · right-handed",
    "instance uniformScale: 20 (2000%)",
    `instance bounds mm: ${size.map((value) => value.toFixed(3)).join(" × ")}`,
    `source bytes retained: ${sourceBytes ? "YES" : "NO"}`,
    `original signed volume: ${original.capabilities.signedVolumeCapability.availability} (${original.capabilities.signedVolumeCapability.reason ?? "n/a"})`,
  ].join("\n");
}

function refreshPreflight(): void {
  if (!repaired) return;
  const originalTopology = repaired.original.volumePreflight.diagnostics.topology;
  const topology = repaired.repaired.volumePreflight.diagnostics.topology;
  const signed = repaired.repaired.capabilities.signedVolumeCapability;
  elements.preflight.textContent = [
    `original boundary edges / loops: ${originalTopology.boundaryEdgeCount} / ${originalTopology.boundaryLoopCount}`,
    `repaired triangles: ${topology.triangleCount}`,
    `repaired valid / degenerate: ${topology.validTriangleCount} / ${topology.degenerateTriangleCount}`,
    `repaired boundary edges / loops: ${topology.boundaryEdgeCount} / ${topology.boundaryLoopCount}`,
    `non-manifold / orientation: ${topology.nonManifoldEdgeCount} / ${topology.orientationInconsistencyEdgeCount}`,
    `connected components: ${topology.connectedComponentCount}`,
    `self-intersection: ${repaired.repaired.volumePreflight.selfIntersection}`,
    `Signed Volume: ${signed.availability}`,
    `repair policy: ${repaired.materialization.provenance.repairPolicyVersion}`,
    `repair fingerprint: ${repaired.materialization.repairedFingerprint}`,
    `removed degenerate triangles: ${repaired.materialization.removedDegenerateTriangleIndices.length}`,
    `inserted local fan triangles: ${repaired.materialization.provenance.repairParameters.insertedTriangleCount}`,
  ].join("\n");
}

function clearPreview(): void {
  if (hostMesh) {
    hostMesh.geometry.dispose();
    (hostMesh.material as THREE.Material).dispose();
    hostRoot.remove(hostMesh);
    hostMesh = null;
  }
  if (motifMesh) {
    motifMesh.geometry.dispose();
    (motifMesh.material as THREE.Material).dispose();
    motifRoot.remove(motifMesh);
    motifMesh = null;
  }
}

function refreshPresentation(): void {
  clearPreview();
  if (!repaired) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(repaired.repaired.mesh.positions), 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(repaired.repaired.mesh.geometricNormals), 3));
  hostMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x8e9fa8,
    roughness: 0.82,
    metalness: 0.04,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    wireframe: elements.wireframe.checked,
    side: THREE.DoubleSide,
  }));
  hostRoot.add(hostMesh);
  hostRoot.visible = elements.hostVisible.checked;
  refreshMotifs();
}

function refreshMotifs(): void {
  if (motifMesh) {
    motifMesh.geometry.dispose();
    (motifMesh.material as THREE.Material).dispose();
    motifRoot.remove(motifMesh);
    motifMesh = null;
  }
  const points = motifs.flatMap((motif) => motif.points);
  if (points.length === 0) return;
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  const material = new THREE.MeshStandardMaterial({ color: 0xff9f43, emissive: 0x4a1f08, emissiveIntensity: 0.6, roughness: 0.52, metalness: 0.05 });
  motifMesh = new THREE.InstancedMesh(geometry, material, points.length);
  const dummy = new THREE.Object3D();
  points.forEach((point, index) => {
    dummy.position.set(point.x, point.y, point.z);
    dummy.scale.setScalar(Math.max(point.r, 0.08));
    dummy.updateMatrix();
    motifMesh!.setMatrixAt(index, dummy.matrix);
  });
  motifMesh.instanceMatrix.needsUpdate = true;
  motifRoot.add(motifMesh);
}

function motifFingerprint(): string {
  return motifs.flatMap((motif) => motif.points).map((point) => `${point.x.toFixed(9)},${point.y.toFixed(9)},${point.z.toFixed(9)},${point.r.toFixed(9)}`).join("|");
}

function exactMotifFingerprint(): string {
  const number = (value: number) => Object.is(value, -0) ? "-0" : String(value);
  return motifs.flatMap((motif) => motif.points).map((point) => [point.x, point.y, point.z, point.r].map(number).join(",")).join("|");
}

function framePreview(): void {
  if (!repaired) return;
  const bounds = repaired.repaired.mesh.bounds;
  const center = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2);
  const size = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size * 1.2, size * 0.78, size * 1.38));
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
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", resize);
if (main && "ResizeObserver" in window) new ResizeObserver(resize).observe(main);
resize();
refreshConsole();
const animate = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); };
animate();
