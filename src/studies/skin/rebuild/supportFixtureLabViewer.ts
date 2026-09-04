import * as THREE from "three";
import {
  compareFixtureModes,
  createSupportExperimentRegistry,
  detectOrganicGeneralizationWarnings,
  parseSupportExperimentFixture,
  serializeSupportExperimentFixture,
  type FixtureModeComparison,
  type SupportExperimentFixture,
} from "./supportExperimentFixture.ts";
import type { BranchedCompareMode } from "./supportBranchedTree.ts";

/**
 * Fixture Lab viewer. Synthetic Vertical Stress Fixture ships built in;
 * the Author Organic slot starts NOT LOADED and only fills from a local
 * JSON file the author supplies (never synthesized, never fetched).
 * Invalid loads show a specific error and preserve the previous valid
 * state. Both fixtures run the identical three-mode analysis path with
 * identical parameters. No export to production, no FKEI, no Print #2
 * contact.
 */

const MODES: Array<{ mode: BranchedCompareMode; label: string }> = [
  { mode: "independent", label: "Independent" },
  { mode: "shared", label: "Shared Trunk" },
  { mode: "shared-lowdiagonal", label: "Shared + Low Diagonal" },
];

type LayerId =
  | "body"
  | "targets"
  | "routes"
  | "roots"
  | "sharedTrunks"
  | "junctions"
  | "branches"
  | "lowBraces"
  | "rejected"
  | "collision";

const LAYERS: Array<{ id: LayerId; label: string }> = [
  { id: "body", label: "BODY" },
  { id: "targets", label: "Targets" },
  { id: "routes", label: "Routes" },
  { id: "roots", label: "Roots" },
  { id: "sharedTrunks", label: "Shared Trunks" },
  { id: "junctions", label: "Junctions" },
  { id: "branches", label: "Branches" },
  { id: "lowBraces", label: "Low Braces" },
  { id: "rejected", label: "Rejected Shares" },
  { id: "collision", label: "Collision Rejects" },
];

const COLORS = {
  body: 0x64748b,
  soloTrunk: 0x8a9a5b,
  sharedTrunk: 0xe0a100,
  child: 0x7dd3fc,
  brace: 0x22d3ee,
  root: 0xfacc15,
  junction: 0xecfeff,
  target: 0xf0abfc,
  rejected: 0xef4444,
  plate: 0x334155,
};

const ANALYSIS = { scaleMmPerUnit: 1 };
const registry = createSupportExperimentRegistry();
const cache = new Map<string, FixtureModeComparison>();

function analyzed(id: string): FixtureModeComparison {
  const hit = cache.get(id);
  if (hit) return hit;
  const fixture = id === registry.getSynthetic().id
    ? registry.getSynthetic()
    : registry.getAuthor();
  if (!fixture) throw new Error("author fixture not loaded");
  const result = compareFixtureModes(fixture, ANALYSIS);
  cache.set(id, result);
  return result;
}

const canvas = document.getElementById("viewport") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(640, 480, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d10);
const camera = new THREE.PerspectiveCamera(40, 640 / 480, 0.1, 2000);
camera.position.set(55, -80, 45);
camera.lookAt(50, 0, 12);

{
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(160, 40, 1),
    new THREE.MeshBasicMaterial({ color: COLORS.plate, transparent: true, opacity: 0.55 }),
  );
  plate.position.set(50, 0, -0.5);
  scene.add(plate);
}

function cylinderBetween(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  radius: number,
  color: number,
  opacity = 1,
): THREE.Mesh {
  const direction = new THREE.Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, Math.max(length, 1e-6), 10),
    new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity }),
  );
  mesh.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function marker(position: { x: number; y: number; z: number }, radius: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 14, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.set(position.x, position.y, position.z);
  return mesh;
}

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const lamp = new THREE.DirectionalLight(0xffffff, 1.2);
lamp.position.set(30, -40, 80);
scene.add(lamp);

const rootGroup = new THREE.Group();
rootGroup.name = "fixture-lab";
scene.add(rootGroup);

function clearGroup(group: THREE.Group): void {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    group.remove(child);
  }
}

const visibleLayers = new Map<LayerId, boolean>(LAYERS.map((l) => [l.id, true]));
let activeFixtureId = registry.getSynthetic().id;
let activeMode: BranchedCompareMode = "independent";
let authorFileName = "";

function targetById(fixture: SupportExperimentFixture, id: string) {
  return fixture.targets.find((t) => t.id === id);
}

