import * as THREE from "three";
import {
  buildVerticalStressFixture,
  compareBootstrapModes,
  supportBootstrapFootingFingerprint,
  type BootstrapCompareMode,
  type BootstrapModeComparison,
} from "./supportBootstrapFooting.ts";

/**
 * SKIN Support v2 Experimental viewer. Diagnostics only: renders the
 * Synthetic Vertical Stress Fixture in current / root / brace / combined
 * modes from one precomputed comparison. Mode switching toggles visibility
 * of precomputed candidate meshes; the underlying trunk data is never
 * mutated (geometry mutation 0). The exact Print Preview path is untouched —
 * this page has no export, no FKEI, no production wiring.
 */

const MODES: Array<{ mode: BootstrapCompareMode; label: string }> = [
  { mode: "current", label: "A · current Print #2 style" },
  { mode: "root", label: "B · root thickening only" },
  { mode: "brace", label: "C · low diagonal brace only" },
  { mode: "combined", label: "D · root thickening + low diagonal" },
];

const COLORS = {
  trunk: 0x8a9a5b,
  neck: 0xa8b87a,
  thickened: 0xe0a100,
  brace: 0x22d3ee,
  root: 0xfacc15,
  junction: 0xecfeff,
  bootstrap: 0xfb923c,
  rejected: 0xef4444,
  plate: 0x334155,
};

const comparison: BootstrapModeComparison = compareBootstrapModes(
  buildVerticalStressFixture().inputs,
  buildVerticalStressFixture().options,
);
const modeFingerprint = supportBootstrapFootingFingerprint(comparison);

const canvas = document.getElementById("viewport") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(640, 480, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d10);
const camera = new THREE.PerspectiveCamera(40, 640 / 480, 0.1, 1000);
camera.position.set(55, -70, 42);
camera.lookAt(50, 0, 12);

// Build plate slab (presentation only).
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
  const geometry = new THREE.CylinderGeometry(radius, radius, Math.max(length, 1e-6), 12);
  const material = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
  const mesh = new THREE.Mesh(geometry, material);
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

const modeGroups = new Map<BootstrapCompareMode, THREE.Group>();
for (const { mode } of MODES) {
  const result = comparison[mode];
  const group = new THREE.Group();
  group.name = `bootstrap-footing-${mode}`;
  const fixture = buildVerticalStressFixture();
  for (const input of fixture.inputs) {
    for (const segment of input.route.segments) {
      const isNeck = segment.radius < 0.6;
      group.add(cylinderBetween(segment.start, segment.end, segment.radius, isNeck ? COLORS.neck : COLORS.trunk));
    }
  }
  for (const trunk of result.trunks) {
    group.add(marker(trunk.rootPosition, 0.55, COLORS.root));
    if (trunk.firstStableJunctionHeightMm !== null) {
      group.add(marker({
        x: trunk.rootPosition.x,
        y: trunk.rootPosition.y,
        z: trunk.rootPosition.z + trunk.firstStableJunctionHeightMm,
      }, 0.45, COLORS.junction));
      group.add(cylinderBetween(
        trunk.rootPosition,
        {
          x: trunk.rootPosition.x,
          y: trunk.rootPosition.y,
          z: trunk.rootPosition.z + trunk.firstStableJunctionHeightMm,
        },
        0.32,
        COLORS.bootstrap,
        0.55,
      ));
    }
  }
  for (const thickening of result.thickenings) {
    if (thickening.status === "rejected") {
      const trunk = result.trunks.find((t) => t.id === thickening.trunkId);
      if (trunk) group.add(marker(trunk.rootPosition, 0.7, COLORS.rejected));
      continue;
    }
    for (const segment of thickening.segments) {
      group.add(cylinderBetween(segment.start, segment.end, segment.radius, COLORS.thickened));
    }
  }
  for (const brace of result.braces) {
    if (brace.status !== "candidate") {
      group.add(marker(brace.start, 0.6, COLORS.rejected));
      continue;
    }
    group.add(cylinderBetween(brace.start, brace.end, 0.8, COLORS.brace));
  }
  group.visible = false;
  scene.add(group);
  modeGroups.set(mode, group);
}

// Minimal orbit: drag rotates, wheel zooms. No external controls dependency.
let azimuth = Math.atan2(camera.position.y - 0, camera.position.x - 50);
let polar = 0.9;
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
  radius = Math.min(400, Math.max(15, radius * (1 + event.deltaY * 0.001)));
  applyOrbit();
}, { passive: false });

