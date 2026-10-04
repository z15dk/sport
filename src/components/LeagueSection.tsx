'use client'

import Link from 'next/link'
import { Fragment, useState } from 'react'
import type { LeagueGroup } from '../types'
import { chunksWithAds, type FeedAdPlan } from '../data/ads'
import { AdSlot } from './AdSlot'
import { paths } from '../lib/site'
import { MatchRow } from './MatchRow'
import { competitionLabel } from '../data/leagues'
import { OddsBy } from './MatchExtras'
import { RESPONSIBLE_GAMBLING } from '../data/partners'
import { oddsEnabled } from '../data/odds'
import { TeamBadge } from './TeamBadge'
import { danishCountry } from '../data/countries'
import { sportById } from '../sports'

interface Props {
  group: LeagueGroup
  pinned: boolean
  onTogglePin: () => void
  /** Ads inside a long league's list (the front page's plan, src/data/ads.ts) */
  ads?: FeedAdPlan
  /** The list holds every sport: the sport is named beside the country */
  showSport?: boolean
}

export function LeagueSection({ group, pinned, onTogglePin, ads, showSport }: Props) {
  // Among every sport: which one, when it isn't football ("1. Division" in Denmark is handball as well as volleyball)
  const sport = showSport && group.matches[0] && group.matches[0].sport !== 'soccer' ? sportById(group.matches[0].sport).label : undefined
  const [open, setOpen] = useState(true)
  const liveCount = group.matches.filter((m) => m.state === 'live').length
  const hasOdds = oddsEnabled() && group.matches.some((m) => m.state === 'upcoming')

  return (
    <section className="league" id={`league-${group.leagueId}`}>
      <header className="league__header">
        <div className="league__toggle">
          <TeamBadge name={group.league} src={group.leagueBadge} size={28} label={competitionLabel(group.league)} />
          <span className="league__titles">
            {(group.country || sport) && <span className="league__country">{[group.country && danishCountry(group.country), sport].filter(Boolean).join(' · ')}</span>}
            {group.leagueSlug ? (
              <Link className="league__name" href={paths.league(group.leagueSlug)}>
                {group.league}
              </Link>
            ) : (
              <span className="league__name">{group.league}</span>
            )}
          </span>
          {liveCount > 0 && <span className="league__live">{liveCount} live</span>}
          {hasOdds ? <OddsBy /> : <span className="league__count">{group.matches.length} kampe</span>}
        </div>
        <button
          className={`chevron-btn${open ? ' is-open' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? `Skjul ${group.league}` : `Vis ${group.league}`}
        >
          ›
        </button>
        <button
          className={`star${pinned ? ' is-on' : ''}`}
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? `Fjern ${group.league} fra favoritter` : `Føj ${group.league} til favoritter`}
          title={pinned ? 'Fjern fra favoritter' : 'Føj til favoritter'}
        >
          {pinned ? '★' : '☆'}
        </button>
      </header>
      {open &&
        chunksWithAds(group.matches, ads ?? { inside: [] }).map((chunk, k) => (
          <Fragment key={k}>
            <ul className="league__matches">
              {chunk.rows.map((m) => (
                <MatchRow key={m.id} match={m} />
              ))}
            </ul>
            {chunk.ad && <AdSlot placement="feed" index={chunk.ad} className="ad--inside" />}
          </Fragment>
        ))}
      {open && hasOdds && (
        <a className="league__rg" href={RESPONSIBLE_GAMBLING.url} target="_blank" rel="noopener">
          {RESPONSIBLE_GAMBLING.text}
        </a>
      )}
    </section>
  )
}
