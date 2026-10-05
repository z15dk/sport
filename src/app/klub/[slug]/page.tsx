import type { Metadata } from 'next'
import { forVisitor } from '../../../lib/visitorBudget'
import Link from 'next/link'
import { MasonryFlow } from '../../../components/MasonryFlow'
import { notFound, permanentRedirect } from 'next/navigation'
import { seasonOf, sportOf, type Club, type Division } from '../../../data/leagues'
import { allTeams, movedTeamSlug, teamBySlug, womenOf, type TeamEntry } from '../../../data/teams'
import { isUnconfirmed, standings } from '../../../data/season'
import { clubExternalGames, clubMatches, teamGames } from '../../../data/matches'
import { RealDataExtra } from '../../../components/RealDataExtra'
import { clubLeagues } from '../../../lib/clientData'
import { clubStats } from '../../../data/matchInsights'
import { ClubMatches } from '../../../components/ClubMatches'
import { FormChart } from '../../../components/FormChart'
import { FormChips } from '../../../components/FormChips'
import { StandingsTable } from '../../../components/StandingsTable'
import { TeamBadge } from '../../../components/TeamBadge'
import { danishCountry, shownTeam } from '../../../data/countries'
import { counted, genitive } from '../../../lib/words'
import { BadgeWatermark } from '../../../components/BadgeWatermark'
import { JsonLd, breadcrumbLd, clubLd, teamPageLd, webPageLd } from '../../../lib/jsonld'
import { Faq } from '../../../components/Faq'
import { AboutText } from '../../../components/AboutText'
import { clubRivalries } from '../../../lib/rivalry'
import { clubTicketUrl, matchTicketUrl, ticketClickPath } from '../../../lib/tickets'
import { ClubPastSeasons } from '../../../components/ClubPastSeasons'
import { clubAbout, clubSeasons } from '../../../lib/seoText'
import { AdSlot } from '../../../components/AdSlot'
import { ClubSeasonStats } from '../../../components/ClubSeasonStats'
import { NewsList } from '../../../components/NewsList'
import { TaggedArticles } from '../../../components/TaggedArticles'
import { articlesAbout } from '../../../lib/articleTopics'
import { newsFor } from '../../../lib/news'
import { archiveLeagueTable } from '../../../lib/history'
import { readArchive } from '../../../lib/archive'
import { clubNames, normalize } from '../../../data/aliases'
import type { PastMatch } from '../../../data/matchInsights'
import type { Match } from '../../../types'
import { BASELINES, mainLeagueKey, sameLeagueKeys } from '../../../data/baselines'
import { getRealData } from '../../../data/real'
import { divisionOfGame } from '../../../data/ourLeagues'
import { externalLeagueKey } from '../../../data/external'
import { cupOfGame } from '../../../data/cups'
import { apiInjuries, apiLeagueIdOf, apiLeagueTable, apiTeamIdOf, apiTeamOwnGoals, apiTeamStats, externalLeague, injuriesForTeam, teamLogos } from '../../../lib/apisports'
import { TeamStatsPanel } from '../../../components/TeamStatsPanel'
import { checkedTeamStats } from '../../../data/teamStats'
import { clubSeasonStats } from '../../../data/stats'
import { InjuryList } from '../../../components/InjuryList'
import { Updated } from '../../../components/Updated'
import { CalendarButton } from '../../../components/CalendarButton'
import { KlubHeader } from '../../../components/KlubHeader'
import { klubfarve } from '../../../data/klubfarver'
import { calendarLinks } from '../../../lib/calendar'
import { getBadges } from '../../../lib/badges'
import { FollowButton } from '../../../components/FollowButton'
import { clubFaq, teamFaq } from '../../../lib/faq'
import { formatDayMonth, formatLong, formatShortYear, formatTime, isoDate } from '../../../lib/time'
import { paths } from '../../../lib/site'
import { sportById } from '../../../sports'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

/** The leagues (our division ids) whose clubs have the new header, KlubHeader; add a league here to give its clubs the header too */
const NEW_HEADER_DIVISIONS = new Set(['superliga'])

