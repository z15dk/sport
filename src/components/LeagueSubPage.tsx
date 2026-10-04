import Link from 'next/link'
import { forVisitor } from '../lib/visitorBudget'
import type { Metadata } from 'next'
import { seasonOf, sportOf, type Division } from '../data/leagues'
import { allFixtures, clubInDivision, isFinished, toMatch, type Fixture } from '../data/season'
import { leagueStats } from '../data/stats'
import { getRealData } from '../data/real'
import { apiLeagueIdOf, apiLeagueLeaders } from '../lib/apisports'
import { dbuTopScorers, type TopScorer } from '../lib/dbuLineups'
import { JsonLd, breadcrumbLd, matchListLd, webPageLd } from '../lib/jsonld'
import { paths } from '../lib/site'
import { formatDayMonth, formatLong, isoDate } from '../lib/time'
import type { Leaders } from '../data/matchExtra'
import type { Match } from '../types'
import { MatchRow } from './MatchRow'
import { TeamBadge } from './TeamBadge'
import { LeagueLeaders } from './LeagueLeaders'
import { TopScorersList } from './TopScorersList'
import { Faq } from './Faq'
import { AdSlot } from './AdSlot'
import { Updated } from './Updated'

// Pages for what people search for about a league, each under its own address
// (SEO): /turnering/<liga>/topscorere ("superliga topscorer"), /kampprogram
// ("superliga kampprogram") and /resultater ("superliga resultater"). They sit
// in the season route (src/app/turnering/[slug]/[saeson]), whose past seasons
// are named by years and never by these words.

export const LEAGUE_SUBPAGES = ['kampprogram', 'resultater', 'topscorere'] as const
export type LeagueSubPage = (typeof LEAGUE_SUBPAGES)[number]
export const isLeagueSubPage = (s: string): s is LeagueSubPage => (LEAGUE_SUBPAGES as readonly string[]).includes(s)

const LABEL: Record<LeagueSubPage | 'stilling', string> = { stilling: 'Stilling', kampprogram: 'Kampprogram', resultater: 'Resultater', topscorere: 'Topscorere' }

export const leagueSubPath = (division: Division, page: LeagueSubPage) => `${paths.league(division.slug)}/${page}`

/** Links between the league's own pages: the table, the fixture list, the results and the top scorers */
export function LeagueSubNav({ division, active }: { division: Division; active: LeagueSubPage | 'stilling' }) {
  const pages: (LeagueSubPage | 'stilling')[] = ['stilling', 'kampprogram', 'resultater', ...(sportOf(division) === 'soccer' ? (['topscorere'] as const) : [])]
  return (
    <nav className="league-subnav" aria-label={`${division.name}: sider`}>
      {pages.map((p) => (
        <Link key={p} className={`pill${p === active ? ' is-active' : ''}`} href={p === 'stilling' ? paths.league(division.slug) : leagueSubPath(division, p)} aria-current={p === active ? 'page' : undefined}>
          {LABEL[p]}
        </Link>
      ))}
    </nav>
  )
}

const ofDivision = (division: Division) => allFixtures().filter((f) => f.division?.id === division.id)

/** Coming matches (and those being played), in kick-off order */
function coming(division: Division, now: number) {
  return ofDivision(division)
    .filter((f) => !isFinished(f) && f.kickoff.getTime() > now - 3 * 3_600_000)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
}

/** Played matches, newest first */
function played(division: Division, now: number) {
  return ofDivision(division)
    .filter((f) => isFinished(f) && f.kickoff.getTime() <= now)
    .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime())
}

/** Matches grouped by round (when the sources number them), else by day */
function groups(list: Fixture[]) {
  const byRound = list.every((f) => f.round > 0)
  const out: { key: string; title: string; sub?: string; list: Fixture[] }[] = []
  for (const f of list) {
    const key = byRound ? `r${f.round}` : isoDate(f.kickoff)
    let g = out.find((x) => x.key === key)
    if (!g) {
      g = { key, title: byRound ? `${f.round}. runde` : formatLong(isoDate(f.kickoff)), list: [] }
      out.push(g)
    }
    g.list.push(f)
  }
  if (byRound) {
    for (const g of out) {
      const days = [...new Set(g.list.map((f) => isoDate(f.kickoff)))].sort()
      g.sub = days.length === 1 ? formatDayMonth(days[0]) : `${formatDayMonth(days[0])} – ${formatDayMonth(days.at(-1)!)}`
    }
  }
  return out
}

