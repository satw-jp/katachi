import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { request, type SceneData, type TriangleMesh } from "./api.ts";

interface ViewModel { scene: THREE.Scene; host: THREE.Mesh; flowers: THREE.InstancedMesh; branches: THREE.Mesh }

function geometry(data: TriangleMesh): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(data.vertices, 3));
  result.setIndex(data.faces);
  result.computeVertexNormals();
  result.computeBoundingSphere();
  return result;
}

function createModel(data: SceneData): ViewModel {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x151d22);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x54606a, 2.4));
  const light = new THREE.DirectionalLight(0xffe5cb, 2.5);
  light.position.set(140, -200, 350);
  scene.add(light);
  const host = new THREE.Mesh(geometry(data.host), new THREE.MeshBasicMaterial({ color: 0x91a3b2, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  const flowers = new THREE.InstancedMesh(geometry(data.flower), new THREE.MeshLambertMaterial({ color: 0xf3c4a0, side: THREE.DoubleSide }), data.instances.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  data.instances.forEach((instance, index) => {
    const [w, x, y, z] = instance.rotation_quaternion_wxyz;
    // #33 is local-origin based: no composition-v0 anchor translation, no Host scale.
    matrix.compose(position.fromArray(instance.position_mm), rotation.set(x, y, z, w), scale.setScalar(instance.physical_scale));
    flowers.setMatrixAt(index, matrix);
  });
  flowers.instanceMatrix.needsUpdate = true;
  flowers.computeBoundingSphere();
  const branches = new THREE.Mesh(geometry(data.branches), new THREE.MeshLambertMaterial({ color: 0x65c9be, side: THREE.DoubleSide }));
  scene.add(host, flowers, branches);
  const grid = new THREE.GridHelper(220, 22, 0x475057, 0x29353c);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
  return { scene, host, flowers, branches };
}

function dispose(model: ViewModel): void {
  model.scene.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
  });
}

export class CreationView {
  private renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 4000);
  private controls: OrbitControls;
  private cache = new Map<string, ViewModel>();
  private models: ViewModel[] = [];
  private ticket = 0;
  private frame = 0;
  private fitted = false;
  private visibility = { host: true, flowers: true, branches: true };

  constructor(private container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-label", "実生成形状の3Dビュー。ドラッグで回転、ホイールで拡大、右ドラッグで移動");
    container.append(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 2000;
    this.controls.target.set(0, 0, 80);
    this.camera.position.set(280, -330, 220);
    this.controls.update();
    this.controls.addEventListener("change", this.render);
    new ResizeObserver(this.render).observe(container);
    this.render();
  }

  async show(ids: string[]): Promise<void> {
    const ticket = ++this.ticket;
    const models: ViewModel[] = [];
    for (const id of ids) {
      let model = this.cache.get(id);
      if (!model) {
        const data = await request<SceneData>(`/result/${encodeURIComponent(id)}/scene.json`);
        if (ticket !== this.ticket) return;
        model = createModel(data);
        this.cache.set(id, model);
      }
      models.push(model);
    }
    if (ticket !== this.ticket) return;
    this.models = models;
    // GPU storage is bounded to the two visible candidates, not the whole project history.
    for (const [id, model] of this.cache) {
      if (!ids.includes(id)) { dispose(model); this.cache.delete(id); }
    }
    if (!this.fitted && models.length) { this.fit(); this.fitted = true; }
    this.render();
  }

  clear(): void {
    ++this.ticket;
    for (const model of this.cache.values()) dispose(model);
    this.cache.clear();
    this.models = [];
    this.fitted = false;
    this.render();
  }

  setVisibility(kind: "host" | "flowers" | "branches", visible: boolean): void {
    this.visibility[kind] = visible;
    this.render();
  }

  fit(): void {
    if (!this.models.length) return;
    const box = new THREE.Box3().setFromObject(this.models[0].host);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(1, -1.4, 0.8).normalize().multiplyScalar(size * 1.55));
    this.controls.update();
    this.render();
  }

  private render = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const width = Math.max(1, this.container.clientWidth);
      const height = Math.max(1, this.container.clientHeight);
      this.renderer.setSize(width, height, false);
      this.renderer.setScissorTest(false);
      this.renderer.setClearColor(0x151d22);
      this.renderer.clear();
      this.renderer.setScissorTest(true);
      const count = Math.max(1, this.models.length);
      this.models.forEach((model, index) => {
        model.host.visible = this.visibility.host;
        model.flowers.visible = this.visibility.flowers;
        model.branches.visible = this.visibility.branches;
        const x = Math.floor(width * index / count);
        const right = Math.floor(width * (index + 1) / count);
        this.renderer.setViewport(x, 0, right - x, height);
        this.renderer.setScissor(x, 0, right - x, height);
        this.camera.aspect = (right - x) / height;
        this.camera.updateProjectionMatrix();
        this.renderer.render(model.scene, this.camera);
      });
      this.renderer.setScissorTest(false);
    });
  };
}