const modesBar = document.getElementById("modes") as HTMLElement;
const metricsBox = document.getElementById("metrics") as HTMLElement;
const comparisonBox = document.getElementById("comparison") as HTMLElement;
const statusBox = document.getElementById("status") as HTMLElement;
const legendBox = document.getElementById("legend") as HTMLElement;
legendBox.innerHTML = [
  ["trunk", COLORS.trunk],
  ["thickened root", COLORS.thickened],
  ["low brace", COLORS.brace],
  ["root", COLORS.root],
  ["first stable junction", COLORS.junction],
  ["bootstrap segment", COLORS.bootstrap],
  ["rejected", COLORS.rejected],
].map(([label, color]) => `<span style="background:#${(color as number).toString(16).padStart(6, "0")}"></span>${label}`).join(" · ");

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function renderMetrics(mode: BootstrapCompareMode): void {
  const c = comparison[mode].compare;
  const rows: Array<[string, string]> = [
    ["max bootstrap unbraced", `${c.maxBootstrapUnbracedLengthMm.toFixed(2)} mm`],
    ["mean bootstrap unbraced", `${c.meanBootstrapUnbracedLengthMm.toFixed(2)} mm`],
    ["long-bootstrap count", formatCount(c.longBootstrapCount)],
    ["mean first junction height", c.meanFirstStableJunctionHeightMm !== null ? `${c.meanFirstStableJunctionHeightMm.toFixed(2)} mm` : "—"],
    ["root reinforced", formatCount(c.rootReinforcedCount)],
    ["low braces", formatCount(c.lowBraceCount)],
    ["extra volume", `${c.totalExtraSupportVolumeMm3.toFixed(1)} mm³`],
    ["BODY collision (accepted)", formatCount(c.bodyCollisionCount)],
    ["BODY rejects", formatCount(c.bodyRejectedCount)],
    ["connected components", formatCount(c.supportConnectedComponents)],
    ["removal-risk adjacency", formatCount(c.removalRiskAdjacencyCount)],
  ];
  metricsBox.innerHTML = `<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`;
}

function renderComparison(): void {
  const keys = ["maxBootstrapUnbracedLengthMm", "meanBootstrapUnbracedLengthMm", "longBootstrapCount", "rootReinforcedCount", "lowBraceCount", "totalExtraSupportVolumeMm3", "bodyCollisionCount", "supportConnectedComponents", "removalRiskAdjacencyCount"] as const;
  const labels: Record<(typeof keys)[number], string> = {
    maxBootstrapUnbracedLengthMm: "max boot",
    meanBootstrapUnbracedLengthMm: "mean boot",
    longBootstrapCount: "long #",
    rootReinforcedCount: "roots",
    lowBraceCount: "braces",
    totalExtraSupportVolumeMm3: "extra mm³",
    bodyCollisionCount: "collide",
    supportConnectedComponents: "comps",
    removalRiskAdjacencyCount: "risk adj",
  };
  let html = `<table><tr><th>metric</th>${MODES.map((m) => `<th>${m.mode}</th>`).join("")}</tr>`;
  for (const key of keys) {
    html += `<tr><td>${labels[key]}</td>${MODES.map((m) => {
      const value = comparison[m.mode].compare[key];
      return `<td>${typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : "—"}</td>`;
    }).join("")}</tr>`;
  }
  comparisonBox.innerHTML = `${html}</table>`;
}

let activeMode: BootstrapCompareMode = "current";
const buttons = new Map<BootstrapCompareMode, HTMLButtonElement>();
for (const { mode, label } of MODES) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(mode === activeMode));
  button.onclick = () => {
    activeMode = mode;
    for (const [m, group] of modeGroups) group.visible = m === activeMode;
    for (const [m, btn] of buttons) btn.setAttribute("aria-pressed", String(m === activeMode));
    renderMetrics(activeMode);
    applyOrbit();
  };
  modesBar.appendChild(button);
  buttons.set(mode, button);
}

for (const [m, group] of modeGroups) group.visible = m === activeMode;
renderMetrics(activeMode);
renderComparison();
statusBox.textContent = `comparison fingerprint ${modeFingerprint.slice(0, 16)}… · fixture trunks ${comparison.current.compare.trunkCount} · Print #2 FROZEN · printApproval=false`;
applyOrbit();