function renderFixture(): void {
  clearGroup(rootGroup);
  const compared = analyzed(activeFixtureId);
  const fixture = activeFixtureId === registry.getSynthetic().id
    ? registry.getSynthetic()
    : (registry.getAuthor() as SupportExperimentFixture);
  const result = compared.comparison[activeMode];
  const show = (id: LayerId): boolean => visibleLayers.get(id) ?? false;

  if (show("body") && fixture.body.kind === "triangle-soup") {
    const geometry = new THREE.BufferGeometry();
    const capped = fixture.body.positions.slice(0, 20000 * 3);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(capped, 3));
    rootGroup.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: COLORS.body, size: 0.35 })));
  }
  const soloRoutes = activeMode === "independent"
    ? fixture.targets.map((t) => t.route)
    : result.independentTargets
      .map((id) => targetById(fixture, id)?.route)
      .filter((r): r is NonNullable<typeof r> => !!r);
  if (show("routes")) {
    for (const route of soloRoutes) {
      for (const segment of route.segments) {
        rootGroup.add(cylinderBetween(segment.start, segment.end, segment.radius, COLORS.soloTrunk));
      }
    }
  }
  if (show("roots")) {
    for (const target of fixture.targets) {
      rootGroup.add(marker(target.route.root, 0.55, COLORS.root));
    }
  }
  if (show("targets")) {
    for (const target of fixture.targets) {
      rootGroup.add(marker(target.route.target, 0.5, COLORS.target));
    }
  }
  if (activeMode !== "independent") {
    if (show("sharedTrunks")) {
      for (const tree of result.trees) {
        for (const segment of tree.trunkSegments) {
          rootGroup.add(cylinderBetween(segment.start, segment.end, segment.radius, COLORS.sharedTrunk));
        }
      }
    }
    if (show("junctions")) {
      for (const tree of result.trees) {
        rootGroup.add(marker(tree.junction, 0.6, COLORS.junction));
      }
    }
    if (show("branches")) {
      for (const tree of result.trees) {
        for (const child of tree.children) {
          rootGroup.add(cylinderBetween(child.connector.start, child.connector.end, child.connector.radius, COLORS.child));
          for (const segment of child.upperSegments) {
            rootGroup.add(cylinderBetween(segment.start, segment.end, segment.radius, COLORS.child));
          }
        }
      }
    }
    if (show("lowBraces")) {
      for (const brace of result.lowBraces) {
        const a = result.trees.find((t) => t.id === brace.trunkAId);
        const b = result.trees.find((t) => t.id === brace.trunkBId);
        if (a && b) rootGroup.add(cylinderBetween(a.junction, b.junction, 0.8, COLORS.brace, 0.85));
      }
    }
  }
  for (const rejection of result.rejections) {
    const first = targetById(fixture, rejection.memberIds[0]);
    const anchor = first ? first.route.root : { x: 0, y: 0, z: 0 };
    const isBody = rejection.reason.includes("BODY");
    if ((isBody && show("collision")) || (!isBody && show("rejected"))) {
      rootGroup.add(marker({ x: anchor.x, y: anchor.y, z: 2 }, 0.65, COLORS.rejected));
    }
  }
  applyOrbit();
  renderPanels();
}

// Minimal orbit: drag rotates, wheel zooms. No external controls dependency.
let azimuth = Math.atan2(camera.position.y - 0, camera.position.x - 50);
let polar = 0.95;
let orbitRadius = Math.hypot(camera.position.x - 50, camera.position.y, camera.position.z - 12);
let dragging = false;
let lastX = 0;
let lastY = 0;
function applyOrbit(): void {
  camera.position.set(
    50 + orbitRadius * Math.sin(polar) * Math.cos(azimuth),
    orbitRadius * Math.sin(polar) * Math.sin(azimuth),
    12 + orbitRadius * Math.cos(polar),
  );
  camera.lookAt(50, 0, 12);
  renderer.render(scene, camera);
}
canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  azimuth -= (event.clientX - lastX) * 0.008;
  polar = Math.min(Math.PI - 0.05, Math.max(0.05, polar - (event.clientY - lastY) * 0.008));
  lastX = event.clientX;
  lastY = event.clientY;
  applyOrbit();
});
canvas.addEventListener("pointerup", () => {
  dragging = false;
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  orbitRadius = Math.min(600, Math.max(15, orbitRadius * (1 + event.deltaY * 0.001)));
  applyOrbit();
}, { passive: false });

