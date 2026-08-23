import fs from 'node:fs'
import readline from 'node:readline'

const [gcodePath, outputPath] = process.argv.slice(2)
if (!gcodePath) {
  console.error('usage: node scripts/analyze-bambu-gcode-layers.mjs <plate.gcode> [report.json]')
  process.exit(2)
}

const numericSetting = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value < 0) throw new Error(name + ' must be a non-negative number')
  return value
}

const CELL_MM = numericSetting('KATACHI_REACHABILITY_CELL_MM', 0.15)
const PAD_MM = 1
const MAX_SUPPORTED_OFFSET_MM = numericSetting('KATACHI_REACHABILITY_MAX_OFFSET_MM', 0.35)
const MIN_COMPONENT_AREA_MM2 = numericSetting('KATACHI_REACHABILITY_MIN_AREA_MM2', 0.045)
const FLOATING_SHELL_TARGET_SPACING_MM = numericSetting('KATACHI_FLOATING_SHELL_TARGET_SPACING_MM', 0.55)
const FLOATING_SHELL_TARGET_DEDUPE_MM = numericSetting('KATACHI_FLOATING_SHELL_TARGET_DEDUPE_MM', 0.35)
const EVIDENCE_DIR = process.env.KATACHI_REACHABILITY_EVIDENCE_DIR?.trim() || null

function createMotionState() {
  return {
    absoluteXy: true,
    relativeE: false,
    x: 0,
    y: 0,
    z: 0,
    e: 0,
    layer: 0,
    width: 0.42,
  }
}

function words(line) {
  const values = new Map()
  for (const match of line.matchAll(/([A-Z])(-?(?:\d+(?:\.\d*)?|\.\d+))/g)) {
    values.set(match[1], Number(match[2]))
  }
  return values
}

function applyNonMotion(line, state) {
  if (line === 'G90') state.absoluteXy = true
  else if (line === 'G91') state.absoluteXy = false
  else if (line === 'M82') state.relativeE = false
  else if (line === 'M83') state.relativeE = true
  else if (line.startsWith('G92')) {
    const values = words(line)
    if (values.has('X')) state.x = values.get('X')
    if (values.has('Y')) state.y = values.get('Y')
    if (values.has('Z')) state.z = values.get('Z')
    if (values.has('E')) state.e = values.get('E')
  }
}

function parseMotion(line, state) {
  const command = line.match(/^(G[0123])(?:\s|$)/)?.[1]
  if (!command) return null
  const values = words(line)
  const nextX = values.has('X')
    ? (state.absoluteXy ? values.get('X') : state.x + values.get('X'))
    : state.x
  const nextY = values.has('Y')
    ? (state.absoluteXy ? values.get('Y') : state.y + values.get('Y'))
    : state.y
  const nextZ = values.has('Z')
    ? (state.absoluteXy ? values.get('Z') : state.z + values.get('Z'))
    : state.z
  let extrusion = 0
  if (values.has('E')) {
    extrusion = state.relativeE ? values.get('E') : values.get('E') - state.e
    state.e = state.relativeE ? state.e + values.get('E') : values.get('E')
  }
  const motion = {
    command,
    x1: state.x,
    y1: state.y,
    z1: state.z,
    x2: nextX,
    y2: nextY,
    z2: nextZ,
    i: values.get('I'),
    j: values.get('J'),
    extrusion,
    width: state.width,
  }
  state.x = nextX
  state.y = nextY
  state.z = nextZ
  return motion
}

function sampleMotion(motion, visit) {
  const { command, x1, y1, x2, y2 } = motion
  if ((command === 'G2' || command === 'G3') && Number.isFinite(motion.i) && Number.isFinite(motion.j)) {
    const cx = x1 + motion.i
    const cy = y1 + motion.j
    const radius = Math.hypot(x1 - cx, y1 - cy)
    if (radius > 0) {
      const start = Math.atan2(y1 - cy, x1 - cx)
      const end = Math.atan2(y2 - cy, x2 - cx)
      let sweep = end - start
      if (command === 'G2') {
        if (sweep >= 0) sweep -= Math.PI * 2
      } else if (sweep <= 0) {
        sweep += Math.PI * 2
      }
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) * radius / (CELL_MM * 0.5)))
      for (let step = 0; step <= steps; step += 1) {
        const angle = start + sweep * (step / steps)
        visit(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
      }
      return
    }
  }
  const length = Math.hypot(x2 - x1, y2 - y1)
  const steps = Math.max(1, Math.ceil(length / (CELL_MM * 0.5)))
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    visit(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)
  }
}

