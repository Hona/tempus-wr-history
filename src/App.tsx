import { useEffect, useMemo, useState } from 'react'
import './App.css'

type MapEntry = {
  map: string
  classes: string[]
  files: Record<string, string>
}

type IndexData = {
  generatedAt: string
  count: number
  maps: MapEntry[]
}

type CsvRow = {
  date: string
  record_time: string
  player: string
  map: string
  record_type: string
  source: string
  run_time: string
  split: string
  improvement: string
  inferred: string
  demo_id: string
  steam_id64: string
  steam_id: string
}

type DataPoint = CsvRow & {
  dateValue: number
  recordSeconds: number
}

function App() {
  const [index, setIndex] = useState<IndexData | null>(null)
  const [query, setQuery] = useState('')
  const [selectedMap, setSelectedMap] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<'Solly' | 'Demo'>('Solly')
  const [rows, setRows] = useState<CsvRow[]>([])
  const [loading, setLoading] = useState(false)
  const [includeInferred, setIncludeInferred] = useState(true)
  const [includeSubrecords, setIncludeSubrecords] = useState(false)
  const [showAllEntries, setShowAllEntries] = useState(false)
  const [showRawPoints, setShowRawPoints] = useState(false)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((res) => res.json())
      .then((data: IndexData) => {
        setIndex(data)
      })
      .catch(() => {
        setIndex(null)
      })
  }, [])

  useEffect(() => {
    if (!index) return
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const mapParam = params.get('map')
    const classParam = params.get('class')
    const found = mapParam && index.maps.find((entry) => entry.map === mapParam)
    if (found) {
      setSelectedMap(found.map)
      if (classParam === 'Demo' || classParam === 'Solly') {
        setSelectedClass(classParam)
      } else if (!found.classes.includes(selectedClass)) {
        setSelectedClass((found.classes[0] as 'Solly' | 'Demo') ?? 'Solly')
      }
    } else if (index.maps.length > 0) {
      setSelectedMap(index.maps[0].map)
    }
  }, [index])

  useEffect(() => {
    if (!selectedMap) return
    const params = new URLSearchParams()
    params.set('map', selectedMap)
    params.set('class', selectedClass)
    window.location.hash = params.toString()
  }, [selectedMap, selectedClass])

  useEffect(() => {
    if (!index || !selectedMap) return
    const entry = index.maps.find((item) => item.map === selectedMap)
    if (!entry) return
    if (!entry.classes.includes(selectedClass)) {
      const next = entry.classes[0] as 'Solly' | 'Demo'
      setSelectedClass(next)
      return
    }

    const file = entry.files[selectedClass]
    if (!file) return

    setLoading(true)
    fetch(`${import.meta.env.BASE_URL}${file}`)
      .then((res) => res.text())
      .then((text) => {
        const parsed = parseCsv(text)
        setRows(parsed)
      })
      .finally(() => setLoading(false))
  }, [index, selectedMap, selectedClass])

  const filtered = useMemo(() => {
    const list = rows.filter((row) => {
      if (!includeInferred && row.inferred === 'true') return false
      if (!includeSubrecords && isSubrecord(row.source)) return false
      return true
    })
    return list
  }, [rows, includeInferred, includeSubrecords])

  const timeline = useMemo(() => {
    const points = filtered
      .map((row) => {
        const dateValue = Date.parse(row.date)
        const recordSeconds = parseTimeToSeconds(row.record_time)
        if (!dateValue || recordSeconds == null) return null
        return { ...row, dateValue, recordSeconds }
      })
      .filter(Boolean) as DataPoint[]

    points.sort((a, b) => a.dateValue - b.dateValue)

    if (showAllEntries) return points

    let best = Number.POSITIVE_INFINITY
    return points.filter((row) => {
      if (row.recordSeconds < best - 0.0001) {
        best = row.recordSeconds
        return true
      }
      return false
    })
  }, [filtered, showAllEntries])

  const stats = useMemo(() => {
    if (timeline.length === 0) return null
    const best = timeline[timeline.length - 1]
    const first = timeline[0]
    return {
      count: timeline.length,
      bestTime: best.record_time,
      bestDate: best.date,
      firstDate: first.date
    }
  }, [timeline])

  const filteredMaps = useMemo(() => {
    if (!index) return []
    const term = query.trim().toLowerCase()
    if (!term) return index.maps
    return index.maps.filter((map) => map.map.toLowerCase().includes(term))
  }, [index, query])

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Tempus WR History</p>
          <h1>World records, mapped over time.</h1>
          <p className="lede">
            Browse deterministic WR history across every map. Switch between Solly and Demo,
            filter inferred runs, and export CSVs you can share.
          </p>
        </div>
        <div className="hero-meta">
          <div className="meta-card">
            <span>Maps indexed</span>
            <strong>{index?.count ?? '—'}</strong>
          </div>
          <div className="meta-card">
            <span>Data generated</span>
            <strong>{index?.generatedAt ? formatDate(index.generatedAt) : '—'}</strong>
          </div>
        </div>
      </header>

      <main className="layout">
        <aside className="panel">
          <div className="panel-header">
            <h2>Maps</h2>
            <span>{filteredMaps.length} results</span>
          </div>
          <input
            className="search"
            placeholder="Search map name…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="map-list">
            {filteredMaps.map((entry) => {
              const isActive = entry.map === selectedMap
              return (
                <button
                  key={entry.map}
                  className={`map-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedMap(entry.map)}
                >
                  <span>{entry.map}</span>
                  <em>{entry.classes.join(' / ')}</em>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="panel wide">
          <div className="panel-header">
            <div>
              <h2>{selectedMap ?? 'Select a map'}</h2>
              <p className="muted">WR timeline for {selectedClass}</p>
            </div>
            <div className="class-toggle">
              <button
                className={selectedClass === 'Solly' ? 'active' : ''}
                onClick={() => setSelectedClass('Solly')}
              >
                Solly
              </button>
              <button
                className={selectedClass === 'Demo' ? 'active' : ''}
                onClick={() => setSelectedClass('Demo')}
              >
                Demo
              </button>
            </div>
          </div>

          <div className="filters">
            <label>
              <input
                type="checkbox"
                checked={includeInferred}
                onChange={(event) => setIncludeInferred(event.target.checked)}
              />
              Include inferred map runs
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeSubrecords}
                onChange={(event) => setIncludeSubrecords(event.target.checked)}
              />
              Include bonus/course/segment/ranked
            </label>
            <label>
              <input
                type="checkbox"
                checked={showAllEntries}
                onChange={(event) => setShowAllEntries(event.target.checked)}
              />
              Show all WR announcements
            </label>
            <label>
              <input
                type="checkbox"
                checked={showRawPoints}
                onChange={(event) => setShowRawPoints(event.target.checked)}
              />
              Show raw points
            </label>
          </div>

          {loading ? (
            <div className="loading">Loading WR history…</div>
          ) : timeline.length === 0 ? (
            <div className="empty">No WR history found for this map/class.</div>
          ) : (
            <>
              <div className="stats">
                <div>
                  <span>Records</span>
                  <strong>{stats?.count}</strong>
                </div>
                <div>
                  <span>Best time</span>
                  <strong>{stats?.bestTime}</strong>
                </div>
                <div>
                  <span>First record</span>
                  <strong>{stats?.firstDate}</strong>
                </div>
                <div>
                  <span>Latest record</span>
                  <strong>{stats?.bestDate}</strong>
                </div>
                <a
                  className="download"
                  href={`${import.meta.env.BASE_URL}${index?.maps.find((item) => item.map === selectedMap)?.files[selectedClass]}`}
                  download
                >
                  Download CSV
                </a>
              </div>

              <div className="chart">
                <TimelineChart points={timeline} showRaw={showRawPoints} />
              </div>

              <div className="table">
                <div className="table-head">
                  <span>Date</span>
                  <span>Time</span>
                  <span>Player</span>
                  <span>Source</span>
                  <span>Demo</span>
                </div>
                {timeline.map((row) => (
                  <div key={`${row.demo_id}-${row.date}-${row.record_time}`} className="table-row">
                    <span>{row.date}</span>
                    <span>
                      {row.record_time}
                      {row.inferred === 'true' ? ' *' : ''}
                    </span>
                    <span>{row.player}</span>
                    <span>{row.source}</span>
                    <span>
                      {row.demo_id ? (
                        <a href={`https://tempus2.xyz/demos/${row.demo_id}`} target="_blank" rel="noreferrer">
                          {row.demo_id}
                        </a>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <p className="legend">* inferred from WR split in map-run message</p>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n')
  if (lines.length <= 1) return []
  const headers = lines[0].split(',')
  return lines.slice(1).map((line) => {
    const cells = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ''
    })
    return row as CsvRow
  })
}

function parseTimeToSeconds(value: string): number | null {
  if (!value) return null
  const parts = value.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  const seconds = Number.parseFloat(parts[parts.length - 1])
  const minutes = Number.parseInt(parts[parts.length - 2], 10)
  const hours = parts.length === 3 ? Number.parseInt(parts[0], 10) : 0
  if (Number.isNaN(seconds) || Number.isNaN(minutes) || Number.isNaN(hours)) return null
  return hours * 3600 + minutes * 60 + seconds
}

function isSubrecord(source: string) {
  if (!source) return false
  return (
    source.startsWith('Bonus') ||
    source.startsWith('Course') ||
    source.startsWith('C') ||
    source.startsWith('Ranked')
  )
}

function formatDate(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
}

function TimelineChart({ points, showRaw }: { points: DataPoint[]; showRaw: boolean }) {
  const padding = 48
  const width = 900
  const height = 320

  const dates = points.map((point) => point.dateValue)
  const times = points.map((point) => point.recordSeconds)
  const minX = Math.min(...dates)
  const maxX = Math.max(...dates)
  const minY = Math.min(...times)
  const maxY = Math.max(...times)

  const scaleX = (value: number) =>
    padding + ((value - minX) / Math.max(1, maxX - minX)) * (width - padding * 2)
  const scaleY = (value: number) =>
    padding + (1 - (value - minY) / Math.max(1, maxY - minY)) * (height - padding * 2)

  const stepPath = buildStepPath(points, scaleX, scaleY)
  const rawPath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(point.dateValue)} ${scaleY(point.recordSeconds)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="WR history">
      <rect x="0" y="0" width={width} height={height} rx="18" fill="var(--panel)" />
      <g stroke="var(--grid)" strokeWidth="1">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding + t * (height - padding * 2)
          return <line key={t} x1={padding} x2={width - padding} y1={y} y2={y} />
        })}
      </g>
      <path d={stepPath} fill="none" stroke="var(--accent)" strokeWidth="3" />
      {showRaw && <path d={rawPath} fill="none" stroke="var(--accent-soft)" strokeWidth="2" />}
      {showRaw &&
        points.map((point) => (
          <circle
            key={`${point.demo_id}-${point.date}`}
            cx={scaleX(point.dateValue)}
            cy={scaleY(point.recordSeconds)}
            r={3}
            fill={point.inferred === 'true' ? 'var(--warn)' : 'var(--accent)'}
          />
        ))}
      <text x={padding} y={height - 16} fill="var(--muted)" fontSize="12">
        {formatDate(new Date(minX).toISOString())}
      </text>
      <text x={width - padding} y={height - 16} fill="var(--muted)" fontSize="12" textAnchor="end">
        {formatDate(new Date(maxX).toISOString())}
      </text>
      <text x={padding} y={padding - 14} fill="var(--muted)" fontSize="12">
        {formatSeconds(minY)}
      </text>
      <text x={padding} y={padding + 10} fill="var(--muted)" fontSize="12">
        {formatSeconds(maxY)}
      </text>
    </svg>
  )
}

function buildStepPath(
  points: DataPoint[],
  scaleX: (value: number) => number,
  scaleY: (value: number) => number
) {
  if (points.length === 0) return ''
  const sorted = [...points].sort((a, b) => a.dateValue - b.dateValue)
  let path = `M ${scaleX(sorted[0].dateValue)} ${scaleY(sorted[0].recordSeconds)}`
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const point = sorted[i]
    const x = scaleX(point.dateValue)
    const prevY = scaleY(prev.recordSeconds)
    const y = scaleY(point.recordSeconds)
    path += ` H ${x} V ${y}`
  }
  return path
}

function formatSeconds(seconds: number) {
  const total = Math.max(0, seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = (total % 60).toFixed(2).padStart(5, '0')
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
  }
  return `${String(minutes).padStart(2, '0')}:${secs}`
}

export default App
