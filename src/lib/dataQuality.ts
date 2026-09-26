import 'server-only'
import { statSync } from 'node:fs'
import { shownDivisions } from '../data/leagues'
import { allFixtures, standings, type Fixture } from '../data/season'
import { alike } from '../data/aliases'
import { isoDate } from './time'
import { API_KEY } from './tsdb'
import { apiSportsStatus, seasonGames } from './apisports'
import { divisionOfGame } from '../data/ourLeagues'
import { historyStatus } from './history'
import { archiveStatus } from './archive'
import { apiMergeStatus, realDataStatus } from './realdata'
import { allTeams, teamInLeague, type TeamEntry } from '../data/teams'
import { getRealData } from '../data/real'
import { NOT_FIRST_TEAM, cupOfGame, ourClubInCup } from '../data/cups'
import { BASELINES, sameLeagueKeys } from '../data/baselines'
import { normalize } from '../data/aliases'
import { paths } from './site'
import { countryKey } from '../data/channels'

// Checks that the data we show is right and keeps updating: per league the
// sources, gaps, duplicates, stuck matches, unknown teams and results the
// sources disagree on; per source whether it is fresh and can keep going.

export type Level = 'ok' | 'warn' | 'error'
export interface Check {
  level: Level
  text: string
  /** Examples (matches, teams) */
  items?: string[]
}
export interface LeagueQuality {
  id: string
  name: string
  sport: string
  level: Level
  sources: Record<string, number>
  matches: number
  finished: number
  checks: Check[]
}

