import { BOOKMAKER, RESPONSIBLE_GAMBLING } from '../data/partners'
import { channelsFor } from '../data/channels'
import { formatOdds, oddsFor, type Odds } from '../data/odds'
import type { Match } from '../types'
import { PartnerLogo } from './PartnerLogo'

/**
 * The channel in match lists: a channel with a logo file is shown large next to
 * the score ('logo'); one without is shown by name under the kickoff time ('name').
 */
export function MatchChannel({ match, only, small }: { match: Match; only: 'logo' | 'name'; small?: boolean }) {
  const [channel] = channelsFor(match)
  if (!channel) return null
  return (
    <span className={`match__channel match__channel--${only}${small ? ' match__channel--small' : ''}`} title={`Vises på ${channel.name}`}>
      <PartnerLogo partner={channel} kind="kanal" height={only === 'logo' ? (small ? 26 : 32) : 12} only={only} />
    </span>
  )
}

/** 1 X 2 odds in the right-hand column of a match row; the bookmaker is shown in the league header */
export function MatchOdds({ odds }: { odds: Odds }) {
  return (
    <span className="match__odds" aria-label="Odds">
      <OddsChip label="1" value={odds.home} />
      {odds.draw && <OddsChip label="X" value={odds.draw} />}
      <OddsChip label="2" value={odds.away} />
    </span>
  )
}

/** "Odds fra <bookmaker>" for league headers */
export function OddsBy() {
  return (
    <span className="odds-by">
      <span className="odds-by__text" title="Odds er eksempler, indtil en bookmaker-aftale er på plads">Eksempel-odds fra</span> <PartnerLogo partner={BOOKMAKER} kind="bookmaker" height={14} />
    </span>
  )
}

function OddsChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="odds-chip">
      <em>{label}</em>
      {formatOdds(value)}
    </span>
  )
}

function TvIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 21h8M9 2l3 4 3-4" />
    </svg>
  )
}

/** Odds and TV box on the match page */
export function MatchExtrasPanel({ match, withChannels = true }: { match: Match; withChannels?: boolean }) {
  const channels = withChannels ? channelsFor(match) : []
  const odds = oddsFor(match)
  const tvLabel = match.state === 'finished' ? 'Blev vist på' : match.state === 'live' ? 'Vises nu på' : 'Vises på'
  if (!channels.length && !odds) return null
  return (
    <section className="extras-panel" aria-label="Odds og TV">
      {channels.length > 0 && (
        <div className="extras-panel__tv">
          <span className="extras-panel__label">
            <TvIcon /> {tvLabel}
          </span>
          <span className="extras-panel__channels">
            {channels.map((c) => (
              <PartnerLogo key={c.id} partner={c} kind="kanal" height={40} />
            ))}
          </span>
        </div>
      )}
      {odds && (
        <div className="extras-panel__odds">
          <div className="extras-panel__odds-head">
            <span className="extras-panel__label">Eksempel-odds</span>
            <PartnerLogo partner={BOOKMAKER} kind="bookmaker" height={24} />
          </div>
          <div className="odds-grid" style={{ gridTemplateColumns: `repeat(${odds.draw ? 3 : 2}, 1fr)` }}>
            <OddsBox label="1" team={match.home.name} value={odds.home} />
            {odds.draw && <OddsBox label="X" team="Uafgjort" value={odds.draw} />}
            <OddsBox label="2" team={match.away.name} value={odds.away} />
          </div>
          {match.sport === 'ice_hockey' && <p className="extras-panel__note">Gælder resultatet efter ordinær tid.</p>}
          <a className="extras-panel__rg" href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener">
            {RESPONSIBLE_GAMBLING.text}
          </a>
        </div>
      )}
    </section>
  )
}

function OddsBox({ label, team, value }: { label: string; team: string; value: number }) {
  return (
    <div className="odds-box">
      <span className="odds-box__label">
        {label} <em>{team}</em>
      </span>
      <strong>{formatOdds(value)}</strong>
    </div>
  )
}
