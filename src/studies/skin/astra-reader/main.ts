import * as THREE from "three";
import manifest from "./manifest.json";
import { boundedJunctionDisplayRadius, boundedPermanentDisplayRadius, buildAstraResearchSnapshot, deriveConnectivityContext, type CandidateId, type Fact, type JunctionRecord, type LayerId, type MemberRecord } from "./snapshot.ts";
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
const highlightColors = { selected: 0xfff19a, junction: 0xffc857, adjacent: 0x55d9ff, parent: 0xff63c7 };
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
let highlightGroup: THREE.Group | null = null;
let candidate: CandidateId = "B_OPEN";
let snapshot = buildAstraResearchSnapshot(candidate);
let selection: Selection = null;
const visibility = { ...defaultVisibility };
let motifMode: "visible" | "transparent" | "hidden" = "visible";

function resize(): void { const width = viewport.clientWidth; const height = viewport.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); }
window.addEventListener("resize", resize); resize();
function disposeObject(object: THREE.Object3D): void { object.traverse((child) => { if (child instanceof THREE.Mesh || child instanceof THREE.Line) { child.geometry.dispose(); if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose()); else child.material.dispose(); } }); }
function clearScene(): void { while (root.children.length) { const child = root.children.pop(); if (child) disposeObject(child); } pickables.length = 0; layerGroups.clear(); highlightGroup = null; }
function line(points: { x: number; y: number; z: number }[], color: number, opacity = 1): THREE.Line { const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, p.z))); const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); return new THREE.Line(geometry, material); }
function tube(member: MemberRecord, color: number, radius: number, opacity: number, overlay = false): THREE.Mesh { const geometry = new THREE.TubeGeometry(memberCurve(member), Math.max(4, Math.min(48, member.points.length * 6)), radius, 6, false); const material = overlay ? new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false }) : new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: .72, metalness: .05 }); const mesh = new THREE.Mesh(geometry, material); if (overlay) mesh.renderOrder = 10; return mesh; }
function memberCurve(member: MemberRecord): THREE.CatmullRomCurve3 { const vectors = member.points.map((point) => new THREE.Vector3(point.x, point.y, point.z)); if (vectors.length === 1) vectors.push(vectors[0].clone().add(new THREE.Vector3(.5, 0, 0))); return new THREE.CatmullRomCurve3(vectors, false, "centripetal"); }
function connector(start: THREE.Vector3, end: THREE.Vector3, color: number, radius: number, opacity: number): THREE.Mesh | null { if (start.distanceToSquared(end) < .0025) return null; const geometry = new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 1, radius, 6, false); const material = new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: .72, metalness: .05 }); return new THREE.Mesh(geometry, material); }
function nearestEndpoint(member: MemberRecord, target: THREE.Vector3): THREE.Vector3 { const endpoints = [member.points[0], member.points[member.points.length - 1]].filter((point): point is MemberRecord["points"][number] => Boolean(point)).map((point) => new THREE.Vector3(point.x, point.y, point.z)); const first = endpoints[0] ?? new THREE.Vector3(); return (endpoints.slice(1).reduce((nearest, point) => point.distanceToSquared(target) < nearest.distanceToSquared(target) ? point : nearest, first)).clone(); }
function highlightRadius(member: MemberRecord): number { return Math.max(.95, Math.min(2, member.radius * .8)); }
function junctionRadius(junction: JunctionRecord): number { const radii = junction.connectedMembers.value.map((id) => snapshot.members.find((member) => member.id === id)?.radius).filter((radius): radius is number => radius !== undefined); return boundedJunctionDisplayRadius(radii); }
function addPick(point: THREE.Vector3, radius: number, record: JunctionRecord | MemberRecord, kind: "junction" | "member", group: THREE.Group): void { const mesh = new THREE.Mesh(new THREE.SphereGeometry(Math.max(radius * 1.8, 1), 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false })); mesh.position.copy(point); mesh.userData.selection = { kind, record }; mesh.userData.layer = kind === "junction" ? "junctions" : (record as MemberRecord).layer; group.add(mesh); pickables.push(mesh); }
function renderSnapshot(): void {
  clearScene();
  const hostGroup = new THREE.Group(); const hostGeometry = new THREE.BufferGeometry(); hostGeometry.setAttribute("position", new THREE.Float32BufferAttribute(snapshot.host.vertices.flat(), 3)); hostGeometry.setIndex(snapshot.host.faces.flat()); hostGeometry.computeVertexNormals(); const hostMesh = new THREE.Mesh(hostGeometry, new THREE.MeshStandardMaterial({ color: colors.host, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide })); hostGroup.add(hostMesh); root.add(hostGroup); layerGroups.set("host", hostGroup);
  const groups: Record<Exclude<LayerId, "host">, THREE.Group> = { junctions: new THREE.Group(), core: new THREE.Group(), crossLinks: new THREE.Group(), attachments: new THREE.Group(), motifs: new THREE.Group(), fabricationD1: new THREE.Group(), removableSupport: new THREE.Group() };
  Object.entries(groups).forEach(([id, group]) => { layerGroups.set(id as LayerId, group); root.add(group); });
  snapshot.junctions.forEach((junction) => { const marker = new THREE.Mesh(new THREE.SphereGeometry(junctionRadius(junction), 10, 6), new THREE.MeshStandardMaterial({ color: colors.junctions, emissive: colors.junctions, emissiveIntensity: .18 })); marker.position.set(junction.position.value.x, junction.position.value.y, junction.position.value.z); groups.junctions.add(marker); addPick(marker.position, junctionRadius(junction), junction, "junction", groups.junctions); });
  const addGraphConnectors = (member: MemberRecord, group: THREE.Group): void => { for (const junctionId of member.connectedJunctions.value) { const junction = snapshot.junctions.find((candidateJunction) => candidateJunction.id === junctionId); if (!junction) continue; const node = new THREE.Vector3(junction.position.value.x, junction.position.value.y, junction.position.value.z); const bridge = connector(nearestEndpoint(member, node), node, colors[member.layer], boundedPermanentDisplayRadius(member.radius) * .92, .95); if (bridge) group.add(bridge); const joint = new THREE.Mesh(new THREE.SphereGeometry(boundedPermanentDisplayRadius(member.radius) * 1.08, 8, 6), new THREE.MeshStandardMaterial({ color: colors[member.layer], roughness: .72, metalness: .05 })); joint.position.copy(node); group.add(joint); } };
  const addMembers = (members: MemberRecord[], connectGraph = false) => members.forEach((member) => { const group = groups[member.layer as Exclude<LayerId, "host">]; const display = tube(member, colors[member.layer], boundedPermanentDisplayRadius(member.radius), .95); group.add(display); if (connectGraph) addGraphConnectors(member, group); addPick(midpoint(member.points), member.radius, member, "member", group); });
  addMembers(snapshot.members, true); addMembers(snapshot.fabricationAdditions); addMembers(snapshot.removableSupports);
  snapshot.motifs.forEach((motif) => { const display = line(motif.points, colors.motifs, motifMode === "transparent" ? .2 : 1); display.userData.motif = true; groups.motifs.add(display); });
  highlightGroup = new THREE.Group(); highlightGroup.name = "connectivity-highlight"; root.add(highlightGroup);
  applyVisibility(); refreshHighlight();
}
function applyVisibility(): void { layerGroups.forEach((group, id) => { group.visible = visibility[id] && (id !== "motifs" || motifMode !== "hidden"); }); refreshHighlight(); }
function valueFact<T>(value: T, provenance: Fact<T>["provenance"]): Fact<T> { return { value, provenance }; }
function visibleLayer(id: LayerId): boolean { return visibility[id] && (id !== "motifs" || motifMode !== "hidden"); }
function clearHighlights(): void { if (!highlightGroup) return; while (highlightGroup.children.length) { const child = highlightGroup.children.pop(); if (child) disposeObject(child); } }
function highlightJunction(junction: JunctionRecord, color = highlightColors.junction, radius = junctionRadius(junction) * 1.35): void { if (!highlightGroup || !visibleLayer("junctions")) return; const marker = new THREE.Mesh(new THREE.SphereGeometry(Math.min(.95, Math.max(.4, radius)), 16, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .84, depthTest: false, depthWrite: false })); marker.position.set(junction.position.value.x, junction.position.value.y, junction.position.value.z); marker.renderOrder = 11; highlightGroup.add(marker); }
function refreshHighlight(): void {
  clearHighlights();
  if (!highlightGroup || !selection) return;
  if (selection.kind === "junction") { if (visibleLayer("junctions")) highlightJunction(selection.record); return; }
  const member = selection.record;
  if (!visibleLayer(member.layer)) return;
  const context = deriveConnectivityContext(snapshot, member);
  const byId = new Map(snapshot.members.map((candidateMember) => [candidateMember.id, candidateMember]));
  for (const adjacentId of context.adjacentMembers.value) { const adjacent = byId.get(adjacentId); if (adjacent && visibleLayer(adjacent.layer)) highlightGroup?.add(tube(adjacent, highlightColors.adjacent, Math.max(.55, Math.min(.95, adjacent.radius * .38)), .42, true)); }
  if (context.recordedParent.value) { const parent = byId.get(context.recordedParent.value); if (parent && visibleLayer(parent.layer)) highlightGroup?.add(tube(parent, highlightColors.parent, Math.max(.65, Math.min(1.1, parent.radius * .45)), .56, true)); }
  highlightGroup.add(tube(member, highlightColors.selected, highlightRadius(member), .78, true));
  if (visibleLayer("junctions")) { for (const junctionId of context.connectedJunctions.value) { const junction = snapshot.junctions.find((candidateJunction) => candidateJunction.id === junctionId); if (junction) highlightJunction(junction); } }
}
function refreshSelection(): void {
  selectionPanel.replaceChildren();
  if (!selection) { selectionPanel.append(el("div", "muted", "選択なし。junctionまたはmemberをクリックしてください。")); return; }
  selectionPanel.append(el("h3", undefined, `${selection.kind === "junction" ? "JUNCTION" : "MEMBER"} ${selection.record.id}`));
  if (selection.kind === "junction") {
    selectionPanel.append(factRow("ID", valueFact(selection.record.id, "RECORDED")), factRow("Position", selection.record.position), factRow("CONNECTED CONTEXT", selection.record.connectedMembers), factRow("Role / stage", valueFact("junction candidate", "DERIVED")), factRow("Added reason", valueFact(null, "NOT RECORDED")));
  } else {
    const record = selection.record; const context = deriveConnectivityContext(snapshot, record);
    selectionPanel.append(factRow("ID", valueFact(record.id, "RECORDED")), factRow("Role", record.role), factRow("RECORDED PARENT", context.recordedParent), factRow("CONNECTED JUNCTIONS", context.connectedJunctions), factRow("DERIVED ADJACENCY", context.adjacentMembers), factRow("Target surface component / motif", context.target), factRow("Added stage", record.addedStage), factRow("Added reason", record.addedReason), factRow("Diameter / radius", valueFact(record.radius, "RECORDED")));
    if (!visibleLayer(record.layer)) selectionPanel.append(el("div", "muted", "選択layerが非表示のため、highlightは抑制されています。"));
    selectionPanel.append(el("div", "context-legend", "表示: selected / junction / DERIVED adjacency / RECORDED parent"));
  }
}
function buildPanel(): void {
  panel.replaceChildren(); panel.append(el("div", "panel-title", manifest.title)); panel.append(el("p", "intro", "既存Astra Research成果を読むためのResearch-only viewer。編集・再生成・Exportはありません。"));
  const candidateSection = el("div", "section"); candidateSection.append(el("div", "section-title", "Candidate / same camera")); const candidateRow = el("div", "candidate-row"); for (const id of ["B_OPEN", "B_PARTICIPATING"] as const) { const button = el("button", id === candidate ? "active" : undefined, id); button.type = "button"; button.addEventListener("click", () => { candidate = id; selection = null; snapshot = buildAstraResearchSnapshot(candidate); renderSnapshot(); buildPanel(); }); candidateRow.append(button); } candidateSection.append(candidateRow, el("div", "source-line", `source junctions ${snapshot.source.sourceJunctionCount.value} · surface components ${snapshot.source.surfaceComponentCount.value}`)); panel.append(candidateSection);
  const layerSection = el("div", "section"); layerSection.append(el("div", "section-title", "Layers")); (Object.keys(layerLabels) as LayerId[]).forEach((id) => { const label = el("label"); const input = el("input") as HTMLInputElement; input.type = "checkbox"; input.checked = visibility[id]; input.addEventListener("change", () => { visibility[id] = input.checked; applyVisibility(); refreshSelection(); }); label.append(input, el("span", undefined, layerLabels[id])); const row = el("div", "layer-row"); row.append(label); layerSection.append(row); }); panel.append(layerSection);
  const motifSection = el("div", "section"); motifSection.append(el("div", "section-title", "Surface motifs")); const select = el("select") as HTMLSelectElement; for (const [value, label] of [["visible", "Visible"], ["transparent", "Transparent"], ["hidden", "Hidden"]] as const) { const option = el("option") as HTMLOptionElement; option.value = value; option.textContent = label; option.selected = motifMode === value; select.append(option); } select.addEventListener("change", () => { motifMode = select.value as typeof motifMode; renderSnapshot(); }); const motifRow = el("div", "motif-row"); motifRow.append(select, el("span", "muted", `${snapshot.motifs.length} recorded surface motifs`)); motifSection.append(motifRow); panel.append(motifSection);
  const counts = el("div", "section"); counts.append(el("div", "section-title", "Loaded counts"), el("div", "source-line", `members ${snapshot.members.length} · attachments ${snapshot.attachments.length} · D1 ${snapshot.fabricationAdditions.length} · removable ${snapshot.removableSupports.length}`)); panel.append(counts);
  selectionPanel = el("div", "selection"); panel.append(selectionPanel); refreshSelection();
}
let selectionPanel = el("div", "selection");
renderer.domElement.addEventListener("pointerdown", (event) => { const rect = renderer.domElement.getBoundingClientRect(); const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(pickables, false).find((intersection) => visibleLayer(intersection.object.userData.layer as LayerId)); selection = (hit?.object.userData.selection as Selection | undefined) ?? null; refreshSelection(); refreshHighlight(); });
function frame(): void { controls?.update(); renderer.render(scene, camera); requestAnimationFrame(frame); }
renderSnapshot(); buildPanel(); frame();
