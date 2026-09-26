'use client'

import Link from 'next/link'
import { useFavoriteTeams } from '../hooks/useFavoriteTeams'
import { usePersistentState } from '../hooks/usePersistentState'
import { teamBySlug } from '../data/teams'
import { clubMatches, externalMatch } from '../data/matches'
import { clubStats } from '../data/matchInsights'
import { seasonClubs } from '../data/season'
import { getRealData } from '../data/real'
import { outcomeFor } from '../lib/result'
import { paths } from '../lib/site'
import { formatNumeric, formatTime, formatWeekday, isoDate } from '../lib/time'
import type { Match } from '../types'
import { TeamBadge } from './TeamBadge'

/** "om 2 t 15 min", "i morgen kl. 15.00", "lør 3. okt. kl. 15.00" */
function until(kickoff: Date, now: number): string {
  const min = Math.round((kickoff.getTime() - now) / 60_000)
  if (min < 60) return `om ${Math.max(1, min)} min`
  if (min < 12 * 60) return `om ${Math.floor(min / 60)} t ${min % 60} min`
  const day = isoDate(kickoff)
  if (day === isoDate(now + 86_400_000)) return `i morgen kl. ${formatTime(kickoff)}`
  if (day === isoDate(now)) return `i dag kl. ${formatTime(kickoff)}`
  return `${formatWeekday(day)} ${formatNumeric(kickoff).replace(/\.\d{2,4}$/, '')} kl. ${formatTime(kickoff)}`
}

/** A followed team's matches: the season for our clubs, API-Sports' games for the rest */
function matchesOf(slug: string, now: number): { name: string; matches: Match[]; place?: string } | undefined {
  const team = teamBySlug(slug)
  if (!team) return undefined
  if (team.season) {
    const stats = clubStats(team.name, now)
    return { name: team.name, matches: clubMatches(team.name, now), place: stats ? `${stats.position}. plads i ${stats.division.name}` : undefined }
  }
  const names = new Set(team.names ?? [team.name])
  const matches = (getRealData()?.external ?? [])
    .map(externalMatch)
    .filter((m) => (names.has(m.home.name) || names.has(m.away.name)) && (!team.names || !team.leagueSlug || m.leagueSlug === team.leagueSlug))
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  return { name: team.name, matches, place: team.league }
}

function TeamCard({ slug, now, onUnfollow }: { slug: string; now: number; onUnfollow: () => void }) {
  const data = matchesOf(slug, now)
  if (!data) return null
  const { name, matches, place } = data
  const live = matches.find((m) => m.state === 'live')
  const next = matches.find((m) => m.state === 'upcoming' && m.kickoff.getTime() > now)
  const last = [...matches].reverse().find((m) => m.state === 'finished')
  const against = (m: Match) => (m.home.name === name ? `${m.away.name} (h)` : `${m.home.name} (u)`)
  const outcome = last && outcomeFor(last, name)
  return (
    <li className={`my-team${live ? ' is-live' : ''}`}>
      <div className="my-team__head">
        <TeamBadge name={name} size={36} />
        <span className="my-team__name">
          <Link href={paths.club(slug)}>{name}</Link>
          {place && <em>{place}</em>}
        </span>
        <button type="button" className="my-team__remove" onClick={onUnfollow} aria-label={`Følg ikke længere ${name}`} title="Følg ikke længere">
          ★
        </button>
      </div>
      {live ? (
        <Link className="my-team__row my-team__row--live" href={paths.match(live.slug)}>
          <span className="live-dot" aria-hidden />
          <span>
            {live.home.name} {live.home.score ?? 0}–{live.away.score ?? 0} {live.away.name}
          </span>
          <strong>{live.statusLabel ?? 'Live'}</strong>
        </Link>
      ) : next ? (
        <Link className="my-team__row" href={paths.match(next.slug)}>
          <span className="my-team__label">Næste</span>
          <span>mod {against(next)}</span>
          <strong>{until(next.kickoff, now)}</strong>
        </Link>
      ) : (
        <span className="my-team__row my-team__row--muted">Ingen kommende kampe i programmet</span>
      )}
      {last && (
        <Link className="my-team__row" href={paths.match(last.slug)}>
          <span className="my-team__label">Senest</span>
          <span>
            {last.home.name === name ? last.home.score : last.away.score}–{last.home.name === name ? last.away.score : last.home.score} mod {against(last)}
          </span>
          {outcome && <span className={`outcome outcome--${outcome}`}>{outcome}</span>}
        </Link>
      )}
    </li>
  )
}

/** The front page's "Mine hold": a card for each team the visitor follows, or suggestions to follow some */
export function MyTeams({ now }: { now: number }) {
  const { teams, loaded, toggle } = useFavoriteTeams()
  const [hintHidden, setHintHidden] = usePersistentState('myTeamsHintHidden', false)
  if (!loaded) return null

  if (!teams.length) {
    if (hintHidden) return null
    const suggestions = seasonClubs()
      .filter(({ division }) => division.id === 'superliga')
      .slice(0, 12)
    if (!suggestions.length) return null
    return (
      <section className="my-teams my-teams--hint" aria-label="Følg dine hold">
        <header className="my-teams__head">
          <h2>Følg dine hold</h2>
          <span>Få næste kamp, live-stilling og seneste resultat øverst – tryk på et hold</span>
          <button type="button" className="text-btn" onClick={() => setHintHidden(true)} aria-label="Skjul">
            ✕
          </button>
        </header>
        <ul className="my-teams__suggest">
          {suggestions.map(({ club }) => (
            <li key={club.slug}>
              <button type="button" onClick={() => toggle(club.slug)}>
                <TeamBadge link={false} name={club.name} colors={club.colors} size={28} />
                <span>{club.name}</span>
                <span aria-hidden>☆</span>
              </button>
            </li>
          ))}
        </ul>
        <Link className="my-teams__more" href={paths.clubs()}>
          Find andre hold under Klubber →
        </Link>
      </section>
    )
  }

  return (
    <section className="my-teams" aria-label="Mine hold">
      <header className="my-teams__head">
        <h2>Mine hold</h2>
        <Link href={paths.clubs()}>Følg flere</Link>
      </header>
      <ul className="my-teams__list">
        {teams.map((slug) => (
          <TeamCard key={slug} slug={slug} now={now} onUnfollow={() => toggle(slug)} />
        ))}
      </ul>
    </section>
  )
}
