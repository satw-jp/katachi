import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshBuildResult } from "../../cloud-sculpt/meshExport.ts";
import { buildSkinMesh } from "../meshExport.ts";
import type { InternalStructureGraph, Vector3Value } from "../voronoi.ts";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "./fkei.ts";
import {
  analyzeSpiderGraphCleanupLab,
  type SpiderGraphCleanupLabReport,
  type SpiderGraphTerminal,
} from "./spiderGraphCleanupLab.ts";
import {
  studySpiderGraphSimplification,
  type SpiderEdgeSimplificationDecision,
  type SpiderSimplificationLevel,
  type SpiderSimplificationLevelResult,
} from "./spiderGraphSimplificationLab.ts";
import {
  studyTerminalPreservingNetworkTopology,
  type SpiderTerminalTopologyLevelResult,
  type SpiderTerminalTopologyStudy,
  type SpiderTopologyLevel,
  type SpiderTopologyNodeDecision,
} from "./spiderGraphTerminalTopologyLab.ts";
import "./spiderGraphComparisonLab.css";

type ComparisonMode = "raw" | "clean" | "raw-clean" | "result" | "clean-result";
type NetworkStudyKind = "edge-removal" | "node-topology";
type MarkerLayer = "retained" | "collapsed" | "merge" | "overlap" | "contact" | "motif";

const BASELINE_SHA256 = "4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf";
const SAMPLE_URL = "./samples/skin-rebuild-first-print.fkei";

function vector(point: Vector3Value): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function graphNode(graph: InternalStructureGraph, id: number): Vector3Value {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`graph node ${id} is missing`);
  return node.position;
}

function linePositions(graph: InternalStructureGraph): number[] {
  return graph.edges.flatMap((edge) => {
    const start = graphNode(graph, edge.start);
    const end = graphNode(graph, edge.end);
    return [start.x, start.y, start.z, end.x, end.y, end.z];
  });
}

function edgeLinePositions(graph: InternalStructureGraph, edgeIds: ReadonlySet<number>): number[] {
  return graph.edges.filter((edge) => edgeIds.has(edge.id)).flatMap((edge) => {
    const start = graphNode(graph, edge.start);
    const end = graphNode(graph, edge.end);
    return [start.x, start.y, start.z, end.x, end.y, end.z];
  });
}

function polylinePositions(points: readonly Vector3Value[]): number[] {
  const positions: number[] = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
  }
  return positions;
}

function pointsGeometry(points: readonly Vector3Value[]): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(points.map(vector));
}

function lineSegments(positions: readonly number[], color: number, opacity: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 10;
  return lines;
}

function pointCloud(points: readonly Vector3Value[], color: number, size: number, opacity = 1): THREE.Points {
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: opacity < 1,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
  const cloud = new THREE.Points(pointsGeometry(points), material);
  cloud.renderOrder = 14;
  return cloud;
}

