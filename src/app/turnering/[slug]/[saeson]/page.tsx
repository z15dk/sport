import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { divisionBySlug } from '../../../../data/leagues'
import { pastSeason, pastSeasons, type PastSeason } from '../../../../lib/history'
import { archiveIncidents } from '../../../../lib/archive'
import { JsonLd, breadcrumbLd, webPageLd } from '../../../../lib/jsonld'
import { paths } from '../../../../lib/site'
import { formatShortYear } from '../../../../lib/time'
import { TeamBadge } from '../../../../components/TeamBadge'
import { AdSlot } from '../../../../components/AdSlot'
import { SeasonLinks } from '../../../../components/SeasonLinks'

// An earlier season of one of our leagues (only seasons our partners' results
// cover in full): final table, top scorers, every match and the season in numbers.

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string; saeson: string }>

function load(slug: string, saeson: string) {
  const division = divisionBySlug(slug)
  const season = division && pastSeason(division.id, saeson)
  return division && season ? { division, season } : undefined
}

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

/** The season's top scorers from the goals the statistics bank has (own goals not counted) */
function scorers(season: PastSeason) {
  const incidents = archiveIncidents(season.games.map((g) => g.id))
  const byPlayer = new Map<string, { name: string; team: string; goals: number; penalties: number }>()
  for (const g of season.games) {
    for (const i of incidents.get(g.id) ?? []) {
      if ((i.kind !== 'goal' && i.kind !== 'penalty') || !i.player) continue
      const team = i.side === 'home' ? g.home : g.away
      const key = `${i.player}|${team}`
      const r = byPlayer.get(key) ?? byPlayer.set(key, { name: i.player, team, goals: 0, penalties: 0 }).get(key)!
      r.goals++
      if (i.kind === 'penalty') r.penalties++
    }
  }
  return { list: [...byPlayer.values()].sort((a, b) => b.goals - a.goals || a.penalties - b.penalties).slice(0, 10), withGoals: incidents.size }
}

function facts(season: PastSeason) {
  const g = season.games
  const goals = g.reduce((n, m) => n + m.homeScore + m.awayScore, 0)
  const homeWins = g.filter((m) => m.homeScore > m.awayScore).length
  const draws = g.filter((m) => m.homeScore === m.awayScore).length
  const biggest = [...g].sort((a, b) => Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore) || b.homeScore + b.awayScore - (a.homeScore + a.awayScore))[0]
  const crowd = g.filter((m) => m.spectators).sort((a, b) => (b.spectators ?? 0) - (a.spectators ?? 0))[0]
  return { goals, perMatch: g.length ? goals / g.length : 0, homeWins, draws, awayWins: g.length - homeWins - draws, biggest, crowd }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, saeson } = await params
  const found = load(slug, saeson)
  if (!found) return { title: 'Sæsonen findes ikke' }
  const { division, season } = found
  const [first, second] = season.table
  const f = facts(season)
  return {
    title: `${division.name} ${season.label} – slutstilling, resultater og topscorere`,
    description: `Slutstillingen i ${division.name} ${season.label}: ${first.name} vandt${season.hasDraws ? ` med ${first.points} point` : ''}${second ? ` foran ${second.name}` : ''}. Alle ${season.games.length} kampe, ${f.goals} mål (${one(f.perMatch)} pr. kamp) og sæsonens topscorere.`,
    alternates: { canonical: `${paths.league(division.slug)}/${season.slug}` },
  }
}

