import type * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const PALETTE = ["#e76f51", "#2a9d8f", "#e9c46a", "#457b9d", "#9b5de5", "#f4a261", "#43aa8b", "#577590"];

export interface DenseFlowerOpeningSource {
  opening_id: string;
  area_mm2: number;
  perimeter_mm: number;
  shape_index_p2_over_4piA: number;
  centroid_x_mm: number;
  centroid_y_mm: number;
  centroid_z_mm: number;
  normal_x: number;
  normal_y: number;
  normal_z: number;
}

export interface DenseFlowerReport {
  schema: string;
  source_shape: { sha256: string };
  method: {
    measurement_surface_offset_mm: number;
    minimum_area_mm2: number;
    limitation: string;
  };
  counts: { reported_openings: number };
  openings: DenseFlowerOpeningSource[];
}

export interface DenseFlowerOpening {
  id: string;
  color: string;
  areaMm2: number;
  perimeterMm: number;
  shapeIndex: number;
  centroidMm: { x: number; y: number; z: number };
  averageNormal: { x: number; y: number; z: number };
  geometry: THREE.BufferGeometry;
}

export interface DenseFlowerSample {
  master: THREE.BufferGeometry;
  openings: DenseFlowerOpening[];
  report: DenseFlowerReport;
}

export function denseFlowerRows(report: DenseFlowerReport, limit = 40): Omit<DenseFlowerOpening, "geometry">[] {
  return report.openings.slice(0, limit).map((opening, index) => ({
    id: opening.opening_id,
    color: PALETTE[index % PALETTE.length],
    areaMm2: opening.area_mm2,
    perimeterMm: opening.perimeter_mm,
    shapeIndex: opening.shape_index_p2_over_4piA,
    centroidMm: { x: opening.centroid_x_mm, y: opening.centroid_y_mm, z: opening.centroid_z_mm },
    averageNormal: { x: opening.normal_x, y: opening.normal_y, z: opening.normal_z },
  }));
}

export async function loadDenseFlowerSample(
  onProgress?: (loaded: number, total: number) => void,
): Promise<DenseFlowerSample> {
  const base = "./samples/dense-flower-v6";
  const reportResponse = await fetch(`${base}/openings.json`);
  if (!reportResponse.ok) throw new Error(`空隙情報を読めませんでした (${reportResponse.status})`);
  const report = await reportResponse.json() as DenseFlowerReport;
  const rows = denseFlowerRows(report, 40);
  const loader = new STLLoader();
  let loaded = 0;
  const total = rows.length + 1;
  const loadGeometry = async (url: string): Promise<THREE.BufferGeometry> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} を読めませんでした (${response.status})`);
    const geometry = loader.parse(await response.arrayBuffer());
    loaded++;
    onProgress?.(loaded, total);
    return geometry;
  };
  const [master, ...openingGeometries] = await Promise.all([
    loadGeometry(`${base}/master.stl`),
    ...rows.map((row) => loadGeometry(`${base}/${row.id}.stl`)),
  ]);
  return {
    master,
    openings: rows.map((row, index) => ({ ...row, geometry: openingGeometries[index] })),
    report,
  };
}
