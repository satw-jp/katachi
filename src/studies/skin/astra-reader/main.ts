import * as THREE from "three";
import manifest from "./manifest.json";
import { buildAstraResearchSnapshot, type CandidateId, type Fact, type JunctionRecord, type LayerId, type MemberRecord } from "./snapshot.ts";
import "./style.css";

type Selection = { kind: "junction"; record: JunctionRecord } | { kind: "member"; record: MemberRecord } | null;
const layerLabels: Record<LayerId, string> = {
  host: "HOST",
  junctions: "INTERNAL JUNCTIONS / CANDIDATES",
  core: "OPEN CORE",
  crossLinks: "CROSS-LINKS",
  attachments: "SURFACE ATTACHMENTS",
  motifs: "SURFACE MOTIFS",
  fabricationD1: "FABRICATION D1",
  removableSupport: "REMOVABLE SUPPORT",
};
const colors: Record<LayerId, number> = { host: 0x8b96a8, junctions: 0xffc857, core: 0x52a7ff, crossLinks: 0xf08a5d, attachments: 0x58d68d, motifs: 0xe6d98a, fabricationD1: 0xdb6cf2, removableSupport: 0xb0b4c1 };
const defaultVisibility: Record<LayerId, boolean> = { host: true, junctions: true, core: true, crossLinks: false, attachments: true, motifs: true, fabricationD1: false, removableSupport: false };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function badge(fact: Fact<unknown>): HTMLElement {
  const node = el("span", `badge ${fact.provenance.toLowerCase().split(" ").join("-")}`, fact.provenance);
  return node;
}
function factRow(label: string, fact: Fact<unknown>): HTMLElement {
  const row = el("div", "fact");
  row.append(el("span", undefined, label), el("span", undefined, String(Array.isArray(fact.value) ? fact.value.join(", ") : fact.value ?? "—")), badge(fact));
  return row;
}
function midpoint(points: { x: number; y: number; z: number }[]): THREE.Vector3 {
  const first = points[0] ?? { x: 0, y: 0, z: 0 };
  const last = points[points.length - 1] ?? first;
  return new THREE.Vector3((first.x + last.x) / 2, (first.y + last.y) / 2, (first.z + last.z) / 2);
}

const app = document.getElementById("app");
if (!app) throw new Error("#app missing");
const viewport = el("div"); viewport.id = "viewport";
const panel = el("aside", "panel"); app.append(viewport, panel);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x111318);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
camera.position.set(120, 80, 140);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); viewport.append(renderer.domElement);
const controlsTarget = new THREE.Vector3(0, 20, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x263044, 1.7));
const directional = new THREE.DirectionalLight(0xffffff, 1.6); directional.position.set(80, 120, 60); scene.add(directional);
let controls: { update: () => void; target: THREE.Vector3; enableDamping: boolean; dispose: () => void } | null = null;
// OrbitControls is imported dynamically through the existing Three.js example module to keep this route isolated.
void import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(controlsTarget); controls.enableDamping = true; controls.update();
});
const root = new THREE.Group(); scene.add(root);
const pickables: THREE.Object3D[] = [];
const layerGroups = new Map<LayerId, THREE.Group>();
let candidate: CandidateId = "B_OPEN";
let snapshot = buildAstraResearchSnapshot(candidate);
let selection: Selection = null;
const visibility = { ...defaultVisibility };
let motifMode: "visible" | "transparent" | "hidden" = "visible";

