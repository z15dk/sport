import Link from 'next/link'
import type { Metadata } from 'next'
import { MatchesView } from './MatchesView'
import { RealDataExtra } from './RealDataExtra'
import { TeamBadge } from './TeamBadge'
import { WomenHero } from './WomenHero'
import { womenPage } from '../lib/womenPage'
import { externalOn, getMatches, isWomenGame, isWomenMatch, upcomingMatches } from '../data/matches'
import { competitionLabel } from '../data/leagues'
import { JsonLd, breadcrumbLd, matchListLd, webPageLd } from '../lib/jsonld'
import { SITE_NAME, paths } from '../lib/site'
import { addDays, formatDayMonth, formatFull, formatTime, formatWeekday, isoDate, isValidIsoDate } from '../lib/time'
import { ALL_SPORTS, SPORTS } from '../sports'
import type { Match, SportFilter } from '../types'

// The women's sport pages: /kvindesport (every sport), /kvindesport/<sport>
// and /kvindefodbold. A big top that celebrates women in sport, the sports as
// tabs, the day's live scores and results (the front page's view with only the
// women's games), the tournaments followed, a few real numbers and a text.

export type WomenSport = { id: SportFilter; slug: string; label: string }

export const womenSport = (slug?: string): WomenSport | undefined => (!slug ? ALL_SPORTS : SPORTS.find((s) => s.slug === slug))

/** The page's name: "Kvindesport", "Kvindefodbold", "Håndbold for kvinder" */
export const womenTitle = (s: WomenSport) => (s.id === 'all' ? 'Kvindesport' : s.id === 'soccer' ? 'Kvindefodbold' : `${s.label} for kvinder`)

const womenOn = (date: string, sport: SportFilter, now: number) => getMatches(date, sport, now).filter(isWomenMatch)

/** The nearest day with women's games before or after a date */
function nearestDay(date: string, sport: SportFilter, direction: 1 | -1, now: number) {
  for (let i = 1; i <= 60; i++) {
    const d = addDays(date, i * direction)
    if (womenOn(d, sport, now).length) return d
  }
  return undefined
}

function dayOf(dato: string | undefined, today: string) {
  // Only days our data can have
  return isValidIsoDate(dato) && Math.abs(Date.parse(dato) - Date.parse(today)) / 86_400_000 <= 400 ? dato : today
}

export function womenMetadata(s: WomenSport, dato: string | undefined): Metadata {
  const now = Date.now()
  const today = isoDate(now)
  const date = dayOf(dato, today)
  const count = womenOn(date, s.id, now).length
  const other = date !== today
  const when = other ? formatFull(date) : 'i dag'
  const name = womenTitle(s)
  const what =
    s.id === 'soccer'
      ? 'Kvindeligaen, A-Ligaen, Champions League, WSL, Frauen-Bundesliga, Damallsvenskan og mere'
      : s.id === 'all'
        ? 'fodbold, håndbold, basketball, ishockey og volleyball'
        : `${s.label.toLowerCase()} for kvinder i ind- og udland`
  return {
    title: other ? `${name} ${when} – resultater og kampe` : `${name} i dag – live resultater, kampe og stillinger`,
    description: `${count ? `${count} kampe` : 'Kampene'} i ${name.toLowerCase()} ${when}: ${what} – live stilling, resultater og tabeller. Vi følger kvinderne i sport.`,
    alternates: { canonical: paths.women({ sport: s.slug, dato: date, today }) },
    // Other days are for visitors; the page to find is today's
    ...(other && { robots: { index: false, follow: true } }),
  }
}

/** The tournaments with women's games around today, most games first */
function tournaments(days: Match[][]) {
  const map = new Map<string, { m: Match; games: number; live: boolean; next?: Date; last?: Date }>()
  for (const m of days.flat()) {
    const t = map.get(m.leagueId) ?? map.set(m.leagueId, { m, games: 0, live: false }).get(m.leagueId)!
    t.games++
    if (m.state === 'live') t.live = true
    else if (m.state === 'upcoming' && (!t.next || m.kickoff < t.next)) t.next = m.kickoff
    else if (m.state === 'finished' && (!t.last || m.kickoff > t.last)) t.last = m.kickoff
  }
  return [...map.values()].sort((a, b) => Number(b.live) - Number(a.live) || b.games - a.games || a.m.league.localeCompare(b.m.league, 'da'))
}