function surfaceMesh(result: MeshBuildResult): THREE.Mesh {
  const positions = new Float32Array(result.triangles.length * 9);
  let offset = 0;
  for (const triangle of result.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[offset++] = point.x;
      positions[offset++] = point.y;
      positions[offset++] = point.z;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x87919d,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
}

class SpiderGraphComparisonRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.001, 1000);
  private readonly controls: OrbitControls;
  private readonly content = new THREE.Group();
  private readonly rawLayer = new THREE.Group();
  private readonly cleanLayer = new THREE.Group();
  private readonly simplifiedLayer = new THREE.Group();
  private readonly removedLayer = new THREE.Group();
  private readonly markerLayers = new Map<MarkerLayer, THREE.Group>();
  private readonly selectedLayer = new THREE.Group();
  private mode: ComparisonMode = "clean-result";
  private cleanGraph: InternalStructureGraph | null = null;
  private observer: ResizeObserver;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x0b0d11, 1);
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.scene.add(new THREE.HemisphereLight(0xe9eef4, 0x151923, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(4, 7, 6);
    this.scene.add(key, this.content);
    this.content.add(
      this.rawLayer,
      this.cleanLayer,
      this.simplifiedLayer,
      this.removedLayer,
      this.selectedLayer,
    );
    for (const name of ["retained", "collapsed", "merge", "overlap", "contact", "motif"] as const) {
      const layer = new THREE.Group();
      this.markerLayers.set(name, layer);
      this.content.add(layer);
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.animate();
  }

  install(
    report: SpiderGraphCleanupLabReport,
    topologyStudy: SpiderTerminalTopologyStudy,
    surface: MeshBuildResult,
    terminals: readonly SpiderGraphTerminal[],
  ): void {
    this.rawLayer.clear();
    this.cleanLayer.clear();
    this.simplifiedLayer.clear();
    this.removedLayer.clear();
    this.selectedLayer.clear();
    for (const layer of this.markerLayers.values()) layer.clear();
    this.cleanGraph = report.cleanupCandidate;

    const ghostSurface = surfaceMesh(surface);
    ghostSurface.name = "surface-context-no-spider";
    this.content.add(ghostSurface);

    this.rawLayer.add(
      lineSegments(linePositions(report.rawGraph), 0x40bce5, 0.72),
      pointCloud(report.rawGraph.nodes.map((node) => node.position), 0x69d8f7, 0.018, 0.72),
    );

    // Clean topology is the authority here. Straight interpolation is only
    // this Lab's current realization of each topological endpoint pair.
    const cleanPositions = report.cleanTopology.edges.flatMap((edge) => {
      const start = report.cleanTopology.nodes[edge.startNodeId].position;
      const end = report.cleanTopology.nodes[edge.endNodeId].position;
      return [start.x, start.y, start.z, end.x, end.y, end.z];
    });
    this.cleanLayer.add(lineSegments(cleanPositions, 0xf2c75c, 0.94));
    this.markerLayers.get("retained")!.add(pointCloud(
      report.cleanTopology.nodes.map((node) => node.position), 0xf1eee4, 0.035,
    ));

    const collapsedIds = new Set(report.provenance.edges.flatMap((edge) => edge.collapsedRawNodeIds));
    this.markerLayers.get("collapsed")!.add(pointCloud(
      report.rawGraph.nodes.filter((node) => collapsedIds.has(node.id)).map((node) => node.position),
      0xff5fb4,
      0.03,
    ));

    const mergePositions: number[] = [];
    const mergePoints: Vector3Value[] = [];
    for (const finding of report.findings.nearlyCoincidentNodes) {
      const first = graphNode(report.rawGraph, finding.firstNodeId);
      const second = graphNode(report.rawGraph, finding.secondNodeId);
      mergePositions.push(first.x, first.y, first.z, second.x, second.y, second.z);
      mergePoints.push(first, second);
    }
    this.markerLayers.get("merge")!.add(
      lineSegments(mergePositions, 0xff8c42, 1),
      pointCloud(mergePoints, 0xff8c42, 0.065),
    );

    const overlapPositions = report.findings.collinearOverlaps.flatMap((finding) => {
      const edge = report.rawGraph.edges.find((candidate) => candidate.id === finding.firstEdgeId)!;
      const start = graphNode(report.rawGraph, edge.start);
      const end = graphNode(report.rawGraph, edge.end);
      return [start.x, start.y, start.z, end.x, end.y, end.z];
    });
    this.markerLayers.get("overlap")!.add(lineSegments(overlapPositions, 0xff4c4c, 1));

    this.markerLayers.get("contact")!.add(pointCloud(
      report.findings.edgeIntersections.map((finding) => finding.position),
      0xd8ff62,
      0.055,
    ));

    const motifPoints = terminals.filter((terminal) => terminal.role === "motif").map((terminal) => terminal.position);
    const supportPoints = terminals.filter((terminal) => terminal.role === "support-target").map((terminal) => terminal.position);
    this.markerLayers.get("motif")!.add(
      pointCloud(motifPoints, 0xffffff, 0.04),
      pointCloud(supportPoints, 0x78f0a7, 0.06),
    );

    const box = new THREE.Box3().setFromPoints(report.rawGraph.nodes.map((node) => vector(node.position)));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z, 1);
    this.content.position.set(-center.x, -center.y, -center.z);
    this.camera.position.set(longest * 0.95, longest * 0.65, longest * 1.05);
    this.camera.near = longest / 1000;
    this.camera.far = longest * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = longest * 0.35;
    this.controls.maxDistance = longest * 8;
    this.controls.update();
    this.setTerminalTopology(topologyStudy.levels.medium, topologyStudy);
    this.setMode(this.mode);
  }

  setSimplification(result: SpiderSimplificationLevelResult): void {
    this.simplifiedLayer.clear();
    this.removedLayer.clear();
    const retained = new Set(result.retainedEdgeIds);
    const removed = new Set(result.removedEdgeIds);
    this.simplifiedLayer.add(
      lineSegments(edgeLinePositions(result.graph, retained), 0x70e5a0, 0.98),
      pointCloud(result.graph.nodes.map((node) => node.position), 0xd8ffe6, 0.027, 0.88),
    );
    this.removedLayer.add(lineSegments(edgeLinePositions(this.cleanGraph!, removed), 0xff6b63, 1));
    this.setMode(this.mode);
  }

  setTerminalTopology(
    result: SpiderTerminalTopologyLevelResult,
    study: SpiderTerminalTopologyStudy,
  ): void {
    this.simplifiedLayer.clear();
    this.removedLayer.clear();
    const realizationPositions = result.topology.edges.flatMap((edge) =>
      polylinePositions(edge.realizationIntent.controlPoints));
    this.simplifiedLayer.add(
      lineSegments(realizationPositions, 0x70e5a0, 0.98),
      pointCloud(result.topology.nodes.map((node) => node.position), 0xcaf7d8, 0.026, 0.82),
    );

    const cleanNodePositions = new Map(this.cleanGraph!.nodes.map((node) => [node.id, node.position]));
    const removedPoints = result.contractedNodeIds.map((id) => cleanNodePositions.get(id)!).filter(Boolean);
    const rewiredChords = result.topology.edges
      .filter((edge) => edge.provenance.contractedCleanNodeIds.length > 0)
      .flatMap((edge) => {
        const start = result.topology.nodes.find((node) => node.id === edge.startNodeId)!.position;
        const end = result.topology.nodes.find((node) => node.id === edge.endNodeId)!.position;
        return [start.x, start.y, start.z, end.x, end.y, end.z];
      });
    const motifTerminals = result.topology.nodes.filter((node) =>
      node.terminalRoles.includes("motif") && !node.terminalRoles.includes("support-target"));
    const supportTerminals = result.topology.nodes.filter((node) => node.terminalRoles.includes("support-target"));
    const nearbyJunctionLines = study.findings.nearbyJunctions.flatMap((finding) => {
      const start = cleanNodePositions.get(finding.firstCleanNodeId)!;
      const end = cleanNodePositions.get(finding.secondCleanNodeId)!;
      return [start.x, start.y, start.z, end.x, end.y, end.z];
    });
    this.removedLayer.add(
      lineSegments(rewiredChords, 0xffa34d, 0.82),
      pointCloud(removedPoints, 0xff5fb4, 0.052, 1),
      pointCloud(motifTerminals.map((node) => node.position), 0xffffff, 0.052, 1),
      pointCloud(supportTerminals.map((node) => node.position), 0x78f0a7, 0.068, 1),
      lineSegments(nearbyJunctionLines, 0xff8c42, 0.24),
    );
    this.setMode(this.mode);
  }

  setMode(mode: ComparisonMode): void {
    this.mode = mode;
    this.rawLayer.visible = mode === "raw" || mode === "raw-clean";
    this.cleanLayer.visible = mode === "clean" || mode === "raw-clean" || mode === "clean-result";
    this.simplifiedLayer.visible = mode === "result" || mode === "clean-result";
    this.removedLayer.visible = mode === "result" || mode === "clean-result";
    const rawMaterial = this.rawLayer.children[0] && (this.rawLayer.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
    if (rawMaterial) rawMaterial.opacity = mode === "raw" ? 0.9 : 0.28;
    const cleanMaterial = this.cleanLayer.children[0] && (this.cleanLayer.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
    if (cleanMaterial) cleanMaterial.opacity = mode === "clean" ? 0.94 : mode === "raw-clean" ? 0.74 : 0.32;
  }

  setMarkerVisible(layer: MarkerLayer, visible: boolean): void {
    const group = this.markerLayers.get(layer);
    if (group) group.visible = visible;
  }

  highlightCleanEdge(edgeId: number): void {
    this.selectedLayer.clear();
    const graph = this.cleanGraph;
    const edge = graph?.edges.find((candidate) => candidate.id === edgeId);
    if (!graph || !edge) return;
    const start = graphNode(graph, edge.start);
    const end = graphNode(graph, edge.end);
    this.selectedLayer.add(lineSegments(
      [start.x, start.y, start.z, end.x, end.y, end.z],
      0xffffff,
      1,
    ));
  }

  highlightCleanNode(nodeId: number, edge?: { controlPoints: Vector3Value[] }): void {
    this.selectedLayer.clear();
    const node = this.cleanGraph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    this.selectedLayer.add(pointCloud([node.position], 0xffffff, 0.09, 1));
    if (edge) this.selectedLayer.add(lineSegments(polylinePositions(edge.controlPoints), 0xffffff, 1));
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    window.requestAnimationFrame(this.animate);
  };
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function buildShell(app: HTMLElement): void {
  app.innerHTML = `
    <div class="lab-shell">
      <header class="lab-header">
        <div class="lab-title">
          <h1>SKIN NETWORK LAB</h1>
          <p>Terminal-preserving topology / Edge density study</p>
        </div>
        <div class="lab-freeze-badge">SHADOW ONLY · production geometry unchanged</div>
        <div class="study-switch" role="group" aria-label="Network laboratory study">
          <button type="button" data-study="edge-removal" aria-pressed="false">Edge Density</button>
          <button type="button" data-study="node-topology" aria-pressed="true">Node Topology</button>
        </div>
        <div class="mode-switch" role="group" aria-label="Graph comparison mode">
          <button type="button" data-mode="raw" aria-pressed="false">Raw</button>
          <button type="button" data-mode="clean" aria-pressed="false">Clean</button>
          <button type="button" data-mode="raw-clean" aria-pressed="false">Raw / Clean</button>
          <button type="button" data-mode="result" id="result-mode-label" aria-pressed="false">Topology</button>
          <button type="button" data-mode="clean-result" id="clean-result-mode-label" aria-pressed="true">Clean / Topology</button>
        </div>
        <div class="level-switch" role="group" aria-label="Author simplification level">
          <button type="button" data-level="none" aria-pressed="false">None</button>
          <button type="button" data-level="low" aria-pressed="false">Low</button>
          <button type="button" data-level="medium" aria-pressed="true">Medium</button>
          <button type="button" data-level="high" aria-pressed="false">High</button>
        </div>
      </header>
      <main class="lab-main">
        <aside class="lab-panel">
          <h2>Graph facts</h2>
          <div class="stat-grid" id="graph-stats">
            <span></span><span class="head">Raw</span><span class="head">Clean</span><span class="head" id="result-stat-label">Topology</span>
            <span>Nodes</span><span class="raw" id="raw-nodes">—</span><span class="clean" id="clean-nodes">—</span><span class="simplified" id="simplified-nodes">—</span>
            <span>Edges</span><span class="raw" id="raw-edges">—</span><span class="clean" id="clean-edges">—</span><span class="simplified" id="simplified-edges">—</span>
            <span>Components</span><span class="raw" id="raw-components">—</span><span class="clean" id="clean-components">—</span><span class="simplified" id="simplified-components">—</span>
            <span>Motif</span><span class="raw" id="raw-motif">—</span><span class="clean" id="clean-motif">—</span><span class="simplified" id="simplified-motif">—</span>
            <span>Support</span><span class="raw" id="raw-support">—</span><span class="clean" id="clean-support">—</span><span class="simplified" id="simplified-support">—</span>
          </div>
          <h2 style="margin-top: 16px">Layers</h2>
          <div class="result-legend" id="result-legend"></div>
          <div class="legend">
            <label><input type="checkbox" data-layer="retained" checked /><span class="swatch retained"></span>retained nodes</label>
            <label><input type="checkbox" data-layer="collapsed" checked /><span class="swatch collapsed"></span>collapsed degree-2</label>
            <label><input type="checkbox" data-layer="merge" checked /><span class="swatch merge"></span>near-node merge</label>
            <label><input type="checkbox" data-layer="overlap" checked /><span class="swatch overlap"></span>duplicate / overlap</label>
            <label><input type="checkbox" data-layer="contact" checked /><span class="swatch contact"></span>endpoint contact</label>
            <label><input type="checkbox" data-layer="motif" checked /><span class="swatch motif"></span>Motif <span class="swatch support"></span>support target</label>
          </div>
        </aside>
        <section class="viewport-wrap" aria-label="Clean and topology-simplified Spider Graph comparison viewport">
          <div id="network-lab-viewport"></div>
          <div class="viewport-caption" id="mode-caption">Clean / Topology · Clean gold / realized path green / rewired chord orange. Drag to orbit, wheel to zoom.</div>
        </section>
        <aside class="lab-panel is-right">
          <h2 id="decision-title">Node decision</h2>
          <select class="provenance-select" id="study-decision" aria-label="Network Study decision"></select>
          <div class="provenance-card" id="decision-detail">Loading…</div>
          <ul class="finding-list" id="finding-list"></ul>
        </aside>
      </main>
      <footer class="lab-status" id="lab-status" data-ready="false">
        <span id="status-text">Baselineを読み込んでいます…</span>
        <code id="baseline-sha">SHA-256 …</code>
      </footer>
    </div>`;
}

async function start(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app was not found");
  buildShell(app);
  const viewport = document.getElementById("network-lab-viewport");
  const status = document.getElementById("lab-status");
  const statusText = document.getElementById("status-text");
  if (!viewport || !status || !statusText) throw new Error("Lab shell is incomplete");
  const renderer = new SpiderGraphComparisonRenderer(viewport);

  try {
    const response = await fetch(SAMPLE_URL);
    if (!response.ok) throw new Error(`baseline fetch failed: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const actualSha = await sha256(bytes);
    if (actualSha !== BASELINE_SHA256) throw new Error(`baseline SHA mismatch: ${actualSha}`);
    document.getElementById("baseline-sha")!.textContent = `SHA-256 ${actualSha}`;
    const documentValue = parseSkinRebuildFkei(new TextDecoder().decode(bytes));
    const project = projectFromSkinRebuildFkei(documentValue);
    const supportTargetIds = new Set(project.latticeConnections.map((connection) => connection.targetPatchId));
    const terminals: SpiderGraphTerminal[] = [
      ...project.patternSides.map((side) => ({
        id: `motif:${side.patchId}`,
        role: "motif" as const,
        position: { ...side.insidePosition },
      })),
      ...project.patternSides.filter((side) => supportTargetIds.has(side.patchId)).map((side) => ({
        id: `support-target:${side.patchId}`,
        role: "support-target" as const,
        position: { ...side.insidePosition },
      })),
    ];
    const report = analyzeSpiderGraphCleanupLab(project.lattice, terminals);
    const edgeStudy = studySpiderGraphSimplification(report, terminals);
    const topologyStudy = studyTerminalPreservingNetworkTopology(report, terminals);
    statusText.textContent = "Surface contextを作成しています…（Spiderは含めません）";
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const surface = buildSkinMesh(
      "plate",
      project.base.host,
      project.base.hostK,
      project.settings.surfaceThickness,
      project.patterns,
      project.settings.roundK,
      { resolution: project.settings.analysisResolution, targetLongestMm: project.settings.targetLongestMm },
      0,
      0,
      0,
      null,
    );
    renderer.install(report, topologyStudy, surface, terminals);

    const setText = (id: string, value: string | number): void => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    };
    setText("raw-nodes", report.rawStats.nodeCount);
    setText("clean-nodes", report.candidateStats.nodeCount);
    setText("raw-edges", report.rawStats.edgeCount);
    setText("clean-edges", report.candidateStats.edgeCount);
    setText("raw-components", report.rawStats.connectedComponents);
    setText("clean-components", report.candidateStats.connectedComponents);
    setText("raw-motif", `${report.rawStats.motifConnectivity.connectedCount}/38`);
    setText("clean-motif", `${report.candidateStats.motifConnectivity.connectedCount}/38`);
    setText("raw-support", `${report.rawStats.supportTargetConnectivity.connectedCount}/20`);
    setText("clean-support", `${report.candidateStats.supportTargetConnectivity.connectedCount}/20`);

    let activeStudy: NetworkStudyKind = "node-topology";
    let activeLevel: SpiderSimplificationLevel & SpiderTopologyLevel = "medium";
    let activeMode: ComparisonMode = "clean-result";
    const caption = (mode: ComparisonMode): string => {
      if (mode === "raw") return "Raw · cyan 251 nodes / 270 edges. Generator outputをそのまま観察。";
      if (mode === "clean") return "Clean · gold 101 nodes / 118 topological edges。";
      if (mode === "raw-clean") return "Raw / Clean · Raw cyan（薄） / Cleanup gold。TASK 16の対応を確認。";
      if (activeStudy === "edge-removal") {
        return mode === "result"
          ? "Edge Simplified · retained green / author removal red。production未採用。"
          : "Clean / Edge Simplified · Clean gold（薄） / retained green / removed red。";
      }
      return mode === "result"
        ? "Topology · realized polyline green / removed Node magenta / rewired chord orange / terminals white+green。"
        : "Clean / Topology · Clean gold（薄） / realized path green / rewired chord orange。";
    };
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode as ComparisonMode;
        activeMode = mode;
        renderer.setMode(mode);
        for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        }
        document.getElementById("mode-caption")!.textContent = caption(mode);
        status.dataset.mode = mode;
      });
    }
    for (const checkbox of document.querySelectorAll<HTMLInputElement>("[data-layer]")) {
      checkbox.addEventListener("change", () => {
        renderer.setMarkerVisible(checkbox.dataset.layer as MarkerLayer, checkbox.checked);
      });
    }

    const select = document.getElementById("study-decision") as HTMLSelectElement;
    const detail = document.getElementById("decision-detail")!;
    let activeEdgeResult = edgeStudy.levels.medium;
    let activeTopologyResult = topologyStudy.levels.medium;
    const edgeDecisionOrder = (decisions: readonly SpiderEdgeSimplificationDecision[]): SpiderEdgeSimplificationDecision[] =>
      [...decisions].sort((first, second) => {
        const statusOrder = { removed: 0, "retained-by-level": 1, rejected: 2 } as const;
        return statusOrder[first.status] - statusOrder[second.status]
          || (first.removalOrder ?? Infinity) - (second.removalOrder ?? Infinity)
          || second.removalScore - first.removalScore
          || first.edgeId - second.edgeId;
      });
    const topologyDecisionOrder = (decisions: readonly SpiderTopologyNodeDecision[]): SpiderTopologyNodeDecision[] =>
      [...decisions].sort((first, second) => {
        const statusOrder = {
          contracted: 0,
          "retained-by-level": 1,
          "rejected-cycle": 2,
          "protected-terminal": 3,
          "protected-junction": 4,
          "protected-critical": 5,
        } as const;
        return statusOrder[first.status] - statusOrder[second.status]
          || (first.contractionOrder ?? Infinity) - (second.contractionOrder ?? Infinity)
          || first.cleanNodeId - second.cleanNodeId;
      });
    const showEdgeDecision = (): void => {
      const cleanEdgeId = Number(select.value);
      const decision = activeEdgeResult.decisions.find((entry) => entry.edgeId === cleanEdgeId)!;
      const lineage = report.provenance.edges.find((edge) => edge.cleanEdgeId === cleanEdgeId)!;
      const realization = report.cleanEdgeRealizations.find((entry) => entry.edgeId === cleanEdgeId)!;
      const edge = report.cleanTopology.edges.find((entry) => entry.id === cleanEdgeId)!;
      const path = decision.alternativePath
        ? `Edges <code>${decision.alternativePath.edgeIds.join(" → ")}</code><br />`
          + `${decision.alternativePath.hopCount} hops · ${decision.alternativePath.detourRatio.toFixed(2)}x detour`
        : "none (bridge)";
      detail.innerHTML = `<strong>Clean Edge ${cleanEdgeId} · ${decision.status}</strong><br />`
        + `topology: Node ${edge.startNodeId} ↔ ${edge.endNodeId}<br />`
        + `realization: <code>${realization.kind}</code> · radius ${realization.radius}<br />`
        + `removal score: <code>${decision.removalScore.toFixed(1)}</code> / criticality: <code>${decision.criticality.toFixed(3)}</code><br />`
        + `<span class="detail-label">alternative path</span><br />${path}<br />`
        + `<span class="detail-label">decision</span><br />${decision.reasons.join("<br />")}<br />`
        + `<span class="detail-label">provenance</span><br />Raw Edges: <code>${lineage.rawEdgeIds.join(", ")}</code><br />`
        + `Collapsed Raw Nodes: <code>${lineage.collapsedRawNodeIds.join(", ") || "none"}</code>`;
      renderer.highlightCleanEdge(cleanEdgeId);
    };
    const showTopologyDecision = (): void => {
      const cleanNodeId = Number(select.value);
      const decision = activeTopologyResult.decisions.find((entry) => entry.cleanNodeId === cleanNodeId)!;
      const classification = topologyStudy.classifications.find((entry) => entry.cleanNodeId === cleanNodeId)!;
      const replacement = activeTopologyResult.topology.edges.find((edge) =>
        edge.provenance.contractedCleanNodeIds.includes(cleanNodeId));
      const metrics = decision.metrics
        ? `bend <code>${decision.metrics.localBendDeg.toFixed(2)}°</code> · max <code>${decision.metrics.resultMaximumBendDeg.toFixed(2)}°</code><br />`
          + `polyline/chord <code>${decision.metrics.resultDetourRatio.toFixed(3)}x</code> · intent cost <code>${decision.metrics.intentCost.toFixed(3)}</code>`
        : "not evaluated (absolute terminal / junction / endpoint)";
      const rewiring = replacement
        ? `<strong>${replacement.id}</strong><br />`
          + `${replacement.startNodeId} ↔ ${replacement.endNodeId}<br />`
          + `realization: <code>${replacement.realizationIntent.kind}</code> · control Clean Nodes <code>${replacement.realizationIntent.controlCleanNodeIds.join(" → ")}</code><br />`
          + `Clean Edges: <code>${replacement.provenance.cleanEdgeIds.join(", ")}</code><br />`
          + `Raw Edges: <code>${replacement.provenance.rawEdgeIds.join(", ")}</code><br />`
          + `Contracted Clean Nodes: <code>${replacement.provenance.contractedCleanNodeIds.join(", ")}</code>`
        : "none; Node identity retained";
      detail.innerHTML = `<strong>Clean Node ${cleanNodeId} · ${decision.status}</strong><br />`
        + `classification: <code>${classification.kind}</code> · degree ${classification.degree} · articulation ${classification.articulation}<br />`
        + `terminal roles: <code>${classification.terminalRoles.join("+") || "none"}</code><br />`
        + `<span class="detail-label">contraction metrics</span><br />${metrics}<br />`
        + `<span class="detail-label">decision</span><br />${decision.reasons.join("<br />")}<br />`
        + `<span class="detail-label">rewiring / realization intent</span><br />${rewiring}<br />`
        + `<span class="detail-label">Node provenance</span><br />Raw Nodes: <code>${decision.rawNodeIds.join(", ") || "none"}</code>`;
      renderer.highlightCleanNode(cleanNodeId, replacement?.realizationIntent);
    };
    const showDecision = (): void => {
      if (activeStudy === "edge-removal") showEdgeDecision();
      else showTopologyDecision();
    };
    const installEdgeDecisionOptions = (): void => {
      select.innerHTML = "";
      for (const decision of edgeDecisionOrder(activeEdgeResult.decisions)) {
        const option = document.createElement("option");
        option.value = String(decision.edgeId);
        const state = decision.status === "removed" ? `removed #${decision.removalOrder}`
          : decision.status === "rejected" ? "reject"
            : "optional";
        option.textContent = `Edge ${decision.edgeId} · ${state} · score ${decision.removalScore.toFixed(1)}`;
        select.appendChild(option);
      }
      select.value = String(edgeDecisionOrder(activeEdgeResult.decisions)[0].edgeId);
      showDecision();
    };
    const installTopologyDecisionOptions = (): void => {
      select.innerHTML = "";
      for (const decision of topologyDecisionOrder(activeTopologyResult.decisions)) {
        const option = document.createElement("option");
        option.value = String(decision.cleanNodeId);
        const state = decision.status === "contracted" ? `contracted #${decision.contractionOrder}` : decision.status;
        option.textContent = `Node ${decision.cleanNodeId} · ${state}`;
        select.appendChild(option);
      }
      select.value = String(topologyDecisionOrder(activeTopologyResult.decisions)[0].cleanNodeId);
      showDecision();
    };
    const renderEdgeLevel = (level: SpiderSimplificationLevel): void => {
      activeEdgeResult = edgeStudy.levels[level];
      renderer.setSimplification(activeEdgeResult);
      setText("simplified-nodes", activeEdgeResult.stats.nodeCount);
      setText("simplified-edges", activeEdgeResult.stats.edgeCount);
      setText("simplified-components", activeEdgeResult.stats.connectedComponents);
      setText("simplified-motif", `${activeEdgeResult.stats.motifConnectivity.connectedCount}/38`);
      setText("simplified-support", `${activeEdgeResult.stats.supportTargetConnectivity.connectedCount}/20`);
      const rejected = activeEdgeResult.decisions.filter((decision) => decision.status === "rejected").length;
      const optional = activeEdgeResult.decisions.filter((decision) => decision.status === "retained-by-level").length;
      document.getElementById("finding-list")!.innerHTML = `
        <li>cycle budget <b>${activeEdgeResult.removedEdgeIds.length}/${edgeStudy.cycleBudget}</b></li>
        <li>accepted removals <b>${activeEdgeResult.removedEdgeIds.length}</b></li>
        <li>optional this level <b>${optional}</b></li>
        <li>constraint rejects <b>${rejected}</b></li>
        <li>cycle rank remaining <b>${activeEdgeResult.cycleRank}</b></li>
        <li>graph criticality ≠ physical strength</li>`;
      document.getElementById("result-legend")!.innerHTML = `
        <span><i class="swatch simplified"></i>retained Edge</span>
        <span><i class="swatch removed"></i>removed Edge</span>`;
      installEdgeDecisionOptions();
      statusText.textContent = `Ready · Edge Density ${level} · ${activeEdgeResult.stats.nodeCount} nodes / ${activeEdgeResult.stats.edgeCount} edges · component 1 · Motif 38/38 · support 20/20 · production未採用`;
    };
    const renderTopologyLevel = (level: SpiderTopologyLevel): void => {
      activeTopologyResult = topologyStudy.levels[level];
      renderer.setTerminalTopology(activeTopologyResult, topologyStudy);
      setText("simplified-nodes", activeTopologyResult.stats.nodeCount);
      setText("simplified-edges", activeTopologyResult.stats.edgeCount);
      setText("simplified-components", activeTopologyResult.stats.connectedComponents);
      setText("simplified-motif", `${activeTopologyResult.stats.motifConnectivity.connectedCount}/38`);
      setText("simplified-support", `${activeTopologyResult.stats.supportTargetConnectivity.connectedCount}/20`);
      document.getElementById("finding-list")!.innerHTML = `
        <li>absolute terminal Nodes <b>${topologyStudy.terminalSummary.uniqueTerminalNodeCount}</b>（multi-role ${topologyStudy.terminalSummary.multiRoleTerminalNodeCount}）</li>
        <li>contracted Nodes <b>${activeTopologyResult.contractedNodeIds.length}</b></li>
        <li>rewired topology Edges <b>${activeTopologyResult.rewiredEdgeIds.length}</b></li>
        <li>inferred branch junctions <b>${topologyStudy.terminalSummary.inferredBranchJunctionCount}</b> / explicit <b>0</b></li>
        <li>nearby junction pairs <b>${topologyStudy.findings.nearbyJunctions.length}</b>（review-only）</li>
        <li>terminal reachability <b>${activeTopologyResult.audit.terminalReachability.reachableTerminalPairs}/${activeTopologyResult.audit.terminalReachability.requiredTerminalPairs}</b></li>
        <li>cycle rank <b>${activeTopologyResult.cycleRank}</b> preserved</li>`;
      document.getElementById("result-legend")!.innerHTML = `
        <span><i class="swatch topology-path"></i>polyline realization</span>
        <span><i class="swatch topology-removed"></i>removed Node</span>
        <span><i class="swatch topology-rewired"></i>rewired chord</span>
        <span><i class="swatch motif"></i>retained Motif terminal</span>
        <span><i class="swatch support"></i>retained Support terminal</span>`;
      installTopologyDecisionOptions();
      statusText.textContent = `Ready · Node Topology ${level} · ${activeTopologyResult.stats.nodeCount} nodes / ${activeTopologyResult.stats.edgeCount} edges · terminal 38 · component 1 · Motif 38/38 · support 20/20 · production未採用`;
    };
    const renderActiveLevel = (): void => {
      if (activeStudy === "edge-removal") renderEdgeLevel(activeLevel);
      else renderTopologyLevel(activeLevel);
      status.dataset.level = activeLevel;
      status.dataset.study = activeStudy;
      document.getElementById("mode-caption")!.textContent = caption(activeMode);
    };
    select.addEventListener("change", showDecision);
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-level]")) {
      button.addEventListener("click", () => {
        const level = button.dataset.level as SpiderSimplificationLevel & SpiderTopologyLevel;
        activeLevel = level;
        for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-level]")) {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        }
        renderActiveLevel();
      });
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-study]")) {
      button.addEventListener("click", () => {
        activeStudy = button.dataset.study as NetworkStudyKind;
        for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-study]")) {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        }
        const topologyMode = activeStudy === "node-topology";
        document.getElementById("result-mode-label")!.textContent = topologyMode ? "Topology" : "Edge Simplified";
        document.getElementById("clean-result-mode-label")!.textContent = topologyMode
          ? "Clean / Topology"
          : "Clean / Edge";
        document.getElementById("result-stat-label")!.textContent = topologyMode ? "Topology" : "Edge Result";
        document.getElementById("decision-title")!.textContent = topologyMode ? "Node decision" : "Edge decision";
        renderActiveLevel();
      });
    }
    renderActiveLevel();

    status.dataset.ready = "true";
    status.dataset.mode = "clean-result";
  } catch (error) {
    status.dataset.ready = "error";
    statusText.textContent = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

void start();
