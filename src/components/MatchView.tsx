'use client'

import Link from 'next/link'
import { formatDayMonth, formatFull, formatShortYear, formatTime, isoDate } from '../lib/time'
import { danishCountry } from '../data/countries'
import { paths } from '../lib/site'
import { clubStats, findClub, scoreWords, type ClubStats, type PastMatch } from '../data/matchInsights'
import { clubSeasonStats } from '../data/stats'
import { sportOf } from '../data/leagues'
import { findMatch } from '../data/matches'
import { teamByName } from '../data/teams'
import { useNow } from '../hooks/useNow'
import type { Match } from '../types'
import { StatBar } from './StatBar'
import { FormChips } from './FormChips'
import { summary } from '../lib/matchText'
import { Updated } from './Updated'
import { MatchExtrasPanel } from './MatchExtras'
import { PartnerLogo } from './PartnerLogo'
import { channelsFor } from '../data/channels'
import { clubFixtures, isFinished, standings } from '../data/season'
import { TeamBadge } from './TeamBadge'
import type { FormGame, MatchExtra, TableRow } from '../data/matchExtra'

/** Where the head-to-head meetings come from */
export type H2hSource = 'database' | 'api-sports' | 'both'

interface Props {
  slug: string
  date: string
  initialNow: number
  /** Real meetings from the match database, when both clubs are in it */
  realH2h?: PastMatch[]
  h2hSource?: H2hSource
  /** Facts, form and table from API-Sports (server) */
  extra?: MatchExtra
}

/** Match page body. Regenerates the match as time passes so live scores tick. */
export function MatchView({ slug, date, initialNow, realH2h, h2hSource, extra }: Props) {
  const now = useNow(30_000, initialNow)
  const match = findMatch(slug, date, now)
  if (!match) return null
  return <MatchBody match={match} now={now} realH2h={realH2h} h2hSource={h2hSource} extra={extra} />
}

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** Both clubs' season side by side: the home side at home, the away side away, and their goal habits */
function seasonCompare(match: Match) {
  const h = findClub(match.home.name)
  const a = findClub(match.away.name)
  if (!h || !a || match.sport !== 'soccer') return undefined
  const hs = clubSeasonStats(h.club, h.division)
  const as = clubSeasonStats(a.club, a.division)
  if (!hs || !as) return undefined
  const ppg = (points: number, played: number) => (played ? points / played : 0)
  const homePpg = ppg(hs.home.points, hs.home.played)
  const awayPpg = ppg(as.away.points, as.away.played)
  const rows = [
    { label: 'Point pr. kamp (hjemme / ude)', home: homePpg, away: awayPpg, homeText: one(homePpg), awayText: one(awayPpg) },
    { label: 'Mål pr. kamp', home: hs.goalsForPerMatch, away: as.goalsForPerMatch, homeText: one(hs.goalsForPerMatch), awayText: one(as.goalsForPerMatch) },
    {
      label: 'Mål imod pr. kamp',
      home: hs.goalsAgainstPerMatch,
      away: as.goalsAgainstPerMatch,
      homeText: one(hs.goalsAgainstPerMatch),
      awayText: one(as.goalsAgainstPerMatch),
      lowerIsBetter: true,
    },
    { label: 'Clean sheets', home: hs.cleanSheets, away: as.cleanSheets, homeText: `${hs.cleanSheets}`, awayText: `${as.cleanSheets}` },
    { label: 'Begge hold scorer', home: hs.bttsPct, away: as.bttsPct, homeText: `${hs.bttsPct} %`, awayText: `${as.bttsPct} %` },
    { label: 'Over 2,5 mål', home: hs.over25Pct, away: as.over25Pct, homeText: `${hs.over25Pct} %`, awayText: `${as.over25Pct} %` },
  ]
  return rows.map((r) => ({ lowerIsBetter: false, ...r }))
}

function ClubName({ name }: { name: string }) {
  const team = teamByName(name)
  return team ? <Link href={paths.club(team.slug)}>{name}</Link> : <>{name}</>
}

