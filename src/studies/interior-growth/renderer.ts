// ---------------------------------------------------------------------------
// S-interior-growth's comparison renderer (instruction §9). ONE shared
// THREE.PerspectiveCamera + OrbitControls, THREE separate THREE.Scene
// objects (field-only / coin-constrained / ring-constrained) rendered side
// by side into scissored viewports of a SINGLE canvas — using literally the
// same camera object for all three viewports is what guarantees "同一camera
// / 同一Scale" by construction, rather than by careful syncing of 3 separate
// cameras.
//
// Bead/instanced-mesh display (not raymarch GLSL): each accepted unit's
// points become small spheres in an InstancedMesh, same idiom S-skin's
// renderer.ts established for its capacity-unlimited bead view. Kept as
// spheres rather than a smooth-min raymarch composite — three synchronized
// raymarch shaders would need 3x the uniform budget skin already hit limits
// on once; beads read the network structure (accept/reject/void) more
// directly than a fused blob would anyway, which is the point of this
// specific comparison.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildPlateOffset, hostBounds, hostTopOffset, waistedRadius, type HostFixtureId, type Vec3 } from "./field.ts";
import { sampleVoidCellCenters, unitCentroid, type GrowthResult, type GrowthVariant } from "./growth.ts";
import { computeProbeDepthField, computeSurfaceCoverage, getCoverageReferenceMesh } from "./coverage.ts";
import type { MeshBuildResult } from "../cloud-sculpt/meshExport.ts";

const PANEL_ORDER: GrowthVariant[] = ["field-only", "coin-constrained", "ring-constrained"];

const PANEL_LABEL: Record<GrowthVariant, string> = {
  "field-only": "Field only（制約なし）",
  "coin-constrained": "Coin constrained",
  "ring-constrained": "Ring constrained",
};

const ROOT_COLOR = new THREE.Color(0xffb454);
const UNIT_COLOR = new THREE.Color(0x6f9bd8);
const REJECTED_COLOR = 0xd9534f;
const EDGE_COLOR = 0x8fa0b3;
const EXTERIOR_VOID_COLOR = 0x4fc3f7;
const CLOSED_VOID_COLOR = 0xff7043;
const HOST_WIRE_COLOR = 0x51606f;
const PLATE_COLOR = 0x34424f;
const BUILD_VOLUME_COLOR = 0x3d4f5c;
const TOP_REACHED_COLOR = 0x66d98c;
const LOWEST_POINT_COLOR = 0xffb454;
const HIGHEST_POINT_COLOR = 0x66d98c;
// Plan doc §6 3D display spec: covered=緑, uncovered=暗い灰. "現在目標にしている
// 領域"(yellow) is NOT rendered — it's transient generator-loop state, not
// part of the persisted GrowthResult, and this Study doesn't animate
// generation step-by-step (see updateCoverage's own comment) — an honest
// scope decision, not a hidden gap. "support制約で棄却された到達枝"(red) is
// already the existing rejectedMesh above; no separate color needed there.
const COVERED_SAMPLE_COLOR = new THREE.Color(0x5fd97f);
const UNCOVERED_SAMPLE_COLOR = new THREE.Color(0x3a3f45);

const UNIT_CAP = 6000;
const REJECTED_CAP = 4000;
const VOID_CAP = 4000;
const COVERAGE_SAMPLE_CAP = 4500; // >= coverage.ts's COVERAGE_SAMPLE_COUNT (4000)

interface Panel {
  key: GrowthVariant;
  scene: THREE.Scene;
  unitsMesh: THREE.InstancedMesh;
  rejectedMesh: THREE.InstancedMesh;
  edgeLines: THREE.LineSegments;
  surfaceMesh: THREE.Mesh;
  cachedSurfaceSource: MeshBuildResult | null;
  voidExteriorMesh: THREE.InstancedMesh;
  voidClosedMesh: THREE.InstancedMesh;
  coverageMesh: THREE.InstancedMesh;
  hostGroup: THREE.Group;
  cachedHostKey: string | null;
  markersGroup: THREE.Group;
}