export default async function SeasonPage({ params }: { params: Params }) {
  const { slug, saeson } = await params
  const found = load(slug, saeson)
  if (!found) notFound()
  const { division, season } = found
  const path = `${paths.league(division.slug)}/${season.slug}`
  const title = `${division.name} ${season.label}`
  const [first, second] = season.table
  const f = facts(season)
  const top = scorers(season)
  const others = pastSeasons(division.id)
  const lead = [
    `${first.name} vandt ${division.name} ${season.label}${season.hasDraws ? ` med ${first.points} point` : ` med ${first.won} sejre`}${second ? `, ${season.hasDraws ? `${first.points - second.points} point` : `${first.won - second.won} sejre`} foran ${second.name}` : ''}.`,
    `Der blev spillet ${season.games.length} kampe med ${f.goals} mål – ${one(f.perMatch)} pr. kamp.`,
    top.list[0] ? `${top.list[0].name} (${top.list[0].team}) blev topscorer med ${top.list[0].goals} mål.` : '',
    f.biggest ? `Største sejr: ${f.biggest.home} – ${f.biggest.away} ${f.biggest.homeScore}-${f.biggest.awayScore}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  // Every match by month, newest last
  const months = new Map<string, PastSeason['games']>()
  for (const g of season.games) {
    const key = g.date.toLocaleDateString('da-DK', { month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen' })
    months.set(key, [...(months.get(key) ?? []), g])
  }
  const Club = ({ name, slug }: { name: string; slug?: string }) => (
    <span className="table__club">
      <TeamBadge link={false} name={name} size={20} />
      {slug ? <Link href={paths.club(slug)}>{name}</Link> : name}
    </span>
  )
  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name: division.name, path: paths.league(division.slug) }, { name: season.label, path }])} />
      <JsonLd data={webPageLd(path, title, season.games.at(-1)?.date ?? new Date(), lead)} />
      <div className="clubs prose">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href={paths.league(division.slug)}>{division.name}</Link>
          <span aria-hidden>/</span>
          <span>{season.label}</span>
        </nav>
        <h1 className="feed__title">{title}</h1>
        <p>{lead}</p>

        <section className="panel table-panel">
          <header className="table-panel__head">
            <h2 className="panel__title">Slutstilling</h2>
          </header>
          <div className="table-wrap">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Hold</th>
                  <th className="num">K</th>
                  <th className="num">V</th>
                  {season.hasDraws && <th className="num">U</th>}
                  <th className="num">T</th>
                  <th className="num hide-sm">Score</th>
                  {season.hasDraws && <th className="num">P</th>}
                </tr>
              </thead>
              <tbody>
                {season.table.map((r) => (
                  <tr key={r.name} className={season.upper === r.rank ? 'is-split' : undefined}>
                    <td className="num pos">{r.rank}</td>
                    <td>
                      <Club name={r.name} slug={r.slug} />
                    </td>
                    <td className="num">{r.played}</td>
                    <td className="num">{r.won}</td>
                    {season.hasDraws && <td className="num">{r.drawn}</td>}
                    <td className="num">{r.lost}</td>
                    <td className="num hide-sm">
                      {r.goalsFor}–{r.goalsAgainst}
                    </td>
                    {season.hasDraws && <td className="num pts">{r.points}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Beregnet af Matchly ud fra sæsonens kampe{season.hasDraws ? ' (3 point for sejr)' : ''}
            {season.upper ? `; de ${season.upper} øverste spillede i mesterskabsspillet` : ''}. Fratrukne point og slutspil er ikke med.
          </p>
        </section>

        {top.list.length > 0 && (
          <section className="panel table-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">Topscorere</h2>
            </header>
            <table className="table table--compact">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Spiller</th>
                  <th>Hold</th>
                  <th className="num">Mål</th>
                </tr>
              </thead>
              <tbody>
                {top.list.map((p, i) => (
                  <tr key={`${p.name}|${p.team}`}>
                    <td className="num pos">{i + 1}</td>
                    <td>{p.name}</td>
                    <td>{p.team}</td>
                    <td className="num pts">
                      {p.goals}
                      {p.penalties ? <span className="muted small"> ({p.penalties} str.)</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {top.withGoals < season.games.length && <p className="muted small">Ud fra de {top.withGoals} kampe, vi har målscorerne til.</p>}
          </section>
        )}

        <section className="panel">
          <h2 className="panel__title">Sæsonen i tal</h2>
          <ul>
            <li>
              {season.games.length} kampe, {f.goals} mål ({one(f.perMatch)} pr. kamp)
            </li>
            <li>
              Hjemmesejre {f.homeWins}
              {season.hasDraws ? `, uafgjorte ${f.draws}` : ''}, udesejre {f.awayWins}
            </li>
            {f.biggest && (
              <li>
                Største sejr: {f.biggest.home} – {f.biggest.away} {f.biggest.homeScore}-{f.biggest.awayScore} ({formatShortYear(f.biggest.date)})
              </li>
            )}
            {f.crowd?.spectators && (
              <li>
                Flest tilskuere: {f.crowd.spectators.toLocaleString('da-DK')} til {f.crowd.home} – {f.crowd.away}
              </li>
            )}
          </ul>
        </section>

        <AdSlot placement="feed" />

        <section className="panel">
          <h2 className="panel__title">Alle kampe</h2>
          {[...months].map(([month, games]) => (
            <div key={month}>
              <h3 className="season-month">{month}</h3>
              <ul className="season-games">
                {games.map((g) => (
                  <li key={g.id}>
                    <span className="muted small">{formatShortYear(g.date)}</span>
                    {g.slug ? (
                      <Link href={paths.match(g.slug)}>
                        {g.home} – {g.away}
                      </Link>
                    ) : (
                      <span>
                        {g.home} – {g.away}
                      </span>
                    )}
                    <strong>
                      {g.homeScore}-{g.awayScore}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {others.length > 1 && (
          <section className="panel">
            <h2 className="panel__title">Andre sæsoner</h2>
            <SeasonLinks divisionSlug={division.slug} seasons={others} current={season.slug} />
          </section>
        )}
      </div>
    </div>
  )
}
