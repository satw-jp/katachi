import fs from 'node:fs'

const [modelXmlPath, outputStlPath] = process.argv.slice(2)
if (!modelXmlPath || !outputStlPath) {
  console.error('usage: node scripts/extract-3mf-stl.mjs <object.model> <output.stl>')
  process.exit(2)
}

const xml = fs.readFileSync(modelXmlPath, 'utf8')
const vertices = []
const vertexPattern = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*\/>/g
for (const match of xml.matchAll(vertexPattern)) {
  vertices.push(Number(match[1]), Number(match[2]), Number(match[3]))
}

const trianglePattern = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"\s*\/>/g
const triangles = [...xml.matchAll(trianglePattern)]
if (vertices.length === 0 || triangles.length === 0) {
  throw new Error('3MF object contains no vertices or triangles')
}

const output = Buffer.allocUnsafe(84 + triangles.length * 50)
output.fill(0, 0, 80)
output.writeUInt32LE(triangles.length, 80)

for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
  const match = triangles[triangleIndex]
  const indices = [Number(match[1]), Number(match[2]), Number(match[3])]
  const points = indices.map((index) => vertices.slice(index * 3, index * 3 + 3))
  const ab = points[1].map((value, axis) => value - points[0][axis])
  const ac = points[2].map((value, axis) => value - points[0][axis])
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]
  const length = Math.hypot(...normal) || 1
  const offset = 84 + triangleIndex * 50
  normal.forEach((value, axis) => output.writeFloatLE(value / length, offset + axis * 4))
  points.flat().forEach((value, coordinate) => output.writeFloatLE(value, offset + 12 + coordinate * 4))
  output.writeUInt16LE(0, offset + 48)
}

fs.writeFileSync(outputStlPath, output)
console.log(JSON.stringify({
  vertices: vertices.length / 3,
  triangles: triangles.length,
  bytes: output.length,
  outputStlPath,
}, null, 2))