export interface RenderOptions {
  showSurfaceMesh: boolean;
  showRejected: boolean;
  showVoids: boolean;
  showCoverageSamples: boolean;
  voidResolution: number;
  blendK: number;
  unitPointRadiusFallback: number;
}

function buildHostWireframe(hostId: HostFixtureId): THREE.LineSegments {
  let geom: THREE.BufferGeometry;
  if (hostId === "box") {
    geom = new THREE.BoxGeometry(2, 2, 2);
  } else if (hostId === "sphere") {
    geom = new THREE.SphereGeometry(1.15, 24, 16);
  } else {
    const b = hostBounds("waisted");
    const steps = 28;
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= steps; i++) {
      const y = b.min.y + ((b.max.y - b.min.y) * i) / steps;
      profile.push(new THREE.Vector2(Math.max(0.001, waistedRadius(y)), y));
    }
    geom = new THREE.LatheGeometry(profile, 24);
  }
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geom),
    new THREE.LineBasicMaterial({ color: HOST_WIRE_COLOR, transparent: true, opacity: 0.45 }),
  );
  return wire;
}

function buildPlateMesh(hostId: HostFixtureId, buildAxis: Vec3): THREE.Mesh {
  const b = hostBounds(hostId);
  const size = Math.max(b.size.x, b.size.y, b.size.z) * 1.7;
  const geom = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: PLATE_COLOR, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geom, mat);
  const normal = new THREE.Vector3(buildAxis.x, buildAxis.y, buildAxis.z).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const offset = buildPlateOffset(hostId, buildAxis);
  mesh.position.copy(normal.clone().multiplyScalar(offset));
  return mesh;
}

/** §7 "build volumeのwireframe box" — sized directly from buildVolumeMm/scaleMmPerUnit along world x/y/z (no rotation: buildVolumeMm is already expressed in the same x/y/z terms hostBounds/fitHostToBuildVolume use), positioned so its face along -buildAxis sits exactly on the build plate. */
function buildVolumeWireframe(hostId: HostFixtureId, buildAxis: Vec3, buildVolumeMm: Vec3, scaleMmPerUnit: number): THREE.LineSegments {
  const sx = buildVolumeMm.x / scaleMmPerUnit;
  const sy = buildVolumeMm.y / scaleMmPerUnit;
  const sz = buildVolumeMm.z / scaleMmPerUnit;
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geom),
    new THREE.LineBasicMaterial({ color: BUILD_VOLUME_COLOR, transparent: true, opacity: 0.3 }),
  );
  const axis = new THREE.Vector3(buildAxis.x, buildAxis.y, buildAxis.z).normalize();
  const heightField = Math.abs(sx * axis.x + sy * axis.y + sz * axis.z);
  const plateOffset = buildPlateOffset(hostId, buildAxis);
  wire.position.copy(axis.clone().multiplyScalar(plateOffset + heightField / 2));
  return wire;
}

