import { parentPort, workerData } from "node:worker_threads";
import {
  buildSkinMeshTrianglesSlice,
  type SkinMeshSliceInput,
} from "../src/studies/skin/meshExport.ts";

if (!parentPort) throw new Error("export mesh slice worker requires parentPort");

const input = workerData as SkinMeshSliceInput & { sliceIndex: number };
const triangles = buildSkinMeshTrianglesSlice(input);
const positions = new Float64Array(triangles.length * 9);
let offset = 0;
for (const triangle of triangles) {
  positions[offset++] = triangle.a.x;
  positions[offset++] = triangle.a.y;
  positions[offset++] = triangle.a.z;
  positions[offset++] = triangle.b.x;
  positions[offset++] = triangle.b.y;
  positions[offset++] = triangle.b.z;
  positions[offset++] = triangle.c.x;
  positions[offset++] = triangle.c.y;
  positions[offset++] = triangle.c.z;
}

parentPort.postMessage(
  { sliceIndex: input.sliceIndex, positions: positions.buffer, triangleCount: triangles.length },
  [positions.buffer],
);
parentPort.close();
