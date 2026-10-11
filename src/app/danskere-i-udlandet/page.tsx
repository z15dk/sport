import type { Metadata } from 'next'
import Link from 'next/link'
import { MatchRow } from '../../components/MatchRow'
import { teamGames } from '../../data/matches'
import { abroadTeam, readAbroad, type AbroadPlayer } from '../../lib/abroad'
import { abroadFace, type AbroadFace } from '../../lib/abroadPhotos'
import { JsonLd, breadcrumbLd, webPageLd } from '../../lib/jsonld'
import { paths } from '../../lib/site'
import { formatLong, isoDate } from '../../lib/time'
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

/** James' roundup cut at its headings: the opening (the lead in the header) and one card per section */
function splitRoundup(html: string): { lead?: string; intro: string; sections: { title: string; html: string }[] } {
  const parts = html.split(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
  let intro = parts[0].trim()
  // The first paragraph as the header's lead, the rest of the opening stays with the cards
  const first = /^<p[^>]*>([\s\S]*?)<\/p>/i.exec(intro)
  const lead = first ? first[1].replace(/<[^>]+>/g, '').trim() : undefined
  if (first) intro = intro.slice(first[0].length).trim()
  const sections: { title: string; html: string }[] = []
  for (let i = 1; i < parts.length; i += 2) sections.push({ title: parts[i].replace(/<[^>]+>/g, '').trim(), html: (parts[i + 1] ?? '').trim() })
  return { lead, intro, sections }
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
  const today = isoDate(now)
  const story = roundup ? splitRoundup(roundup) : undefined
  const faces = rows.filter((r) => r.face.photo).slice(0, 12)
  const stats = [
    { label: 'Spillere', value: rows.length },
    { label: 'Ligaer', value: new Set(rows.map((r) => r.league)).size },
    { label: 'Klubber', value: new Set(rows.map((r) => r.player.club)).size },
    { label: 'Spiller i dag', value: rows.filter((r) => r.next && isoDate(r.next.kickoff) === today).length, lime: true },
  ]
  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name: 'Forside', path: '/' }, { name: TITLE, path: PATH }])} />
      <JsonLd data={webPageLd(PATH, TITLE, new Date(updated ?? now))} />
      <div className="clubs abroad">
        <header className="ab-hero">
          <div className="ab-hero__top">
            <span className="ab-stripe ab-stripe--white" aria-hidden />
            <span className="ab-stripe ab-stripe--red" aria-hidden />
            <div className="ab-hero__id">
              <p className="ab-hero__eyebrow">Fodbold{updated ? ` · opdateret ${formatLong(new Date(updated))}` : ''}</p>
              <h1 className="ab-hero__title">{TITLE}</h1>
              <p className="ab-hero__lead">{story?.lead ?? 'De danske spillere i udenlandske klubber: hvordan det går, seneste kamp og næste kamp.'}</p>
              {faces.length > 0 && (
                <ul className="ab-faces" aria-label="Nogle af spillerne">
                  {faces.map((r) => (
                    <li key={r.player.name} title={r.player.name}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- the player's photo through our own image proxy */}
                      <img src={r.face.photo} alt={r.player.name} width={44} height={44} loading="lazy" />
                    </li>
                  ))}
                  {rows.length > faces.length && <li className="ab-faces__more">+{rows.length - faces.length}</li>}
                </ul>
              )}
            </div>
          </div>
          <dl className="ab-hero__stats">
            {stats.map((x) => (
              <div key={x.label} className={x.lime ? 'ab-stat ab-stat--lime' : 'ab-stat'}>
                <dt>{x.label}</dt>
                <dd>{x.value}</dd>
              </div>
            ))}
          </dl>
        </header>
        {story && (story.intro || story.sections.length > 0) && (
          <section className="ab-week" aria-labelledby="ab-week">
            <h2 id="ab-week" className="feed__title clubs__subtitle">
              Ugens opsamling
            </h2>
            {story.intro && <div className="panel ab-card ab-card--intro" dangerouslySetInnerHTML={{ __html: story.intro }} />}
            <div className="ab-cards">
              {story.sections.map((sec, i) => (
                <article key={i} className="panel ab-card">
                  <h3 className="ab-card__title">{sec.title}</h3>
                  <div className="ab-card__body" dangerouslySetInnerHTML={{ __html: sec.html }} />
                </article>
              ))}
            </div>
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
      </div>
    </div>
  )
}