function sampleMotionAtSpacing(motion, spacing, visit) {
  const { command, x1, y1, x2, y2 } = motion
  if ((command === 'G2' || command === 'G3') && Number.isFinite(motion.i) && Number.isFinite(motion.j)) {
    const cx = x1 + motion.i
    const cy = y1 + motion.j
    const radius = Math.hypot(x1 - cx, y1 - cy)
    if (radius > 0) {
      const start = Math.atan2(y1 - cy, x1 - cx)
      const end = Math.atan2(y2 - cy, x2 - cx)
      let sweep = end - start
      if (command === 'G2') {
        if (sweep >= 0) sweep -= Math.PI * 2
      } else if (sweep <= 0) {
        sweep += Math.PI * 2
      }
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) * radius / spacing))
      for (let step = 0; step <= steps; step += 1) {
        const angle = start + sweep * (step / steps)
        visit(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
      }
      return
    }
  }
  const length = Math.hypot(x2 - x1, y2 - y1)
  const steps = Math.max(1, Math.ceil(length / spacing))
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    visit(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)
  }
}

async function scanBounds() {
  const state = createMotionState()
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const input = readline.createInterface({ input: fs.createReadStream(gcodePath), crlfDelay: Infinity })
  for await (const rawLine of input) {
    const line = rawLine.trim()
    const layer = line.match(/^; layer num\/total_layer_count: (\d+)\//)
    if (layer) {
      state.layer = Number(layer[1])
      continue
    }
    const width = line.match(/^; LINE_WIDTH: ([\d.]+)/)
    if (width) {
      state.width = Number(width[1])
      continue
    }
    applyNonMotion(line, state)
    const motion = parseMotion(line, state)
    if (!motion || state.layer === 0 || motion.extrusion <= 1e-7) continue
    if (motion.x1 === motion.x2 && motion.y1 === motion.y2) continue
    sampleMotion(motion, (x, y) => {
      bounds.minX = Math.min(bounds.minX, x)
      bounds.minY = Math.min(bounds.minY, y)
      bounds.maxX = Math.max(bounds.maxX, x)
      bounds.maxY = Math.max(bounds.maxY, y)
    })
  }
  if (!Number.isFinite(bounds.minX)) throw new Error('no model-layer extrusion found')
  return bounds
}

function analyzeMask(mask, previousMask, grid, layer, extrusionMoves) {
  const visited = new Uint8Array(mask.length)
  const queue = new Int32Array(mask.length)
  const supportCells = Math.ceil(MAX_SUPPORTED_OFFSET_MM / CELL_MM)
  const minPixels = Math.max(1, Math.ceil(MIN_COMPONENT_AREA_MM2 / (CELL_MM * CELL_MM)))
  const components = []

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    visited[start] = 1
    let pixels = 0
    let supported = layer === 1
    let minCol = grid.cols
    let maxCol = 0
    let minRow = grid.rows
    let maxRow = 0
    while (head < tail) {
      const index = queue[head++]
      const row = Math.floor(index / grid.cols)
      const col = index - row * grid.cols
      pixels += 1
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      if (!supported && previousMask) {
        for (let dy = -supportCells; dy <= supportCells && !supported; dy += 1) {
          const py = row + dy
          if (py < 0 || py >= grid.rows) continue
          for (let dx = -supportCells; dx <= supportCells; dx += 1) {
            if (dx * dx + dy * dy > supportCells * supportCells) continue
            const px = col + dx
            if (px >= 0 && px < grid.cols && previousMask[py * grid.cols + px]) {
              supported = true
              break
            }
          }
        }
      }
      for (let dy = -1; dy <= 1; dy += 1) {
        const nextRow = row + dy
        if (nextRow < 0 || nextRow >= grid.rows) continue
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const nextCol = col + dx
          if (nextCol < 0 || nextCol >= grid.cols) continue
          const next = nextRow * grid.cols + nextCol
          if (mask[next] && !visited[next]) {
            visited[next] = 1
            queue[tail++] = next
          }
        }
      }
    }
    if (pixels < minPixels) continue
    components.push({
      pixels,
      areaMm2: Number((pixels * CELL_MM * CELL_MM).toFixed(4)),
      supported,
      boundsMm: {
        minX: Number((grid.minX + minCol * CELL_MM).toFixed(3)),
        minY: Number((grid.minY + minRow * CELL_MM).toFixed(3)),
        maxX: Number((grid.minX + (maxCol + 1) * CELL_MM).toFixed(3)),
        maxY: Number((grid.minY + (maxRow + 1) * CELL_MM).toFixed(3)),
      },
    })
  }

  const unsupported = components.filter((component) => !component.supported)
  const occupied = components.reduce((sum, component) => sum + component.pixels, 0)
  return {
    layer,
    zMm: Number((layer * 0.2).toFixed(3)),
    extrusionMoves,
    components: components.length,
    occupiedAreaMm2: Number((occupied * CELL_MM * CELL_MM).toFixed(3)),
    unsupportedComponents: unsupported.length,
    unsupportedAreaMm2: Number(unsupported.reduce((sum, component) => sum + component.areaMm2, 0).toFixed(3)),
    unsupported: unsupported.sort((a, b) => b.areaMm2 - a.areaMm2),
  }
}

