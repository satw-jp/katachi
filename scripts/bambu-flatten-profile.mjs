import fs from 'node:fs'
import path from 'node:path'

const [category, presetName, outputPath] = process.argv.slice(2)

if (!category || !presetName || !outputPath) {
  console.error('usage: node scripts/bambu-flatten-profile.mjs <machine|process|filament> <preset-name> <output.json>')
  process.exit(2)
}

const roots = [
  '/Applications/BambuStudio.app/Contents/Resources/profiles/BBL',
  path.join(process.env.HOME ?? '', 'Library/Application Support/BambuStudio/system/BBL'),
]

const files = roots.flatMap((root) => {
  const dir = path.join(root, category)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true })
    .filter((entry) => typeof entry === 'string' && entry.endsWith('.json'))
    .map((entry) => path.join(dir, entry))
})

const presets = new Map()
for (const file of files) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof value.name === 'string' && !presets.has(value.name)) {
      presets.set(value.name, value)
    }
  } catch {
    // Bambu's profile directories may contain unrelated JSON metadata.
  }
}

const stack = []
function flatten(name) {
  if (stack.includes(name)) {
    throw new Error(`cyclic preset inheritance: ${[...stack, name].join(' -> ')}`)
  }
  const current = presets.get(name)
  if (!current) throw new Error(`preset not found: ${name}`)

  stack.push(name)
  const parent = typeof current.inherits === 'string' && current.inherits.length > 0
    ? flatten(current.inherits)
    : {}
  stack.pop()

  return { ...parent, ...current }
}

const flattened = flatten(presetName)
flattened.inherits = presetName
flattened.name = `${presetName} - Katachi CLI Full`
flattened.from = 'User'

fs.writeFileSync(outputPath, `${JSON.stringify(flattened, null, 2)}\n`)
console.log(JSON.stringify({
  category,
  presetName,
  outputPath,
  keys: Object.keys(flattened).length,
}, null, 2))
