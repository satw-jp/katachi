import * as THREE from "three";
import {
  buildBranchedTreeFixture,
  compareBranchedModes,
  supportBranchedTreeFingerprint,
  type BranchedCompareMode,
  type BranchedModeComparison,
} from "./supportBranchedTree.ts";

/**
 * SKIN Support v2 Experimental viewer. Diagnostics only: renders the shared
 * fixture in Independent / Shared Trunk / Shared + Low Diagonal modes from
 * one precomputed comparison. Mode and layer toggles only change visibility
 * of precomputed meshes; trunk data is never mutated (geometry mutation 0).
 * No export, no FKEI, no production wiring; the print preview path is
 * untouched.
 */

const MODES: Array<{ mode: BranchedCompareMode; label: string }> = [
  { mode: "independent", label: "A · Independent" },
  { mode: "shared", label: "B · Shared Trunk" },
  { mode: "shared-lowdiagonal", label: "C · Shared + Low Diagonal" },
];

type LayerId =
  | "roots"
  | "sharedTrunks"
  | "junctions"
  | "childBranches"
  | "targets"
  | "rejectedShares"
  | "collisionRejects"
  | "provenance";

const LAYERS: Array<{ id: LayerId; label: string }> = [
  { id: "roots", label: "Roots" },
  { id: "sharedTrunks", label: "Shared Trunks" },
  { id: "junctions", label: "Junctions" },
  { id: "childBranches", label: "Child Branches" },
  { id: "targets", label: "Targets" },
  { id: "rejectedShares", label: "Rejected Share Candidates" },
  { id: "collisionRejects", label: "Collision Rejects" },
  { id: "provenance", label: "Provenance" },
];

const COLORS = {
  soloTrunk: 0x8a9a5b,
  neck: 0xa8b87a,
  sharedTrunk: 0xe0a100,
  child: 0x7dd3fc,
  brace: 0x22d3ee,
  root: 0xfacc15,
  junction: 0xecfeff,
  target: 0xf0abfc,
  rejected: 0xef4444,
  plate: 0x334155,
};

const built = buildBranchedTreeFixture();
const comparison: BranchedModeComparison = compareBranchedModes(built.targets, built.options);
const modeFingerprint = supportBranchedTreeFingerprint(comparison);

const canvas = document.getElementById("viewport") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(640, 480, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d10);
const camera = new THREE.PerspectiveCamera(40, 640 / 480, 0.1, 1200);
camera.position.set(55, -80, 45);
camera.lookAt(50, 0, 12);

{
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(150, 30, 1),
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
    new THREE.CylinderGeometry(radius, radius, Math.max(length, 1e-6), 12),
    new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity }),
  );
  mesh.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function marker(position: { x: number; y: number; z: number }, radius: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.set(position.x, position.y, position.z);
  return mesh;
}

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const lamp = new THREE.DirectionalLight(0xffffff, 1.2);
lamp.position.set(30, -40, 80);
scene.add(lamp);

const layerGroups = new Map<BranchedCompareMode, Map<LayerId, THREE.Group>>();

function targetById(id: string) {
  return built.targets.find((t) => t.id === id);
}

for (const { mode } of MODES) {
  const result = comparison[mode];
  const groups = new Map<LayerId, THREE.Group>();
  const makeGroup = (id: LayerId): THREE.Group => {
    const group = new THREE.Group();
    group.name = `branched-${mode}-${id}`;
    group.visible = false;
    scene.add(group);
    groups.set(id, group);
    return group;
  };
  const roots = makeGroup("roots");
  const trunks = makeGroup("sharedTrunks");
  const junctions = makeGroup("junctions");
  const branches = makeGroup("childBranches");
  const targets = makeGroup("targets");
  const rejectedShares = makeGroup("rejectedShares");
  const collisionRejects = makeGroup("collisionRejects");
  makeGroup("provenance"); // text panel only; keeps toggle cardinality stable

  if (mode === "independent") {
    for (const target of built.targets) {
      for (const segment of target.route.segments) {
        trunks.add(cylinderBetween(segment.start, segment.end, segment.radius, COLORS.soloTrunk));
      }
      roots.add(marker(target.route.root, 0.55, COLORS.root));
      targets.add(marker(target.route.target, 0.5, COLORS.target));
    }
  } else {
    // Solo independent trunks keep the baseline look.
    for (const id of result.independentTargets) {
      const target = targetById(id);
      if (!target) continue;
      for (const segment of target.route.segments) {
        trunks.add(cylinderBetween(segment.start, segment.end, segment.radius, COLORS.soloTrunk));
      }
      roots.add(marker(target.route.root, 0.55, COLORS.root));
      targets.add(marker(target.route.target, 0.5, COLORS.target));
    }
    for (const tree of result.trees) {
      roots.add(marker(tree.root, 0.7, COLORS.root));
      for (const segment of tree.trunkSegments) {
        trunks.add(cylinderBetween(segment.start, segment.end, segment.radius, COLORS.sharedTrunk));
      }
      junctions.add(marker(tree.junction, 0.6, COLORS.junction));
      for (const child of tree.children) {
        branches.add(cylinderBetween(child.connector.start, child.connector.end, child.connector.radius, COLORS.child));
        for (const segment of child.upperSegments) {
          branches.add(cylinderBetween(segment.start, segment.end, segment.radius, COLORS.child));
        }
        const target = targetById(child.targetId);
        if (target) targets.add(marker(target.route.target, 0.5, COLORS.target));
      }
    }
    for (const brace of result.lowBraces) {
      const a = result.trees.find((t) => t.id === brace.trunkAId);
      const b = result.trees.find((t) => t.id === brace.trunkBId);
      if (!a || !b) continue;
      branches.add(cylinderBetween(a.junction, b.junction, 0.8, COLORS.brace, 0.85));
    }
  }
  for (const rejection of result.rejections) {
    const first = targetById(rejection.memberIds[0]);
    const anchor = first ? first.route.root : { x: 0, y: 0, z: 0 };
    const group = rejection.reason.includes("BODY") ? collisionRejects : rejectedShares;
    const pin = marker({ x: anchor.x, y: anchor.y, z: 2 }, 0.65, COLORS.rejected);
    pin.userData.reason = rejection.reason;
    group.add(pin);
  }
  layerGroups.set(mode, groups);
}