const HOUR = 3_600_000
const worst = (checks: Check[]): Level => (checks.some((c) => c.level === 'error') ? 'error' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok')
const label = (f: Fixture) => `${f.home.name} – ${f.away.name} (${isoDate(f.kickoff)})`

/** Where a fixture comes from, by its id ("tsdb-<event id>") */
function sourceOf(f: Fixture) {
  const inner = f.id.slice(5)
  if (inner.startsWith('db-')) return 'Kampdatabase'
  if (/^[a-z-]+-\d+$/.test(inner)) return 'API-Sports'
  return 'TheSportsDB'
}

export function leagueQuality(now = Date.now()): LeagueQuality[] {
  const fixtures = allFixtures()
  const apiGames = seasonGames()
  return shownDivisions().map((d) => {
    const own = fixtures.filter((f) => f.division?.id === d.id)
    const finished = own.filter((f) => f.real.state === 'finished' && f.real.hasScore)
    const sources: Record<string, number> = {}
    for (const f of own) sources[sourceOf(f)] = (sources[sourceOf(f)] ?? 0) + 1
    const checks: Check[] = []

    // The same match twice (two sources that were not joined)
    const seen = new Map<string, Fixture>()
    const dupes: string[] = []
    for (const f of own) {
      const key = `${isoDate(f.kickoff)}|${[f.home.id, f.away.id].sort().join('|')}`
      if (seen.has(key)) dupes.push(label(f))
      else seen.set(key, f)
    }
    checks.push(dupes.length ? { level: 'error', text: `${dupes.length} kamp(e) står to gange`, items: dupes } : { level: 'ok', text: 'Ingen dobbelte kampe' })

    // Matches that should have a result by now, or are stuck as live
    const missing = own.filter((f) => f.real.state === 'upcoming' && f.kickoff.getTime() < now - 4 * HOUR)
    const stuck = own.filter((f) => f.real.state === 'live' && f.kickoff.getTime() < now - 5 * HOUR)
    const noScore = own.filter((f) => f.real.state === 'finished' && !f.real.hasScore)
    const late = [...missing, ...noScore]
    checks.push(
      late.length
        ? { level: 'warn', text: `${late.length} spillet kamp(e) uden resultat`, items: late.slice(-10).map(label) }
        : { level: 'ok', text: 'Alle spillede kampe har et resultat' },
    )
    if (stuck.length) checks.push({ level: 'error', text: `${stuck.length} kamp(e) har stået som live i over 5 timer`, items: stuck.map(label) })

    // Teams missing from our club register (a name that differs gives the club twice in the table)
    const standIns = [...new Set(own.flatMap((f) => [f.home, f.away]).filter((c) => c.id.startsWith('x-')).map((c) => c.name))]
    checks.push(
      standIns.length
        ? { level: 'warn', text: `${standIns.length} hold findes ikke i klubregistret (tjek at de ikke står to gange i stillingen)`, items: standIns }
        : { level: 'ok', text: 'Alle hold er koblet til klubregistret' },
    )

    // The table: teams should have played about as many matches as each other
    const table = standings(d)
    if (table.length > 1) {
      const played = table.map((r) => r.played)
      const spread = Math.max(...played) - Math.min(...played)
      const expected = (d.clubs.length || table.length) * ((d.clubs.length || table.length) - 1) * ((d.meetings ?? 2) / 2)
      checks.push(
        spread > 2
          ? {
              level: 'warn',
              text: `Holdene har spillet fra ${Math.min(...played)} til ${Math.max(...played)} kampe – der mangler sandsynligvis kampe`,
              items: table.filter((r) => r.played === Math.min(...played)).map((r) => `${r.club.name}: ${r.played} kampe`),
            }
          : { level: 'ok', text: `Antal spillede kampe hænger sammen (${Math.min(...played)}–${Math.max(...played)} pr. hold)` },
      )
      if (table.length !== d.clubs.length && d.clubs.length)
        checks.push({ level: 'warn', text: `Stillingen har ${table.length} hold, vores liste over ligaen har ${d.clubs.length}` })
      if (own.length < expected * 0.9)
        checks.push({
          level: 'warn',
          text: `Kampprogrammet har ${own.length} af ca. ${Math.round(expected)} kampe i sæsonen – kilden giver ikke hele programmet`,
        })
    }

    // Results the sources disagree on: our season against API-Sports
    const disagree: string[] = []
    for (const g of apiGames) {
      if (divisionOfGame(g)?.d.id !== d.id || g.homeScore === undefined) continue
      const f = finished.find(
        (x) => isoDate(x.kickoff) === isoDate(new Date(g.kickoff)) && alike([x.home.name, x.home.originalName ?? ''], g.home.name) && alike([x.away.name, x.away.originalName ?? ''], g.away.name),
      )
      if (f && !f.id.includes(g.id) && (f.score[0] !== g.homeScore || f.score[1] !== g.awayScore))
        disagree.push(`${label(f)}: ${sourceOf(f)} ${f.score[0]}-${f.score[1]}, API-Sports ${g.homeScore}-${g.awayScore}`)
    }
    checks.push(
      disagree.length
        ? { level: 'error', text: `${disagree.length} resultat(er) er forskellige hos kilderne`, items: disagree }
        : { level: 'ok', text: 'Kilderne er enige om resultaterne (hvor begge har kampen)' },
    )

    // API-Sports' games for the league this season: how many, with goals and cards, and joined to ours
    if ((d.sport ?? 'soccer') === 'soccer') {
      const from = own[0]?.kickoff.getTime() ?? 0
      const theirs = apiGames.filter((g) => divisionOfGame(g)?.d.id === d.id && Date.parse(g.kickoff) >= from - 86_400_000)
      const withEvents = theirs.filter((g) => g.incidents?.length).length
      checks.push(
        theirs.length
          ? { level: 'ok', text: `API-Sports: ${theirs.length} spillede kampe denne sæson, ${withEvents} med målscorere/kort` }
          : { level: 'warn', text: 'API-Sports har ingen af ligaens kampe denne sæson endnu – tjek ligaens id under Ligaer' },
      )
      // How they joined our matches in the last merge
      const m = apiMergeStatus(d.id)
      if (m) {
        const lost = m.withIncidents - m.usedIncidents - m.keptOwn
        checks.push({
          level: lost > 0 || m.skipped.length ? 'warn' : 'ok',
          text: `Sammenfletning: ${m.games} kampe fra API-Sports (${m.withIncidents} med målscorere/kort), ${m.matched} koblet til vores kampe, ${m.added} tilføjet; ${m.usedIncidents} fik målscorere/kort derfra, ${m.keptOwn} beholdt vores egne`,
          items: m.skipped.length ? m.skipped.slice(0, 10).map((x) => `Beholdt ufuldstændige: ${x}`) : undefined,
        })
      }
    }
    // Goals and cards: how many played matches have them
    if (finished.length && (d.sport ?? 'soccer') === 'soccer') {
      const withIncidents = finished.filter((f) => f.incidents?.length).length
      const scoreless = finished.filter((f) => f.score[0] + f.score[1] === 0).length
      checks.push({
        level: withIncidents >= (finished.length - scoreless) * 0.8 ? 'ok' : 'warn',
        text: `Mål og kort: ${withIncidents} af ${finished.length} spillede kampe har målscorere/kort${withIncidents ? '' : ' – kilden har dem ikke for denne liga'}`,
        items: finished
          .filter((f) => !f.incidents?.length && f.score[0] + f.score[1] > 0)
          .slice(-5)
          .map((f) => `Mangler: ${label(f)} ${f.score[0]}-${f.score[1]} (${sourceOf(f)})`),
      })
    }

    // Fixtures ahead: without them the source has probably stopped
    const next = own.find((f) => f.kickoff.getTime() > now)
    checks.push(
      next
        ? { level: 'ok', text: `Næste kamp: ${label(next)}` }
        : { level: 'warn', text: 'Ingen kommende kampe – sæsonen er slut, eller kilden giver ikke programmet' },
    )

    return { id: d.id, name: d.name, sport: d.sport ?? 'soccer', level: worst(checks), sources, matches: own.length, finished: finished.length, checks }
  })
}

/** Whether each source is fresh and can keep updating */
export function sourceQuality(now = Date.now()): { name: string; level: Level; checks: Check[] }[] {
  const out: { name: string; level: Level; checks: Check[] }[] = []

  const r = realDataStatus()
  const tsdb: Check[] = []
  const age = r.fetchedAt ? now - Date.parse(r.fetchedAt) : Infinity
  tsdb.push(age < 2 * HOUR ? { level: 'ok', text: `Opdateret for ${Math.round(age / 60_000)} min. siden` } : { level: 'error', text: r.fetchedAt ? `Ikke opdateret siden ${r.fetchedAt}` : 'Aldrig hentet' })
  if (r.lastError) tsdb.push({ level: 'warn', text: `Seneste fejl: ${r.lastError}` })
  tsdb.push(
    API_KEY === '123'
      ? { level: 'warn', text: 'Bruger gratis testnøglen "123": kun de seneste/næste kampe pr. liga. En betalt nøgle (THESPORTSDB_KEY) giver hele sæsoner – tjek licensvilkår før lancering.' }
      : { level: 'ok', text: 'Egen nøgle (THESPORTSDB_KEY)' },
  )
  out.push({ name: 'TheSportsDB', level: worst(tsdb), checks: tsdb })

  for (const a of apiSportsStatus()) {
    if (!a.hasKey) continue
    const c: Check[] = []
    const fetched = a.todayFetchedAt ? now - Date.parse(a.todayFetchedAt) : Infinity
    c.push(fetched < 3 * HOUR ? { level: 'ok', text: `Dagens kampe hentet for ${Math.round(fetched / 60_000)} min. siden` } : { level: 'error', text: 'Dagens kampe er ikke hentet de seneste 3 timer' })
    if (a.lastError) c.push({ level: 'error', text: `Fejl: ${a.lastError}` })
    if (a.allowedDays) {
      const day = (n: number) => (n === 0 ? 'i dag' : n === -1 ? 'i går' : n === 1 ? 'i morgen' : `${n > 0 ? '+' : ''}${n} dage`)
      c.push({
        level: 'warn',
        text: `Planen giver kun kampe fra ${day(a.allowedDays.from)} til ${day(a.allowedDays.to)}. Resten af programmet kommer fra TheSportsDB; ældre resultater kan ikke hentes bagud (en betalt plan giver hele sæsonen).`,
      })
    }
    if (a.remaining !== undefined) c.push({ level: a.remaining < 10 ? 'warn' : 'ok', text: `${a.remaining} af ${a.limit ?? '?'} kald tilbage i dag` })
    out.push({ name: `API-Sports ${a.label}`, level: worst(c), checks: c })
  }

  const h = historyStatus()
  const db: Check[] = []
  if (h.error && !h.matches) db.push({ level: 'error', text: h.error })
  else {
    let mtime: number | undefined
    try {
      mtime = statSync(h.file).mtimeMs
    } catch {
      mtime = undefined
    }
    db.push({ level: 'ok', text: `${h.matches} kampe (${h.from} – ${h.to})` })
    if (mtime !== undefined) {
      const days = Math.floor((now - mtime) / 86_400_000)
      db.push(
        days > 7
          ? { level: 'warn', text: `Filen er ${days} dage gammel og opdateres ikke af sig selv – de danske rækker fra databasen står stille` }
          : { level: 'ok', text: `Filen er opdateret for ${days} dag(e) siden` },
      )
    }
    if (h.unmatched.length) db.push({ level: 'warn', text: `${h.unmatched.length} hold i databasen er ikke koblet til klubregistret`, items: h.unmatched.slice(0, 20) })
  }
  out.push({ name: 'Kampdatabase (football.db)', level: worst(db), checks: db })

  const a = archiveStatus()
  const arch: Check[] = [{ level: 'ok', text: `${a.total ?? 0} kampe gemt i statistikbanken` }]
  const ran = a.lastRun ? now - new Date(a.lastRun).getTime() : Infinity
  arch.push(ran < HOUR ? { level: 'ok', text: `Gemmer løbende (senest for ${Math.round(ran / 60_000)} min. siden)` } : { level: 'warn', text: 'Har ikke gemt den seneste time' })
  if (a.lastError) arch.push({ level: 'error', text: `Fejl: ${a.lastError}` })
  out.push({ name: 'Statistikbank', level: worst(arch), checks: arch })
  out.push({ name: 'Klubregister', ...registryQuality() })
  return out
}

const teamLabel = (t: TeamEntry) => `${t.name} (${t.league}${t.country ? `, ${t.country}` : ''}) ${paths.club(t.slug)}`

/**
 * The club register: the same team with two pages (like "Real Madrid" once for
 * La Liga and once for the Champions League), table rows without a team page,
 * and cup teams we can't tell apart.
 */
export function registryQuality(): { level: Level; checks: Check[] } {
  const checks: Check[] = []
  const teams = allTeams()
  checks.push({ level: 'ok', text: `${teams.length} hold med egen side` })

  // Men's first teams by sport and plain name; more than one page is the same team twice
  const byName = new Map<string, TeamEntry[]>()
  for (const t of teams) {
    // The starting tables are women's leagues (A-Liga, B-Liga)
    if (NOT_FIRST_TEAM.test(`${t.name} ${t.league}`) || (t.leagueSlug && sameLeagueKeys(t.leagueSlug).some((k) => BASELINES[k]))) continue
    const key = `${t.sport}|${normalize(t.name)}`
    if (!normalize(t.name)) continue
    byName.set(key, [...(byName.get(key) ?? []), t])
  }
  const twice = [...byName.values()].filter((list) => list.length > 1)
  checks.push(
    twice.length
      ? { level: 'warn', text: `${twice.length} hold har mere end én side (samme navn og sport – tjek om det er samme klub)`, items: twice.slice(0, 30).map((l) => l.map(teamLabel).join('  ·  ')) }
      : { level: 'ok', text: 'Ingen hold med to sider' },
  )

  // The same name twice in one league (the search lists both)
  const inLeague = new Map<string, TeamEntry[]>()
  for (const t of teams) {
    const key = `${sameLeagueKeys(t.leagueSlug ?? '')[0]}|${normalize(t.name)}`
    inLeague.set(key, [...(inLeague.get(key) ?? []), t])
  }
  const sameLeague = [...inLeague.values()].filter((l) => l.length > 1)
  if (sameLeague.length) checks.push({ level: 'warn', text: `${sameLeague.length} hold står to gange i samme liga`, items: sameLeague.slice(0, 30).map((l) => l.map(teamLabel).join('  ·  ')) })

  // Table rows without a page
  const unlinked: string[] = []
  for (const [key, l] of Object.entries(getRealData()?.tableTeams ?? {})) {
    for (const row of l.teams) if (!teamInLeague(key, row.name, l.sport)) unlinked.push(`${row.name} (${l.league})`)
  }
  checks.push(
    unlinked.length
      ? { level: 'warn', text: `${unlinked.length} hold i stillingerne har ingen side`, items: unlinked.slice(0, 30) }
      : { level: 'ok', text: 'Alle hold i de hentede stillinger har en side' },
  )

  // Cup teams from our country that look like one of our clubs but aren't recognised as one
  const unsure = new Set<string>()
  for (const g of getRealData()?.external ?? []) {
    const cup = cupOfGame(g)
    if (!cup) continue
    for (const side of [g.home.name, g.away.name]) {
      if (NOT_FIRST_TEAM.test(side) || ourClubInCup(side, cup)) continue
      const alikeOurs = teams.filter((t) => t.season && t.sport === cup.sport && countryKey(t.country) === countryKey(cup.country) && normalize(t.name).split(' ').some((w) => w.length > 3 && normalize(side).split(' ').includes(w)))
      if (alikeOurs.length) unsure.add(`${side} (${cup.name}) – ligner ${alikeOurs.map((t) => t.name).join(', ')}`)
    }
  }
  if (unsure.size) checks.push({ level: 'warn', text: `${unsure.size} pokalhold ligner en af vores klubber uden at være koblet til den – tjek at det er et andet hold`, items: [...unsure].slice(0, 30) })

  return { level: worst(checks), checks }
}
