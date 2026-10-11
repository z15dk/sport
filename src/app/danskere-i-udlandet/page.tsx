import type { Metadata } from 'next'
import Link from 'next/link'
import { MatchRow } from '../../components/MatchRow'
import { teamGames } from '../../data/matches'
import { abroadTeam, readAbroad, type AbroadPlayer } from '../../lib/abroad'
import { abroadFace, type AbroadFace } from '../../lib/abroadPhotos'
import { JsonLd, breadcrumbLd, webPageLd } from '../../lib/jsonld'
import { paths } from '../../lib/site'
import { formatLong } from '../../lib/time'
import type { Match } from '../../types'

// "Danskere i udlandet": the Danish players in foreign clubs, grouped by league – James' line on each and his weekly
// roundup (src/lib/abroad.ts), with each player's photo (src/lib/abroadPhotos.ts) and his club's last and next match
// from our own data. Indexed once the list has a few players.

export const dynamic = 'force-dynamic'

const PATH = '/danskere-i-udlandet'
const TITLE = 'Danskere i udlandet'

export function generateMetadata(): Metadata {
  const { players } = readAbroad()
  return {
    title: 'Danskere i udlandet – kampe, mål og resultater',
    description: players.length
      ? `Følg ${players.length} danske fodboldspillere i udlandet: seneste og næste kamp, hvordan det går, og ugens opsamling – fra Premier League til Serie A.`
      : 'Følg de danske fodboldspillere i udlandet: seneste og næste kamp og hvordan det går.',
    alternates: { canonical: PATH },
    ...(players.length < 5 && { robots: { index: false, follow: true } }),
  }
}

interface Row {
  player: AbroadPlayer
  face: AbroadFace
  slug?: string
  league: string
  last?: Match
  next?: Match
}

const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export default async function AbroadPage() {
  const now = Date.now()
  const { players, roundup, roundupAt, playersAt } = readAbroad()
  // Each club's matches once (several Danes can share a club)
  const games = new Map<string, Match[]>()
  const rows: Row[] = await Promise.all(
    players.map(async (p) => {
      const team = abroadTeam(p.club)
      const face = await abroadFace(p.name, team, p.apiId).catch((): AbroadFace => ({}))
      if (!team) return { player: p, face, league: /\(k\)/i.test(p.club) ? 'Kvinder' : 'Andre ligaer' }
      if (!games.has(team.slug)) games.set(team.slug, teamGames(team, now))
      const ms = games.get(team.slug)!
      return {
        player: p,
        face,
        slug: team.slug,
        // The women together: their teams' league in the register can be a tournament (Champions League)
        league: /\(k\)/i.test(p.club) ? 'Kvinder' : team.league,
        last: ms.filter((m) => m.state === 'finished').at(-1),
        next: ms.find((m) => m.state === 'upcoming' || m.state === 'live'),
      }
    }),
  )
  // The leagues with most Danes first
  const byLeague = new Map<string, Row[]>()
  for (const r of rows) byLeague.set(r.league, [...(byLeague.get(r.league) ?? []), r])
  const leagues = [...byLeague.entries()].sort((a, b) => b[1].length - a[1].length)
  const updated = roundupAt ?? playersAt
  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name: 'Forside', path: '/' }, { name: TITLE, path: PATH }])} />
      <JsonLd data={webPageLd(PATH, TITLE, new Date(updated ?? now))} />
      <div className="clubs abroad">
        <div className="clubs__head">
          <h1 className="feed__title">{TITLE}</h1>
          <p className="lead">
            De danske spillere i udenlandske klubber: hvordan det går, seneste kamp og næste kamp. Tryk på en kamp for live-stilling, opstillinger og
            statistik.
          </p>
        </div>
        {roundup && (
          <section className="panel abroad__roundup" aria-labelledby="abroad-roundup">
            <div className="abroad__roundup-head">
              <h2 id="abroad-roundup" className="panel__title">
                Ugens opsamling
              </h2>
              {roundupAt && <span className="abroad__roundup-date">{formatLong(new Date(roundupAt))}</span>}
            </div>
            <div className="abroad__roundup-body" dangerouslySetInnerHTML={{ __html: roundup }} />
          </section>
        )}
        {rows.length === 0 && <p className="panel abroad__empty">Listen over danskerne i udlandet bliver lavet lige nu. Kig forbi igen senere.</p>}
        {leagues.map(([league, list]) => (
          <section key={league} className="abroad__league">
            <h2 className="feed__title clubs__subtitle">{league}</h2>
            <div className="abroad__list">
              {list.map((r) => (
                <div key={r.player.name} className="panel abroad__player">
                  <div className="abroad__who">
                    {r.face.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- the player's photo through our own image proxy
                      <img className="abroad__face" src={r.face.photo} alt="" width={56} height={56} loading="lazy" />
                    ) : (
                      <span className="abroad__face abroad__face--none" aria-hidden="true">
                        {initials(r.player.name)}
                      </span>
                    )}
                    <div className="abroad__id">
                      <h3 className="abroad__name">{r.face.href ? <Link href={r.face.href}>{r.player.name}</Link> : r.player.name}</h3>
                      <span className="abroad__club">
                        {r.player.position && `${r.player.position} · `}
                        {r.slug ? <Link href={paths.club(r.slug)}>{r.player.club}</Link> : r.player.club}
                      </span>
                    </div>
                  </div>
                  {r.player.note && <p className="abroad__note">{r.player.note}</p>}
                  {(r.last || r.next) && (
                    <div className="abroad__matches">
                      {r.last && (
                        <div className="abroad__match">
                          <span className="abroad__label">Seneste kamp</span>
                          <ul className="league__matches">
                            <MatchRow match={r.last} showDate />
                          </ul>
                        </div>
                      )}
                      {r.next && (
                        <div className="abroad__match">
                          <span className="abroad__label">Næste kamp</span>
                          <ul className="league__matches">
                            <MatchRow match={r.next} showDate />
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        {updated && <p className="abroad__updated muted small">Opdateret {formatLong(new Date(updated))}.</p>}
      </div>
    </div>
  )
}
