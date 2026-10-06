import type { ReactNode } from 'react'
import type { LeagueDeep, LeagueRow } from '../data/leagueDeep'
import { AttackDefenceBox, FormTableBox, LeagueBriefBox, LeagueHero, LeagueOutBox, LeaguePlayersBox } from './league/LeagueDeepBoxes'
import Link from 'next/link'
import { MasonryFlow } from './MasonryFlow'
import type { ExternalLeague } from '../lib/apisports'
import type { TableRow } from '../data/matchExtra'
import type { PastMatch } from '../data/matchInsights'
import type { Match } from '../types'
import { TeamBadge } from './TeamBadge'
import { MatchRow } from './MatchRow'
import { LiveNow } from './LiveNow'
import { Updated } from './Updated'
import { CalendarButton } from './CalendarButton'
import { LeagueLeaders } from './LeagueLeaders'
import { KnockoutBracket } from './KnockoutBracket'
import type { BracketRound } from '../lib/bracket'
import { LeagueStats } from './LeagueStats'
import type { LeagueStats as LeagueStatsData } from '../data/stats'
import type { Leaders } from '../data/matchExtra'
import { AdSlot } from './AdSlot'
import { danishCountry } from '../data/countries'
import { sportById } from '../sports'
import { formatShortYear } from '../lib/time'
import { paths } from '../lib/site'
import { JsonLd, breadcrumbLd, webPageLd, absoluteImage } from '../lib/jsonld'
import { SITE_URL } from '../lib/site'
import type { Baseline } from '../data/baselines'
import { teamInLeague } from '../data/teams'

/** A league with one table: the same top and boxes as our own leagues (src/lib/leagueDeep.ts) */
export interface ExternalLeagueView {
  rows: LeagueRow[]
  deep: LeagueDeep
  topScorer?: { name: string; club: string; goals: number; photo?: string }
  brief: string[]
}

interface Props {
  view?: ExternalLeagueView
  league: ExternalLeague
  /** API-Sports' table (all groups), or ours from the statistics bank */
  groups: TableRow[][]
  source: 'api-sports' | 'scoreline'
  /** For our own table: how many games it rests on, and from when */
  matches?: number
  since?: Date
  recent: PastMatch[]
  upcoming: Match[]
  /** Our statistics for the season, from its finished games */
  stats?: LeagueStatsData
  now: number
  /** The starting table our own table builds on, when there is one */
  baseline?: Baseline
  /** A knock-out tournament's bracket (shown instead of a table) */
  bracket?: BracketRound[]
  /** A cup: its played rounds, newest first (shown instead of a table) */
  rounds?: { name: string; matches: Match[] }[]
  /** Top scorers, assists and cards */
  leaders?: Leaders
  /** "Seneste nyheder" about the tournament */
  news?: ReactNode
}

/** A page for one of API-Sports' leagues: table, latest results and coming matches */
/** A single table longer than this shows only its first rows, the rest behind "Vis alle … hold" */
const FOLD_OVER = 20
const FOLD_ROWS = 12
/** UEFA's tournaments with a league phase of 36 teams (the source's ids): Champions League, Europa League, Conference League */
const UEFA_LEAGUE_PHASE = new Set(['2', '3', '848'])