/** The season's top scorers: counted from the match pages (1.–3. division), else our partners' list, else from the goals in our data */
async function scorers(division: Division): Promise<{ dbu?: TopScorer[]; leaders?: Leaders; own?: TopScorer[] }> {
  const dbu = dbuTopScorers(division.slug, (team) => clubInDivision(division, team, getRealData()?.clubNames ?? {})?.name)
  if (dbu?.scorers.length) return { dbu: dbu.scorers }
  const id = sportOf(division) === 'soccer' ? apiLeagueIdOf(division.id) : undefined
  const leaders = id ? await apiLeagueLeaders(id).catch(() => undefined) : undefined
  if (leaders?.scorers.length) return { leaders }
  const stats = leagueStats(division)
  let rank = 0
  let last = -1
  const own = (stats?.scorers ?? []).slice(0, 25).map((s, i): TopScorer => {
    if (s.goals !== last) rank = i + 1
    last = s.goals
    return { rank, name: s.player, team: s.club.name, club: s.club.name, goals: s.goals, moved: 0 }
  })
  return own.length ? { own } : {}
}

const topOf = (s: Awaited<ReturnType<typeof scorers>>) =>
  s.dbu?.[0] ? { name: s.dbu[0].name, team: s.dbu[0].club ?? s.dbu[0].team, goals: s.dbu[0].goals } : s.leaders?.scorers[0] ? { name: s.leaders.scorers[0].name, team: s.leaders.scorers[0].team, goals: s.leaders.scorers[0].value } : s.own?.[0] ? { name: s.own[0].name, team: s.own[0].team, goals: s.own[0].goals } : undefined

export async function leagueSubMetadata(division: Division, page: LeagueSubPage): Promise<Metadata> {
  const name = division.name
  const season = seasonOf(division)
  const now = Date.now()
  const canonical = { canonical: leagueSubPath(division, page) }
  if (page === 'topscorere') {
    const top = topOf(await scorers(division))
    return {
      title: `Topscorer ${name} ${season} – topscorerlisten`,
      description: top
        ? `${top.name} (${top.team}) fører topscorerlisten i ${name} ${season} med ${top.goals} mål. Se hele listen over sæsonens målscorere, opdateret efter hver kamp.`
        : `Topscorerlisten i ${name} ${season}, opdateret efter hver kamp.`,
      alternates: canonical,
    }
  }
  if (page === 'kampprogram') {
    const next = coming(division, now)[0]
    return {
      title: `${name} kampprogram ${season} – alle kampe, tider og TV`,
      description: `Hele kampprogrammet for ${name} ${season}: alle kommende kampe runde for runde med dato, tidspunkt og TV-kanal.${next ? ` Næste kamp: ${next.home.name} – ${next.away.name} ${formatLong(isoDate(next.kickoff))}.` : ''}`,
      alternates: canonical,
    }
  }
  const last = played(division, now)[0]
  return {
    title: `${name} resultater ${season} – alle kampe runde for runde`,
    description: `Alle resultater i ${name} ${season} runde for runde med målscorere.${last ? ` Seneste: ${last.home.name} – ${last.away.name} ${last.score[0]}-${last.score[1]}.` : ''}`,
    alternates: canonical,
  }
}

function MatchGroups({ list, now }: { list: Fixture[]; now: number }) {
  return (
    <>
      {groups(list).map((g, i) => (
        <section key={g.key} className="league">
          <header className="league__header">
            <div className="league__toggle">
              <span className="league__titles">
                {g.sub && <span className="league__country">{g.sub}</span>}
                <h2 className="league__name">{g.title}</h2>
              </span>
            </div>
          </header>
          <ul className="league__matches">
            {g.list.map((f) => (
              <MatchRow key={f.id} match={toMatch(f, now)} showDate />
            ))}
          </ul>
          {i === 1 && <AdSlot placement="feed" />}
        </section>
      ))}
    </>
  )
}

