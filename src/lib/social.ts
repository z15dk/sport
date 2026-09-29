import 'server-only'
import type { Incident, Match, SportId } from '../types'
import type { Club, Division } from '../data/leagues'
import { DIVISIONS, sportOf } from '../data/leagues'
import { allFixtures, fixturesOn, isFinished, standings, type Fixture } from '../data/season'
import { leagueStats, type ScorerRow } from '../data/stats'
import { alike } from '../data/aliases'
import { getMatches, isWomenMatch } from '../data/matches'
import { teamByName } from '../data/teams'
import { ourClubByName } from '../data/cups'
import { addDays, isoDate } from './time'
import { realHeadToHead } from './history'
import { EXTERNAL_PRIORITIES, socialConfig } from './socialStore'

// Test of posts for Facebook and Instagram (/admin/sociale): which matches a
// day's posts would pick, and the numbers each card shows. Everything comes
// from the real season; a card without its own data is left out.

/** How much a league weighs when the day's matches are picked */
const WEIGHT: Record<string, number> = {
  superliga: 100, premierleague: 85, '1div': 70, laliga: 65, bundesliga: 65, metalligaen: 60, basketligaen: 50,
  '2div': 45, ligaportugal: 45, allsvenskan: 45, eliteserien: 45, championship: 40, bundesliga2: 35, shl: 35, '3div': 30, liga3: 25,
}
/** The default weight of one of our leagues (the admin can change it in /admin/sociale/indstillinger) */
export const defaultWeight = (id: string) => WEIGHT[id] ?? 20
const weight = (d?: Division) => (d ? (socialConfig().weights[d.id] ?? defaultWeight(d.id)) : 0)

type Result = 'V' | 'U' | 'T'
export interface Played {
  fixture: Fixture
  result: Result
  goalsFor: number
  goalsAgainst: number
  opponent: Club
}

/** A club's finished matches before a time, newest first */
function played(club: Club, before: number): Played[] {
  return allFixtures()
    .filter((f) => isFinished(f) && f.kickoff.getTime() < before && (f.home.id === club.id || f.away.id === club.id))
    .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime())
    .map((f) => {
      const home = f.home.id === club.id
      const gf = home ? f.score[0] : f.score[1]
      const ga = home ? f.score[1] : f.score[0]
      return { fixture: f, goalsFor: gf, goalsAgainst: ga, opponent: home ? f.away : f.home, result: gf > ga ? 'V' : gf < ga ? 'T' : 'U' }
    })
}

