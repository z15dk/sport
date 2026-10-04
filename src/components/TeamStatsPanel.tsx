import { biggestOf, type Periods, type TeamStats } from '../data/teamStats'

// A club's season statistics from our data source: key numbers, goals and
// cards per quarter hour, and the formations used.

const PERIOD_LABELS: Record<string, string> = {
  '0-15': '0–15',
  '16-30': '16–30',
  '31-45': '31–45',
  '46-60': '46–60',
  '61-75': '61–75',
  '76-90': '76–90',
  '91-105': '91+',
  '106-120': 'Forl.',
}

const score = (s?: string) => (s ? s.replace('-', '–') : '–')

/** Two series per quarter hour (for / against, or yellow / red), side by side */
function PeriodBars({ a, b, labels, colors }: { a: Periods; b: Periods; labels: [string, string]; colors: [string, string] }) {
  const rows = a
    .map((x) => ({ period: x.period, a: x.value, b: b.find((y) => y.period === x.period)?.value ?? 0 }))
    .filter((r) => r.period !== '106-120' || r.a + r.b > 0)
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]))
  return (
    <div className="period-bars">
      <div className="period-bars__legend">
        <span>
          <i style={{ background: colors[0] }} /> {labels[0]}
        </span>
        <span>
          <i style={{ background: colors[1] }} /> {labels[1]}
        </span>
      </div>
      <div className="period-bars__grid" role="img" aria-label={rows.map((r) => `${PERIOD_LABELS[r.period] ?? r.period}: ${labels[0]} ${r.a}, ${labels[1]} ${r.b}`).join('; ')}>
        {rows.map((r) => (
          <div key={r.period} className="period-bars__col" title={`${PERIOD_LABELS[r.period] ?? r.period} min.: ${labels[0].toLowerCase()} ${r.a}, ${labels[1].toLowerCase()} ${r.b}`}>
            <span className="period-bars__pair">
              <span className="period-bars__bar" style={{ height: `${(r.a / max) * 100}%`, background: colors[0] }} />
              <span className="period-bars__bar" style={{ height: `${(r.b / max) * 100}%`, background: colors[1] }} />
            </span>
            <span className="period-bars__values">
              {r.a}/{r.b}
            </span>
            <span className="period-bars__label">{PERIOD_LABELS[r.period] ?? r.period}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TeamStatsPanel({ stats, name }: { stats: TeamStats; name: string }) {
  if (!stats.played.total) return null
  const tiles = [
    { label: 'Clean sheets', value: `${stats.cleanSheets.total}`, sub: `${stats.cleanSheets.home} hjemme · ${stats.cleanSheets.away} ude` },
    { label: 'Kampe uden mål', value: `${stats.failedToScore.total}`, sub: `${stats.failedToScore.home} hjemme · ${stats.failedToScore.away} ude` },
    { label: 'Mål pr. kamp', value: (stats.goalsFor.average ?? stats.goalsFor.total / stats.played.total).toFixed(1).replace('.', ','), sub: `${(stats.goalsAgainst.average ?? stats.goalsAgainst.total / stats.played.total).toFixed(1).replace('.', ',')} imod` },
    { label: 'Straffespark', value: `${stats.penalty?.scored ?? 0} af ${stats.penalty?.total ?? 0}`, sub: stats.penalty?.missed ? `${stats.penalty.missed} misset` : 'ingen misset' },
    { label: 'Største sejr', value: score(biggestOf(stats.biggestWin)), sub: [stats.biggestWin?.home && `hjemme ${score(stats.biggestWin.home)}`, stats.biggestWin?.away && `ude ${score(stats.biggestWin.away)}`].filter(Boolean).join(' · ') || '–' },
    { label: 'Længste sejrsstime', value: `${stats.streak?.wins ?? 0}`, sub: `${stats.streak?.loses ?? 0} nederlag i træk som værst` },
  ]
  return (
    <section className="panel team-stats" aria-labelledby="team-stats-title">
      <h2 id="team-stats-title" className="panel__title">
        Holdstatistik
      </h2>
      <div className="team-stats__tiles">
        {tiles.map((t) => (
          <div key={t.label} className="team-stats__tile">
            <span>{t.label}</span>
            <strong>{t.value}</strong>
            <em>{t.sub}</em>
          </div>
        ))}
      </div>
      <div className="team-stats__charts">
        <div>
          <h3>Mål pr. kvarter</h3>
          <PeriodBars a={stats.goalsFor.periods} b={stats.goalsAgainst.periods} labels={['Scoret', 'Imod']} colors={['var(--lime-deep)', 'var(--ink)']} />
        </div>
        <div>
          <h3>Kort pr. kvarter</h3>
          <PeriodBars a={stats.yellow} b={stats.red} labels={['Gule', 'Røde']} colors={['#f5c518', '#e03a3e']} />
        </div>
      </div>
      {stats.formations.length > 0 && (
        <div className="team-stats__formations">
          <h3>Formationer</h3>
          <ul>
            {stats.formations.map((f) => (
              <li key={f.formation}>
                <strong>{f.formation}</strong> {f.played} {f.played === 1 ? 'kamp' : 'kampe'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small pad">{name}s sæson i tal.</p>
    </section>
  )
}