function MatchBody({
  match,
  now,
  realH2h,
  h2hSource,
  extra,
}: {
  match: Match
  now: number
  realH2h?: PastMatch[]
  h2hSource?: H2hSource
  extra?: MatchExtra
}) {
  const { home, away, state } = match
  const showScore = state === 'live' || state === 'finished'
  const homeStats = clubStats(home.name, now)
  const awayStats = clubStats(away.name, now)
  const h2h = realH2h ?? []
  const wins = { home: 0, draw: 0, away: 0 }
  for (const m of h2h) {
    const homeGoals = m.home === home.name ? m.homeScore : m.awayScore
    const awayGoals = m.home === home.name ? m.awayScore : m.homeScore
    if (homeGoals > awayGoals) wins.home++
    else if (homeGoals < awayGoals) wins.away++
    else wins.draw++
  }
  const colorsOf = (name: string) => findClub(name)?.club.colors
  const compare = seasonCompare(match)
  const channels = channelsFor(match)
  // Latest results and the table: from API-Sports for their games, otherwise from our own season
  const form = extra?.form ?? seasonForm(match)
  const table = extra?.table ?? seasonTable(match)

  return (
    <article className="match-page">
      <nav className="crumbs" aria-label="Brødkrummer">
        <Link href="/">Kampe</Link>
        <span aria-hidden>/</span>
        {match.leagueSlug ? <Link href={paths.league(match.leagueSlug)}>{match.league}</Link> : <span>{match.league}</span>}
        <span aria-hidden>/</span>
        <span>
          {home.name} – {away.name}
        </span>
      </nav>

      <header className="duel">
        <div className="duel__team">
          <TeamBadge name={home.name} src={home.badge} colors={home.colors} size={72} />
          <strong>
            <ClubName name={home.name} />
          </strong>
          {homeStats && <span className="duel__pos">{homeStats.position}. plads</span>}
        </div>
        <div className="duel__center">
          {showScore ? (
            <span className={`duel__score duel__score--${state}`}>
              {home.score ?? 0}–{away.score ?? 0}
            </span>
          ) : (
            <span className="duel__score">{formatTime(match.kickoff)}</span>
          )}
          <span className={`status status--${state}`}>{match.statusLabel ?? 'Kommende'}</span>
        </div>
        <div className="duel__team">
          <TeamBadge name={away.name} src={away.badge} colors={away.colors} size={72} />
          <strong>
            <ClubName name={away.name} />
          </strong>
          {awayStats && <span className="duel__pos">{awayStats.position}. plads</span>}
        </div>
      </header>

      <MatchExtrasPanel match={match} withChannels={false} />

      <h1 className="match-page__title">
        {home.name} – {away.name}
      </h1>
      <p className="match-page__summary">{summary(match, homeStats, awayStats)}</p>
      <Updated at={now} />

      <div className="match-page__cols">
        <div className="match-page__col">
          <section className="sheet__section">
            <h2 className="sheet__title">Kampfakta</h2>
            <dl className="facts">
              <div>
                <dt>Turnering</dt>
                <dd>{match.leagueSlug ? <Link href={paths.league(match.leagueSlug)}>{match.league}</Link> : match.league}</dd>
              </div>
              {match.country && (
                <div>
                  <dt>Land</dt>
                  <dd>{danishCountry(match.country)}</dd>
                </div>
              )}
              <div>
                <dt>Dato</dt>
                <dd>
                  {formatFull(match.kickoff)} kl. {formatTime(match.kickoff)}
                </dd>
              </div>
              {match.venue && !extra?.facts.some((f) => f.label === 'Spillested') && (
                <div>
                  <dt>Spillested</dt>
                  <dd>{match.venue}</dd>
                </div>
              )}
              {channels.length > 0 && (
                <div className="facts__wide">
                  <dt>{match.state === 'finished' ? 'Blev vist på' : match.state === 'live' ? 'Vises nu på' : 'Vises på'}</dt>
                  <dd className="facts__channels">
                    {channels.map((c) => (
                      <PartnerLogo key={c.id} partner={c} kind="kanal" height={36} />
                    ))}
                  </dd>
                </div>
              )}
              {extra?.facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {match.incidents && match.incidents.length > 0 && (
            <section className="sheet__section">
              <h2 className="sheet__title">Kampforløb</h2>
              <ol className="timeline">
                {match.incidents.map((e, n) => {
                  const label =
                    e.kind === 'goal' ? 'Mål' : e.kind === 'penalty' ? 'Mål (straffespark)' : e.kind === 'own-goal' ? 'Selvmål' : e.kind === 'red' ? 'Rødt kort' : 'Gult kort'
                  const icon =
                    e.kind === 'red' ? <span className="red-card" aria-hidden /> : e.kind === 'yellow' ? <span className="yellow-card" aria-hidden /> : <span aria-hidden>⚽</span>
                  const body = (
                    <span className={`timeline__event timeline__event--${e.side}`}>
                      {e.side === 'home' ? (
                        <>
                          <span>
                            {e.player ?? label}
                            {e.player && <em> · {label}</em>}
                          </span>
                          {icon}
                        </>
                      ) : (
                        <>
                          {icon}
                          <span>
                            {e.player ?? label}
                            {e.player && <em> · {label}</em>}
                          </span>
                        </>
                      )}
                    </span>
                  )
                  return (
                    <li key={n} className="timeline__row">
                      {e.side === 'home' ? body : <span />}
                      <span className="timeline__minute">{e.minute}&apos;</span>
                      {e.side === 'away' ? body : <span />}
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          {table && table.rows.length > 1 && (
            <section className="sheet__section">
              <h2 className="sheet__title">Stilling · {match.league}</h2>
              <div className="table-wrap table-wrap--flush">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>Hold</th>
                      <th className="num" title="Kampe">K</th>
                      <th className="num" title="Vundet">V</th>
                      {table.rows.some((r) => r.drawn !== undefined) && (
                        <th className="num" title="Uafgjort">U</th>
                      )}
                      <th className="num" title="Tabt">T</th>
                      {table.rows.some((r) => r.for !== undefined) && <th className="num hide-sm">Score</th>}
                      {table.rows.some((r) => r.points !== undefined) && (
                        <th className="num" title="Point">
                          P
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r) => {
                      const ours = (r.teamId !== undefined && (r.teamId === table.homeId || r.teamId === table.awayId)) || r.name === home.name || r.name === away.name
                      return (
                        <tr key={`${r.rank}-${r.name}`} className={ours ? 'is-highlight' : undefined}>
                          <td className="num pos">{r.rank}</td>
                          <td>
                            <span className="table__club">
                              <TeamBadge name={r.name} src={r.logo} size={20} />
                              {r.name}
                            </span>
                          </td>
                          <td className="num">{r.played}</td>
                          <td className="num">{r.won}</td>
                          {table.rows.some((x) => x.drawn !== undefined) && <td className="num">{r.drawn ?? 0}</td>}
                          <td className="num">{r.lost}</td>
                          {table.rows.some((x) => x.for !== undefined) && (
                            <td className="num hide-sm">
                              {r.for ?? 0}–{r.against ?? 0}
                            </td>
                          )}
                          {table.rows.some((x) => x.points !== undefined) && <td className="num pts">{r.points ?? 0}</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="muted small">Stilling: {table.source === 'api-sports' ? 'API-Sports' : 'beregnet af Scoreline ud fra sæsonens kampe'}.</p>
            </section>
          )}
        </div>
        <div className="match-page__col">
          {compare && (
            <section className="sheet__section">
              <h2 className="sheet__title">{state === 'upcoming' ? 'Før kampen' : 'Sæsonen i tal'}</h2>
            <CompareHead home={home} away={away} />
              {compare.map((c) => (
                <StatBar
                  key={c.label}
                  label={c.label}
                  home={c.home}
                  away={c.away}
                  homeText={c.homeText}
                  awayText={c.awayText}
                  lowerIsBetter={c.lowerIsBetter}
                />
              ))}
              <p className="muted small">Beregnet af Scoreline ud fra sæsonens spillede kampe.</p>
            </section>
          )}

          {homeStats && awayStats && (
            <section className="sheet__section">
              <h2 className="sheet__title">Klubberne i sæsonen</h2>
            <CompareHead home={home} away={away} />
              <ClubComparison home={homeStats} away={awayStats} />
            </section>
          )}

        </div>
      </div>
      <div className="match-page__grid match-page__grid--wide">
        {form && (form.home.length > 0 || form.away.length > 0) && (
          <section className="sheet__section">
            <h2 className="sheet__title">Seneste kampe</h2>
            <div className="form-cols">
              <TeamForm name={home.name} badge={home.badge} games={form.home} />
              <TeamForm name={away.name} badge={away.badge} games={form.away} />
            </div>
          </section>
        )}

        <section className="sheet__section">
          <h2 className="sheet__title">Seneste indbyrdes opgør</h2>
          {h2h.length > 0 && (
          <div className="h2h-summary">
            <div>
              <strong>{wins.home}</strong>
              <span>{home.name}</span>
            </div>
            <div>
              <strong>{match.sport === 'soccer' || wins.draw > 0 ? wins.draw : h2h.length}</strong>
              <span>{match.sport === 'soccer' || wins.draw > 0 ? 'Uafgjort' : 'Kampe'}</span>
            </div>
            <div>
              <strong>{wins.away}</strong>
              <span>{away.name}</span>
            </div>
          </div>
          )}
          {h2h.length === 0 && (
            <p className="muted small">
              {realH2h ? 'Klubberne har ikke mødt hinanden i vores data.' : 'Vi har ingen tidligere opgør mellem klubberne.'}
            </p>
          )}
          <ul className="h2h">
            {h2h.map((m, i) => {
              const winner = m.homeScore > m.awayScore ? m.home : m.homeScore < m.awayScore ? m.away : null
              return (
                <li key={i} className="h2h__row">
                  <span className="h2h__meta">
                    {formatShortYear(m.date)}
                    <em>{m.competition}</em>
                  </span>
                  <span className={`h2h__team${winner === m.home ? ' is-winner' : ''}`}>
                    {m.home}
                    <TeamBadge name={m.home} src={m.homeLogo ?? (m.home === home.name ? home.badge : m.home === away.name ? away.badge : undefined)} colors={colorsOf(m.home)} size={22} />
                  </span>
                  <span className="h2h__score">
                    {m.homeScore}–{m.awayScore}
                  </span>
                  <span className={`h2h__team h2h__team--away${winner === m.away ? ' is-winner' : ''}`}>
                    <TeamBadge name={m.away} src={m.awayLogo ?? (m.away === home.name ? home.badge : m.away === away.name ? away.badge : undefined)} colors={colorsOf(m.away)} size={22} />
                    {m.away}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="muted small">
            Kampprogram og resultat: {sourceOf(match.id)}.{realH2h ? ` Indbyrdes opgør: ${h2hSource === 'api-sports' ? 'API-Sports' : h2hSource === 'both' ? 'vores kampdatabase og API-Sports' : 'vores kampdatabase'}.` : ''}
          </p>
        </section>
      </div>
    </article>
  )
}

function ClubComparison({ home, away }: { home: ClubStats; away: ClubStats }) {
  const h = home.row
  const a = away.row
  const perGame = (goals: number, played: number) => (played ? goals / played : 0)
  const sameDivision = home.division.id === away.division.id
  const sport = sportOf(home.division)
  const words = scoreWords(sport)

  return (
    <>
      {!sameDivision && (
        <p className="muted small">
          {home.division.name} mod {away.division.name} – tallene er fra hver klubs egen række.
        </p>
      )}
      <StatBar label="Placering" home={home.position} away={away.position} lowerIsBetter />
      <StatBar label="Point" home={h.points} away={a.points} />
      <StatBar label="Sejre" home={h.won} away={a.won} />
      {sport === 'soccer' && <StatBar label="Uafgjort" home={h.drawn} away={a.drawn} neutral />}
      <StatBar label="Nederlag" home={h.lost} away={a.lost} lowerIsBetter />
      <StatBar label={words.scored} home={h.goalsFor} away={a.goalsFor} />
      <StatBar label={words.conceded} home={h.goalsAgainst} away={a.goalsAgainst} lowerIsBetter />
      <StatBar
        label={words.perGame}
        home={perGame(h.goalsFor, h.played)}
        away={perGame(a.goalsFor, a.played)}
        homeText={perGame(h.goalsFor, h.played).toFixed(1).replace('.', ',')}
        awayText={perGame(a.goalsFor, a.played).toFixed(1).replace('.', ',')}
      />
      <div className="form-compare">
        <FormChips form={h.form} />
        <span className="statbar__label">Form</span>
        <FormChips form={a.form} />
      </div>
    </>
  )
}

/** A team's latest results, newest first */
function TeamForm({ name, badge, games }: { name: string; badge?: string; games: FormGame[] }) {
  const result = (g: FormGame) => (g.for > g.against ? 'V' : g.for < g.against ? 'T' : 'U')
  return (
    <div className="team-form">
      <h3 className="team-form__name">
        <TeamBadge name={name} src={badge} size={22} />
        {name}
        <FormChips form={[...games].reverse().map(result)} />
      </h3>
      {games.length ? (
        <ul className="team-form__list">
          {games.map((g, i) => (
            <li key={i}>
              <span className={`form__chip form__chip--${result(g)}`}>{result(g)}</span>
              <span className="team-form__date">{formatDayMonth(isoDate(new Date(g.date)))}</span>
              <span className="team-form__opp">
                {g.home ? 'mod' : 'ude mod'} {g.opponent}
                <em>{g.competition}</em>
              </span>
              <strong>
                {g.for}–{g.against}
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Ingen kampe fundet.</p>
      )}
    </div>
  )
}

/** Where a match comes from, by its id ("tsdb-<event id>" for our leagues' season) */
function sourceOf(id: string) {
  const inner = id.startsWith('tsdb-') ? id.slice(5) : id
  if (inner.startsWith('db-')) return 'vores kampdatabase'
  if (/^[a-z-]+-\d+$/.test(inner) && !/^\d+$/.test(inner)) return 'API-Sports'
  return 'TheSportsDB'
}

/** Both clubs' latest results in our season, before this match */
function seasonForm(match: Match): MatchExtra['form'] {
  const of = (name: string): FormGame[] => {
    const club = findClub(name)?.club
    if (!club) return []
    return clubFixtures(club.id)
      .filter((f) => isFinished(f) && f.kickoff.getTime() < match.kickoff.getTime())
      .slice(-5)
      .reverse()
      .map((f) => {
        const home = f.home.id === club.id
        return { date: f.kickoff.toISOString(), opponent: home ? f.away.name : f.home.name, home, for: home ? f.score[0] : f.score[1], against: home ? f.score[1] : f.score[0], competition: f.competition }
      })
  }
  const form = { home: of(match.home.name), away: of(match.away.name) }
  return form.home.length || form.away.length ? form : undefined
}

/** The table of the league both clubs play in, from our season */
function seasonTable(match: Match): MatchExtra['table'] {
  const home = findClub(match.home.name)
  const away = findClub(match.away.name)
  if (!home || !away || home.division.id !== away.division.id) return undefined
  const rows: TableRow[] = standings(home.division).map((r, i) => ({
    rank: i + 1,
    name: r.club.name,
    played: r.played,
    won: r.won,
    drawn: sportOf(home.division) === 'basketball' ? undefined : r.drawn,
    lost: r.lost,
    for: r.goalsFor,
    against: r.goalsAgainst,
    points: r.points,
  }))
  return { rows }
}

/** Which side is which in the comparisons: the home club left, the away club right */
function CompareHead({ home, away }: { home: Match['home']; away: Match['away'] }) {
  return (
    <div className="compare-head">
      <span>
        <TeamBadge name={home.name} src={home.badge} colors={home.colors} size={24} />
        <ClubName name={home.name} />
      </span>
      <span>
        <ClubName name={away.name} />
        <TeamBadge name={away.name} src={away.badge} colors={away.colors} size={24} />
      </span>
    </div>
  )
}
