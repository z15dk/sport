import Link from 'next/link'
import type { ExternalLeague } from '../lib/apisports'
import type { TableRow } from '../data/matchExtra'
import type { PastMatch } from '../data/matchInsights'
import type { Match } from '../types'
import { TeamBadge } from './TeamBadge'
import { MatchRow } from './MatchRow'
import { Updated } from './Updated'
import { AdSlot } from './AdSlot'
import { danishCountry } from '../data/countries'
import { sportById } from '../sports'
import { formatShortYear } from '../lib/time'
import { paths } from '../lib/site'
import { JsonLd, breadcrumbLd, webPageLd } from '../lib/jsonld'
import { SITE_URL } from '../lib/site'
import type { Baseline } from '../data/baselines'
import { teamInLeague } from '../data/teams'

interface Props {
  league: ExternalLeague
  /** API-Sports' table (all groups), or ours from the statistics bank */
  groups: TableRow[][]
  source: 'api-sports' | 'scoreline'
  /** For our own table: how many games it rests on, and from when */
  matches?: number
  since?: Date
  recent: PastMatch[]
  upcoming: Match[]
  now: number
  /** The starting table our own table builds on, when there is one */
  baseline?: Baseline
  /** A cup: its played rounds, newest first (shown instead of a table) */
  rounds?: { name: string; matches: Match[] }[]
}