async function analyzeLayers(bounds) {
  const grid = {
    minX: bounds.minX - PAD_MM,
    minY: bounds.minY - PAD_MM,
    cols: Math.ceil((bounds.maxX - bounds.minX + PAD_MM * 2) / CELL_MM) + 1,
    rows: Math.ceil((bounds.maxY - bounds.minY + PAD_MM * 2) / CELL_MM) + 1,
  }
  const state = createMotionState()
  let currentMask = new Uint8Array(grid.cols * grid.rows)
  let previousMask = null
  let currentLayer = 0
  let currentFeature = ''
  let currentFloatingShell = null
  let extrusionMoves = 0
  const layers = []
  const evidenceMasks = []
  const bambuFloatingShells = []
  const bambuFloatingTargets = []

  const finishFloatingShell = () => {
    const shell = currentFloatingShell
    currentFloatingShell = null
    if (!shell || shell.points.length === 0) return
    const xs = shell.points.map((point) => point.x)
    const ys = shell.points.map((point) => point.y)
    const boundsMm = {
      minX: Number(Math.min(...xs).toFixed(3)),
      minY: Number(Math.min(...ys).toFixed(3)),
      maxX: Number(Math.max(...xs).toFixed(3)),
      maxY: Number(Math.max(...ys).toFixed(3)),
    }
    const shellIndex = bambuFloatingShells.length
    bambuFloatingShells.push({
      layer: shell.layer,
      zMm: Number((shell.layer * 0.2).toFixed(3)),
      areaMm2: 0,
      centerMm: {
        x: Number(((boundsMm.minX + boundsMm.maxX) * 0.5).toFixed(3)),
        y: Number(((boundsMm.minY + boundsMm.maxY) * 0.5).toFixed(3)),
      },
      boundsMm,
      targetCount: shell.points.length,
      source: 'BambuStudio Floating vertical shell',
    })
    shell.points.forEach((point, targetIndex) => {
      bambuFloatingTargets.push({
        layer: shell.layer,
        zMm: Number((shell.layer * 0.2).toFixed(3)),
        areaMm2: 0,
        centerMm: { x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)) },
        boundsMm,
        shellIndex,
        targetIndex,
        source: 'BambuStudio Floating vertical shell',
      })
    })
  }

  const finishLayer = () => {
    finishFloatingShell()
    if (currentLayer === 0) return
    const layerReport = analyzeMask(currentMask, previousMask, grid, currentLayer, extrusionMoves)
    layers.push(layerReport)
    if (EVIDENCE_DIR && currentLayer <= 3) {
      evidenceMasks.push({
        layer: currentLayer,
        mask: currentMask.slice(),
        previousMask: previousMask?.slice() ?? null,
        report: layerReport,
      })
    }
    previousMask = currentMask
    currentMask = new Uint8Array(grid.cols * grid.rows)
    extrusionMoves = 0
  }

  const paint = (x, y, width) => {
    const col = Math.round((x - grid.minX) / CELL_MM)
    const row = Math.round((y - grid.minY) / CELL_MM)
    const radius = Math.max(1, Math.ceil((width * 0.5) / CELL_MM))
    for (let dy = -radius; dy <= radius; dy += 1) {
      const py = row + dy
      if (py < 0 || py >= grid.rows) continue
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue
        const px = col + dx
        if (px >= 0 && px < grid.cols) currentMask[py * grid.cols + px] = 1
      }
    }
  }

  const input = readline.createInterface({ input: fs.createReadStream(gcodePath), crlfDelay: Infinity })
  for await (const rawLine of input) {
    const line = rawLine.trim()
    const feature = line.match(/^; FEATURE: (.+)$/)
    if (feature) {
      finishFloatingShell()
      currentFeature = feature[1]
      if (currentFeature === 'Floating vertical shell') {
        currentFloatingShell = { layer: currentLayer, points: [], pointKeys: new Set() }
      }
      continue
    }
    const layer = line.match(/^; layer num\/total_layer_count: (\d+)\//)
    if (layer) {
      finishLayer()
      currentLayer = Number(layer[1])
      state.layer = currentLayer
      continue
    }
    const width = line.match(/^; LINE_WIDTH: ([\d.]+)/)
    if (width) {
      state.width = Number(width[1])
      continue
    }
    applyNonMotion(line, state)
    const motion = parseMotion(line, state)
    if (!motion || currentLayer === 0 || motion.extrusion <= 1e-7) continue
    if (motion.x1 === motion.x2 && motion.y1 === motion.y2) continue
    if (currentFloatingShell && currentFeature === 'Floating vertical shell') {
      sampleMotionAtSpacing(motion, FLOATING_SHELL_TARGET_SPACING_MM, (x, y) => {
        const key = Math.round(x / FLOATING_SHELL_TARGET_DEDUPE_MM) + ',' + Math.round(y / FLOATING_SHELL_TARGET_DEDUPE_MM)
        if (currentFloatingShell.pointKeys.has(key)) return
        currentFloatingShell.pointKeys.add(key)
        currentFloatingShell.points.push({ x, y })
      })
    }
    extrusionMoves += 1
    sampleMotion(motion, (x, y) => paint(x, y, motion.width))
  }
  finishLayer()
  return { grid, layers, evidenceMasks, bambuFloatingShells, bambuFloatingTargets }
}