const fixturesBar = document.getElementById("fixtures") as HTMLElement;
const modesBar = document.getElementById("modes") as HTMLElement;
const layersBar = document.getElementById("layers") as HTMLElement;
const metricsBox = document.getElementById("metrics") as HTMLElement;
const crossBox = document.getElementById("crossfix") as HTMLElement;
const provenanceBox = document.getElementById("provenance") as HTMLElement;
const warningsBox = document.getElementById("warnings") as HTMLElement;
const statusBox = document.getElementById("status") as HTMLElement;
const errorBox = document.getElementById("error") as HTMLElement;
const legendBox = document.getElementById("legend") as HTMLElement;
legendBox.innerHTML = [
  ["BODY evidence", COLORS.body],
  ["solo trunk", COLORS.soloTrunk],
  ["shared trunk", COLORS.sharedTrunk],
  ["child branch", COLORS.child],
  ["low brace", COLORS.brace],
  ["root", COLORS.root],
  ["junction", COLORS.junction],
  ["target", COLORS.target],
  ["rejected", COLORS.rejected],
].map(([label, color]) => `<span style="background:#${(color as number).toString(16).padStart(6, "0")}"></span>${label}`).join(" · ");

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.style.display = "block";
}
function clearError(): void {
  errorBox.textContent = "";
  errorBox.style.display = "none";
}

function metricRows(): Array<[string, string]> {
  const m = analyzed(activeFixtureId).comparison[activeMode].metrics;
  return [
    ["targets total / supported / unresolved / critical",
      `${m.targets.total} / ${m.targets.supported} / ${m.targets.unresolved} / ${m.targets.critical}`],
    ["trunks independent / shared, trees, junctions, branches",
      `${m.topology.independentTrunkCount} / ${m.topology.sharedTrunkCount}, ${m.topology.treeCount}, ${m.topology.branchJunctionCount}, ${m.topology.branches}`],
    ["bootstrap max / mean, long #, junction mean, branch mean",
      `${m.bootstrap.maxBootstrapUnbracedLengthMm.toFixed(1)} / ${m.bootstrap.meanBootstrapUnbracedLengthMm.toFixed(1)}, ${m.bootstrap.longBootstrapCount}, ${m.bootstrap.meanFirstStableJunctionHeightMm?.toFixed(1) ?? "—"}, ${m.bootstrap.meanFirstBranchHeightMm?.toFixed(1) ?? "—"}`],
    ["conflicts indep / resolved / rejected / new",
      `${m.routing.independentRouteConflicts} / ${m.routing.resolvedBySharingCount} / ${m.routing.rejectedShareCandidates} / ${m.routing.newConflictsIntroduced}`],
    ["branch angle max / mean",
      `${m.routing.maxBranchAngleFromVerticalDeg?.toFixed(1) ?? "—"}° / ${m.routing.meanBranchAngleFromVerticalDeg?.toFixed(1) ?? "—"}°`],
    ["edge length / volume",
      `${m.material.totalSupportEdgeLengthMm.toFixed(1)} / ${m.material.estimatedSupportVolumeMm3.toFixed(1)}`],
    ["safety collide / plate / fusion / NaN / zero / dup",
      `${m.safety.bodyCollisionCount} / ${m.safety.plateViolationCount} / ${m.safety.unintendedFusionCount} / ${m.safety.invalidNaNCount} / ${m.safety.zeroLengthCount} / ${m.safety.duplicateEdgeCount}`],
    ["failure domain max lost / max critical",
      `${m.failureDomain.maxTargetsLostOnRootFailure} / ${m.failureDomain.maxCriticalTargetsOnOneRoot}`],
  ];
}

