import { teamBySlug } from '../../../data/teams'
import { teamGames } from '../../../data/matches'
import { normalize } from '../../../data/aliases'
import type { Match } from '../../../types'

/**
 * "Mine hold" for teams outside our leagues: the browser has only today's
 * games, so the server gives each followed team's logo and its live, next and
 * latest game (the team under its page name, "HB Køge" in the women's
 * Champions League is HB Køge Women). ?hold=slug1,slug2
 */
export async function GET(request: Request) {
  const slugs = (new URL(request.url).searchParams.get('hold') ?? '').split(',').filter(Boolean).slice(0, 20)
  const now = Date.now()
  const out: Record<string, { logo?: string; matches: Match[] }> = {}
  for (const slug of slugs) {
    const team = teamBySlug(slug)
    if (!team || team.season) continue
    const names = team.names ?? [team.name]
    const bare = (n: string) => normalize(n.replace(/\b(w|women|q|kvinder)\b\.?/gi, '').trim())
    const ours = new Set(names.map(bare))
    const asTeam = (side: Match['home']) => (ours.has(bare(side.name)) ? { ...side, name: team.name } : side)
    const games = teamGames(team, now).map((m) => ({ ...m, home: asTeam(m.home), away: asTeam(m.away) }))
    const live = games.find((m) => m.state === 'live')
    const next = games.find((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
    const last = games.filter((m) => m.state === 'finished').at(-1)
    out[slug] = { logo: team.logo, matches: [last, live, next].filter((m): m is Match => !!m) }
  }
  return Response.json(out, { headers: { 'cache-control': 'private, max-age=30' } })
}