function resize(): void { const width = viewport.clientWidth; const height = viewport.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); }
window.addEventListener("resize", resize); resize();
function clearScene(): void { while (root.children.length) { const child = root.children.pop(); if (child) child.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { object.geometry.dispose(); if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose()); else object.material.dispose(); } }); } pickables.length = 0; layerGroups.clear(); }
function line(points: { x: number; y: number; z: number }[], color: number, opacity = 1): THREE.Line { const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, p.z))); const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); return new THREE.Line(geometry, material); }
function addPick(point: THREE.Vector3, radius: number, record: JunctionRecord | MemberRecord, kind: "junction" | "member", group: THREE.Group): void { const mesh = new THREE.Mesh(new THREE.SphereGeometry(Math.max(radius * 1.8, 1), 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })); mesh.position.copy(point); mesh.userData.selection = { kind, record }; group.add(mesh); pickables.push(mesh); }
function renderSnapshot(): void {
  clearScene();
  const hostGroup = new THREE.Group(); const hostGeometry = new THREE.BufferGeometry(); hostGeometry.setAttribute("position", new THREE.Float32BufferAttribute(snapshot.host.vertices.flat(), 3)); hostGeometry.setIndex(snapshot.host.faces.flat()); hostGeometry.computeVertexNormals(); const hostMesh = new THREE.Mesh(hostGeometry, new THREE.MeshStandardMaterial({ color: colors.host, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide })); hostGroup.add(hostMesh); root.add(hostGroup); layerGroups.set("host", hostGroup);
  const groups: Record<Exclude<LayerId, "host">, THREE.Group> = { junctions: new THREE.Group(), core: new THREE.Group(), crossLinks: new THREE.Group(), attachments: new THREE.Group(), motifs: new THREE.Group(), fabricationD1: new THREE.Group(), removableSupport: new THREE.Group() };
  Object.entries(groups).forEach(([id, group]) => { layerGroups.set(id as LayerId, group); root.add(group); });
  snapshot.junctions.forEach((junction) => { const marker = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 6), new THREE.MeshStandardMaterial({ color: colors.junctions })); marker.position.set(junction.position.value.x, junction.position.value.y, junction.position.value.z); groups.junctions.add(marker); addPick(marker.position, 1.2, junction, "junction", groups.junctions); });
  const addMembers = (members: MemberRecord[]) => members.forEach((member) => { const group = groups[member.layer as Exclude<LayerId, "host">]; const display = line(member.points, colors[member.layer], .95); group.add(display); addPick(midpoint(member.points), member.radius, member, "member", group); });
  addMembers(snapshot.members); addMembers(snapshot.fabricationAdditions); addMembers(snapshot.removableSupports);
  snapshot.motifs.forEach((motif) => { const display = line(motif.points, colors.motifs, motifMode === "transparent" ? .2 : 1); display.userData.motif = true; groups.motifs.add(display); });
  applyVisibility();
}
function applyVisibility(): void { layerGroups.forEach((group, id) => { group.visible = visibility[id] && (id !== "motifs" || motifMode !== "hidden"); }); }
function valueFact<T>(value: T, provenance: Fact<T>["provenance"]): Fact<T> { return { value, provenance }; }
function refreshSelection(): void { selectionPanel.replaceChildren(); if (!selection) { selectionPanel.append(el("div", "muted", "選択なし。junctionまたはmemberをクリックしてください。")); return; } selectionPanel.append(el("h3", undefined, `${selection.kind === "junction" ? "JUNCTION" : "MEMBER"} ${selection.record.id}`)); if (selection.kind === "junction") { selectionPanel.append(factRow("ID", valueFact(selection.record.id, "RECORDED")), factRow("Position", selection.record.position), factRow("Connected members", selection.record.connectedMembers), factRow("Role / stage", valueFact("junction candidate", "DERIVED")), factRow("Added reason", valueFact(null, "NOT RECORDED"))); } else { const record = selection.record; selectionPanel.append(factRow("ID", valueFact(record.id, "RECORDED")), factRow("Role", record.role), factRow("Parent branch", record.parentBranch), factRow("Connected junctions", record.connectedJunctions), factRow("Target surface component / motif", record.target), factRow("Added stage", record.addedStage), factRow("Added reason", record.addedReason), factRow("Diameter / radius", valueFact(record.radius, "RECORDED"))); } }
function buildPanel(): void {
  panel.replaceChildren(); panel.append(el("div", "panel-title", manifest.title)); panel.append(el("p", "intro", "既存Astra Research成果を読むためのResearch-only viewer。編集・再生成・Exportはありません。"));
  const candidateSection = el("div", "section"); candidateSection.append(el("div", "section-title", "Candidate / same camera")); const candidateRow = el("div", "candidate-row"); for (const id of ["B_OPEN", "B_PARTICIPATING"] as const) { const button = el("button", id === candidate ? "active" : undefined, id); button.type = "button"; button.addEventListener("click", () => { candidate = id; snapshot = buildAstraResearchSnapshot(candidate); renderSnapshot(); buildPanel(); }); candidateRow.append(button); } candidateSection.append(candidateRow, el("div", "source-line", `source junctions ${snapshot.source.sourceJunctionCount.value} · surface components ${snapshot.source.surfaceComponentCount.value}`)); panel.append(candidateSection);
  const layerSection = el("div", "section"); layerSection.append(el("div", "section-title", "Layers")); (Object.keys(layerLabels) as LayerId[]).forEach((id) => { const label = el("label"); const input = el("input") as HTMLInputElement; input.type = "checkbox"; input.checked = visibility[id]; input.addEventListener("change", () => { visibility[id] = input.checked; applyVisibility(); }); label.append(input, el("span", undefined, layerLabels[id])); const row = el("div", "layer-row"); row.append(label); layerSection.append(row); }); panel.append(layerSection);
  const motifSection = el("div", "section"); motifSection.append(el("div", "section-title", "Surface motifs")); const select = el("select") as HTMLSelectElement; for (const [value, label] of [["visible", "Visible"], ["transparent", "Transparent"], ["hidden", "Hidden"]] as const) { const option = el("option") as HTMLOptionElement; option.value = value; option.textContent = label; option.selected = motifMode === value; select.append(option); } select.addEventListener("change", () => { motifMode = select.value as typeof motifMode; renderSnapshot(); }); const motifRow = el("div", "motif-row"); motifRow.append(select, el("span", "muted", `${snapshot.motifs.length} recorded surface motifs`)); motifSection.append(motifRow); panel.append(motifSection);
  const counts = el("div", "section"); counts.append(el("div", "section-title", "Loaded counts"), el("div", "source-line", `members ${snapshot.members.length} · attachments ${snapshot.attachments.length} · D1 ${snapshot.fabricationAdditions.length} · removable ${snapshot.removableSupports.length}`)); panel.append(counts);
  selectionPanel = el("div", "selection"); panel.append(selectionPanel); refreshSelection();
}
let selectionPanel = el("div", "selection");
renderer.domElement.addEventListener("pointerdown", (event) => { const rect = renderer.domElement.getBoundingClientRect(); const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(pickables, false)[0]; selection = (hit?.object.userData.selection as Selection | undefined) ?? null; refreshSelection(); });
function frame(): void { controls?.update(); renderer.render(scene, camera); requestAnimationFrame(frame); }
renderSnapshot(); buildPanel(); frame();