/** §7 "上端到達ライン" — a translucent plane at the height-coverage=0.95 threshold, plus small markers at the growth's lowest (build plate) and highest reached points (§7 "growthの最下点と最高点"). */
function buildMarkersGroup(result: GrowthResult): THREE.Group {
  const group = new THREE.Group();
  const buildAxis = new THREE.Vector3(result.envelope.buildAxis.x, result.envelope.buildAxis.y, result.envelope.buildAxis.z).normalize();
  const plateOffset = buildPlateOffset(result.hostId, result.envelope.buildAxis);
  const topOffset = hostTopOffset(result.hostId, result.envelope.buildAxis);
  const thresholdOffset = plateOffset + 0.95 * (topOffset - plateOffset);

  const b = hostBounds(result.hostId);
  const size = Math.max(b.size.x, b.size.y, b.size.z) * 1.4;
  const lineGeom = new THREE.PlaneGeometry(size, size);
  const lineMat = new THREE.MeshBasicMaterial({ color: TOP_REACHED_COLOR, transparent: true, opacity: result.topReached ? 0.28 : 0.12, side: THREE.DoubleSide });
  const linePlane = new THREE.Mesh(lineGeom, lineMat);
  linePlane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), buildAxis);
  linePlane.position.copy(buildAxis.clone().multiplyScalar(thresholdOffset));
  group.add(linePlane);

  const markerR = Math.max(0.02, (b.longest || 1) * 0.02);
  const lowMesh = new THREE.Mesh(new THREE.SphereGeometry(markerR, 8, 6), new THREE.MeshBasicMaterial({ color: LOWEST_POINT_COLOR }));
  lowMesh.position.copy(buildAxis.clone().multiplyScalar(plateOffset));
  group.add(lowMesh);

  if (result.units.length > 0) {
    let highestUnit = result.units[0];
    let highestProj = -Infinity;
    for (const u of result.units) {
      const c = unitCentroid(u);
      const proj = c.x * buildAxis.x + c.y * buildAxis.y + c.z * buildAxis.z;
      if (proj > highestProj) {
        highestProj = proj;
        highestUnit = u;
      }
    }
    const hc = unitCentroid(highestUnit);
    const highMesh = new THREE.Mesh(new THREE.SphereGeometry(markerR, 8, 6), new THREE.MeshBasicMaterial({ color: HIGHEST_POINT_COLOR }));
    highMesh.position.set(hc.x, hc.y, hc.z);
    group.add(highMesh);
  }

  return group;
}