/** A page for one of API-Sports' leagues: table, latest results and coming matches */
export function ExternalLeaguePage({ league, groups, source, matches, since, recent, upcoming, now, baseline, rounds }: Props) {
  const sport = sportById(league.sport).label
  const path = paths.league(league.key)
  const rows = groups.flat()
  const hasPoints = rows.some((r) => r.points !== undefined)
  const hasDraws = rows.some((r) => r.drawn !== undefined)
  const hasScore = rows.some((r) => r.for !== undefined)
  const leader = groups[0]?.[0]
  return (
    <div className="page">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SportsOrganization',
          name: league.name,
          sport,
          url: `${SITE_URL}${path}`,
          ...(league.logo && { logo: league.logo }),
        }}
      />
      <JsonLd data={webPageLd(path, league.name, new Date(now))} />
      <JsonLd data={breadcrumbLd([{ name: 'Kampe', path: '/' }, { name: league.name, path }])} />
      <div className="clubs">
        <div className="clubs__head">
          <h1 className="feed__title league-title">
            <span className="league-title__row">
              <TeamBadge link={false} name={league.name} src={league.logo} colors={['#0f110c', '#c6f135']} size={56} />
              {league.name}
            </span>
            <span>
              {sport} · {danishCountry(league.country)}
            </span>
          </h1>
        </div>
        {rounds && (
          <p className="lead">
            {rounds.length
              ? `${league.name}: ${rounds.reduce((n, r) => n + r.matches.length, 0)} kampe spillet, senest ${rounds[0].name.toLowerCase()}.`
              : `${league.name}: resultater og kommende kampe.`}
            {upcoming[0] && ` Næste kamp: ${upcoming[0].home.name} – ${upcoming[0].away.name}.`}
          </p>
        )}
        {!rounds && leader && (
          <p className="lead">
            {leader.name} fører {league.name} efter {leader.played} kampe
            {hasPoints ? ` med ${leader.points} point` : ` med ${leader.won} sejre`}.
          </p>
        )}
        <Updated at={now} />

        {rounds && upcoming.length > 0 && <Upcoming upcoming={upcoming} />}
        {rounds?.map((r) => (
          <section key={r.name} className="league">
            <header className="league__header">
              <div className="league__toggle">
                <span className="league__titles">
                  <h2 className="league__name">{r.name}</h2>
                </span>
              </div>
            </header>
            <ul className="league__matches">
              {r.matches.map((m) => (
                <MatchRow key={m.id} match={m} showDate />
              ))}
            </ul>
          </section>
        ))}
        {!rounds && (
          <>
          <section className="panel table-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">Stilling</h2>
              {source === 'scoreline' && baseline ? (
                <span className="tag">Efter {baseline.round + Math.max(0, ...groups.flat().map((r) => r.played - baseline.rows[0].played))}. runde</span>
              ) : (
                source === 'scoreline' && matches !== undefined && <span className="tag">{matches} kampe</span>
              )}
            </header>
            {rows.length > 1 ? (
              groups.map((group, gi) => (
                <div key={gi} className="table-wrap">
                  <table className="table table--compact">
                    <thead>
                      <tr>
                        <th className="num">#</th>
                        <th>Hold</th>
                        <th className="num">K</th>
                        <th className="num">V</th>
                        {hasDraws && <th className="num">U</th>}
                        <th className="num">T</th>
                        {hasScore && <th className="num hide-sm">Score</th>}
                        {hasPoints && <th className="num">P</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((r) => (
                        <tr key={`${r.rank}-${r.name}`} className={baseline?.splitAfter === r.rank ? 'is-split' : undefined}>
                          <td className="num pos">{r.rank}</td>
                          <td>
                            {(() => {
                              // Linked to the team's own page in this league (not a men's club of the same name)
                              const team = teamInLeague(league.key, r.name)
                              return (
                                <span className="table__club">
                                  <TeamBadge link={false} name={r.name} src={r.logo ?? team?.logo} size={20} />
                                  {team ? <Link href={paths.club(team.slug)}>{r.name}</Link> : r.name}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="num">{r.played}</td>
                          <td className="num">{r.won}</td>
                          {hasDraws && <td className="num">{r.drawn ?? 0}</td>}
                          <td className="num">{r.lost}</td>
                          {hasScore && (
                            <td className="num hide-sm">
                              {r.for ?? 0}–{r.against ?? 0}
                            </td>
                          )}
                          {hasPoints && <td className="num pts">{r.points ?? 0}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            ) : (
              <p className="muted pad">Vi har endnu ikke nok spillede kampe til en stilling. Den bygges op for hver spillerunde.</p>
            )}
            <p className="muted small history__note">
              {source === 'api-sports'
                ? 'Stilling: API-Sports.'
                : baseline
                  ? `Udgangspunkt: stillingen efter ${baseline.round}. runde fra ${baseline.source} (${formatShortYear(new Date(baseline.after))}). Derefter beregnet af Scoreline ud fra ${matches ?? 0} ${matches === 1 ? 'kamp' : 'kampe'} (3 point for sejr).${baseline.splitAfter ? (baseline.splitLabel ? ` Nr. 1-${baseline.splitAfter} ${baseline.splitLabel}.` : ` Stregen under nr. ${baseline.splitAfter} er som i stillingen på ${baseline.source}.`) : ''}`
                  : `Beregnet af Scoreline ud fra de ${matches ?? 0} kampe, vi har gemt${since ? ` siden ${formatShortYear(since)}` : ''} (3 point for sejr). API-Sports' gratisplan giver ikke sæsonens tidligere kampe, så stillingen er kun komplet fra da.`}
            </p>
          </section>
          </>
        )}
        {!rounds && upcoming.length > 0 && <Upcoming upcoming={upcoming} />}

        <AdSlot placement="feed" />

        {recent.length > 0 && (
          <section className="panel table-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">{rounds ? 'Tidligere kampe' : 'Seneste resultater'}</h2>
            </header>
            <ul className="h2h h2h--pad">
              {recent.map((m, i) => {
                const winner = m.homeScore > m.awayScore ? m.home : m.homeScore < m.awayScore ? m.away : null
                return (
                  <li key={i} className="h2h__row">
                    <span className="h2h__meta">{formatShortYear(m.date)}</span>
                    <span className={`h2h__team${winner === m.home ? ' is-winner' : ''}`}>
                      {m.home}
                      <TeamBadge name={m.home} src={m.homeLogo} size={22} />
                    </span>
                    <span className="h2h__score">
                      {m.homeScore}–{m.awayScore}
                    </span>
                    <span className={`h2h__team h2h__team--away${winner === m.away ? ' is-winner' : ''}`}>
                      <TeamBadge name={m.away} src={m.awayLogo} size={22} />
                      {m.away}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        <p className="muted small">
          Kampe og resultater: {rounds ? 'API-Sports og vores kampdatabase' : 'API-Sports'}. <Link href="/">Se alle dagens kampe</Link>.
        </p>
      </div>
    </div>
  )
}

function Upcoming({ upcoming }: { upcoming: Match[] }) {
  return (
    <section className="league">
      <header className="league__header">
        <div className="league__toggle">
          <span className="league__titles">
            <h2 className="league__name">Kommende og igangværende kampe</h2>
          </span>
        </div>
      </header>
      <ul className="league__matches">
        {upcoming.map((m) => (
          <MatchRow key={m.id} match={m} showDate />
        ))}
      </ul>
    </section>
  )
}
