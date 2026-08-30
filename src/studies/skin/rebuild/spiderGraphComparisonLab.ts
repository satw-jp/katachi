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
  type SpiderGraphSimplificationStudy,
  type SpiderSimplificationLevel,
  type SpiderSimplificationLevelResult,
} from "./spiderGraphSimplificationLab.ts";
import "./spiderGraphComparisonLab.css";

type ComparisonMode = "raw" | "clean" | "raw-clean" | "simplified" | "clean-simplified";
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
  private mode: ComparisonMode = "clean-simplified";
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
    study: SpiderGraphSimplificationStudy,
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
    this.setSimplification(study.levels.medium);
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

  setMode(mode: ComparisonMode): void {
    this.mode = mode;
    this.rawLayer.visible = mode === "raw" || mode === "raw-clean";
    this.cleanLayer.visible = mode === "clean" || mode === "raw-clean" || mode === "clean-simplified";
    this.simplifiedLayer.visible = mode === "simplified" || mode === "clean-simplified";
    this.removedLayer.visible = mode === "simplified" || mode === "clean-simplified";
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
          <p>Cleanup / author Simplification visual study</p>
        </div>
        <div class="lab-freeze-badge">SHADOW ONLY · production geometry unchanged</div>
        <div class="mode-switch" role="group" aria-label="Graph comparison mode">
          <button type="button" data-mode="raw" aria-pressed="false">Raw</button>
          <button type="button" data-mode="clean" aria-pressed="false">Clean</button>
          <button type="button" data-mode="raw-clean" aria-pressed="false">Raw / Clean</button>
          <button type="button" data-mode="simplified" aria-pressed="false">Simplified</button>
          <button type="button" data-mode="clean-simplified" aria-pressed="true">Clean / Simplified</button>
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
            <span></span><span class="head">Raw</span><span class="head">Clean</span><span class="head">Simplified</span>
            <span>Nodes</span><span class="raw" id="raw-nodes">—</span><span class="clean" id="clean-nodes">—</span><span class="simplified" id="simplified-nodes">—</span>
            <span>Edges</span><span class="raw" id="raw-edges">—</span><span class="clean" id="clean-edges">—</span><span class="simplified" id="simplified-edges">—</span>
            <span>Components</span><span class="raw" id="raw-components">—</span><span class="clean" id="clean-components">—</span><span class="simplified" id="simplified-components">—</span>
            <span>Motif</span><span class="raw" id="raw-motif">—</span><span class="clean" id="clean-motif">—</span><span class="simplified" id="simplified-motif">—</span>
            <span>Support</span><span class="raw" id="raw-support">—</span><span class="clean" id="clean-support">—</span><span class="simplified" id="simplified-support">—</span>
          </div>
          <h2 style="margin-top: 16px">Layers</h2>
          <div class="legend">
            <label><input type="checkbox" data-layer="retained" checked /><span class="swatch retained"></span>retained nodes</label>
            <label><input type="checkbox" data-layer="collapsed" checked /><span class="swatch collapsed"></span>collapsed degree-2</label>
            <label><input type="checkbox" data-layer="merge" checked /><span class="swatch merge"></span>near-node merge</label>
            <label><input type="checkbox" data-layer="overlap" checked /><span class="swatch overlap"></span>duplicate / overlap</label>
            <label><input type="checkbox" data-layer="contact" checked /><span class="swatch contact"></span>endpoint contact</label>
            <label><input type="checkbox" data-layer="motif" checked /><span class="swatch motif"></span>Motif <span class="swatch support"></span>support target</label>
          </div>
        </aside>
        <section class="viewport-wrap" aria-label="Clean and Simplified Spider Graph comparison viewport">
          <div id="network-lab-viewport"></div>
          <div class="viewport-caption" id="mode-caption">Clean / Simplified · Clean gold / retained green / removed red. Drag to orbit, wheel to zoom.</div>
        </section>
        <aside class="lab-panel is-right">
          <h2>Edge decision</h2>
          <select class="provenance-select" id="decision-edge" aria-label="Simplification Edge decision"></select>
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
    const simplification = studySpiderGraphSimplification(report, terminals);
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
    renderer.install(report, simplification, surface, terminals);

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

    const captions: Record<ComparisonMode, string> = {
      raw: "Raw · cyan 251 nodes / 270 edges. Generator outputをそのまま観察。",
      clean: "Clean · gold 101 nodes / 118 topological edges. straightは現在の表示realizationのみ。",
      "raw-clean": "Raw / Clean · Raw cyan（薄） / Cleanup gold。TASK 16の対応を確認。",
      simplified: "Simplified · retained green / author removal red。production未採用。",
      "clean-simplified": "Clean / Simplified · Clean gold（薄） / retained green / removed red。",
    };
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode as ComparisonMode;
        renderer.setMode(mode);
        for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        }
        document.getElementById("mode-caption")!.textContent = captions[mode];
        status.dataset.mode = mode;
      });
    }
    for (const checkbox of document.querySelectorAll<HTMLInputElement>("[data-layer]")) {
      checkbox.addEventListener("change", () => {
        renderer.setMarkerVisible(checkbox.dataset.layer as MarkerLayer, checkbox.checked);
      });
    }

    const select = document.getElementById("decision-edge") as HTMLSelectElement;
    const detail = document.getElementById("decision-detail")!;
    let activeResult = simplification.levels.medium;
    const decisionOrder = (decisions: readonly SpiderEdgeSimplificationDecision[]): SpiderEdgeSimplificationDecision[] =>
      [...decisions].sort((first, second) => {
        const statusOrder = { removed: 0, "retained-by-level": 1, rejected: 2 } as const;
        return statusOrder[first.status] - statusOrder[second.status]
          || (first.removalOrder ?? Infinity) - (second.removalOrder ?? Infinity)
          || second.removalScore - first.removalScore
          || first.edgeId - second.edgeId;
      });
    const showDecision = (): void => {
      const cleanEdgeId = Number(select.value);
      const decision = activeResult.decisions.find((entry) => entry.edgeId === cleanEdgeId)!;
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
    const installDecisionOptions = (): void => {
      select.innerHTML = "";
      for (const decision of decisionOrder(activeResult.decisions)) {
        const option = document.createElement("option");
        option.value = String(decision.edgeId);
        const state = decision.status === "removed" ? `removed #${decision.removalOrder}`
          : decision.status === "rejected" ? "reject"
            : "optional";
        option.textContent = `Edge ${decision.edgeId} · ${state} · score ${decision.removalScore.toFixed(1)}`;
        select.appendChild(option);
      }
      select.value = String(decisionOrder(activeResult.decisions)[0].edgeId);
      showDecision();
    };
    const renderLevel = (level: SpiderSimplificationLevel): void => {
      activeResult = simplification.levels[level];
      renderer.setSimplification(activeResult);
      setText("simplified-nodes", activeResult.stats.nodeCount);
      setText("simplified-edges", activeResult.stats.edgeCount);
      setText("simplified-components", activeResult.stats.connectedComponents);
      setText("simplified-motif", `${activeResult.stats.motifConnectivity.connectedCount}/38`);
      setText("simplified-support", `${activeResult.stats.supportTargetConnectivity.connectedCount}/20`);
      const rejected = activeResult.decisions.filter((decision) => decision.status === "rejected").length;
      const optional = activeResult.decisions.filter((decision) => decision.status === "retained-by-level").length;
      document.getElementById("finding-list")!.innerHTML = `
        <li>cycle budget <b>${activeResult.removedEdgeIds.length}/${simplification.cycleBudget}</b></li>
        <li>accepted removals <b>${activeResult.removedEdgeIds.length}</b></li>
        <li>optional this level <b>${optional}</b></li>
        <li>constraint rejects <b>${rejected}</b></li>
        <li>cycle rank remaining <b>${activeResult.cycleRank}</b></li>
        <li>graph criticality ≠ physical strength</li>`;
      installDecisionOptions();
      status.dataset.level = level;
      statusText.textContent = `Ready · ${level} ${activeResult.stats.nodeCount} nodes / ${activeResult.stats.edgeCount} edges · component 1 · Motif 38/38 · support 20/20 · production未採用`;
    };
    select.addEventListener("change", showDecision);
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-level]")) {
      button.addEventListener("click", () => {
        const level = button.dataset.level as SpiderSimplificationLevel;
        for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-level]")) {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        }
        renderLevel(level);
      });
    }
    renderLevel("medium");

    status.dataset.ready = "true";
    status.dataset.mode = "clean-simplified";
  } catch (error) {
    status.dataset.ready = "error";
    statusText.textContent = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

void start();
