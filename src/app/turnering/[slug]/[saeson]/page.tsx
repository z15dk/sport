import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { divisionBySlug, sportOf } from '../../../../data/leagues'
import { pastSeason, pastSeasons, seasonGameAsMatch, type PastSeason, type SeasonGame } from '../../../../lib/history'
import { MatchRow } from '../../../../components/MatchRow'
import type { Match } from '../../../../types'
import { archiveIncidents } from '../../../../lib/archive'
import { JsonLd, breadcrumbLd, webPageLd } from '../../../../lib/jsonld'
import { paths } from '../../../../lib/site'
import { TeamBadge } from '../../../../components/TeamBadge'
import { AdSlot } from '../../../../components/AdSlot'
import { playerPath } from '../../../../data/player'
import { SeasonLinks } from '../../../../components/SeasonLinks'
import { PlayerPhoto } from '../../../../components/PlayerPhoto'
import { playerFaces } from '../../../../lib/playerPhotos'

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

/** The season's top scorers: the official list, else from the goals the statistics bank has (own goals not counted) */
function scorers(season: PastSeason) {
  if (season.scorers?.length)
    return { list: season.scorers.slice(0, 10).map((x) => ({ id: x.id, name: x.name, team: x.team, goals: x.goals, penalties: x.penalties })), withGoals: season.games.length }
  const incidents = archiveIncidents(season.games.map((g) => g.id))
  const byPlayer = new Map<string, { id?: number; name: string; team: string; goals: number; penalties: number }>()
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
  // Photos (and pages) for the scorers we know; otherwise the club's logo
  const faces = sportOf(division) === 'soccer' ? playerFaces(top.list) : []
  const others = pastSeasons(division.id)
  const lead = [
    `${first.name} vandt ${division.name} ${season.label}${season.hasDraws ? ` med ${first.points} point` : ` med ${first.won} sejre`}${second ? `, ${season.hasDraws ? `${first.points - second.points} point` : `${first.won - second.won} sejre`} foran ${second.name}` : ''}.`,
    `Der blev spillet ${season.games.length} kampe med ${f.goals} mål – ${one(f.perMatch)} pr. kamp.`,
    top.list[0] ? `${top.list[0].name} (${top.list[0].team}) blev topscorer med ${top.list[0].goals} mål.` : '',
    f.biggest ? `Største sejr: ${f.biggest.home} – ${f.biggest.away} ${f.biggest.homeScore}-${f.biggest.awayScore}.` : '',
    f.crowd?.spectators ? `Flest tilskuere: ${f.crowd.spectators.toLocaleString('da-DK')} til ${f.crowd.home} – ${f.crowd.away}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  // Every match by month, as the league page shows them (only matches with a page of their own)
  const asMatch = (g: SeasonGame) => seasonGameAsMatch(g, division)
  const months = new Map<string, Match[]>()
  for (const g of season.games) {
    if (!g.slug) continue
    const key = g.date.toLocaleDateString('da-DK', { month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen' })
    months.set(key, [...(months.get(key) ?? []), asMatch(g)])
  }
  const Club = ({ name, slug, logo }: { name: string; slug?: string; logo?: string }) => (
    <span className="table__club table__club--fit">
      <TeamBadge link={false} name={name} src={logo} size={20} />
      {slug ? (
        <Link className="table__clubname" href={paths.club(slug)} title={name}>
          {name}
        </Link>
      ) : (
        <span className="table__clubname">{name}</span>
      )}
    </span>
  )
  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name: division.name, path: paths.league(division.slug) }, { name: season.label, path }])} />
      <JsonLd data={webPageLd(path, title, season.games.at(-1)?.date ?? new Date(), lead)} />
      <div className="clubs">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href={paths.league(division.slug)}>{division.name}</Link>
          <span aria-hidden>/</span>
          <span>{season.label}</span>
        </nav>
        <div className="clubs__head">
          <h1 className="feed__title league-title">
            <span className="league-title__row">
              <TeamBadge link={false} name={division.name} label={division.short} colors={['#0f110c', '#c6f135']} size={56} />
              {division.name}
            </span>
            <span>Sæson {season.label} · slutstilling og resultater</span>
          </h1>
        </div>
        <p className="lead">{lead}</p>

        <section className="tiles tiles--club" aria-label="Sæsonen i tal">
          <div className="tile tile--lime">
            <span className="tile__label">Mester</span>
            <strong className="tile__value tile__value--text">{first.name}</strong>
          </div>
          <div className="tile tile--ink">
            <span className="tile__label">Kampe</span>
            <strong className="tile__value">{season.games.length}</strong>
          </div>
          <div className="tile tile--blush">
            <span className="tile__label">Mål pr. kamp</span>
            <strong className="tile__value">{one(f.perMatch)}</strong>
          </div>
          <div className="tile tile--lime">
            <span className="tile__label">Hjemmesejre</span>
            <strong className="tile__value">{season.games.length ? Math.round((f.homeWins / season.games.length) * 100) : 0} %</strong>
            <span className="tile__sub">
              {f.homeWins} hjemme{season.hasDraws ? ` · ${f.draws} uafgjort` : ''} · {f.awayWins} ude
            </span>
          </div>
        </section>

        <div className={top.list.length ? 'table-duo' : 'table-solo'}>
          <div className="table-duo__main">
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
                        <td className="table__grow">
                          <Club name={r.name} slug={r.slug} logo={r.logo} />
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
              <p className="muted small pad">
                Officiel slutstilling{season.upper ? `. De ${season.upper} øverste spillede i mesterskabsspillet` : ''}.
                {season.adjustments.map((a) => ` ${a.name} ${a.points < 0 ? `fik ${-a.points} point fratrukket` : `fik ${a.points} point tildelt`}.`).join('')}
              </p>
            </section>
          </div>

          {top.list.length > 0 && (
            <section className="panel leaders" aria-labelledby="scorers-title">
              <header className="table-panel__head">
                <h2 id="scorers-title" className="panel__title">
                  Topscorere
                </h2>
              </header>
              <div className="leaders__grid leaders__grid--one">
                <div className="leaders__list">
                  <ol>
                    {top.list.map((p, i) => (
                      <li key={`${p.name}|${p.team}`}>
                        <span className="leaders__rank">{i + 1}</span>
                        <PlayerPhoto photo={faces[i]?.photo} team={p.team} size={28} />
                        <span className="leaders__who">
                          {(p.id ?? faces[i]?.id) ? (
                            <Link className="leaders__name" href={playerPath((p.id ?? faces[i]?.id)!, p.name)}>
                              <strong>{p.name}</strong>
                            </Link>
                          ) : (
                            <strong>{p.name}</strong>
                          )}
                          <em>
                            {p.team}
                            {p.penalties ? ` · ${p.penalties} på straffe` : ''}
                          </em>
                        </span>
                        <span className="leaders__value">{p.goals}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              {top.withGoals < season.games.length && <p className="muted small pad">Ud fra de {top.withGoals} kampe, vi har målscorerne til.</p>}
            </section>
          )}
        </div>

        <AdSlot placement="feed" />

        {[...months].map(([month, matches]) => (
          // Folded by default (a long season is a long page); the matches stay in the page for search engines
          <details key={month} className="league season-fold">
            <summary className="league__header">
              <div className="league__toggle">
                <span className="league__titles">
                  <span className="league__country">
                    {division.name} {season.label}
                  </span>
                  <h2 className="league__name season-month">{month}</h2>
                </span>
                <span className="league__count">{matches.length} kampe</span>
                <span className="chevron" aria-hidden="true">
                  ›
                </span>
              </div>
            </summary>
            <ul className="league__matches">
              {matches.map((m) => (
                <MatchRow key={m.id} match={m} showDate />
              ))}
            </ul>
          </details>
        ))}

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
