import { genitive } from '../lib/words'
import Link from 'next/link'
import { shownDivisions, type Club, type Division } from '../data/leagues'
import { hasRealData } from '../data/real'
import { clubMatches, getMatches } from '../data/matches'
import { standings } from '../data/season'
import { articleSubjects } from '../lib/news'
import { isWomenArticle, subjectFromTags } from '../lib/articleTopics'
import { paths } from '../lib/site'
import { addDays, isoDate } from '../lib/time'
import type { Match } from '../types'
import { MatchRow } from './MatchRow'
import { StandingsTable } from './StandingsTable'

// The living side column of an article: the table, the next matches and the latest results of the league
// or club the article is about (its tags first – the first club tag, else the first league tag –
// then its title, lead and category), else
// today's matches. Real data, the same as the league and club pages show.

interface Subject {
  division: Division
  club?: Club
}

/** The league (and club) an article is about, when it is one we cover with data */
export function articleSubject(a: { title: string; excerpt: string; tags: string[]; focusKeyword?: string }, categoryName?: string): Subject | undefined {
  // Our leagues are the men's: an article about women's football gets today's matches, not the men's club's table
  if (isWomenArticle({ tags: a.tags, title: a.title, category: categoryName })) return undefined
  // The tags decide: the first club tag (its league's table and matches), else the first league tag
  const tagged = subjectFromTags(a.tags)
  if (tagged) return tagged
  const { clubs, leagues } = articleSubjects(a.title, [a.excerpt, a.focusKeyword, categoryName, ...a.tags].filter(Boolean).join(' '))
  const shown = shownDivisions()
  for (const id of clubs) {
    const hit = shown.flatMap((d) => d.clubs.filter((c) => c.id === id).map((c) => ({ division: d, club: c })))[0]
    if (hit) return hit
  }
  for (const id of leagues) {
    const division = shown.find((d) => d.id === id)
    if (division) return { division }
  }
  return undefined
}

/** The league's next matches (in play first), up to `limit`, within the next two weeks */
function leagueMatches(division: Division, now: number, limit: number): Match[] {
  const today = isoDate(now)
  const out: Match[] = []
  for (let i = 0; i < 14 && out.length < limit; i++) {
    for (const m of getMatches(addDays(today, i), 'all', now)) {
      if (m.leagueSlug !== division.slug || m.state === 'finished' || m.state === 'postponed') continue
      out.push(m)
      if (out.length >= limit) break
    }
  }
  return out
}

/** The league's latest results, newest first, up to `limit`, from the last three weeks */
function leagueResults(division: Division, now: number, limit: number): Match[] {
  const today = isoDate(now)
  const out: Match[] = []
  for (let i = 0; i < 21 && out.length < limit; i++) {
    const day = getMatches(addDays(today, -i), 'all', now).filter((m) => m.leagueSlug === division.slug && m.state === 'finished')
    out.push(...day.sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime()))
  }
  return out.slice(0, limit)
}

export function ArticleSide({ subject, now }: { subject?: Subject; now: number }) {
  if (!subject) {
    const today = getMatches(isoDate(now), 'all', now)
    const live = today.filter((m) => m.state === 'live')
    const list = (live.length ? live : today.filter((m) => m.state === 'upcoming')).slice(0, 5)
    if (!list.length) return null
    return (
      <aside className="article-side">
        <section className="panel">
          <h2 className="panel__title">{live.length ? 'Lige nu' : 'Kampe i dag'}</h2>
          <ul className="league__matches">
            {list.map((m) => (
              <MatchRow key={m.id} match={m} showLeague />
            ))}
          </ul>
          <Link className="article-side__more" href={paths.home()}>
            Alle dagens kampe →
          </Link>
        </section>
      </aside>
    )
  }
  const { division, club } = subject
  const rows = hasRealData(division.id) ? standings(division, now) : []
  // Six rows: around the club, else the top
  const at = club ? rows.findIndex((r) => r.club.id === club.id) : -1
  const offset = at < 0 ? 0 : Math.max(0, Math.min(at - 2, rows.length - 6))
  const slice = rows.slice(offset, offset + 6)
  const next = club
    ? clubMatches(club.name, now)
        .filter((m) => m.state !== 'finished' && m.state !== 'postponed' && m.kickoff.getTime() > now - 3 * 3_600_000)
        .slice(0, 4)
    : leagueMatches(division, now, 4)
  const results = club
    ? clubMatches(club.name, now)
        .filter((m) => m.state === 'finished')
        .slice(-4)
        .reverse()
    : leagueResults(division, now, 4)
  return (
    <aside className="article-side">
      {slice.length > 0 && (
        <section className="panel table-panel">
          <h2 className="panel__title">Stillingen i {division.name}</h2>
          <StandingsTable division={division} rows={slice} offset={offset} total={rows.length} highlight={club?.slug} compact />
          <Link className="article-side__more" href={paths.league(division.slug)}>
            Hele stillingen →
          </Link>
        </section>
      )}
      {next.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">{club ? `${genitive(club.name)} næste kampe` : `Kommende kampe i ${division.name}`}</h2>
          <ul className="league__matches">
            {next.map((m) => (
              <MatchRow key={m.id} match={m} showDate showLeague={!!club} />
            ))}
          </ul>
          <Link className="article-side__more" href={club ? paths.club(club.slug) : paths.league(division.slug)}>
            {club ? `Alt om ${club.name} →` : `Alt om ${division.name} →`}
          </Link>
        </section>
      )}
      {results.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">{club ? `${genitive(club.name)} seneste kampe` : `Seneste resultater i ${division.name}`}</h2>
          <ul className="league__matches">
            {results.map((m) => (
              <MatchRow key={m.id} match={m} showDate showLeague={!!club} />
            ))}
          </ul>
          <Link className="article-side__more" href={club ? paths.club(club.slug) : paths.league(division.slug)}>
            {club ? `Alle ${genitive(club.name)} kampe →` : `Alle resultater →`}
          </Link>
        </section>
      )}
    </aside>
  )
}
