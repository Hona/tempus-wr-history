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
  steam_candidates: string
}

type DataPoint = CsvRow & {
  dateValue: number
  recordSeconds: number
}

type ViewMode = 'map' | 'zones'

type SteamCandidate = {
  name: string
  steamId64?: string
  steamId?: string
}

type ZoneInfo = {
  id: string
  label: string
  kind: 'bonus' | 'course' | 'segment'
  order: number
}

function App() {
  const [index, setIndex] = useState<IndexData | null>(null)
  const [query, setQuery] = useState('')
  const [selectedMap, setSelectedMap] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<'Solly' | 'Demo'>('Solly')
  const [view, setView] = useState<ViewMode>('map')
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [rows, setRows] = useState<CsvRow[]>([])
  const [loading, setLoading] = useState(false)
  const [includeInferred, setIncludeInferred] = useState(true)
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
    const viewParam = params.get('view')
    const zoneParam = params.get('zone')
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

    if (viewParam === 'zones' || viewParam === 'map') {
      setView(viewParam)
    }

    if (zoneParam) {
      setSelectedZone(zoneParam)
    }
  }, [index])

  useEffect(() => {
    if (!selectedMap) return
    const params = new URLSearchParams()
    params.set('map', selectedMap)
    params.set('class', selectedClass)
    if (view === 'zones') {
      params.set('view', 'zones')
      if (selectedZone) {
        params.set('zone', selectedZone)
      }
    }
    window.location.hash = params.toString()
  }, [selectedMap, selectedClass, view, selectedZone])

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

  const rowsWithZone = useMemo(() => {
    return rows.map((row) => ({ row, zone: getZoneInfo(row.source) }))
  }, [rows])

  const zoneOptions = useMemo(() => {
    const map = new Map<string, ZoneInfo>()
    for (const item of rowsWithZone) {
      if (!item.zone) continue
      map.set(item.zone.id, item.zone)
    }
    return Array.from(map.values()).sort(compareZones)
  }, [rowsWithZone])

  const activeZone = useMemo(() => {
    if (!selectedZone) return null
    return zoneOptions.find((zone) => zone.id === selectedZone) ?? null
  }, [selectedZone, zoneOptions])

  useEffect(() => {
    if (view !== 'zones') {
      if (selectedZone !== null) {
        setSelectedZone(null)
      }
      return
    }

    if (zoneOptions.length === 0) {
      if (selectedZone !== null) {
        setSelectedZone(null)
      }
      return
    }

    if (!selectedZone || !zoneOptions.some((zone) => zone.id === selectedZone)) {
      setSelectedZone(zoneOptions[0].id)
    }
  }, [view, zoneOptions, selectedZone])

  const filtered = useMemo(() => {
    return rowsWithZone
      .filter(({ row, zone }) => {
        if (!includeInferred && row.inferred === 'true') return false
        if (view === 'map') return zone == null
        if (zone == null) return false
        if (selectedZone && zone.id !== selectedZone) return false
        return true
      })
      .map(({ row }) => row)
  }, [rowsWithZone, includeInferred, view, selectedZone])

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
      const epsilon = row.inferred === 'true' ? 0.01 : 0.0001
      if (row.recordSeconds < best - epsilon) {
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
              <p className="muted">
                {view === 'zones'
                  ? `Zone history for ${selectedClass}${activeZone ? ` · ${activeZone.label}` : ''}`
                  : `WR timeline for ${selectedClass}`}
              </p>
            </div>
            <div className="panel-controls">
              <div className="class-toggle view-toggle">
                <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
                  Map
                </button>
                <button className={view === 'zones' ? 'active' : ''} onClick={() => setView('zones')}>
                  Zones
                </button>
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
          </div>

          <div className="filters">
            <label>
              <input
                type="checkbox"
                checked={includeInferred}
                onChange={(event) => setIncludeInferred(event.target.checked)}
              />
              {view === 'zones' ? 'Include inferred runs' : 'Include inferred map runs'}
            </label>
            {view === 'zones' ? (
              <label className="zone-select">
                <span>Zone</span>
                <select
                  value={selectedZone ?? ''}
                  onChange={(event) => setSelectedZone(event.target.value)}
                  disabled={zoneOptions.length === 0}
                >
                  {zoneOptions.length === 0 ? (
                    <option value="">No zones</option>
                  ) : (
                    zoneOptions.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.label}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}
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
                    <div className="player-cell">
                      <PlayerIdentity row={row} />
                    </div>
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
              <p className="legend">* inferred from WR split in chat message</p>
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

const STEAM_ID64_BASE = 76561197960265728n

function parseSteamCandidates(value: string): SteamCandidate[] {
  if (!value) return []
  return value
    .split(';')
    .map((entry) => {
      const [name, steamId64, steamId] = entry.split('|')
      const trimmedName = name?.trim()
      if (!trimmedName) return null
      return {
        name: trimmedName,
        steamId64: steamId64?.trim() || undefined,
        steamId: steamId?.trim() || undefined
      }
    })
    .filter(Boolean) as SteamCandidate[]
}

function normalizeSteamId64(value?: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{16,17}$/.test(trimmed)) return trimmed
  return null
}

function parseSteamId64(steamId?: string): string | null {
  if (!steamId) return null
  const trimmed = steamId.trim()
  if (!trimmed) return null

  const direct = normalizeSteamId64(trimmed)
  if (direct) return direct

  if (trimmed.startsWith('[U:') && trimmed.endsWith(']')) {
    const lastColon = trimmed.lastIndexOf(':')
    if (lastColon > 0) {
      const value = trimmed.slice(lastColon + 1, -1)
      if (/^\d+$/.test(value)) {
        return (STEAM_ID64_BASE + BigInt(value)).toString()
      }
    }
  }

  if (trimmed.startsWith('STEAM_')) {
    const parts = trimmed.slice('STEAM_'.length).split(':')
    if (parts.length === 3 && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
      const y = BigInt(parts[1])
      const z = BigInt(parts[2])
      return (STEAM_ID64_BASE + z * 2n + y).toString()
    }
  }

  return null
}

function buildSteamProfileUrl(steamId64?: string, steamId?: string): string | null {
  const parsed = normalizeSteamId64(steamId64) ?? parseSteamId64(steamId)
  if (!parsed) return null
  return `https://steamcommunity.com/profiles/${parsed}`
}

function getZoneInfo(source: string): ZoneInfo | null {
  if (!source) return null
  const trimmed = source.trim()
  if (!trimmed) return null

  const bonusMatch = trimmed.match(/^Bonus\s+(\d+)/i)
  if (bonusMatch) {
    const order = Number.parseInt(bonusMatch[1], 10)
    return { id: `bonus-${order}`, label: `Bonus ${order}`, kind: 'bonus', order }
  }

  const courseMatch = trimmed.match(/^Course\s+(\d+)/i)
  if (courseMatch) {
    const order = Number.parseInt(courseMatch[1], 10)
    return { id: `course-${order}`, label: `Course ${order}`, kind: 'course', order }
  }

  const segmentMatch = trimmed.match(/^C(\d+)\s*-\s*(.+)$/i)
  if (segmentMatch) {
    const order = Number.parseInt(segmentMatch[1], 10)
    const name = sanitizeSegmentName(segmentMatch[2])
    const label = name ? `C${order} - ${name}` : `C${order}`
    return { id: `segment-${order}`, label, kind: 'segment', order }
  }

  const segmentIndexMatch = trimmed.match(/^C(\d+)/i)
  if (segmentIndexMatch) {
    const order = Number.parseInt(segmentIndexMatch[1], 10)
    return { id: `segment-${order}`, label: `C${order}`, kind: 'segment', order }
  }

  return null
}

function sanitizeSegmentName(value: string) {
  const trimmed = value.trim()
  return trimmed.replace(/\s+First$/i, '').trim()
}

function compareZones(left: ZoneInfo, right: ZoneInfo) {
  const rank = (zone: ZoneInfo) => {
    switch (zone.kind) {
      case 'bonus':
        return 0
      case 'course':
        return 1
      case 'segment':
        return 2
      default:
        return 99
    }
  }

  const rankDiff = rank(left) - rank(right)
  if (rankDiff !== 0) return rankDiff
  return left.order - right.order
}

function formatDate(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
}

function PlayerIdentity({ row }: { row: CsvRow }) {
  const candidates = parseSteamCandidates(row.steam_candidates)
  const profileUrl = buildSteamProfileUrl(row.steam_id64, row.steam_id)

  if (candidates.length > 0) {
    return (
      <details className="player-drawer">
        <summary>
          <span>{row.player}</span>
          <em>{candidates.length} matches</em>
        </summary>
        <div className="player-drawer-list">
          {candidates.map((candidate, index) => {
            const url = buildSteamProfileUrl(candidate.steamId64, candidate.steamId)
            const meta = candidate.steamId64 || candidate.steamId
            return (
              <div
                key={`${candidate.name}-${candidate.steamId64 ?? candidate.steamId ?? index}`}
                className="player-candidate"
              >
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    {candidate.name}
                  </a>
                ) : (
                  <span>{candidate.name}</span>
                )}
                {meta ? <span className="candidate-meta">{meta}</span> : null}
              </div>
            )
          })}
        </div>
      </details>
    )
  }

  if (profileUrl) {
    return (
      <a className="player-link" href={profileUrl} target="_blank" rel="noreferrer">
        {row.player}
      </a>
    )
  }

  return <span>{row.player}</span>
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
    const point = sorted[i]
    const x = scaleX(point.dateValue)
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
