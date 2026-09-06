import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url));
const sharp = require("sharp");
const OUT = process.argv[2] ?? "J:/My Drive/codex/2026-09-06/files-pasted-by-the-user-temporary/outputs/production-v0-geometry-fidelity-fix-v0";
const RESEARCH = "J:/My Drive/codex/2026-09-06/files-pasted-by-the-user-skin-2/outputs";
const items = [
  { title: "Research M", path: `${RESEARCH}/astra-c-round2/geometry/M.stl` },
  { title: "Research M-R", path: `${RESEARCH}/astra-c-round4-mr-control/geometry/M-R.stl` },
  { title: "Fixed Production P1", path: `${OUT}/geometry/production-P1-before-repair.stl` },
  { title: "Fixed Production P3", path: `${OUT}/geometry/production-P3-final-native.stl` },
];

function readBinaryStl(path) {
  const bytes = readFileSync(path);
  const faces = bytes.readUInt32LE(80);
  if (bytes.length < 84 + faces * 50) throw new Error(`Invalid binary STL: ${path}`);
  const vertices = new Float32Array(faces * 9);
  for (let face = 0; face < faces; face++) {
    const base = 84 + face * 50 + 12;
    for (let value = 0; value < 9; value++) vertices[face * 9 + value] = bytes.readFloatLE(base + value * 4);
  }
  return { vertices, faces };
}

const geometry = items.map((item) => ({ ...item, ...readBinaryStl(item.path) }));

function project(view, x, y, z) {
  if (view === "front") return [x, z, y];
  if (view === "side") return [y, z, x];
  if (view === "oblique") return [(x - y) * 0.7071, z + (x + y) * 0.16, x + y];
  if (view === "axial") return [x, y, z];
  return [x + y * 0.52, z + x * 0.14, y - x * 0.52];
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function render(view) {
  const width = 1920; const height = 640; const panelWidth = width / geometry.length;
  const projectedGeometry = geometry.map((item) => {
    const points = [];
    for (let index = 0; index < item.vertices.length; index += 3) {
      points.push(project(view, item.vertices[index], item.vertices[index + 1], item.vertices[index + 2]));
    }
    let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
    for (const point of points) {
      minU = Math.min(minU, point[0]); maxU = Math.max(maxU, point[0]);
      minV = Math.min(minV, point[1]); maxV = Math.max(maxV, point[1]);
    }
    return { item, points, minU, maxU, minV, maxV };
  });
  const maximumSpanU = Math.max(...projectedGeometry.map((entry) => entry.maxU - entry.minU));
  const maximumSpanV = Math.max(...projectedGeometry.map((entry) => entry.maxV - entry.minV));
  const scale = Math.min(410 / Math.max(maximumSpanU, 1), 480 / Math.max(maximumSpanV, 1));
  const labels = { front: "Front", side: "Side", oblique: "Oblique 45°", axial: "Axial", author: "Author / Bambu-like" };
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#fbfaf7"/>`,
    `<text x="28" y="34" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#332b26">C Production v0 Geometry Fidelity · ${labels[view]} · same projection / scale / orientation</text>`,
  ];
  projectedGeometry.forEach(({ item, minU, maxU, minV, maxV }, panel) => {
    const left = panel * panelWidth;
    const shapeU = (value) => panelWidth / 2 + (value - (minU + maxU) / 2) * scale;
    const shapeV = (value) => 332 - (value - (minV + maxV) / 2) * scale;
    svg.push(`<rect x="${left + 8}" y="52" width="${panelWidth - 16}" height="560" rx="8" fill="#fff" stroke="#d7cdc5"/>`);
    svg.push(`<text x="${left + 24}" y="83" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#4a3a31">${escapeXml(item.title)}</text>`);
    svg.push(`<text x="${left + 24}" y="105" font-family="Arial,sans-serif" font-size="12" fill="#786b63">${item.faces.toLocaleString()} triangles · support hidden</text>`);
    const stride = Math.max(1, Math.ceil(item.faces / 15000));
    const faces = [];
    for (let face = 0; face < item.faces; face += stride) {
      const index = face * 9;
      const a = project(view, item.vertices[index], item.vertices[index + 1], item.vertices[index + 2]);
      const b = project(view, item.vertices[index + 3], item.vertices[index + 4], item.vertices[index + 5]);
      const c = project(view, item.vertices[index + 6], item.vertices[index + 7], item.vertices[index + 8]);
      faces.push({ a, b, c, depth: (a[2] + b[2] + c[2]) / 3 });
    }
    faces.sort((a, b) => a.depth - b.depth);
    const minDepth = Math.min(...faces.map((face) => face.depth));
    const depthSpan = Math.max(Math.max(...faces.map((face) => face.depth)) - minDepth, 1e-6);
    for (const face of faces) {
      const light = Math.round(132 + ((face.depth - minDepth) / depthSpan) * 72);
      const fill = `rgb(${Math.min(225, light + 25)},${Math.min(190, light - 8)},${Math.max(55, light - 48)})`;
      const points = [face.a, face.b, face.c].map((point) => `${(left + shapeU(point[0])).toFixed(2)},${shapeV(point[1]).toFixed(2)}`).join(" ");
      svg.push(`<polygon points="${points}" fill="${fill}" fill-opacity="0.74" stroke="#5b4538" stroke-opacity="0.12" stroke-width="0.32"/>`);
    }
  });
  svg.push(`<text x="28" y="632" font-family="Arial,sans-serif" font-size="12" fill="#786b63">Diagnostic comparison only. Artwork gate: C SOL / Author review required.</text>`, "</svg>");
  return svg.join("");
}

mkdirSync(`${OUT}/images`, { recursive: true });
for (const view of ["front", "side", "oblique", "axial", "author"]) {
  const name = view === "author" ? "author-view" : view;
  await sharp(Buffer.from(render(view))).png().toFile(`${OUT}/images/comparison-${name}.png`);
}
console.log(JSON.stringify({ output: `${OUT}/images`, views: ["front", "side", "oblique", "axial", "author-view"] }, null, 2));