export class InteriorGrowthRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private container: HTMLElement;
  private panels: Panel[];

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    this.camera.position.set(3.2, 2.6, 3.8);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    this.panels = PANEL_ORDER.map((key) => this.buildPanel(key));

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private buildPanel(key: GrowthVariant): Panel {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11161c);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(2.5, 3.5, 2);
    scene.add(dir);

    const unitsMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({}),
      UNIT_CAP,
    );
    unitsMesh.count = 0;
    // InstancedMesh's default frustum-culling bound is its GEOMETRY's own
    // bounding sphere (radius 1 at local origin) — it does not grow to cover
    // where individual instances actually sit once positioned via
    // setMatrixAt, so a mesh whose instances spread beyond that nominal
    // radius-1 sphere can be culled as a whole depending on camera framing.
    unitsMesh.frustumCulled = false;
    scene.add(unitsMesh);

    const rejectedMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 6, 4),
      new THREE.MeshBasicMaterial({ color: REJECTED_COLOR, transparent: true, opacity: 0.55 }),
      REJECTED_CAP,
    );
    rejectedMesh.count = 0;
    rejectedMesh.visible = false;
    scene.add(rejectedMesh);

    const edgeLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.75 }),
    );
    scene.add(edgeLines);

    // This is the actual triangle surface already built for the normal STL
    // path. The renderer never remeshes, so visual inspection and the save
    // gate refer to the same geometry.
    const surfaceMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({
        color: key === "field-only" ? 0x8994a3 : key === "coin-constrained" ? 0x4e91b8 : 0xb88355,
        roughness: 0.78,
        metalness: 0.04,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    );
    surfaceMesh.visible = false;
    surfaceMesh.frustumCulled = false;
    scene.add(surfaceMesh);

    const voidExteriorMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 5, 4),
      new THREE.MeshBasicMaterial({ color: EXTERIOR_VOID_COLOR, transparent: true, opacity: 0.32 }),
      VOID_CAP,
    );
    voidExteriorMesh.count = 0;
    scene.add(voidExteriorMesh);

    const voidClosedMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 5, 4),
      new THREE.MeshBasicMaterial({ color: CLOSED_VOID_COLOR, transparent: true, opacity: 0.45 }),
      VOID_CAP,
    );
    voidClosedMesh.count = 0;
    scene.add(voidClosedMesh);

    // Small markers (see updateCoverage's own radius comment) so this
    // toggleable overlay reads as a light dusting over the form rather than
    // obscuring it — plan doc §6 "形本体が読めなくならないようにする".
    const coverageMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 5, 4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55 }),
      COVERAGE_SAMPLE_CAP,
    );
    coverageMesh.count = 0;
    coverageMesh.visible = false;
    coverageMesh.frustumCulled = false;
    scene.add(coverageMesh);

    const hostGroup = new THREE.Group();
    scene.add(hostGroup);

    const markersGroup = new THREE.Group();
    scene.add(markersGroup);

    return {
      key,
      scene,
      unitsMesh,
      rejectedMesh,
      edgeLines,
      surfaceMesh,
      cachedSurfaceSource: null,
      voidExteriorMesh,
      voidClosedMesh,
      coverageMesh,
      hostGroup,
      cachedHostKey: null,
      markersGroup,
    };
  }

  resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    // updateStyle=false: setSize() otherwise overwrites the canvas's inline
    // width/height with LITERAL pixel values, permanently pinning it to
    // whatever #viewport's clientWidth happened to be at construction time
    // (before the sidebar panel's own DOM existed, so #viewport was briefly
    // full-window-width) — the canvas never tracked the container again
    // after that, silently covering the panel. Keeping the constructor's
    // width:100%/height:100% CSS in charge means the canvas always tracks
    // the container's CURRENT box, construction-order-independent.
    this.renderer.setSize(w, h, false);
  }

  /** Auto-frames the camera once, on the FIRST host known (or whenever the host changes) — never fights the user's own orbit afterward. */
  frameHost(hostId: HostFixtureId): void {
    const b = hostBounds(hostId);
    // 1.4x (not 0.9x): the host now occupies at most 90% of the build
    // volume box per axis (§2.1 10% study margin), and the build-volume
    // wireframe itself is drawn too — this margin keeps that box in frame,
    // not just the host.
    const radius = Math.max(b.size.x, b.size.y, b.size.z) * 1.4;
    this.camera.position.set(radius, radius * 0.8, radius);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private updateHostAndPlate(panel: Panel, hostId: HostFixtureId, buildAxis: Vec3, buildVolumeMm: Vec3, scaleMmPerUnit: number): void {
    const key = `${hostId}:${buildAxis.x},${buildAxis.y},${buildAxis.z}:${buildVolumeMm.x},${buildVolumeMm.y},${buildVolumeMm.z}:${scaleMmPerUnit.toFixed(4)}`;
    if (panel.cachedHostKey === key) return;
    panel.cachedHostKey = key;
    while (panel.hostGroup.children.length > 0) {
      const child = panel.hostGroup.children.pop()!;
      panel.hostGroup.remove(child);
    }
    panel.hostGroup.add(buildHostWireframe(hostId));
    panel.hostGroup.add(buildPlateMesh(hostId, buildAxis));
    panel.hostGroup.add(buildVolumeWireframe(hostId, buildAxis, buildVolumeMm, scaleMmPerUnit));
  }

  private updateMarkers(panel: Panel, result: GrowthResult): void {
    while (panel.markersGroup.children.length > 0) {
      panel.markersGroup.remove(panel.markersGroup.children[0]);
    }
    panel.markersGroup.add(buildMarkersGroup(result));
  }

  private updateUnits(panel: Panel, result: GrowthResult): void {
    const mesh = panel.unitsMesh;
    const dummy = new THREE.Object3D();
    let i = 0;
    outer: for (const u of result.units) {
      const color = u.supportContact === "build-plate" ? ROOT_COLOR : UNIT_COLOR;
      for (const p of u.points) {
        if (i >= UNIT_CAP) break outer;
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(Math.max(0.004, p.r));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private updateEdges(panel: Panel, result: GrowthResult): void {
    const byId = new Map(result.units.map((u) => [u.id, u]));
    const positions = new Float32Array(result.edges.length * 6);
    let i = 0;
    for (const e of result.edges) {
      const p = byId.get(e.parentId);
      const c = byId.get(e.childId);
      if (!p || !c) continue;
      const pc = unitCentroid(p);
      const cc = unitCentroid(c);
      positions[i * 6 + 0] = pc.x;
      positions[i * 6 + 1] = pc.y;
      positions[i * 6 + 2] = pc.z;
      positions[i * 6 + 3] = cc.x;
      positions[i * 6 + 4] = cc.y;
      positions[i * 6 + 5] = cc.z;
      i++;
    }
    panel.edgeLines.geometry.dispose();
    panel.edgeLines.geometry = new THREE.BufferGeometry();
    panel.edgeLines.geometry.setAttribute("position", new THREE.BufferAttribute(positions.subarray(0, i * 6), 3));
  }

  private updateSurface(panel: Panel, mesh: MeshBuildResult | undefined, show: boolean): void {
    panel.surfaceMesh.visible = show && mesh !== undefined;
    panel.unitsMesh.visible = !show;
    panel.edgeLines.visible = !show;
    // The top-reached plane is useful in the structural unit view, but it
    // obscures the silhouette when the author is judging the saved surface.
    panel.markersGroup.visible = !show;
    if (!mesh || panel.cachedSurfaceSource === mesh) return;
    panel.cachedSurfaceSource = mesh;
    const positions = new Float32Array(mesh.triangles.length * 9);
    let i = 0;
    for (const triangle of mesh.triangles) {
      for (const vertex of [triangle.a, triangle.b, triangle.c]) {
        positions[i++] = vertex.x;
        positions[i++] = vertex.y;
        positions[i++] = vertex.z;
      }
    }
    panel.surfaceMesh.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    panel.surfaceMesh.geometry = geometry;
  }

  private updateRejected(panel: Panel, result: GrowthResult, unitRadiusFallback: number, show: boolean): void {
    const mesh = panel.rejectedMesh;
    mesh.visible = show;
    if (!show) return;
    const dummy = new THREE.Object3D();
    const r = Math.max(0.01, unitRadiusFallback * 0.35);
    const n = Math.min(result.rejectedSamples.length, REJECTED_CAP);
    for (let i = 0; i < n; i++) {
      const s = result.rejectedSamples[i];
      dummy.position.set(s.center.x, s.center.y, s.center.z);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateVoids(panel: Panel, result: GrowthResult, options: RenderOptions): void {
    panel.voidExteriorMesh.visible = options.showVoids;
    panel.voidClosedMesh.visible = options.showVoids;
    if (!options.showVoids) return;
    const samples = sampleVoidCellCenters(result.hostId, result.units, options.blendK, options.voidResolution);
    const b = hostBounds(result.hostId);
    const r = (b.longest / options.voidResolution) * 0.42;
    const fill = (mesh: THREE.InstancedMesh, points: Vec3[]) => {
      const dummy = new THREE.Object3D();
      const n = Math.min(points.length, VOID_CAP);
      for (let i = 0; i < n; i++) {
        dummy.position.set(points[i].x, points[i].y, points[i].z);
        dummy.scale.setScalar(r);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    };
    fill(panel.voidExteriorMesh, samples.exteriorConnected);
    fill(panel.voidClosedMesh, samples.closed);
  }

  /**
   * Coverage reference samples (S1/S2 — surface-coverage plan doc §6), colored
   * covered/uncovered. Recomputed fresh from result.hostId/result.units each
   * call rather than stored on GrowthResult — same "one source of numbers,
   * never a second independently-drifting copy" convention updateVoids/
   * summarizeMetrics already follow for their own grid-based numbers.
   * "unreachable" samples render as uncovered (dark gray): the plan doc's §6
   * 3D-display list only names covered/uncovered/target/rejected, and
   * "material present but orphaned" should not occur given growNetwork's own
   * invariants (verified in growth.test.ts) — folding it visually into
   * uncovered is an honest simplification, not a hidden one.
   */
  private updateCoverage(panel: Panel, result: GrowthResult, show: boolean): void {
    const mesh = panel.coverageMesh;
    mesh.visible = show;
    if (!show) return;
    const samples = getCoverageReferenceMesh(result.hostId);
    const probeDepthField = computeProbeDepthField(result.params.unitRadius);
    const coverage = computeSurfaceCoverage(samples, result.units, probeDepthField);
    const dummy = new THREE.Object3D();
    const b = hostBounds(result.hostId);
    const r = Math.max(0.003, (b.longest || 1) * 0.006);
    const n = Math.min(coverage.classified.length, COVERAGE_SAMPLE_CAP);
    for (let i = 0; i < n; i++) {
      const c = coverage.classified[i];
      dummy.position.set(c.sample.point.x, c.sample.point.y, c.sample.point.z);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, c.status === "covered" ? COVERED_SAMPLE_COLOR : UNCOVERED_SAMPLE_COLOR);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /**
   * `host` is drawn in all three panels unconditionally (host/build-axis/
   * build-volume/printer selection should be visible immediately, before
   * "3候補生成" has ever run) — `results` may still have fewer than 3
   * entries; panels with no result yet just show the host/plate/build-volume
   * and stay otherwise empty (no top-reached line/markers without a result).
   */
  update(
    host: { hostId: HostFixtureId; buildAxis: Vec3; buildVolumeMm: Vec3; scaleMmPerUnit: number },
    results: Partial<Record<GrowthVariant, GrowthResult>>,
    meshes: Partial<Record<GrowthVariant, MeshBuildResult>>,
    options: RenderOptions,
  ): void {
    for (const panel of this.panels) {
      this.updateHostAndPlate(panel, host.hostId, host.buildAxis, host.buildVolumeMm, host.scaleMmPerUnit);
      const result = results[panel.key];
      if (result) {
        this.updateUnits(panel, result);
        this.updateEdges(panel, result);
        this.updateSurface(panel, meshes[panel.key], options.showSurfaceMesh);
        this.updateRejected(panel, result, options.unitPointRadiusFallback, options.showRejected);
        this.updateVoids(panel, result, options);
        this.updateCoverage(panel, result, options.showCoverageSamples);
        this.updateMarkers(panel, result);
      } else {
        this.updateSurface(panel, undefined, options.showSurfaceMesh);
        panel.unitsMesh.count = 0;
        panel.rejectedMesh.count = 0;
        panel.voidExteriorMesh.count = 0;
        panel.voidClosedMesh.count = 0;
        panel.coverageMesh.count = 0;
        while (panel.markersGroup.children.length > 0) panel.markersGroup.remove(panel.markersGroup.children[0]);
      }
    }
  }

  render(): void {
    this.controls.update();
    const totalW = Math.max(1, this.renderer.domElement.clientWidth);
    const totalH = Math.max(1, this.renderer.domElement.clientHeight);
    const panelW = Math.floor(totalW / this.panels.length);
    this.renderer.setScissorTest(true);
    for (let i = 0; i < this.panels.length; i++) {
      const x = i * panelW;
      const w = i === this.panels.length - 1 ? totalW - x : panelW;
      this.renderer.setViewport(x, 0, w, totalH);
      this.renderer.setScissor(x, 0, w, totalH);
      this.camera.aspect = w / totalH;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.panels[i].scene, this.camera);
    }
    this.renderer.setScissorTest(false);
  }

  panelLabels(): Record<GrowthVariant, string> {
    return PANEL_LABEL;
  }
}
