import * as THREE from "three";
import type { MeshBuildResult } from "../cloud-sculpt/meshExport.ts";
import type { SkinRebuildProject } from "../skin/rebuild/model.ts";
import { SkinRenderer } from "../skin/renderer.ts";
import type { VoidAnalysisResult } from "./voidAnalysis.ts";

export type ViewerRepresentation = "Geometry" | "Graph" | "Surface" | "Void";

export interface ViewerSceneData {
  project: SkinRebuildProject;
  surface: MeshBuildResult;
  hostBounds: MeshBuildResult["sourceBounds"];
  voidAnalysis: VoidAnalysisResult;
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    });
  }
}

function addVoid(group: THREE.Group, result: VoidAnalysisResult): void {
  if (result.surfacePositions.length === 0) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(result.surfacePositions, 3));
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x65d6c7,
      roughness: 0.44,
      metalness: 0,
      transparent: true,
      opacity: 0.54,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  ));
}

function boundsPositions(bounds: ViewerSceneData["hostBounds"]): Float32Array {
  const { min, max } = bounds;
  return Float32Array.from([
    min.x, min.y, min.z, max.x, min.y, min.z,
    min.x, max.y, min.z, max.x, max.y, min.z,
    min.x, min.y, max.z, max.x, min.y, max.z,
    min.x, max.y, max.z, max.x, max.y, max.z,
  ]);
}

/**
 * Viewer adapter around the existing SKIN renderer. It supplies canonical
 * read-only data and toggles established renderer layers; only the Void
 * voxel surface is viewer-specific.
 */
export class ViewerRenderer {
  readonly skin: SkinRenderer;
  private readonly voidGroup = new THREE.Group();
  private bounds: ViewerSceneData["hostBounds"] | null = null;
  private representation: ViewerRepresentation = "Geometry";

  constructor(container: HTMLElement) {
    this.skin = new SkinRenderer(container);
    this.skin.setViewportMode("one");
    this.voidGroup.name = "fkei-analysis-viewer-void";
    this.skin.scene.add(this.voidGroup);
    const frame = () => {
      this.skin.render();
      requestAnimationFrame(frame);
    };
    frame();
  }

  setSceneData(data: ViewerSceneData): void {
    clearGroup(this.voidGroup);
    this.bounds = data.hostBounds;
    const settings = data.project.settings;
    this.skin.update(
      data.project.base.host,
      data.project.base.hostK,
      settings.surfaceThickness,
      data.project.patterns,
      settings.roundK,
      "plate",
      null,
      0,
      0,
    );
    this.skin.updateBeads(data.project.base.host, data.project.patterns, null);
    this.skin.setInternalStructure(data.project.finalGraph);
    this.skin.setPrintSupport(null);
    this.skin.setMeshOverlay(data.surface.triangles);
    this.skin.setViewportBoundsFromPositions(boundsPositions(data.hostBounds));
    addVoid(this.voidGroup, data.voidAnalysis);
    this.resetView();
    this.setRepresentation(this.representation);
  }

  setRepresentation(representation: ViewerRepresentation): void {
    this.representation = representation;
    this.voidGroup.visible = representation === "Void";
    if (representation === "Geometry") {
      this.skin.setInternalStructureVisible(true);
      this.skin.setInternalObservationMode("normal");
      this.skin.setViewMode("beads");
      return;
    }
    if (representation === "Graph") {
      this.skin.setInternalStructureVisible(true);
      this.skin.setInternalObservationMode("internalOnly");
      this.skin.setViewMode("beads");
      return;
    }
    if (representation === "Surface") {
      this.skin.setInternalStructureVisible(false);
      this.skin.setInternalObservationMode("normal");
      this.skin.setViewMode("mesh");
      return;
    }
    this.skin.setInternalStructureVisible(false);
    this.skin.setInternalObservationMode("internalOnly");
    this.skin.setViewMode("beads");
  }

  resetView(): void {
    if (!this.bounds) return;
    this.skin.resetViewportCamera(1);
  }

  cameraState(): { position: [number, number, number]; target: [number, number, number] } {
    return {
      position: [this.skin.camera.position.x, this.skin.camera.position.y, this.skin.camera.position.z],
      target: [this.skin.controls.target.x, this.skin.controls.target.y, this.skin.controls.target.z],
    };
  }
}
