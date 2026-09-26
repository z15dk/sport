import { divisionBySlug, seasonOf } from '../../../../data/leagues'
import { teamBySlug } from '../../../../data/teams'
import { allFixtures, toMatch } from '../../../../data/season'
import { clubMatches, externalMatch } from '../../../../data/matches'
import { externalLeagueKey } from '../../../../data/external'
import { getRealData } from '../../../../data/real'
import { sameLeagueKeys } from '../../../../data/baselines'
import { loadRealData } from '../../../../lib/realdata'
import { calendar } from '../../../../lib/calendar'
import type { Match } from '../../../../types'

export const dynamic = 'force-dynamic'

type Params = Promise<{ kind: string; file: string }>

/** A club's or a tournament's matches as a calendar subscription: /kalender/klub/<slug>.ics, /kalender/turnering/<slug>.ics */
export async function GET(_request: Request, { params }: { params: Params }) {
  const { kind, file } = await params
  const slug = file.replace(/\.ics$/, '')
  const now = Date.now()
  const real = loadRealData() ?? getRealData()
  let name: string | undefined
  let matches: Match[] = []

  if (kind === 'klub') {
    const team = teamBySlug(slug)
    if (team?.season) {
      name = team.name
      matches = clubMatches(team.name, now)
    } else if (team) {
      name = team.name
      const names = new Set(team.names ?? [team.name])
      matches = (real?.external ?? [])
        .map(externalMatch)
        .filter((m) => (names.has(m.home.name) || names.has(m.away.name)) && (!team.names || !team.leagueSlug || m.leagueSlug === team.leagueSlug))
    }
  } else if (kind === 'turnering') {
    const division = divisionBySlug(slug)
    if (division) {
      name = `${division.name} ${seasonOf(division)}`
      matches = allFixtures()
        .filter((f) => f.division?.id === division.id)
        .map((f) => toMatch(f, now))
    } else if (slug.startsWith('x-')) {
      const keys = sameLeagueKeys(slug)
      const games = (real?.external ?? []).filter((g) => keys.includes(externalLeagueKey(g.league)))
      name = games[0]?.league.name
      matches = games.map(externalMatch)
    }
  }
  if (!name) return new Response('Kalenderen findes ikke', { status: 404 })

  const unique = [...new Map(matches.map((m) => [m.id, m])).values()].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const body = calendar(`${name} · Scoreline`, `Kampprogram og resultater for ${name}`, unique)
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="${slug}.ics"`,
      'cache-control': 'public, max-age=900',
    },
  })
}