/** The league table as it stood at a time (football points), position by club id */
function tableAt(div: Division, at: number) {
  const rows = new Map<string, { club: Club; points: number; diff: number; goals: number; played: number }>()
  for (const f of allFixtures()) {
    if (f.division !== div || !isFinished(f) || f.kickoff.getTime() >= at) continue
    for (const [club, gf, ga] of [
      [f.home, f.score[0], f.score[1]],
      [f.away, f.score[1], f.score[0]],
    ] as const) {
      const r = rows.get(club.id) ?? rows.set(club.id, { club, points: 0, diff: 0, goals: 0, played: 0 }).get(club.id)!
      r.played++
      r.goals += gf
      r.diff += gf - ga
      r.points += gf > ga ? 3 : gf === ga ? 1 : 0
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.diff - a.diff || b.goals - a.goals)
  return new Map(sorted.map((r, i) => [r.club.id, { ...r, pos: i + 1, of: sorted.length }]))
}

const isGoal = (i: Incident) => i.kind === 'goal' || i.kind === 'penalty' || i.kind === 'own-goal'
/** The side a goal counts for (an own goal counts for the other side) */
export const scoringSide = (i: Incident): 'home' | 'away' => (i.kind === 'own-goal' ? (i.side === 'home' ? 'away' : 'home') : i.side)
export const goalsOf = (f: Fixture) => (f.incidents ?? []).filter(isGoal).sort((a, b) => a.minute - b.minute)

// ---------------------------------------------------------------- the day's matches

export interface Fact {
  text: string
  /** The numbers behind the fact */
  proof: { label: string; value: string }[]
  proofTitle: string
}

export interface Pick {
  fixture: Fixture
  /** Our league, when it is one (cups and API-Sports' other leagues have none) */
  division?: Division
  league: string
  sport: SportId
  finished: boolean
  home: { pos?: number; points?: number }
  away: { pos?: number; points?: number }
  /** One fact for the preview */
  fact?: Fact
  /** Table position after the match, when it is the club's latest */
  after?: { home?: number; away?: number }
  /** Logos the source sent with the match (API-Sports' games) */
  logos?: Record<string, string>
  /** The league's other finished matches that day, without their own card (at most 3) */
  sameDay: Fixture[]
}

/** Danish genitive: "Randers FCs"; names ending in s, x or z get an apostrophe */
export const gen = (name: string) => (/[sxz]$/i.test(name) ? `${name}'` : `${name}s`)

const isHomeIn = (club: Club, name: string) => name === club.name || alike([club.name, club.originalName ?? club.name], name)

function headToHeadFact(f: Fixture): Fact | undefined {
  const h2h = realHeadToHead(f.home, f.away, f.kickoff, 6)
  if (!h2h || h2h.length < 3) return undefined
  let w = 0
  let d = 0
  let l = 0
  let high = 0
  for (const m of h2h) {
    const home = isHomeIn(f.home, m.home)
    const gf = home ? m.homeScore : m.awayScore
    const ga = home ? m.awayScore : m.homeScore
    if (gf > ga) w++
    else if (gf === ga) d++
    else l++
    if (m.homeScore + m.awayScore >= 3) high++
  }
  const n = h2h.length
  const proof = h2h.map((m) => ({ label: `${m.date.getFullYear()} · ${m.home} – ${m.away}`, value: `${m.homeScore}–${m.awayScore}` }))
  const proofTitle = `De seneste ${n} opgør`
  if (l === 0 && n >= 4) return { text: `${f.home.name} har ikke tabt i de seneste ${n} opgør mod ${f.away.name}.`, proof, proofTitle }
  if (w === 0 && n >= 4) return { text: `${f.away.name} har ikke tabt i de seneste ${n} opgør mod ${f.home.name}.`, proof, proofTitle }
  if (high >= n - 1 && n >= 4) return { text: `Der er faldet mindst tre mål i ${high} af de seneste ${n} opgør.`, proof, proofTitle }
  return { text: `De seneste ${n} opgør: ${w} sejre til ${f.home.name}, ${d} uafgjort og ${l} til ${f.away.name}.`, proof, proofTitle }
}

/** A club's current run before a time: wins in a row, unbeaten or without a win */
function run(club: Club, before: number) {
  const games = played(club, before)
  const count = (ok: (r: Result) => boolean) => {
    let n = 0
    while (n < games.length && ok(games[n].result)) n++
    return n
  }
  return { games, wins: count((r) => r === 'V'), unbeaten: count((r) => r !== 'T'), winless: count((r) => r !== 'V') }
}

const resultProof = (games: Played[]) =>
  games.map((g) => ({
    label: `${g.fixture.kickoff.getDate()}/${g.fixture.kickoff.getMonth() + 1} · ${g.opponent.name}`,
    value: `${g.goalsFor}–${g.goalsAgainst}`,
  }))

function runFact(f: Fixture): Fact | undefined {
  const at = f.kickoff.getTime()
  const options: { score: number; fact: Fact }[] = []
  for (const club of [f.home, f.away]) {
    const r = run(club, at)
    if (r.wins >= 3)
      options.push({ score: r.wins * 2, fact: { text: `${club.name} har vundet ${r.wins} kampe i træk.`, proof: resultProof(r.games.slice(0, r.wins)), proofTitle: `${gen(club.name)} seneste kampe` } })
    else if (r.unbeaten >= 5)
      options.push({ score: r.unbeaten, fact: { text: `${club.name} er ubesejret i ${r.unbeaten} kampe.`, proof: resultProof(r.games.slice(0, Math.min(r.unbeaten, 6))), proofTitle: `${gen(club.name)} seneste kampe` } })
    else if (r.winless >= 5)
      options.push({ score: r.winless, fact: { text: `${club.name} har ikke vundet i ${r.winless} kampe.`, proof: resultProof(r.games.slice(0, Math.min(r.winless, 6))), proofTitle: `${gen(club.name)} seneste kampe` } })
  }
  return options.sort((a, b) => b.score - a.score)[0]?.fact
}

function tableFact(f: Fixture, div: Division): Fact | undefined {
  if (sportOf(div) !== 'soccer') return undefined
  const table = tableAt(div, f.kickoff.getTime())
  const h = table.get(f.home.id)
  const a = table.get(f.away.id)
  if (!h || !a || h.played < 3 || a.played < 3) return undefined
  const gap = Math.abs(h.points - a.points)
  const text =
    gap === 0
      ? `Nr. ${h.pos} møder nr. ${a.pos}, og holdene har lige mange point.`
      : `Nr. ${h.pos} møder nr. ${a.pos}. ${gap} point skiller holdene.`
  return {
    text,
    proofTitle: 'Stillingen før kampen',
    proof: [h, a].sort((x, y) => x.pos - y.pos).map((r) => ({ label: `${r.pos}. ${r.club.name}`, value: `${r.points} p.` })),
  }
}

function factFor(f: Fixture, div?: Division): Fact | undefined {
  const h2h = headToHeadFact(f)
  if (h2h && !h2h.text.startsWith('De seneste')) return h2h
  return runFact(f) ?? h2h ?? (div ? tableFact(f, div) : undefined)
}

/** The priority key of a cup or an outside league (API-Sports' games) */
function externalKey(m: Match): string {
  const name = m.league.toLowerCase()
  if (/champions league/.test(name)) return /women|kvinde/.test(name) ? 'x-clw' : 'x-cl'
  if (/europa league/.test(name)) return 'x-el'
  if (/conference league/.test(name)) return 'x-ecl'
  if (m.leagueId.startsWith('cup-')) return 'x-cup'
  if (m.country === 'Danmark') return 'x-dk'
  return 'x-other'
}

/** How much a cup or an outside league weighs */
function externalWeight(m: Match) {
  const key = externalKey(m)
  return socialConfig().weights[key] ?? EXTERNAL_PRIORITIES.find((p) => p.key === key)!.weight
}

/** A match from outside our leagues as a fixture, so it can be shown the same way */
function externalFixture(m: Match): Fixture {
  const club = (name: string): Club => {
    const t = teamByName(name)
    // A women's team without colours of its own wears its club's: "Brøndby W" in Brøndby's yellow
    const bare = name.replace(/\s+(w|women|kvinder|damer|frauen|femenino|feminino)\.?$/i, '').trim()
    const parent = t?.colors || t?.season ? undefined : bare !== name ? (ourClubByName(bare, 'soccer')?.club ?? teamByName(bare)) : undefined
    const parentColors = parent && ('season' in parent ? (parent.colors ?? parent.season?.club.colors) : parent.colors)
    const colors = t?.colors ?? t?.season?.club.colors ?? parentColors ?? ['#16181a', '#ffffff']
    return { id: `x-${t?.slug ?? name}`, slug: t?.slug ?? name, name, city: '', colors }
  }
  const hasScore = m.home.score !== undefined && m.away.score !== undefined
  return {
    id: m.id,
    slug: m.slug,
    competition: m.league,
    leagueId: m.leagueId,
    leagueSlug: m.leagueSlug,
    leagueOrder: m.leagueOrder ?? 99,
    round: m.round ?? 0,
    sport: m.sport,
    home: club(m.home.name),
    away: club(m.away.name),
    kickoff: m.kickoff,
    score: [m.home.score ?? 0, m.away.score ?? 0],
    real: { state: m.state, hasScore },
    incidents: m.incidents,
  }
}

/** How many matches a day's programme shows (fewer only when fewer are played) */
export const DAY_MATCHES = 5

/** A finished match with a result */
export const isFinishedMatch = (f: Fixture) => isFinished(f)

/** A finished match where every goal has a named scorer (the results carousel only shows these) */
export const hasNamedScorers = (f: Fixture) => {
  const goals = goalsOf(f)
  return isFinished(f) && goals.length > 0 && goals.length === f.score[0] + f.score[1] && goals.every((i) => !!i.player)
}

type Scored = {
  f: Fixture
  div?: Division
  league: string
  sport: SportId
  score: number
  h?: { pos: number; points: number; played: number }
  a?: { pos: number; points: number; played: number }
  logos?: Record<string, string>
}

/** Every match of a day with its score: league weight (0 = never), table, goals and the admin's favourite clubs */
function scoredMatches(date: string, now: number, only: (f: Fixture) => boolean, women = false): Scored[] {
  // Women's football: only the women's games (our leagues are the men's)
  const ours = women ? [] : fixturesOn(date).filter((f) => f.division && f.real.state !== 'postponed' && only(f))
  const ourSlugs = new Set(DIVISIONS.map((d) => d.slug))
  const known = new Set(ours.map((f) => f.id))
  const favorites = socialConfig().favorites
  const favorite = (f: Fixture) => favorites.some((n) => alike([n], f.home.name) || alike([n], f.away.name))
  // Cups, Champions League and API-Sports' other leagues, for days our leagues rest
  const others = getMatches(date, 'all', now).filter((m) => !known.has(m.id) && !(m.leagueSlug && ourSlugs.has(m.leagueSlug)) && m.state !== 'postponed' && (!women || isWomenMatch(m)))
  const scored: Scored[] = [
    ...ours.flatMap((f) => {
      const div = f.division!
      let score = weight(div)
      if (score <= 0) return []
      const table = sportOf(div) === 'soccer' ? tableAt(div, f.kickoff.getTime()) : undefined
      const h = table?.get(f.home.id)
      const a = table?.get(f.away.id)
      if (h && a && h.played >= 3) {
        if (h.pos <= 4 && a.pos <= 4) score += 20
        if (Math.abs(h.pos - a.pos) <= 2) score += 10
        if (h.pos > h.of - 3 || a.pos > a.of - 3) score += 5
      }
      if (isFinished(f)) score += (f.score[0] + f.score[1]) * 2
      if (favorite(f)) score += 200
      return [{ f, div, league: div.name, sport: sportOf(div), score, h, a }]
    }),
    ...others.flatMap((m) => {
      const f = externalFixture(m)
      if (!only(f)) return []
      let score = externalWeight(m)
      if (score <= 0) return []
      const logos: Record<string, string> = {}
      if (m.home.badge) logos[m.home.name] = m.home.badge
      if (m.away.badge) logos[m.away.name] = m.away.badge
      score += isFinished(f) ? (f.score[0] + f.score[1]) * 2 : 0
      if (favorite(f)) score += 200
      return [{ f, league: m.league, sport: m.sport, score, logos }]
    }),
  ]
  return scored.sort((x, y) => y.score - x.score || x.f.kickoff.getTime() - y.f.kickoff.getTime())
}

/** The picked matches as the cards show them, in kick-off order */
function decorate(chosen: Scored[], scored: Scored[], now: number): Pick[] {
  // A league's other results go on its first card only, so the carousel doesn't repeat them
  const listed = new Set<string>()
  return [...chosen]
    .sort((x, y) => x.f.kickoff.getTime() - y.f.kickoff.getTime())
    .map(({ f, div, league, sport, h, a, logos: own }) => {
      const first = isFinished(f) && !listed.has(league)
      if (first) listed.add(league)
      const others = scored
        .filter((x) => first && x.league === league && x.f !== f && !chosen.includes(x) && isFinished(x.f))
        .sort((x, y) => x.f.kickoff.getTime() - y.f.kickoff.getTime())
        .slice(0, 3)
      const logos = Object.assign({}, own, ...others.map((x) => x.logos ?? {})) as Record<string, string>
      const finished = isFinished(f)
      let after: Pick['after']
      if (finished && div && sportOf(div) === 'soccer') {
        const latest = (club: Club) => played(club, now + 1)[0]?.fixture === f
        const table = tableAt(div, now + 1)
        after = { home: latest(f.home) ? table.get(f.home.id)?.pos : undefined, away: latest(f.away) ? table.get(f.away.id)?.pos : undefined }
      }
      return {
        fixture: f,
        division: div,
        league,
        sport,
        finished,
        home: { pos: h?.pos, points: h?.points },
        away: { pos: a?.pos, points: a?.points },
        fact: factFor(f, div),
        after,
        logos,
        sameDay: others.map((x) => x.f),
      }
    })
}

/** The day's matches (5, or the number set in the admin): the best of each league first, then the next best */
export function pickMatches(date: string, now: number, only: (f: Fixture) => boolean = () => true, count = socialConfig().matches || DAY_MATCHES, women = false): Pick[] {
  const scored = scoredMatches(date, now, only, women)
  const chosen: Scored[] = []
  const leagues = new Set<string>()
  for (const s of scored) {
    if (chosen.length >= count) break
    if (leagues.has(s.league)) continue
    chosen.push(s)
    leagues.add(s.league)
  }
  for (const s of scored) {
    if (chosen.length >= count) break
    if (!chosen.includes(s)) chosen.push(s)
  }
  return decorate(chosen, scored, now)
}

/** Given matches of a day (the plan's, or picked by hand), as cards; matches no longer found (postponed) are left out */
export function picksFor(date: string, now: number, ids: string[], only: (f: Fixture) => boolean = () => true): Pick[] {
  const scored = scoredMatches(date, now, () => true)
  const chosen = scored.filter((s) => ids.includes(s.f.id))
  return decorate(chosen, scored, now).filter((p) => only(p.fixture))
}

/** Every match of a day that could be picked, best first (for picking by hand) */
export function candidates(date: string, now: number): { fixture: Fixture; league: string; score: number }[] {
  return scoredMatches(date, now, () => true).map((s) => ({ fixture: s.f, league: s.league, score: s.score }))
}

// ---------------------------------------------------------------- the week in numbers (Monday)

export interface WeekNumbers {
  from: string
  to: string
  mostGoals?: Fixture
  upset?: { fixture: Fixture; winner: Club; loser: Club; winnerPos: number; loserPos: number; loserUnbeaten: number }
  streak?: { club: Club; division: Division; length: number; games: Played[]; lastDefeat?: Date }
  crowd?: { fixture: Fixture; average?: number }
}

/** The seven days before `date`: most goals, biggest upset, longest unbeaten run, biggest crowd */
export function weekNumbers(date: string): WeekNumbers {
  const from = addDays(date, -7)
  const to = addDays(date, -1)
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const week = days.flatMap((d) => fixturesOn(d)).filter((f) => f.division && isFinished(f))
  const out: WeekNumbers = { from, to }

  const byGoals = week
    .filter((f) => sportOf(f.division!) === 'soccer')
    .sort((a, b) => b.score[0] + b.score[1] - (a.score[0] + a.score[1]) || weight(b.division) - weight(a.division))
  if (byGoals[0] && byGoals[0].score[0] + byGoals[0].score[1] >= 5) out.mostGoals = byGoals[0]

  let best = 0
  for (const f of week) {
    const div = f.division!
    if (sportOf(div) !== 'soccer' || f.score[0] === f.score[1]) continue
    const table = tableAt(div, f.kickoff.getTime())
    const [winner, loser] = f.score[0] > f.score[1] ? [f.home, f.away] : [f.away, f.home]
    const w = table.get(winner.id)
    const l = table.get(loser.id)
    if (!w || !l || w.played < 3 || l.played < 3 || w.pos - l.pos < 5) continue
    const score = (w.pos - l.pos) * weight(div)
    if (score > best) {
      best = score
      out.upset = { fixture: f, winner, loser, winnerPos: w.pos, loserPos: l.pos, loserUnbeaten: run(loser, f.kickoff.getTime()).unbeaten }
    }
  }

  const end = new Date(`${date}T00:00:00Z`).getTime()
  const clubs = new Map<string, { club: Club; division: Division }>()
  for (const f of week) {
    if (sportOf(f.division!) !== 'soccer' || weight(f.division) < 45) continue
    clubs.set(f.home.id, { club: f.home, division: f.division! })
    clubs.set(f.away.id, { club: f.away, division: f.division! })
  }
  for (const { club, division } of clubs.values()) {
    const r = run(club, end)
    if (r.unbeaten < 5) continue
    if (out.streak && (r.unbeaten < out.streak.length || (r.unbeaten === out.streak.length && weight(division) <= weight(out.streak.division)))) continue
    out.streak = { club, division, length: r.unbeaten, games: r.games.slice(0, r.unbeaten), lastDefeat: r.games[r.unbeaten]?.fixture.kickoff }
  }

  const crowd = week.filter((f) => f.spectators).sort((a, b) => b.spectators! - a.spectators!)[0]
  if (crowd) {
    const season = allFixtures().filter((f) => f.division === crowd.division && isFinished(f) && f.spectators)
    const average = season.length >= 5 ? Math.round(season.reduce((s, f) => s + f.spectators!, 0) / season.length) : undefined
    out.crowd = { fixture: crowd, average }
  }
  return out
}

export const todayIso = (now: number) => isoDate(new Date(now))

// ---------------------------------------------------------------- the day's topic (10–11)

/** The league the one-league topics use: the admin's choice, else the Superliga */
export function topicDivision(): Division | undefined {
  const id = socialConfig().topicLeague
  return DIVISIONS.find((d) => d.id === id) ?? DIVISIONS.find((d) => d.id === 'superliga')
}

/** The league's top scorers (at least 5 with goals) */
export function scorersTopic(div: Division): { division: Division; rows: ScorerRow[] } | undefined {
  const rows = leagueStats(div)?.scorers.filter((r) => r.goals > 0).slice(0, 10) ?? []
  return rows.length >= 5 ? { division: div, rows } : undefined
}

export interface FormRow {
  club: Club
  pos: number
  form: Result[]
  points: number
  goals: [number, number]
}

/** The league's teams by points in their latest 5 matches (every team with 5 played) */
export function formTopic(div: Division, now: number): { division: Division; rows: FormRow[] } | undefined {
  if (sportOf(div) !== 'soccer') return undefined
  const table = standings(div, now)
  const rows = table
    .map((r, i) => {
      const games = played(r.club, now + 1).slice(0, 5)
      return {
        club: r.club,
        pos: i + 1,
        form: games.map((g) => g.result).reverse(),
        points: games.reduce((s, g) => s + (g.result === 'V' ? 3 : g.result === 'U' ? 1 : 0), 0),
        goals: [games.reduce((s, g) => s + g.goalsFor, 0), games.reduce((s, g) => s + g.goalsAgainst, 0)] as [number, number],
      }
    })
    .filter((r) => r.form.length === 5)
    .sort((a, b) => b.points - a.points || b.goals[0] - b.goals[1] - (a.goals[0] - a.goals[1]) || a.pos - b.pos)
  return rows.length >= 6 ? { division: div, rows } : undefined
}

/** The league table (every team with at least 3 played) */
export function tableTopic(div: Division, now: number) {
  const rows = standings(div, now)
  return rows.length >= 6 && rows.every((r) => r.played >= 3) ? { division: div, rows } : undefined
}

/** The biggest match of the next 4 days that isn't played yet */
export function bigMatchTopic(date: string, now: number): Pick | undefined {
  let best: { scored: Scored[]; s: Scored } | undefined
  for (let i = 0; i < 4; i++) {
    const scored = scoredMatches(addDays(date, i), now, (f) => !isFinished(f) && f.kickoff.getTime() > now)
    if (scored[0] && (!best || scored[0].score > best.s.score)) best = { scored, s: scored[0] }
  }
  return best ? decorate([best.s], best.scored, now)[0] : undefined
}

/** The coming Saturday and Sunday (today and tomorrow on a Saturday) */
export function weekendDates(date: string): [string, string] {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const sat = addDays(date, weekday === 0 ? -1 : (6 - weekday + 7) % 7)
  return [sat, addDays(sat, 1)]
}

/** The picked matches of the weekend's two days */
export function weekendTopic(date: string, now: number): { date: string; picks: Pick[] }[] | undefined {
  const days = weekendDates(date).map((d) => ({ date: d, picks: pickMatches(d, now, (f) => !isFinished(f)) })).filter((d) => d.picks.length)
  return days.length ? days : undefined
}

/** A fact about each of the day's matches (at least 2) */
export function factsTopic(date: string, now: number, ids: string[]): Pick[] | undefined {
  const picks = picksFor(date, now, ids).filter((p) => p.fact)
  return picks.length >= 2 ? picks : undefined
}