function maskRuns(mask, grid, predicate) {
  const rects = []
  for (let row = 0; row < grid.rows; row += 1) {
    let start = -1
    for (let col = 0; col <= grid.cols; col += 1) {
      const index = row * grid.cols + col
      const active = col < grid.cols && mask[index] && predicate(index)
      if (active && start < 0) start = col
      if (!active && start >= 0) {
        rects.push(`<rect x="${start}" y="${grid.rows - row - 1}" width="${col - start}" height="1"/>`)
        start = -1
      }
    }
  }
  return rects.join('')
}

function writeLayerEvidence(entry, grid, outputDir) {
  const previous = entry.previousMask
  const previousOnly = previous ? maskRuns(previous, grid, (index) => !entry.mask[index]) : ''
  const currentOnly = maskRuns(entry.mask, grid, (index) => !previous?.[index])
  const overlap = previous ? maskRuns(entry.mask, grid, (index) => Boolean(previous[index])) : ''
  const report = entry.report
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid.cols} ${grid.rows + 38}" width="${grid.cols * 2}" height="${(grid.rows + 38) * 2}">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    `<g transform="translate(0 38)">`,
    `<g fill="#d1d5db">${previousOnly}</g>`,
    `<g fill="${entry.layer === 1 ? '#2563eb' : '#f59e0b'}">${currentOnly}</g>`,
    `<g fill="#0f766e">${overlap}</g>`,
    '</g>',
    `<text x="8" y="16" font-family="ui-monospace, monospace" font-size="12" fill="#111827">v071 layer ${entry.layer} · z ${report.zMm.toFixed(2)} mm · ${report.components} islands · unsupported ${report.unsupportedComponents}</text>`,
    `<text x="8" y="31" font-family="ui-monospace, monospace" font-size="10" fill="#4b5563">orange=current-only · teal=overlap with previous · gray=previous-only · blue=layer 1</text>`,
    '</svg>',
  ].join('')
  const file = `layer-${String(entry.layer).padStart(3, '0')}.svg`
  fs.writeFileSync(`${outputDir}/${file}`, svg)
  return file
}