async function LeagueSubPageViewInner({ division, page }: { division: Division; page: LeagueSubPage }) {
  const now = Date.now()
  const name = division.name
  const season = seasonOf(division)
  const path = leagueSubPath(division, page)
  const heading = page === 'topscorere' ? `Topscorer ${name}` : `${name} ${LABEL[page].toLowerCase()}`
  let body: React.ReactNode
  let lead: string
  let faq: { q: string; a: string }[] = []
  let ld: object | undefined

  if (page === 'topscorere') {
    const s = await scorers(division)
    const top = topOf(s)
    const list = s.dbu ?? s.own
    const second = list?.[1] ?? (s.leaders?.scorers[1] ? { name: s.leaders.scorers[1].name, goals: s.leaders.scorers[1].value } : undefined)
    lead = top
      ? `${top.name} (${top.team}) fører topscorerlisten i ${name} ${season} med ${top.goals} mål${second ? `, foran ${second.name} med ${second.goals}` : ''}. Listen opdateres efter hver kamp.`
      : `Der er endnu ingen målscorere i ${name} ${season}. Listen fyldes op, når sæsonens første mål er scoret.`
    body = s.leaders ? <LeagueLeaders leaders={s.leaders} league={name} /> : list ? <TopScorersList league={name} scorers={list} /> : null
    if (top) faq = [{ q: `Hvem er topscorer i ${name}?`, a: `${top.name} (${top.team}) er topscorer med ${top.goals} mål i sæsonen ${season}.` }]
  } else if (page === 'kampprogram') {
    const list = coming(division, now)
    const next = list[0]
    const rounds = new Set(list.map((f) => f.round)).size
    lead = next
      ? `${list.length} ${list.length === 1 ? 'kamp' : 'kampe'} tilbage i ${name} ${season}${list.every((f) => f.round > 0) ? ` fordelt på ${rounds} ${rounds === 1 ? 'runde' : 'runder'}` : ''}. Næste kamp er ${next.home.name} – ${next.away.name} ${formatLong(isoDate(next.kickoff))}. Alle tider er dansk tid, og TV-kanalen står ved kampen, når den kendes.`
      : `Der er ingen kommende kampe i ${name} ${season} lige nu.`
    body = list.length ? <MatchGroups list={list} now={now} /> : null
    if (next) faq = [{ q: `Hvornår er næste kamp i ${name}?`, a: `${next.home.name} – ${next.away.name} ${formatLong(isoDate(next.kickoff))}.` }]
    ld = matchListLd(`${name} kampprogram ${season}`, list.slice(0, 50).map((f) => toMatch(f, now)) as Match[])
  } else {
    const list = played(division, now)
    const goals = list.reduce((n, f) => n + f.score[0] + f.score[1], 0)
    const last = list[0]
    lead = last
      ? `${list.length} kampe spillet i ${name} ${season} med ${goals} mål (${(goals / list.length).toLocaleString('da-DK', { maximumFractionDigits: 2 })} pr. kamp). Seneste resultat: ${last.home.name} – ${last.away.name} ${last.score[0]}-${last.score[1]}.`
      : `Der er endnu ikke spillet kampe i ${name} ${season}.`
    body = list.length ? <MatchGroups list={list} now={now} /> : null
    if (last) faq = [{ q: `Hvad blev det seneste resultat i ${name}?`, a: `${last.home.name} – ${last.away.name} endte ${last.score[0]}-${last.score[1]} (${formatLong(isoDate(last.kickoff))}).` }]
    ld = matchListLd(`${name} resultater ${season}`, list.slice(0, 50).map((f) => toMatch(f, now)) as Match[])
  }

  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name, path: paths.league(division.slug) }, { name: LABEL[page], path }])} />
      <JsonLd data={webPageLd(path, `${heading} ${season}`, new Date(now), lead)} />
      {ld && <JsonLd data={ld} />}
      <div className="clubs">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href={paths.league(division.slug)}>{name}</Link>
          <span aria-hidden>/</span>
          <span>{LABEL[page]}</span>
        </nav>
        <div className="clubs__head">
          <h1 className="feed__title league-title">
            <span className="league-title__row">
              <TeamBadge link={false} name={name} label={division.short} colors={['#0f110c', '#c6f135']} size={56} />
              {heading}
            </span>
            <span>Sæson {season}</span>
          </h1>
          <LeagueSubNav division={division} active={page} />
        </div>
        <p className="lead">{lead}</p>
        <Updated at={now} />
        {body}
        <AdSlot placement="content" />
        {faq.length > 0 && <Faq items={faq} />}
      </div>
    </div>
  )
}

/** LeagueSubPageView with the visitor's right to spend API calls (crawlers use what is saved: src/lib/visitorBudget.ts) */
export async function LeagueSubPageView(props: { division: Division; page: LeagueSubPage }) {
  return forVisitor(() => LeagueSubPageViewInner(props))
}