// Minimal orbit: drag rotates, wheel zooms. No external controls dependency.
let azimuth = Math.atan2(camera.position.y - 0, camera.position.x - 50);
let polar = 0.95;
let radius = Math.hypot(camera.position.x - 50, camera.position.y, camera.position.z - 12);
let dragging = false;
let lastX = 0;
let lastY = 0;
function applyOrbit(): void {
  camera.position.set(
    50 + radius * Math.sin(polar) * Math.cos(azimuth),
    radius * Math.sin(polar) * Math.sin(azimuth),
    12 + radius * Math.cos(polar),
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
  radius = Math.min(500, Math.max(15, radius * (1 + event.deltaY * 0.001)));
  applyOrbit();
}, { passive: false });

const modesBar = document.getElementById("modes") as HTMLElement;
const layersBar = document.getElementById("layers") as HTMLElement;
const metricsBox = document.getElementById("metrics") as HTMLElement;
const comparisonBox = document.getElementById("comparison") as HTMLElement;
const provenanceBox = document.getElementById("provenance") as HTMLElement;
const statusBox = document.getElementById("status") as HTMLElement;
const legendBox = document.getElementById("legend") as HTMLElement;
legendBox.innerHTML = [
  ["solo trunk", COLORS.soloTrunk],
  ["shared trunk", COLORS.sharedTrunk],
  ["child branch", COLORS.child],
  ["low brace", COLORS.brace],
  ["root", COLORS.root],
  ["junction", COLORS.junction],
  ["target", COLORS.target],
  ["rejected", COLORS.rejected],
].map(([label, color]) => `<span style="background:#${(color as number).toString(16).padStart(6, "0")}"></span>${label}`).join(" · ");

let activeMode: BranchedCompareMode = "independent";
const layerState = new Map<LayerId, boolean>(LAYERS.map((l) => [l.id, l.id !== "provenance"]));

function refreshVisibility(): void {
  for (const [mode, groups] of layerGroups) {
    for (const [id, group] of groups) {
      group.visible = mode === activeMode && (layerState.get(id) ?? false);
    }
  }
  applyOrbit();
}