const startedAt = performance.now()
const bounds = await scanBounds()
const { grid, layers, evidenceMasks, bambuFloatingShells, bambuFloatingTargets } = await analyzeLayers(bounds)
const floatingLayers = layers.filter((layer) => layer.unsupportedComponents > 0)
const floatingComponents = floatingLayers.flatMap((layer) => layer.unsupported.map((component) => ({
  layer: layer.layer,
  zMm: layer.zMm,
  areaMm2: component.areaMm2,
  centerMm: {
    x: Number(((component.boundsMm.minX + component.boundsMm.maxX) * 0.5).toFixed(3)),
    y: Number(((component.boundsMm.minY + component.boundsMm.maxY) * 0.5).toFixed(3)),
  },
  boundsMm: component.boundsMm,
})))
const feedbackComponents = [...floatingComponents]
for (const target of bambuFloatingTargets) {
  if (feedbackComponents.some((component) => (
    component.layer === target.layer
    && Math.hypot(component.centerMm.x - target.centerMm.x, component.centerMm.y - target.centerMm.y) < 0.2
  ))) continue
  feedbackComponents.push(target)
}
const feedbackLayers = new Set(feedbackComponents.map((component) => component.layer))
const firstThree = layers.slice(0, 3)
const evidenceFiles = EVIDENCE_DIR
  ? (() => {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
      return evidenceMasks.map((entry) => writeLayerEvidence(entry, grid, EVIDENCE_DIR))
    })()
  : []
const report = {
  schema: 'katachi.bambu.gcode-layer-reachability.v1',
  source: gcodePath,
  settings: {
    cellMm: CELL_MM,
    maximumSupportedOffsetMm: MAX_SUPPORTED_OFFSET_MM,
    minimumComponentAreaMm2: MIN_COMPONENT_AREA_MM2,
    floatingShellTargetSpacingMm: FLOATING_SHELL_TARGET_SPACING_MM,
    floatingShellTargetDedupeMm: FLOATING_SHELL_TARGET_DEDUPE_MM,
  },
  boundsMm: Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Number(value.toFixed(3))])),
  grid: { columns: grid.cols, rows: grid.rows },
  layerCount: layers.length,
  firstThreeLayers: firstThree,
  evidenceFiles,
  floatingLayerCount: feedbackLayers.size,
  floatingComponentCount: feedbackComponents.length,
  floatingComponents: feedbackComponents,
  rasterFloatingComponentCount: floatingComponents.length,
  bambuFloatingShellCount: bambuFloatingShells.length,
  bambuFloatingTargetCount: bambuFloatingTargets.length,
  bambuFloatingShells,
  firstFloatingLayers: floatingLayers.slice(0, 30).map((layer) => ({
    ...layer,
    unsupported: layer.unsupported.slice(0, 12),
  })),
  elapsedSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
  verdict: feedbackComponents.length === 0 ? 'PASS' : 'FAIL',
  limitation: 'Combines rasterized prior-layer reachability with Bambu Studio\'s emitted Floating vertical shell toolpath markers. It does not simulate thermal, mechanical, cooling, or removal behavior.',
}

const json = JSON.stringify(report, null, 2)
if (outputPath) {
  fs.writeFileSync(outputPath, `${json}\n`)
  console.log(JSON.stringify({
    output: outputPath,
    verdict: report.verdict,
    floatingLayerCount: report.floatingLayerCount,
    floatingComponentCount: report.floatingComponentCount,
    bambuFloatingShellCount: report.bambuFloatingShellCount,
    bambuFloatingTargetCount: report.bambuFloatingTargetCount,
    rasterFloatingComponentCount: report.rasterFloatingComponentCount,
    elapsedSeconds: report.elapsedSeconds,
  }, null, 2))
} else {
  console.log(json)
}
