// A team's players with their season statistics, from API-Sports' /players?team=&league=&season= (the club page's squad
// for the leagues we have no line-ups for). No imports of its own, so the tests can read it.

export interface ApiSquadPlayer {
  id: number
  name: string
  /** The source's picture address (our image proxy is put on by the caller) */
  photo?: string
  number?: number
  /** G, D, M or F */
  pos?: string
  starts: number
  subbedOn: number
  goals: number
  assists: number
  yellow: number
  red: number
  minutes?: number
  rating?: number
}

type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v))
const POSITION: Record<string, string> = { Goalkeeper: 'G', Defender: 'D', Midfielder: 'M', Attacker: 'F' }

/**
 * The players of a response (several pages put together): everyone who has played in the league this season, once, with
 * the league's own statistics (a player's other competitions are not counted). Matches from the start, matches come on in
 * (all appearances less those from the start), goals, assists, cards (a second yellow counts as red too) and minutes.
 */
export function squadFromApi(response: Raw[], leagueId: string): ApiSquadPlayer[] {
  const out = new Map<number, ApiSquadPlayer>()
  for (const r of response) {
    const p = r?.player
    const id = n(p?.id)
    if (!id || !p?.name) continue
    const stats = (r.statistics ?? []) as Raw[]
    // The league's own row; the only row where it names no league
    const st = stats.find((s) => String(s?.league?.id) === String(leagueId)) ?? (stats.length === 1 && stats[0]?.league?.id === undefined ? stats[0] : undefined)
    if (!st) continue
    const games = n(st.games?.appearences) ?? 0
    const minutes = n(st.games?.minutes)
    if (!games && !minutes) continue
    const starts = Math.min(games, n(st.games?.lineups) ?? 0)
    out.set(id, {
      id,
      name: String(p.name),
      photo: p.photo ?? undefined,
      number: n(st.games?.number),
      pos: POSITION[String(st.games?.position)] ?? undefined,
      starts,
      subbedOn: Math.max(0, games - starts),
      goals: n(st.goals?.total) ?? 0,
      assists: n(st.goals?.assists) ?? 0,
      yellow: (n(st.cards?.yellow) ?? 0) + (n(st.cards?.yellowred) ?? 0),
      red: (n(st.cards?.red) ?? 0) + (n(st.cards?.yellowred) ?? 0),
      minutes,
      rating: n(st.games?.rating),
    })
  }
  return [...out.values()]
}