function renderMetrics(): void {
  const m = comparison[activeMode].metrics;
  const rows: Array<[string, string]> = [
    ["targets total / supported / unresolved / critical",
      `${m.targets.total} / ${m.targets.supported} / ${m.targets.unresolved} / ${m.targets.critical}`],
    ["trunks independent / shared, trees, junctions, branches",
      `${m.topology.independentTrunkCount} / ${m.topology.sharedTrunkCount}, ${m.topology.treeCount}, ${m.topology.branchJunctionCount}, ${m.topology.branches}`],
    ["targets/tree, max/tree, critical/tree",
      `[${m.topology.targetsPerTree.join(", ")}], ${m.topology.maxTargetsPerTree}, [${m.topology.criticalTargetsPerTree.join(", ")}]`],
    ["bootstrap max / mean, long #, junction mean, branch mean",
      `${m.bootstrap.maxBootstrapUnbracedLengthMm.toFixed(1)} / ${m.bootstrap.meanBootstrapUnbracedLengthMm.toFixed(1)}, ${m.bootstrap.longBootstrapCount}, ${m.bootstrap.meanFirstStableJunctionHeightMm?.toFixed(1) ?? "—"}, ${m.bootstrap.meanFirstBranchHeightMm?.toFixed(1) ?? "—"}`],
    ["conflicts indep / resolved / rejected / new",
      `${m.routing.independentRouteConflicts} / ${m.routing.resolvedBySharingCount} / ${m.routing.rejectedShareCandidates} / ${m.routing.newConflictsIntroduced}`],
    ["branch angle max / mean",
      `${m.routing.maxBranchAngleFromVerticalDeg?.toFixed(1) ?? "—"}° / ${m.routing.meanBranchAngleFromVerticalDeg?.toFixed(1) ?? "—"}°`],
    ["edge length / volume / Δ vs current",
      `${m.material.totalSupportEdgeLengthMm.toFixed(1)} / ${m.material.estimatedSupportVolumeMm3.toFixed(1)} / ${m.material.materialChangeVsCurrent !== null ? `${(m.material.materialChangeVsCurrent * 100).toFixed(1)}%` : "—"}`],
    ["safety collide / plate / fusion / NaN / zero / dup",
      `${m.safety.bodyCollisionCount} / ${m.safety.plateViolationCount} / ${m.safety.unintendedFusionCount} / ${m.safety.invalidNaNCount} / ${m.safety.zeroLengthCount} / ${m.safety.duplicateEdgeCount}`],
    ["removal complexity / loops / risk adjacency",
      `${m.removal.treeComplexity} / ${m.removal.trappedLoopRisk} / ${m.removal.removalRiskAdjacencyCount}`],
    ["failure domain max lost / max critical",
      `${m.failureDomain.maxTargetsLostOnRootFailure} / ${m.failureDomain.maxCriticalTargetsOnOneRoot}`],
  ];
  metricsBox.innerHTML = `<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`;
  const result = comparison[activeMode];
  const lines = result.trees.map((tree) => [
    `${tree.id} root=(${tree.root.x.toFixed(2)}, ${tree.root.y.toFixed(2)})`,
    `targets=[${tree.targetIds.join(", ")}] critical=[${tree.criticalTargetIds.join(", ") || "—"}]`,
    `reason: ${tree.sharedReason}`,
    `loss-on-root-failure=${tree.failureDomain.maxTargetsLostOnRootFailure} alternate-routes=${tree.failureDomain.alternateIndependentRoutesAvailable}`,
  ].join("\n  "));
  const rejects = result.rejections.map((r) => `REJECT [${r.memberIds.join(", ")}]: ${r.reason}`);
  provenanceBox.textContent = [...lines, ...rejects].join("\n") || "(no shared trees in this mode)";
}

function renderComparison(): void {
  const rows: Array<[string, (m: BranchedCompareMode) => string]> = [
    ["shared trunks", (m) => String(comparison[m].metrics.topology.sharedTrunkCount)],
    ["mean bootstrap", (m) => comparison[m].metrics.bootstrap.meanBootstrapUnbracedLengthMm.toFixed(1)],
    ["resolved conflicts", (m) => String(comparison[m].metrics.routing.resolvedBySharingCount)],
    ["edge Δ vs current", (m) => {
      const v = comparison[m].metrics.material.materialChangeVsCurrent;
      return v !== null ? `${(v * 100).toFixed(1)}%` : "—";
    }],
    ["BODY collide", (m) => String(comparison[m].metrics.safety.bodyCollisionCount)],
    ["max lost on root", (m) => String(comparison[m].metrics.failureDomain.maxTargetsLostOnRootFailure)],
  ];
  comparisonBox.innerHTML = `<table><tr><th>metric</th>${MODES.map((m) => `<th>${m.mode}</th>`).join("")}</tr>${
    rows.map(([label, read]) => `<tr><td>${label}</td>${MODES.map((m) => `<td>${read(m.mode)}</td>`).join("")}</tr>`).join("")
  }</table>`;
}

const modeButtons = new Map<BranchedCompareMode, HTMLButtonElement>();
for (const { mode, label } of MODES) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(mode === activeMode));
  button.onclick = () => {
    activeMode = mode;
    for (const [, btn] of modeButtons) btn.setAttribute("aria-pressed", String(false));
    button.setAttribute("aria-pressed", "true");
    refreshVisibility();
    renderMetrics();
  };
  modesBar.appendChild(button);
  modeButtons.set(mode, button);
}

for (const { id, label } of LAYERS) {
  const wrap = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = layerState.get(id) ?? false;
  box.onchange = () => {
    layerState.set(id, box.checked);
    if (id === "provenance") {
      provenanceBox.style.display = box.checked ? "" : "none";
    }
    refreshVisibility();
  };
  wrap.append(box, document.createTextNode(` ${label}`));
  layersBar.appendChild(wrap);
}
provenanceBox.style.display = "none";

refreshVisibility();
renderMetrics();
renderComparison();
statusBox.textContent = `comparison fingerprint ${modeFingerprint.slice(0, 16)}… · fixture targets ${comparison.independent.metrics.targets.total} · Print #2 FROZEN · printApproval=false`;
