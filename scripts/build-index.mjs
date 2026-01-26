import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const dataDir = path.join(root, 'public', 'data', 'wr-history-all')

const files = fs.readdirSync(dataDir).filter((file) => file.endsWith('.csv'))

const entries = new Map()
const prefix = 'wr_history_'

for (const file of files) {
  if (!file.startsWith(prefix)) continue

  let map = null
  let klass = null
  if (file.endsWith('_Demo.csv')) {
    klass = 'Demo'
    map = file.slice(prefix.length, -'_Demo.csv'.length)
  } else if (file.endsWith('_Solly.csv')) {
    klass = 'Solly'
    map = file.slice(prefix.length, -'_Solly.csv'.length)
  }

  if (!map || !klass) continue

  if (!entries.has(map)) {
    entries.set(map, { map, classes: [], files: {} })
  }

  const entry = entries.get(map)
  if (!entry.classes.includes(klass)) {
    entry.classes.push(klass)
  }

  entry.files[klass] = `data/wr-history-all/${file}`
}

const maps = Array.from(entries.values()).sort((a, b) => a.map.localeCompare(b.map))
for (const entry of maps) {
  entry.classes.sort()
}

const output = {
  generatedAt: new Date().toISOString(),
  count: maps.length,
  maps
}

const outPath = path.join(root, 'public', 'data', 'index.json')
fs.writeFileSync(outPath, JSON.stringify(output, null, 2))
console.log(`Wrote ${outPath} (${maps.length} maps)`) 