export function ExternalLeaguePage({ view, league, groups, source, matches, since, recent, upcoming, now, baseline, rounds, bracket, leaders, stats, news }: Props) {
  const sport = sportById(league.sport).label
  const path = paths.league(league.key)
  const rows = groups.flat()
  const hasPoints = rows.some((r) => r.points !== undefined)
  const hasDraws = rows.some((r) => r.drawn !== undefined)
  const hasScore = rows.some((r) => r.for !== undefined)
  const leader = groups[0]?.[0]
  const showTable = !rounds || rows.length > 1
  const tableSection = (
          <section className="panel table-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">Stilling</h2>
            </header>
            {rows.length > 1 ? (
              groups.map((group, gi) => {
                // A long table (the Champions League's league phase is one table of 36) shows its top, the rest behind a button
                const fold = groups.length === 1 && group.length > FOLD_OVER
                // UEFA's league phase: 1–8 straight to the round of 16, 9–24 to the play-off, the rest out
                const phase = league.api === 'football' && UEFA_LEAGUE_PHASE.has(String(league.id)) && group.length === 36
                return (
                <div key={gi} className={fold ? 'table-wrap table-fold' : 'table-wrap'}>
                  {groups.length > 1 && group[0]?.group && <h3 className="table-group">{group[0].group}</h3>}
                  {fold && <input type="checkbox" id={`table-fold-${gi}`} className="table-fold__toggle" aria-label={`Vis alle ${group.length} hold`} />}
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
                      {group.map((r, ri) => (
                        <tr
                          key={`${r.rank}-${r.name}`}
                          className={[baseline?.splitAfter === r.rank || (phase && (ri === 7 || ri === 23)) ? 'is-split' : '', fold && ri >= FOLD_ROWS ? 'is-folded' : ''].filter(Boolean).join(' ') || undefined}
                        >
                          <td className="num pos">{r.rank}</td>
                          <td>
                            {(() => {
                              // Linked to the team's own page in this league (not a men's club of the same name)
                              const team = teamInLeague(league.key, r.name, league.sport)
                              // One of our own clubs under our name for it ("Bodø/Glimt", not the source's "Bodo/Glimt")
                              const name = team?.season ? team.name : r.name
                              return (
                                <span className="table__club">
                                  <TeamBadge link={false} name={name} src={r.logo ?? team?.logo} size={20} />
                                  {team ? <Link href={paths.club(team.slug)}>{name}</Link> : name}
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
                  {phase && <p className="muted small table-fold__note">Nr. 1–8 går direkte i ottendedelsfinalerne, nr. 9–24 spiller playoff om de sidste pladser, og nr. 25–36 er ude.</p>}
                  {fold && (
                    <label htmlFor={`table-fold-${gi}`} className="pill table-fold__more">
                      <span className="table-fold__open">Vis alle {group.length} hold</span>
                      <span className="table-fold__close">Vis færre</span>
                    </label>
                  )}
                </div>
                )
              })
            ) : (
              <p className="muted pad">Vi har endnu ikke nok spillede kampe til en stilling. Den bygges op for hver spillerunde.</p>
            )}
            <p className="muted small history__note">
              {source === 'api-sports'
                ? ''
                : baseline
                  ? `Udgangspunkt: stillingen efter ${baseline.round}. runde (${formatShortYear(new Date(baseline.after))}). Derefter beregnet af Matchly ud fra ${matches ?? 0} ${matches === 1 ? 'kamp' : 'kampe'} (3 point for sejr).${baseline.splitAfter ? (baseline.splitLabel ? ` Nr. 1-${baseline.splitAfter} ${baseline.splitLabel}.` : ` Stregen står under nr. ${baseline.splitAfter}.`) : ''}`
                  : `Beregnet af Matchly ud fra de ${matches ?? 0} kampe, vi har gemt${since ? ` siden ${formatShortYear(since)}` : ''} (3 point for sejr).`}
            </p>
          </section>
  )
  return (
    <div className="page">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SportsOrganization',
          name: league.name,
          sport,
          url: `${SITE_URL}${path}`,
          ...(league.logo && { logo: absoluteImage(league.logo) }),
        }}
      />
      <JsonLd data={webPageLd(path, league.name, new Date(now))} />
      <JsonLd data={breadcrumbLd([{ name: 'Kampe', path: '/' }, { name: league.name, path }])} />
      <div className="clubs">
        {view ? (
          <LeagueHero
            title={league.name}
            // The source gives only the season's first year ("2026" for 2026/27): left out rather than shown wrong
            kicker={`${danishCountry(league.country)} · ${sport}`}
            logo={league.logo}
            rows={view.rows}
            stats={stats}
            goalWord={league.sport === 'basketball' ? 'point' : 'mål'}
            deep={view.deep}
            topScorer={view.topScorer}
          />
        ) : (
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
        )}
        {rounds && (
          <p className="lead">
            {rounds.length
              ? `${league.name}: ${rounds.reduce((n, r) => n + r.matches.length, 0)} kampe spillet, senest ${rounds[0].name.toLowerCase()}.`
              : `${league.name}: resultater og kommende kampe.`}
            {upcoming[0] && ` Næste kamp: ${upcoming[0].home.name} – ${upcoming[0].away.name}.`}
          </p>
        )}
        {!rounds && leader && !view && (
          <p className="lead">
            {leader.name} fører {league.name} efter {leader.played} kampe
            {hasPoints ? ` med ${leader.points} point` : ` med ${leader.won} sejre`}.
          </p>
        )}
        <Updated at={now} />
        <CalendarButton kind="turnering" slug={league.key} name={league.name} />
        <LiveNow matches={upcoming} />

        {bracket && <KnockoutBracket rounds={bracket} />}
        {/* Every box in two columns, each in the shorter one, so nothing leaves a hole (MasonryFlow) */}
        <MasonryFlow>
          {upcoming.length > 0 && <Upcoming upcoming={upcoming} />}
          {showTable && tableSection}
          {/* A tournament shows API-Sports' own table (its groups), never one of ours */}
          <LeagueStats stats={stats} sport={league.sport} leaders={leaders} />
          {leaders && <LeagueLeaders leaders={leaders} league={league.name} />}
          {view && <FormTableBox rows={view.rows} />}
          {view && <AttackDefenceBox rows={view.rows} />}
          {view && <LeaguePlayersBox deep={view.deep} league={league.name} />}
          {view && <LeagueOutBox deep={view.deep} />}
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
          {news}
        </MasonryFlow>
        {view && <LeagueBriefBox items={view.brief} title={`${league.name} kort fortalt`} />}
        <AdSlot placement="feed" />
        <p className="muted small">
          <Link href="/">Se alle dagens kampe</Link>.
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
