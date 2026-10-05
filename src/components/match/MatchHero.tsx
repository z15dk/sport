import Link from 'next/link'
import type { Match } from '../../types'
import type { ClubStats } from '../../data/matchInsights'
import type { Partner } from '../../data/partners'
import { paths } from '../../lib/site'
import { formatFull, formatTime } from '../../lib/time'
import { teamByName } from '../../data/teams'
import { TeamBadge } from '../TeamBadge'
import { FormChips } from '../FormChips'
import { PartnerLogo } from '../PartnerLogo'

// The match page's top: both clubs large on a dark field lit in their colours, the time left to kick-off (or the
// score while it is played and after), and around it what a reader asks first – where, when, on which channel.

/** "om 3 dage", "om 5 t 12 min", "om 8 min" until kick-off */
function countdown(kickoff: number, now: number): { big: string; small: string } | undefined {
  const left = kickoff - now
  if (left <= 0) return undefined
  const min = Math.floor(left / 60_000)
  const days = Math.floor(min / 1440)
  const hours = Math.floor((min % 1440) / 60)
  const mins = min % 60
  if (days >= 1) return { big: `${days}d ${hours}t`, small: days === 1 ? 'til kampstart · i morgen' : 'til kampstart' }
  if (hours >= 1) return { big: `${hours}t ${mins}m`, small: 'til kampstart' }
  return { big: `${mins} min`, small: 'til kampstart' }
}

function Side({ team, stats, form, league }: { team: Match['home']; stats?: ClubStats; form?: ('V' | 'U' | 'T')[]; league?: string }) {
  const club = teamByName(team.name, league)
  return (
    <div className="mx-hero__side">
      <span className="mx-hero__crest">
        <TeamBadge name={team.name} src={team.badge} colors={team.colors} size={84} league={league} />
      </span>
      {/* The size follows the longest word, so a long name never breaks inside a word */}
      <strong className="mx-hero__name" style={{ '--len': Math.max(4, ...team.name.split(/\s+/).map((w) => w.length)) } as React.CSSProperties}>{club ? <Link href={paths.club(club.slug)}>{team.name}</Link> : team.name}</strong>
      {stats && (
        <span className="mx-hero__pos">
          {stats.position}. plads · {stats.row.points} p
        </span>
      )}
      {form && form.length > 0 && <FormChips form={form} />}
    </div>
  )
}

export function MatchHero({
  match,
  now,
  homeStats,
  awayStats,
  form,
  channels,
  ticketHref,
}: {
  match: Match
  now: number
  homeStats?: ClubStats
  awayStats?: ClubStats
  form?: { home: ('V' | 'U' | 'T')[]; away: ('V' | 'U' | 'T')[] }
  channels: Partner[]
  ticketHref?: string
}) {
  const { home, away, state } = match
  const showScore = state === 'live' || state === 'finished'
  const left = state === 'upcoming' ? countdown(match.kickoff.getTime(), now) : undefined
  const glow = (c?: [string, string]) => (c?.[0] && c[0].toLowerCase() !== '#ffffff' ? c[0] : c?.[1])
  return (
    <header
      className={`mx-hero mx-hero--${state}`}
      style={{ '--mx-home': glow(home.colors) ?? '#2c3a0c', '--mx-away': glow(away.colors) ?? '#2c3a0c' } as React.CSSProperties}
    >
      <span className="mx-hero__m" aria-hidden>
        M
      </span>
      <div className="mx-hero__top">
        {match.leagueSlug ? <Link href={paths.league(match.leagueSlug)}>{match.league}</Link> : <span>{match.league}</span>}
        {!!match.round && <span>{match.round}. runde</span>}
      </div>
      <div className="mx-hero__row">
        <Side team={home} stats={homeStats} form={form?.home} league={match.leagueSlug} />
        <div className="mx-hero__center">
          {showScore ? (
            <>
              <span className={`mx-hero__score${state === 'live' ? ' is-live' : ''}`}>
                {home.score ?? 0}
                <i>–</i>
                {away.score ?? 0}
              </span>
              <span className={`mx-hero__status${state === 'live' ? ' is-live' : ''}`}>{match.statusLabel ?? (state === 'live' ? 'Live' : 'Slut')}</span>
            </>
          ) : (
            <>
              <span className="mx-hero__time">{formatTime(match.kickoff)}</span>
              {left ? (
                <span className="mx-hero__count">
                  <b>{left.big}</b> {left.small}
                </span>
              ) : (
                <span className="mx-hero__status">{match.statusLabel ?? 'Kommende'}</span>
              )}
            </>
          )}
        </div>
        <Side team={away} stats={awayStats} form={form?.away} league={match.leagueSlug} />
      </div>
      <div className="mx-hero__meta">
        <span>{formatFull(match.kickoff)}</span>
        {match.venue && <span>{match.venue}</span>}
      </div>
      {(channels.length > 0 || (ticketHref && state === 'upcoming')) && (
        <div className="mx-hero__actions">
          {channels.length > 0 && (
            <span className="mx-hero__tv">
              <span>{state === 'finished' ? 'Blev vist på' : state === 'live' ? 'Vises nu på' : 'Vises på'}</span>
              {channels.map((c) => (
                <PartnerLogo key={c.id} partner={c} kind="kanal" height={26} />
              ))}
            </span>
          )}
          {ticketHref && state === 'upcoming' && (
            <a className="mx-hero__tickets" href={ticketHref} target="_blank" rel="sponsored nofollow noopener">
              Køb billetter
            </a>
          )}
        </div>
      )}
    </header>
  )
}
