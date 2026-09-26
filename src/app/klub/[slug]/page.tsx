import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { seasonOf, sportOf, type Club, type Division } from '../../../data/leagues'
import { allTeams, teamBySlug, type TeamEntry } from '../../../data/teams'
import { isUnconfirmed, standings } from '../../../data/season'
import { clubMatches, teamMatches } from '../../../data/matches'
import { clubStats } from '../../../data/matchInsights'
import { ClubMatches } from '../../../components/ClubMatches'
import { FormChart } from '../../../components/FormChart'
import { FormChips } from '../../../components/FormChips'
import { MatchRow } from '../../../components/MatchRow'
import { StandingsTable } from '../../../components/StandingsTable'
import { TeamBadge } from '../../../components/TeamBadge'
import { danishCountry } from '../../../data/countries'
import { BadgeWatermark } from '../../../components/BadgeWatermark'
import { JsonLd, breadcrumbLd, clubLd, faqLd, teamPageLd, webPageLd } from '../../../lib/jsonld'
import { Faq } from '../../../components/Faq'
import { AdSlot } from '../../../components/AdSlot'
import { ClubHistory } from '../../../components/ClubHistory'
import { ClubSeasonStats } from '../../../components/ClubSeasonStats'
import { archiveLeagueTable, clubHistory } from '../../../lib/history'
import { readArchive } from '../../../lib/archive'
import { normalize } from '../../../data/aliases'
import type { PastMatch } from '../../../data/matchInsights'
import type { Match } from '../../../types'
import { BASELINES } from '../../../data/baselines'
import { cupOfGame } from '../../../data/cups'
import { apiLeagueTable, externalLeague, teamLogos } from '../../../lib/apisports'
import { Updated } from '../../../components/Updated'
import { CalendarButton } from '../../../components/CalendarButton'
import { clubFaq, teamFaq } from '../../../lib/faq'
import { addDays, formatLong, formatShortYear, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'
import { sportById } from '../../../sports'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

export function generateStaticParams() {
  return allTeams().map((t) => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const team = teamBySlug((await params).slug)
  if (!team) return { title: 'Klubben findes ikke' }
  if (!team.season) {
    const sport = sportById(team.sport).label.toLowerCase()
    return {
      title: `${team.name} – resultater og kampprogram (${team.league})`,
      description: `Seneste resultater og kommende kampe for ${team.name} i ${team.league} (${sport}${team.country ? `, ${team.country}` : ''}).`,
      alternates: { canonical: paths.club(team.slug) },
    }
  }
  const { club, division } = team.season
  const stats = clubStats(club.name, Date.now())!
  return {
    title: `${club.name} – resultater, kampprogram og stilling ${seasonOf(division)}`,
    description: `${club.name} fra ${club.city} spiller i ${division.name} ${seasonOf(division)} og ligger nr. ${stats.position} med ${stats.row.points} point efter ${stats.row.played} kampe. Se seneste resultater og kommende kampe.`,
    alternates: { canonical: paths.club(club.slug) },
  }
}

export default async function ClubPage({ params }: { params: Params }) {
  const team = teamBySlug((await params).slug)
  if (!team) notFound()
  return team.season ? <LeagueClub {...team.season} /> : <TeamPage team={team} />
}

/** Full page for clubs in the leagues we cover, which have season and table data */
function LeagueClub({ club, division }: { club: Club; division: Division }) {
  const now = Date.now()
  const stats = clubStats(club.name, now)!
  const r = stats.row
  const sport = sportOf(division)
  const season = clubMatches(club.name, now)
  const recent = season.filter((m) => m.state === 'finished').reverse()
  const upcoming = season.filter((m) => m.state !== 'finished')
  const faq = clubFaq(club, division, stats, upcoming[0], recent[0])
  const history = clubHistory(club)
  const table = standings(division, now)
  const i = table.findIndex((x) => x.club.id === club.id)
  // Five rows around the club
  const start = Math.max(0, Math.min(i - 2, table.length - 5))
  const nearby = table.slice(start, start + 5)

  return (
    <div className="page">
      <JsonLd data={clubLd(club, division)} />
      <JsonLd data={webPageLd(paths.club(club.slug), club.name, new Date(now))} />
      <JsonLd data={faqLd(faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Klubber', path: paths.clubs() },
          { name: club.name, path: paths.club(club.slug) },
        ])}
      />
      <div className="clubs">
        <header className="club-hero" style={{ '--club-bg': club.colors[0], '--club-fg': club.colors[1] } as React.CSSProperties}>
          <BadgeWatermark name={club.name} />
          <TeamBadge link={false} name={club.name} colors={club.colors} size={96} />
          <div className="club-hero__text">
            <span className="club-hero__eyebrow">
              <Link href={paths.league(division.slug)}>{division.name}</Link>
              {club.city && ` · ${club.city}`}
            </span>
            <h1>{club.name}</h1>
            {isUnconfirmed(club, division.id) && <span className="unverified">Rækken for {seasonOf(division)} er ikke bekræftet</span>}
          </div>
        </header>

        <p className="lead">
          {club.name} ligger nr. {stats.position} i {division.name} med {r.points} point efter {r.played} kampe ({r.won}{' '}
          sejre{sport === 'soccer' ? `, ${r.drawn} uafgjorte` : ''} og {r.lost} nederlag
          {sport === 'ice_hockey' && r.otWon + r.otLost > 0 ? `, heraf ${r.otWon + r.otLost} afgjort i forlænget spil` : ''}) og en
          {sport === 'basketball' ? ' samlet score' : ' målscore'} på {r.goalsFor}-{r.goalsAgainst}.
        </p>
        <Updated at={now} />
        <CalendarButton kind="klub" slug={club.slug} name={club.name} />

        <section className="tiles tiles--club" aria-label="Sæsonen i tal">
          <div className="tile tile--lime">
            <span className="tile__label">Placering</span>
            <strong className="tile__value">{stats.position}.</strong>
          </div>
          <div className="tile tile--ink">
            <span className="tile__label">Point</span>
            <strong className="tile__value">{r.points}</strong>
          </div>
          <div className="tile tile--blush">
            <span className="tile__label">{sport === 'basketball' ? 'Score' : 'Mål'}</span>
            <strong className="tile__value">
              {r.goalsFor}-{r.goalsAgainst}
            </strong>
          </div>
          <div className="tile tile--form">
            <span className="tile__label">Form</span>
            <FormChips form={r.form} />
          </div>
        </section>

        <div className="club-layout">
          <ClubMatches clubName={club.name} initialNow={now} />
          <div className="club-layout__side">
            <FormChart clubName={club.name} initialNow={now} />
            <section className="panel table-panel">
              <header className="table-panel__head">
                <h2 className="panel__title">Stilling · {division.name}</h2>
                <Link className="text-btn" href={paths.league(division.slug)}>
                  Hele stillingen
                </Link>
              </header>
              <StandingsTable division={division} rows={nearby} highlight={club.id} offset={start} total={table.length} compact />
            </section>
          </div>
        </div>

        <ClubSeasonStats club={club} division={division} />
        {history && <ClubHistory name={club.name} history={history} />}

        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}

/** A team's finished games: its matches around today and those our statistics bank has saved, newest first */
function teamResults(names: string[], around: Match[], divisionId: string | undefined, leagueName: string): PastMatch[] {
  const keys = new Set(names.map(normalize))
  const logos = teamLogos()
  const fromMatches: PastMatch[] = around
    .filter((m) => m.state === 'finished')
    .map((m) => ({
      date: m.kickoff,
      competition: m.league,
      home: m.home.name,
      away: m.away.name,
      homeScore: m.home.score ?? 0,
      awayScore: m.away.score ?? 0,
      homeLogo: m.home.badge,
      awayLogo: m.away.badge,
      slug: m.slug,
    }))
  const seen = new Set(fromMatches.map((m) => `${isoDate(m.date)}|${normalize(m.home)}`))
  const saved: PastMatch[] = readArchive()
    // In its own league when it has one (a women's team can share its name with the men's club)
    .filter((a) => (divisionId ? a.divisionId === divisionId : a.divisionId.startsWith('ext-') && normalize(a.tournament) === normalize(leagueName)))
    .filter((a) => keys.has(normalize(a.homeName)) || keys.has(normalize(a.awayName)))
    .filter((a) => !seen.has(`${isoDate(a.date)}|${normalize(a.homeName)}`))
    .map((a) => ({
      date: a.date,
      competition: a.tournament,
      home: a.homeName,
      away: a.awayName,
      homeScore: a.homeScore,
      awayScore: a.awayScore,
      homeLogo: logos.get(a.homeName),
      awayLogo: logos.get(a.awayName),
    }))
  return [...fromMatches, ...saved].sort((a, b) => b.date.getTime() - a.date.getTime())
}

/** Page for any other team: built from its matches, the games we have saved and its league's table */
async function TeamPage({ team }: { team: TeamEntry }) {
  const now = Date.now()
  const today = isoDate(now)
  const names = team.names ?? [team.name]
  const keys = new Set(names.map(normalize))
  const own = (name: string) => keys.has(normalize(name))
  const league = team.leagueSlug ? externalLeague(team.leagueSlug) : undefined
  const api = league?.api.split('-')[0]
  const divisionId = league ? `ext-${api}-${league.id}` : undefined
  // The league's table: API-Sports' own when the plan gives it, else ours from a starting table and the saved games
  const baseline = team.leagueSlug ? BASELINES[team.leagueSlug] : undefined
  // A cup has rounds, not a table
  const cup = !!cupOfGame({ sport: team.sport, league: { id: '', name: team.league, country: team.country } })
  const fromApi = league && !cup ? await apiLeagueTable(league) : undefined
  const table = cup ? [] : (fromApi?.find((g) => g.some((r) => own(r.name))) ?? (divisionId || baseline ? archiveLeagueTable(divisionId ?? '', baseline).rows : []))
  const women = (n: string) => n.replace(/\b(w|women|q)\b\.?/gi, '').trim()
  const row =
    table.find((r) => own(r.name)) ??
    table.find((r) => [r.name, ...(baseline?.rows.find((b) => b.name === r.name)?.aliases ?? [])].some((n) => names.some((x) => normalize(women(x)) === normalize(women(n)))))
  const at = row ? table.indexOf(row) : -1
  const start = Math.max(0, Math.min(at - 2, table.length - 5))
  const nearby = at >= 0 && table.length > 1 ? table.slice(start, start + 5) : []
  const hasDraws = table.some((r) => r.drawn !== undefined)
  const hasPoints = table.some((r) => r.points !== undefined)

  const around = teamMatches(names, team.sport, addDays(today, -10), 30, now, team.names ? team.leagueSlug : undefined)
  const live = around.filter((m) => m.state === 'live')
  const upcoming = around.filter((m) => m.state === 'upcoming').slice(0, 6)
  const results = teamResults(names, around, divisionId, team.league)
  const recent = results.slice(0, 10)
  const lastMatch = around.filter((m) => m.state === 'finished').at(-1)
  const faq = teamFaq(team, upcoming[0], lastMatch)
  const sport = sportById(team.sport)
  const goalWord = team.sport === 'soccer' || team.sport === 'ice_hockey' ? 'Mål' : 'Score'

  // The team's side of each result
  const mine = results.map((m) => {
    const home = own(m.home) || (!own(m.away) && normalize(women(m.home)) !== normalize(women(m.away)) && names.some((n) => normalize(women(n)) === normalize(women(m.home))))
    const f = home ? m.homeScore : m.awayScore
    const a = home ? m.awayScore : m.homeScore
    return { m, home, f, a, outcome: (f > a ? 'V' : f < a ? 'T' : 'U') as 'V' | 'U' | 'T', opponent: home ? m.away : m.home }
  })
  const form = mine.slice(0, 5).map((x) => x.outcome).reverse()
  const n = mine.length
  const wins = mine.filter((x) => x.outcome === 'V').length
  const draws = mine.filter((x) => x.outcome === 'U').length
  const scored = mine.reduce((t, x) => t + x.f, 0)
  const conceded = mine.reduce((t, x) => t + x.a, 0)
  const per = (v: number) => (n ? (v / n).toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '–')
  const last = mine[0]
  const next = upcoming[0]

  return (
    <div className="page">
      <JsonLd data={teamPageLd(team)} />
      <JsonLd data={webPageLd(paths.club(team.slug), team.name, new Date(now))} />
      <JsonLd data={faqLd(faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Klubber', path: paths.clubs() },
          { name: team.name, path: paths.club(team.slug) },
        ])}
      />
      <div className="clubs">
        <header className="club-hero">
          <BadgeWatermark name={team.name} src={team.logo} />
          <TeamBadge link={false} name={team.name} src={team.logo} colors={team.colors ?? ['#c6f135', '#0f110c']} size={96} />
          <div className="club-hero__text">
            <span className="club-hero__eyebrow">
              {sport.label} ·{' '}
              {team.leagueSlug ? <Link href={paths.league(team.leagueSlug)}>{team.league}</Link> : team.league}
              {team.country && ` · ${danishCountry(team.country)}`}
            </span>
            <h1>{team.name}</h1>
          </div>
        </header>

        <p className="lead">
          {team.name} spiller i {team.league}
          {row
            ? ` og ligger nr. ${row.rank}${row.points !== undefined ? ` med ${row.points} point` : ''} efter ${row.played} kampe (${row.won} sejre${row.drawn !== undefined ? `, ${row.drawn} uafgjorte` : ''}, ${row.lost} nederlag${row.for !== undefined ? `, ${goalWord.toLowerCase()} ${row.for}-${row.against ?? 0}` : ''})`
            : ''}
          .{last && ` Seneste kamp: ${last.f}-${last.a} mod ${last.opponent}.`}
          {live[0] && ` Spiller lige nu mod ${own(live[0].home.name) ? live[0].away.name : live[0].home.name}.`}
          {!live[0] && next && ` Næste kamp er mod ${own(next.home.name) ? next.away.name : next.home.name} ${formatLong(next.kickoff)}.`}
        </p>
        <Updated at={now} />
        <CalendarButton kind="klub" slug={team.slug} name={team.name} />

        {(row || n > 0) && (
          <section className="tiles tiles--club" aria-label="Nøgletal">
            {row ? (
              <div className="tile tile--lime">
                <span className="tile__label">Placering</span>
                <strong className="tile__value">{row.rank}.</strong>
              </div>
            ) : (
              <div className="tile tile--lime">
                <span className="tile__label">Kampe</span>
                <strong className="tile__value">{n}</strong>
              </div>
            )}
            <div className="tile tile--ink">
              <span className="tile__label">{row?.points !== undefined ? 'Point' : 'Sejre'}</span>
              <strong className="tile__value">{row?.points ?? (row ? row.won : wins)}</strong>
            </div>
            <div className="tile tile--blush">
              <span className="tile__label">{goalWord}</span>
              <strong className="tile__value">{row?.for !== undefined ? `${row.for}-${row.against ?? 0}` : `${scored}-${conceded}`}</strong>
            </div>
            {form.length > 0 && (
              <div className="tile tile--form">
                <span className="tile__label">Form</span>
                <FormChips form={form} />
              </div>
            )}
          </section>
        )}

        {live.length > 0 && (
          <section className="league">
            <header className="league__header">
              <div className="league__toggle">
                <h2 className="league__name">Live nu</h2>
              </div>
            </header>
            <ul className="league__matches">
              {live.map((m) => (
                <MatchRow key={m.id} match={m} showDate />
              ))}
            </ul>
          </section>
        )}

        <div className="club-grid">
          <section className="panel table-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">Seneste resultater</h2>
            </header>
            {recent.length ? (
              <ul className="h2h h2h--pad">
                {mine.slice(0, 10).map(({ m, outcome }, i) => {
                  const winner = m.homeScore > m.awayScore ? m.home : m.homeScore < m.awayScore ? m.away : null
                  const body = (
                    <>
                      <span className="h2h__meta">
                        <em>
                          {formatShortYear(m.date)} · {m.competition}
                        </em>
                        <span className={`outcome outcome--${outcome}`} title={outcome === 'V' ? 'Sejr' : outcome === 'T' ? 'Nederlag' : 'Uafgjort'}>
                          {outcome}
                        </span>
                      </span>
                      <span className={`h2h__team${winner === m.home ? ' is-winner' : ''}`}>
                        {m.home}
                        <TeamBadge link={false} name={m.home} src={m.homeLogo} size={22} />
                      </span>
                      <span className="h2h__score">
                        {m.homeScore}–{m.awayScore}
                      </span>
                      <span className={`h2h__team h2h__team--away${winner === m.away ? ' is-winner' : ''}`}>
                        <TeamBadge link={false} name={m.away} src={m.awayLogo} size={22} />
                        {m.away}
                      </span>
                    </>
                  )
                  return (
                    <li key={i} className="h2h__row">
                      {m.slug ? (
                        <Link className="h2h__link" href={paths.match(m.slug)}>
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted small pad">Vi har ikke gemt nogen af holdets kampe endnu. De kommer med, efterhånden som de bliver spillet.</p>
            )}
          </section>
          <section className="league">
            <header className="league__header">
              <div className="league__toggle">
                <h2 className="league__name">Kommende kampe</h2>
              </div>
            </header>
            {upcoming.length ? (
              <ul className="league__matches">
                {upcoming.map((m) => (
                  <MatchRow key={m.id} match={m} showDate />
                ))}
              </ul>
            ) : (
              <p className="muted small pad">Ingen kampe i vores kampprogram de næste 20 dage.</p>
            )}
          </section>
        </div>

        {nearby.length > 0 && (
          <section className="panel table-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">Stilling · {team.league}</h2>
              {team.leagueSlug && (
                <Link className="text-btn" href={paths.league(team.leagueSlug)}>
                  Hele stillingen
                </Link>
              )}
            </header>
            <table className="table table--compact">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Hold</th>
                  <th className="num">K</th>
                  <th className="num">V</th>
                  {hasDraws && <th className="num">U</th>}
                  <th className="num">T</th>
                  {hasPoints && <th className="num">P</th>}
                </tr>
              </thead>
              <tbody>
                {nearby.map((r) => (
                  <tr key={`${r.rank}-${r.name}`} className={r === row ? 'is-highlight' : undefined}>
                    <td className="num pos">{r.rank}</td>
                    <td>
                      <span className="table__club">
                        <TeamBadge link={false} name={r.name} src={r.logo ?? teamLogos().get(r.name)} size={20} />
                        {r.name}
                      </span>
                    </td>
                    <td className="num">{r.played}</td>
                    <td className="num">{r.won}</td>
                    {hasDraws && <td className="num">{r.drawn ?? 0}</td>}
                    <td className="num">{r.lost}</td>
                    {hasPoints && <td className="num pts">{r.points ?? 0}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!fromApi && <p className="muted small history__note">Stillingen er beregnet af Scoreline (se hele stillingen for grundlaget).</p>}
          </section>
        )}

        {n >= 3 && (
          <section className="panel table-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">I tal</h2>
            </header>
            <dl className="facts pad">
              <div>
                <dt>Kampe</dt>
                <dd>{n}</dd>
              </div>
              <div>
                <dt>Sejre / uafgjorte / nederlag</dt>
                <dd>
                  {wins} / {draws} / {n - wins - draws}
                </dd>
              </div>
              <div>
                <dt>{goalWord} scoret pr. kamp</dt>
                <dd>{per(scored)}</dd>
              </div>
              <div>
                <dt>{goalWord} imod pr. kamp</dt>
                <dd>{per(conceded)}</dd>
              </div>
              <div>
                <dt>Hjemme / ude</dt>
                <dd>
                  {mine.filter((x) => x.home && x.outcome === 'V').length} / {mine.filter((x) => !x.home && x.outcome === 'V').length} sejre
                </dd>
              </div>
              <div>
                <dt>Periode</dt>
                <dd>
                  {formatShortYear(mine.at(-1)!.m.date)} – {formatShortYear(mine[0].m.date)}
                </dd>
              </div>
            </dl>
            <p className="muted small history__note">Beregnet af Scoreline ud fra de {n} kampe, vi har gemt for holdet.</p>
          </section>
        )}

        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}