export function generateStaticParams() {
  return allTeams().map((t) => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const team = teamBySlug((await params).slug)
  if (!team) return { title: 'Klubben findes ikke' }
  if (!team.season) {
    const sport = sportById(team.sport).label.toLowerCase()
    // A team with no games at all (coming or saved) is a thin page: kept out of the search results
    const names = new Set((team.names ?? [team.name]).map(normalize))
    const empty = !teamGames(team, Date.now()).length && !readArchive().some((a) => names.has(normalize(a.homeName)) || names.has(normalize(a.awayName)))
    return {
      title: `${team.name} – resultater og kampprogram`,
      description: `Seneste resultater og kommende kampe for ${team.name} i ${team.league} (${sport}${team.country ? `, ${team.country}` : ''}).`,
      alternates: { canonical: paths.club(team.slug) },
      ...(empty && { robots: { index: false, follow: true } }),
    }
  }
  const { club, division } = team.season
  const stats = clubStats(club.name, Date.now())!
  return {
    title: `${club.name} – kampe og stilling ${seasonOf(division)}`,
    description: `${club.name} fra ${club.city} spiller i ${division.name} ${seasonOf(division)} og ligger nr. ${stats.position} med ${stats.row.points} point efter ${stats.row.played} kampe. Se seneste resultater og kommende kampe.`,
    alternates: { canonical: paths.club(club.slug) },
  }
}

export default async function ClubPage({ params }: { params: Params }) {
  const slug = (await params).slug
  const team = teamBySlug(slug)
  if (!team) {
    // An address the team had by mistake for a few hours: on to its real one
    const moved = movedTeamSlug(slug)
    if (moved) permanentRedirect(paths.club(moved))
    notFound()
  }
  return team.season ? <LeagueClub {...team.season} /> : <TeamPage team={team} />
}

/** Full page for clubs in the leagues we cover, which have season and table data */
async function LeagueClubInner({ club, division }: { club: Club; division: Division }) {
  const now = Date.now()
  const stats = clubStats(club.name, now)!
  const r = stats.row
  const sport = sportOf(division)
  const season = clubMatches(club.name, now)
  const recent = season.filter((m) => m.state === 'finished').reverse()
  const upcoming = season.filter((m) => m.state !== 'finished')
  const faq = clubFaq(club, division, stats, upcoming[0], recent[0])
  const table = standings(division, now)
  const i = table.findIndex((x) => x.club.id === club.id)
  // Five rows around the club
  const start = Math.max(0, Math.min(i - 2, table.length - 5))
  const nearby = table.slice(start, start + 5)
  // The source's team statistics and injured/suspended players (football)
  const apiLeague = sport === 'soccer' ? apiLeagueIdOf(division.id) : undefined
  const apiTeam = apiLeague ? apiTeamIdOf(apiLeague, clubNames(club)) : undefined
  const [teamStats, injuries] = apiLeague && apiTeam ? await Promise.all([apiTeamStats(apiLeague, apiTeam), apiInjuries(apiLeague)]) : [undefined, undefined]
  const absent = injuriesForTeam(injuries, apiTeam, now)
  // The new header (KlubHeader): for the Superliga's clubs to begin with, the other clubs keep the old one.
  // For it: the logo, the next match of the club itself, and which sections the page has
  const newHeader = NEW_HEADER_DIVISIONS.has(division.id)
  const logo = newHeader ? (await getBadges())[club.name] : undefined
  const nextMatch = upcoming.find((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
  const rivals = clubRivalries(club, division, now)
  const pastSeasons = clubSeasons(club, sport)
  const hasTeamStats = !!teamStats?.played.total || !!clubSeasonStats(club, division)

  return (
    <div className="page">
      <RealDataExtra games={clubExternalGames(club.name)} leagues={clubLeagues([club.id])} />
      <JsonLd data={clubLd(club, division)} />
      <JsonLd data={webPageLd(paths.club(club.slug), club.name, new Date(now))} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Klubber', path: paths.clubs() },
          { name: club.name, path: paths.club(club.slug) },
        ])}
      />
      <div className="clubs">
        {newHeader ? (
          <KlubHeader
            name={club.name}
            slug={club.slug}
            logo={logo}
            league={{ name: division.name, href: paths.league(division.slug) }}
            place={club.city}
            color={klubfarve(club.slug, club.colors)}
            row={{ position: stats.position, played: r.played, won: r.won, drawn: sport === 'soccer' ? r.drawn : undefined, lost: r.lost, points: r.points }}
            form={r.form}
            next={nextMatch && { opponent: nextMatch.home.name === club.name ? nextMatch.away.name : nextMatch.home.name, home: nextMatch.home.name === club.name, kickoff: nextMatch.kickoff, href: paths.match(nextMatch.slug) }}
            sections={[
              { id: 'oversigt', label: 'Oversigt' },
              { id: 'kampe', label: 'Kampe' },
              { id: 'stilling', label: 'Stilling' },
              ...(hasTeamStats ? [{ id: 'holdstatistik', label: 'Holdstatistik' }] : []),
              ...(rivals.length ? [{ id: 'indbyrdes-opgoer', label: 'Indbyrdes opgør' }] : []),
              ...(pastSeasons.length ? [{ id: 'tidligere-saesoner', label: 'Tidligere sæsoner' }] : []),
            ]}
            calendarHref={calendarLinks('klub', club.slug).webcal}
            ticketHref={clubTicketUrl(club.id) ? ticketClickPath({ klub: club.id }) : undefined}
            note={isUnconfirmed(club, division.id) ? `Rækken for ${seasonOf(division)} er ikke bekræftet` : undefined}
            now={now}
          />
        ) : (
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
            <FollowButton slug={club.slug} name={club.name} />
          </header>
        )}

        <p className="lead">
          {club.name} ligger nr. {stats.position} i {division.name} med {r.points} point efter {counted(r.played, 'kamp', 'kampe')} ({counted(r.won, 'sejr', 'sejre')}
          {sport === 'soccer' ? `, ${counted(r.drawn, 'uafgjort', 'uafgjorte')}` : ''} og {r.lost} nederlag
          {sport === 'ice_hockey' && r.otWon + r.otLost > 0 ? `, heraf ${r.otWon + r.otLost} afgjort i forlænget spil` : ''}) og en
          {sport === 'basketball' ? ' samlet score' : ' målscore'} på {r.goalsFor}-{r.goalsAgainst}.
        </p>
        <Updated at={now} />
        {/* In the new header these are in the menu and the table row */}
        {!newHeader && <CalendarButton kind="klub" slug={club.slug} name={club.name} />}
        {(() => {
          // "Billetter": the club's ticket shop, and its next home matches with a link each (src/lib/tickets.ts)
          if (!clubTicketUrl(club.id)) return null
          const homes = season.filter((m) => m.state === 'upcoming' && m.home.name === club.name && matchTicketUrl(m)).slice(0, 3)
          return (
            <section className="panel tickets" aria-labelledby="tickets-title">
              <div className="tickets__head">
                <div>
                  <h2 id="tickets-title" className="panel__title">
                    Billetter til {club.name}
                  </h2>
                  <p className="tickets__sub">Billetterne sælges af {club.name} selv. Knapperne åbner klubbens billetsalg.</p>
                </div>
                <a className="tickets__buy" href={ticketClickPath({ klub: club.id })} target="_blank" rel="sponsored nofollow noopener">
                  Køb billetter
                </a>
              </div>
              {homes.length > 0 && (
                <ul className="tickets__list" aria-label={`${genitive(club.name)} næste hjemmekampe`}>
                  {homes.map((m) => {
                    // "18. okt." as a number and a month for the date mark
                    const [day, month] = formatDayMonth(isoDate(m.kickoff)).replace(/\.$/, '').split('. ')
                    return (
                      <li key={m.id}>
                        {/* The whole row opens the club's ticket sale for the match */}
                        <a className="tickets__row" href={ticketClickPath({ kamp: m.slug })} target="_blank" rel="sponsored nofollow noopener">
                          <span className="tickets__date" aria-hidden>
                            <strong>{day}</strong>
                            <span>{month}</span>
                          </span>
                          <TeamBadge link={false} name={m.away.name} src={m.away.badge} colors={m.away.colors} size={30} />
                          <span className="tickets__text">
                            <strong>
                              <span className="visually-hidden">Billetter til {m.home.name} </span>mod {m.away.name}
                            </strong>
                            <span className="tickets__meta">
                              {m.league} · {formatLong(m.kickoff)} kl. {formatTime(m.kickoff)}
                            </span>
                          </span>
                          <span className="tickets__cta">
                            Billetter <span aria-hidden>→</span>
                          </span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })()}

        {!newHeader && (
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
              <FormChips form={r.form} dots />
            </div>
          </section>
        )}

        <MasonryFlow className="club-flow">
          <ClubMatches clubName={club.name} initialNow={now} />
          <div className="club-layout__side">
            <FormChart clubName={club.name} initialNow={now} />
            <section className="panel table-panel kh-target" id="stilling">
              <header className="table-panel__head">
                <h2 className="panel__title">Stilling · {division.name}</h2>
                <Link className="text-btn" href={paths.league(division.slug)}>
                  Hele stillingen
                </Link>
              </header>
              <StandingsTable division={division} rows={nearby} highlight={club.id} offset={start} total={table.length} compact />
            </section>
            {absent.list.length > 0 && (
              <section className="panel">
                <h2 className="panel__title">Skader og karantæner</h2>
                <p className="muted small pad">Til kampen {formatLong(absent.date!.slice(0, 10))}</p>
                <InjuryList list={absent.list} />
              </section>
            )}
          </div>
        </MasonryFlow>

        {/* The source's team statistics replace our own box where it has them */}
        <span className="kh-target kh-anchor" id="holdstatistik" />
        {teamStats?.played.total ? <TeamStatsPanel stats={checkedTeamStats(teamStats, clubSeasonStats(club, division), apiTeamOwnGoals(apiLeague!, apiTeam!))} name={club.name} /> : <ClubSeasonStats club={club} division={division} />}
        <TaggedArticles articles={articlesAbout({ club })} title={`Artikler om ${club.name}`} />
        <NewsList articles={newsFor({ club: club.id })} division={division} club={club} />
        {/* Not for the Superliga's clubs */}
        {pastSeasons.length > 0 && <span className="kh-target kh-anchor" id="tidligere-saesoner" />}
        <ClubPastSeasons name={club.name} entries={pastSeasons} />
        {(() => {
          // The head-to-heads with the league's other clubs (src/lib/rivalry.ts)
          if (!rivals.length) return null
          return (
            <section className="panel rivals-panel kh-target" id="indbyrdes-opgoer">
              <h2 className="panel__title">Indbyrdes opgør</h2>
              <p className="rivals__sub">
                {genitive(club.name)} kampe mod de andre hold i {division.name}. Tryk på et hold for at se alle opgør.
              </p>
              <ul className="rivals">
                {rivals.map((x) => (
                  <li key={x.path}>
                    <Link
                      className="rivals__card"
                      href={x.path}
                      prefetch={false}
                      aria-label={`${club.name} mod ${x.other.name}: ${counted(x.meetings, 'kamp', 'kampe')}, ${counted(x.record.a, 'sejr', 'sejre')}, ${x.record.draw} uafgjort og ${x.record.b} nederlag`}
                    >
                      <TeamBadge link={false} name={x.other.name} colors={x.other.colors} size={34} />
                      <span className="rivals__text">
                        <strong className="rivals__name">{x.other.name}</strong>
                        <span className="rivals__meta">{counted(x.meetings, 'kamp', 'kampe')}</span>
                      </span>
                      {/* Won, drawn and lost, seen from this club */}
                      <span className="rivals__rec" aria-hidden>
                        {(
                          [
                            ['V', x.record.a],
                            ['U', x.record.draw],
                            ['T', x.record.b],
                          ] as const
                        ).map(([letter, n]) => (
                          <span key={letter} className={`rivals__chip rivals__chip--${letter}${n ? '' : ' is-none'}`}>
                            {n}
                            <i>{letter}</i>
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })()}
        <AboutText title={`Om ${club.name}`} paragraphs={clubAbout(club, division, now)} />

        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}

/** A team's finished games: its matches around today and those our statistics bank has saved, newest first */
function teamResults(names: string[], around: Match[], divisionIds: string[], leagueName: string, country?: string): PastMatch[] {
  const keys = new Set(names.map(normalize))
  // The saved games under the names we show, as the matches around today (national teams in Danish, "(K)" for women's teams)
  const shown = (name: string) => shownTeam(name, country)
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
    .filter((a) => (divisionIds.length ? divisionIds.includes(a.divisionId) : a.divisionId.startsWith('ext-') && normalize(a.tournament) === normalize(leagueName)))
    .filter((a) => keys.has(normalize(a.homeName)) || keys.has(normalize(a.awayName)))
    .filter((a) => !seen.has(`${isoDate(a.date)}|${normalize(shown(a.homeName))}`))
    .map((a) => ({
      date: a.date,
      competition: a.tournament,
      home: shown(a.homeName),
      away: shown(a.awayName),
      homeScore: a.homeScore,
      awayScore: a.awayScore,
      homeLogo: logos.get(a.homeName),
      awayLogo: logos.get(a.awayName),
    }))
  return [...fromMatches, ...saved].sort((a, b) => b.date.getTime() - a.date.getTime())
}

/** Page for any other team: built from its matches, the games we have saved and its league's table */
async function TeamPageInner({ team }: { team: TeamEntry }) {
  const now = Date.now()
  const names = team.names ?? [team.name]
  const keys = new Set(names.map(normalize))
  const own = (name: string) => keys.has(normalize(name))
  const league = team.leagueSlug ? sameLeagueKeys(team.leagueSlug).map(externalLeague).find(Boolean) : undefined
  const api = league?.api.split('-')[0]
  const divisionId = league ? `ext-${api}-${league.id}` : undefined
  // Every id the source lists the league under (the A-Liga is also "Kvindeliga")
  const divisionIds = team.leagueSlug
    ? [...new Set(sameLeagueKeys(team.leagueSlug).map(externalLeague).filter((l): l is NonNullable<typeof l> => !!l).map((l) => `ext-${l.api.split('-')[0]}-${l.id}`))]
    : []
  // The league's table: API-Sports' own when the plan gives it, else ours from a starting table and the saved games
  const baseline = team.leagueSlug ? BASELINES[team.leagueSlug] : undefined
  // A cup has rounds, not a table
  const cup = !!cupOfGame({ sport: team.sport, league: { id: '', name: team.league, country: team.country } })
  const fromApi = league && !cup ? await apiLeagueTable(league) : undefined
  const table = cup ? [] : (fromApi?.find((g) => g.some((r) => own(r.name))) ?? (divisionId || baseline ? archiveLeagueTable(divisionIds, baseline).rows : []))
  const women = (n: string) => n.replace(/\b(w|women|q)\b\.?/gi, '').trim()
  const row =
    table.find((r) => own(r.name)) ??
    table.find((r) => [r.name, ...(baseline?.rows.find((b) => b.name === r.name)?.aliases ?? [])].some((n) => names.some((x) => normalize(women(x)) === normalize(women(n)))))
  const at = row ? table.indexOf(row) : -1
  const start = Math.max(0, Math.min(at - 2, table.length - 5))
  const nearby = at >= 0 && table.length > 1 ? table.slice(start, start + 5) : []
  const hasDraws = table.some((r) => r.drawn !== undefined)
  const hasPoints = table.some((r) => r.points !== undefined)

  // Its league's games around today, and its games in the cups and the Champions League
  const around = teamGames(team, now)
  const live = around.filter((m) => m.state === 'live')
  const upcoming = around.filter((m) => m.state === 'upcoming').slice(0, 6)
  const results = teamResults(names, around, divisionIds, team.league, team.country)
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

  // The saved results' tournaments under the names and logos the rest of the site uses ("Kvindeliga" is the A-Liga)
  const tournaments = new Map<string, { name: string; logo?: string; slug?: string }>()
  for (const g of getRealData()?.external ?? []) {
    if (divisionOfGame(g)) continue
    const slug = externalLeagueKey(g.league)
    for (const n of [g.league.name, g.league.originalName]) if (n && !tournaments.get(normalize(n))?.logo) tournaments.set(normalize(n), { name: g.league.name, logo: g.league.logo, slug })
  }
  const tournament = (name: string) => {
    const known = tournaments.get(normalize(name))
    if (known) return known
    const main = mainLeagueKey(externalLeagueKey({ name, country: team.country }))
    const other = BASELINES[main]?.league.name
    return other ? (tournaments.get(normalize(other)) ?? { name: other, slug: main }) : { name }
  }
  // The team's games for the match list (as on our clubs' pages): the saved results and the coming games, the team under its page name
  // Also its plain name in a women's tournament ("HB Køge" in the women's Champions League is HB Køge Women)
  const asTeam = (name: string) => (own(name) || names.some((x) => normalize(women(x)) === normalize(women(name))) ? team.name : name)
  const matches: Match[] = [
    ...mine.map(({ m }, k): Match => ({
      id: `r${k}-${isoDate(m.date)}`,
      slug: m.slug ?? '',
      sport: team.sport,
      league: tournament(m.competition).name,
      leagueId: tournament(m.competition).name,
      leagueBadge: tournament(m.competition).logo,
      leagueSlug: tournament(m.competition).slug,
      kickoff: m.date,
      state: 'finished',
      statusLabel: 'Slut',
      winner: m.homeScore > m.awayScore ? 'home' : m.homeScore < m.awayScore ? 'away' : 'draw',
      home: { name: asTeam(m.home), badge: m.homeLogo, score: m.homeScore },
      away: { name: asTeam(m.away), badge: m.awayLogo, score: m.awayScore },
    })),
    ...around.filter((m) => m.state !== 'finished').map((m) => ({ ...m, home: { ...m.home, name: asTeam(m.home.name) }, away: { ...m.away, name: asTeam(m.away.name) } })),
  ].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const soccer = team.sport === 'soccer'
  const pct = (count: number) => (n ? `${Math.round((count / n) * 100)} %` : '–')

  return (
    <div className="page">
      <JsonLd data={teamPageLd(team)} />
      <JsonLd data={webPageLd(paths.club(team.slug), team.name, new Date(now))} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Klubber', path: paths.clubs() },
          { name: team.name, path: paths.club(team.slug) },
        ])}
      />
      <div className="clubs">
        <header className="club-hero" style={team.colors ? ({ '--club-bg': team.colors[0], '--club-fg': team.colors[1] } as React.CSSProperties) : undefined}>
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
          <FollowButton slug={team.slug} name={team.name} />
        </header>

        <p className="lead">
          {team.name} spiller i {team.league}
          {row
            ? ` og ligger nr. ${row.rank}${row.points !== undefined ? ` med ${row.points} point` : ''} efter ${counted(row.played, 'kamp', 'kampe')} (${counted(row.won, 'sejr', 'sejre')}${row.drawn !== undefined ? `, ${counted(row.drawn, 'uafgjort', 'uafgjorte')}` : ''}, ${row.lost} nederlag${row.for !== undefined ? `, ${goalWord.toLowerCase()} ${row.for}-${row.against ?? 0}` : ''})`
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

        {/* The same layout as our clubs' pages: the match list, with the table beside it */}
        <MasonryFlow className="club-flow">
          <ClubMatches clubName={team.name} initialNow={now} matches={matches} />
          <div className="club-layout__side">
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
                <div className="table-wrap">
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
                              {shownTeam(r.name, team.country)}
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
                </div>
                {!fromApi && <p className="muted small history__note">Stillingen er beregnet af Matchly (se hele stillingen for grundlaget).</p>}
              </section>
            )}
          </div>
        </MasonryFlow>

        {n >= 3 && (
          <section className="panel stats-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">Statistik</h2>
            </header>
            <div className="summary-tiles">
              {(
                [
                  ['Kampe', n],
                  [`${goalWord} scoret`, scored],
                  [`${goalWord} lukket ind`, conceded],
                  soccer ? ['Rent bur', mine.filter((x) => x.a === 0).length] : ['Sejre', wins],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div key={label} className="summary-tiles__item">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <dl className="facts pad">
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
                <dt>Sejre hjemme / ude</dt>
                <dd>
                  {mine.filter((x) => x.home && x.outcome === 'V').length} / {mine.filter((x) => !x.home && x.outcome === 'V').length}
                </dd>
              </div>
              {soccer && (
                <>
                  <div>
                    <dt>Over 2,5 mål</dt>
                    <dd>{pct(mine.filter((x) => x.f + x.a > 2).length)}</dd>
                  </div>
                  <div>
                    <dt>Begge hold scorer</dt>
                    <dd>{pct(mine.filter((x) => x.f > 0 && x.a > 0).length)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Periode</dt>
                <dd>
                  {formatShortYear(mine.at(-1)!.m.date)} – {formatShortYear(mine[0].m.date)}
                </dd>
              </div>
            </dl>
            <p className="muted small history__note">Beregnet af Matchly ud fra de {n} kampe, vi har gemt for holdet.</p>
          </section>
        )}

        {(() => {
          const clubId = womenOf(team)
          return clubId ? <NewsList articles={newsFor({ club: clubId, women: true })} team={team} /> : null
        })()}
        <AdSlot placement="content" />
        <Faq items={faq} />
      </div>
    </div>
  )
}

/** LeagueClub with the visitor's right to spend API calls (crawlers use what is saved: src/lib/visitorBudget.ts) */
async function LeagueClub(props: { club: Club; division: Division }) {
  return forVisitor(() => LeagueClubInner(props))
}

/** TeamPage with the visitor's right to spend API calls (crawlers use what is saved: src/lib/visitorBudget.ts) */
async function TeamPage(props: { team: TeamEntry }) {
  return forVisitor(() => TeamPageInner(props))
}