/** When a tournament plays: now, its next match, or its last one */
function whenText(t: { live: boolean; next?: Date; last?: Date }, today: string) {
  const day = (d: Date) => {
    const iso = isoDate(d)
    return iso === today ? `i dag kl. ${formatTime(d)}` : iso === addDays(today, 1) ? `i morgen kl. ${formatTime(d)}` : `${formatWeekday(iso)} ${formatDayMonth(iso)}`
  }
  if (t.live) return 'Spiller nu'
  if (t.next) return `Næste kamp ${day(t.next)}`
  if (t.last) return `Seneste kamp ${day(t.last)}`
  return undefined
}

const n = (x: number) => x.toLocaleString('da-DK')

/**
 * Every women's game two weeks back and ahead, by day (the tournaments, tabs
 * and numbers). 29 days of every sport's games is a lot of work, so it is kept
 * for two minutes (on globalThis: shared by every page and sport); today's
 * live and today's count on the page are always worked out fresh.
 */
const womenHolder = globalThis as typeof globalThis & { __scorelineWomenDays?: { today: string; at: number; days: Match[][] } }
function womenDays(today: string, now: number): Match[][] {
  const c = womenHolder.__scorelineWomenDays
  if (c && c.today === today && now - c.at < 120_000) return c.days
  const days = Array.from({ length: 29 }, (_, i) => womenOn(addDays(today, i - 14), 'all', now))
  womenHolder.__scorelineWomenDays = { today, at: now, days }
  return days
}

/** The text under the heading when the admin has not written one */
export const defaultLead = (s: WomenSport) =>
  s.id === 'all'
    ? 'Live score, resultater og tabeller fra kvindernes fodbold, håndbold, basketball, ishockey og volleyball – fra Kvindeligaen til Champions League.'
    : `Live score, resultater og tabeller i ${womenTitle(s).toLowerCase()} – hjemme og ude, hver dag.`