function renderPanels(): void {
  const compared = analyzed(activeFixtureId);
  metricsBox.innerHTML = `<table>${
    metricRows().map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")
  }</table>`;
  const fixture = activeFixtureId === registry.getSynthetic().id
    ? registry.getSynthetic()
    : (registry.getAuthor() as SupportExperimentFixture);
  provenanceBox.textContent = [
    `fixture: ${fixture.id} (${fixture.kind}) — ${fixture.label}`,
    `source: ${fixture.provenance.source} · fingerprint ${fixture.provenance.sourceFingerprint.slice(0, 16)}…`,
    `physical: targetLongestMm=${fixture.physical.targetLongestMm ?? "unknown"} supportDiameterMm=${fixture.physical.supportDiameterMm ?? "unknown"} permanentDiameterMm=${fixture.physical.permanentDiameterMm ?? "unknown"}`,
    compared.analysisScaleNote,
    `BODY: ${fixture.body.kind} · components=${fixture.body.components.length} · triangles=${fixture.body.positions.length / 9}`,
    `options fingerprint: ${compared.optionsFingerprint.slice(0, 16)}…`,
  ].join("\n");
  const author = registry.getAuthor();
  if (!author) {
    crossBox.innerHTML = `<table><tr><td>Author Organic Fixture</td><td>NOT LOADED</td></tr></table>`;
    warningsBox.textContent = "(load an author fixture to compare)";
  } else {
    const syntheticCompared = analyzed(registry.getSynthetic().id);
    const authorCompared = analyzed(author.id);
    const keys: Array<[string, (m: BranchedCompareMode) => string, (m: BranchedCompareMode) => string]> = [
      ["shared trunks",
        (m) => String(syntheticCompared.comparison[m].metrics.topology.sharedTrunkCount),
        (m) => String(authorCompared.comparison[m].metrics.topology.sharedTrunkCount)],
      ["mean bootstrap",
        (m) => syntheticCompared.comparison[m].metrics.bootstrap.meanBootstrapUnbracedLengthMm.toFixed(1),
        (m) => authorCompared.comparison[m].metrics.bootstrap.meanBootstrapUnbracedLengthMm.toFixed(1)],
      ["resolved conflicts",
        (m) => String(syntheticCompared.comparison[m].metrics.routing.resolvedBySharingCount),
        (m) => String(authorCompared.comparison[m].metrics.routing.resolvedBySharingCount)],
      ["BODY collide",
        (m) => String(syntheticCompared.comparison[m].metrics.safety.bodyCollisionCount),
        (m) => String(authorCompared.comparison[m].metrics.safety.bodyCollisionCount)],
    ];
    crossBox.innerHTML = `<table><tr><th>metric [mode]</th><th>synthetic</th><th>author</th></tr>${
      (["independent", "shared", "shared-lowdiagonal"] as BranchedCompareMode[]).map((m) => keys.map(([label, s, a]) => `<tr><td>${label} [${m}]</td><td>${s(m)}</td><td>${a(m)}</td></tr>`).join("")).join("")
    }</table>`;
    const warnings = detectOrganicGeneralizationWarnings(
      syntheticCompared.comparison,
      authorCompared.comparison,
    );
    warningsBox.textContent = warnings.length ? warnings.join("\n") : "(no worse axis observed)";
  }
  statusBox.textContent = `fixture ${compared.fixtureId} · mode ${activeMode} · Print #2 FROZEN · printApproval=false`;
}

const fixtureButtons = new Map<string, HTMLButtonElement>();
function refreshFixtureBar(): void {
  fixturesBar.innerHTML = "";
  fixtureButtons.clear();
  const entries: Array<[string, string]> = [
    [registry.getSynthetic().id, "Synthetic Vertical"],
    ...(registry.getAuthor()
      ? [[registry.getAuthor()!.id, `Author Organic: ${authorFileName || registry.getAuthor()!.id}`] as [string, string]]
      : []),
  ];
  for (const [id, label] of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(id === activeFixtureId));
    button.onclick = () => {
      activeFixtureId = id;
      registry.setActive(id);
      for (const [, btn] of fixtureButtons) btn.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      clearError();
      renderFixture();
    };
    fixturesBar.appendChild(button);
    fixtureButtons.set(id, button);
  }
  if (!registry.getAuthor()) {
    const empty = document.createElement("span");
    empty.textContent = "Author Organic Fixture: NOT LOADED";
    fixturesBar.appendChild(empty);
  }
  const load = document.createElement("label");
  load.textContent = " Load Author Fixture ";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.id = "authorFile";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseSupportExperimentFixture(String(reader.result ?? ""));
        if (parsed.kind !== "author") {
          showError("author slot accepts only kind=author fixtures (synthetic files stay on Synthetic)");
          return;
        }
        authorFileName = file.name;
        registry.setAuthorFixture(parsed);
        activeFixtureId = parsed.id;
        refreshFixtureBar();
        clearError();
        renderFixture();
      } catch (error) {
        showError(`author fixture rejected: ${error instanceof Error ? error.message : String(error)} (previous fixture preserved)`);
      }
      input.value = "";
    };
    reader.onerror = () => {
      showError("could not read the selected file (previous fixture preserved)");
      input.value = "";
    };
    reader.readAsText(file);
  };
  load.appendChild(input);
  fixturesBar.appendChild(load);
  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "Download Synthetic Fixture JSON";
  download.title = "Explicit capture utility: serializes the built-in synthetic evidence (proves the capture path; never touches production state).";
  download.onclick = () => {
    const text = serializeSupportExperimentFixture(registry.getSynthetic());
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "synthetic-vertical-stress-fixture.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  fixturesBar.appendChild(download);
}

const modeButtons = new Map<BranchedCompareMode, HTMLButtonElement>();
for (const { mode, label } of MODES) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(mode === activeMode));
  button.onclick = () => {
    activeMode = mode;
    for (const [, btn] of modeButtons) btn.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-pressed", "true");
    renderFixture();
  };
  modesBar.appendChild(button);
  modeButtons.set(mode, button);
}

for (const { id, label } of LAYERS) {
  const wrap = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = true;
  box.onchange = () => {
    visibleLayers.set(id, box.checked);
    renderFixture();
  };
  wrap.append(box, document.createTextNode(` ${label}`));
  layersBar.appendChild(wrap);
}

refreshFixtureBar();
renderFixture();