export function WomenLanding({ sport: s, dato, live }: { sport: WomenSport; dato?: string; live?: string }) {
  const now = Date.now()
  const today = isoDate(now)
  const date = dayOf(dato, today)
  const name = womenTitle(s)
  const hero = womenPage()
  // The browser gets today's games; the page adds the chosen day and tomorrow
  const dates = [...new Set([date, today, addDays(today, 1)])]
  const games = dates.flatMap((d) => externalOn(d)).filter(isWomenGame)
  const upcoming = upcomingMatches(s.id, today, now, 10, 400).filter(isWomenMatch).slice(0, 8)
  const matches = womenOn(date, s.id, now)

  // Two weeks back and ahead: the tournaments, the sports played and the numbers
  const every = womenDays(today, now)
  const mine = s.id === 'all' ? every : every.map((l) => l.filter((m) => m.sport === s.id))
  const played = mine.slice(0, 15).flat().filter((m) => m.state === 'finished')
  const liveNow = womenOn(today, s.id, now).filter((m) => m.state === 'live').length
  const todayCount = womenOn(today, s.id, now).length
  const leagues = tournaments(mine)
  const sportsPlayed = new Set(every.flat().map((m) => m.sport))
  const tabs = [ALL_SPORTS, ...SPORTS.filter((x) => sportsPlayed.has(x.id) || x.id === 'soccer')]
  const todayBy = (id: SportFilter) => (id === 'all' ? every[14] : every[14].filter((m) => m.sport === id)).length

  return (
    <>
      <JsonLd data={breadcrumbLd([...(s.id === 'all' ? [] : [{ name: 'Kvindesport', path: paths.women() }]), { name, path: paths.women({ sport: s.slug }) }])} />
      <JsonLd data={webPageLd(paths.women({ sport: s.slug, dato: date, today }), `${name} · ${SITE_NAME}`, new Date(now), `Live resultater, kampprogram og stillinger i ${name.toLowerCase()}.`)} />
      {matches.length > 0 && <JsonLd data={matchListLd(`${name} ${date === today ? 'i dag' : formatFull(date)}`, matches)} />}
      <RealDataExtra games={games} />


      <MatchesView
        key={`${s.id}|${live ? 'live' : 'all'}`}
        women
        sport={s.id}
        heading={s.id === 'all' ? 'Kampe' : name}
        date={date}
        today={today}
        initialNow={now}
        initialFilter={live ? 'live' : 'all'}
        nearDays={{ prev: nearestDay(date, s.id, -1, now), next: nearestDay(date, s.id, 1, now) }}
        upcoming={upcoming}
        top={
          <WomenHero
            kicker={`Matchly · ${s.id === 'all' ? 'Kvinder i sport' : name}`}
            title1={hero.title1}
            title2={hero.title2}
            lead={hero.lead || defaultLead(s)}
            image={hero.image}
            position={hero.position}
            liveHref={paths.women({ sport: s.slug, live: true })}
            liveNow={liveNow}
            todayCount={todayCount}
            numbers={[
              { label: 'Kampe i dag', value: todayCount },
              { label: 'Spillet de sidste 14 dage', value: played.length },
              { label: 'Turneringer', value: leagues.length },
              ...(s.id === 'all' ? [{ label: 'Sportsgrene', value: sportsPlayed.size }] : []),
            ]}
          />
        }
        tabs={
          <nav className="women-tabs" aria-label="Sportsgrene">
            {tabs.map((t) => (
              <Link key={t.id} className={`women-tabs__tab${t.id === s.id ? ' is-active' : ''}`} href={paths.women({ sport: t.slug })} aria-current={t.id === s.id ? 'page' : undefined}>
                {t.id === 'all' ? 'Alle' : t.label}
                {todayBy(t.id) > 0 && <span>{todayBy(t.id)}</span>}
              </Link>
            ))}
          </nav>
        }
        below={
          <div className="women-more">
            {leagues.length > 0 && (
              <section className="panel women-leagues">
                <h2 className="panel__title">Turneringerne vi følger</h2>
                <ul>
                  {leagues.slice(0, 24).map((t) => {
                    const { m } = t
                    const body = (
                      <>
                        <TeamBadge link={false} name={m.league} src={m.leagueBadge} size={32} label={competitionLabel(m.league)} />
                        <span>
                          <b>{m.league}</b>
                          <small>
                            {[s.id === 'all' ? SPORTS.find((x) => x.id === m.sport)?.label : undefined, m.country, whenText(t, today)].filter(Boolean).join(' · ')}
                          </small>
                        </span>
                      </>
                    )
                    return <li key={m.leagueId}>{m.leagueSlug ? <Link href={paths.league(m.leagueSlug)}>{body}</Link> : <div>{body}</div>}</li>
                  })}
                </ul>
              </section>
            )}
            <section className="panel prose__section about-text women-about">
              <h2 className="panel__title">Om {name.toLowerCase()} på Matchly</h2>
              <p>
                Kvinder i sport fortjener den samme plads som herrerne: live stilling, målscorere, tabeller og kampprogram, samlet ét sted. Her følger vi{' '}
                {s.id === 'all' ? 'kvindernes kampe i fodbold, håndbold, basketball, ishockey og volleyball' : `kvindernes kampe i ${s.id === 'soccer' ? 'fodbold' : s.label.toLowerCase()}`} – fra de danske ligaer til de store
                turneringer i udlandet.
              </p>
              <p>
                {leagues.length
                  ? `Lige nu følger vi ${n(leagues.length)} turneringer med kampe de sidste og næste 14 dage, og ${n(played.length)} kampe er spillet de sidste 14 dage.`
                  : 'Kampene kommer på, så snart turneringerne spiller igen.'}{' '}
                Klik på en kamp for stilling, tidslinje og statistik, eller på en turnering for tabellen.
              </p>
            </section>
          </div>
        }
      />
    </>
  )
}
