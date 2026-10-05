import type { CSSProperties } from 'react'
import Link from 'next/link'
import { formatLong, formatTime } from '../lib/time'
import { sizedImage } from '../lib/imageSize'
import { KlubCountdown, KlubFollow } from './KlubHeaderClient'

// The club page's header, the same for every club, in three layers: the hero (logo, league and
// town, the name, two slanted stripes in the club's colour), the club's own row of the table with
// its form and next match, and the menu to the page's sections. Drawn on the server; only the
// countdown and the follow button run in the browser (KlubHeaderClient). Every field without data
// is left out, never shown empty. Styles: ".kh" in globals.css.

export interface KlubHeaderRow {
  position?: number
  played?: number
  won?: number
  drawn?: number
  lost?: number
  points?: number
}

export interface KlubHeaderProps {
  name: string
  slug: string
  /** The club's logo (our own picture address); left out when we have none */
  logo?: string
  league: { name: string; href?: string }
  /** The club's town (or the country, for a team outside our leagues) */
  place?: string
  /** The club's colour for the stripes and the line (src/data/klubfarver.ts) */
  color: string
  row?: KlubHeaderRow
  /** The latest results in the club's own league, oldest first */
  form?: ('V' | 'U' | 'T')[]
  /** The club's next match (its own team and sport only) */
  next?: { opponent: string; home: boolean; kickoff: Date; href?: string }
  /** The page's sections that exist, in the order of the menu */
  sections: { id: string; label: string }[]
  calendarHref?: string
  ticketHref?: string
  /** A short note under the name (the club's league this season is not confirmed) */
  note?: string
  now: number
}

const FIELDS: { key: keyof KlubHeaderRow; label: string; short: string }[] = [
  { key: 'position', label: 'Nr.', short: 'Nr.' },
  { key: 'played', label: 'Kampe', short: 'K' },
  { key: 'won', label: 'Vundet', short: 'V' },
  { key: 'drawn', label: 'Uafgjort', short: 'U' },
  { key: 'lost', label: 'Tabt', short: 'T' },
  { key: 'points', label: 'Point', short: 'P' },
]
const RESULT: Record<'V' | 'U' | 'T', string> = { V: 'Vundet', U: 'Uafgjort', T: 'Tabt' }

export function KlubHeader({ name, slug, logo, league, place, color, row, form, next, sections, calendarHref, ticketHref, note, now }: KlubHeaderProps) {
  const fields = FIELDS.filter((f) => row?.[f.key] !== undefined)
  const latest = (form ?? []).slice(-5)
  // Unbeaten in every match of the season so far
  const unbeaten = row?.lost === 0 && (row.played ?? 0) > 0 ? row.played : undefined
  const words = name.split(/\s+/)
  // The name's length sets its size, so a long name ("FC Nordsjælland") stops short of the stripes (see .kh-name)
  const style = { '--kh-club': color, '--kh-n': Math.max(3, name.length), '--kh-w': Math.max(3, ...words.map((w) => w.length)) } as CSSProperties
  const hasStrip = fields.length > 0 || latest.length > 0 || !!next
  return (
    <header className="kh" id="oversigt" style={style}>
      <div className="kh-hero">
        <span className="kh-stripe kh-stripe--thin" aria-hidden />
        <span className="kh-stripe kh-stripe--wide" aria-hidden />
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts, through our own picture addresses
          <img className="kh-logo" src={sizedImage(logo, 130)} alt={`${name} logo`} width={130} height={130} />
        )}
        <div className="kh-id">
          <p className="kh-league">
            {league.href ? <Link href={league.href}>{league.name}</Link> : league.name}
            {place && ` · ${place}`}
          </p>
          <h1 className="kh-name">{name}</h1>
          {note && <p className="kh-note">{note}</p>}
        </div>
      </div>

      {hasStrip && (
        <div className="kh-strip">
          {fields.length > 0 && (
            <dl className="kh-row" aria-label={`${name} i stillingen`}>
              {fields.map((f) => (
                <div key={f.key} className={f.key === 'points' ? 'kh-field kh-field--points' : 'kh-field'}>
                  <dt className="kh-label">
                    <span className="kh-wide">{f.label}</span>
                    <abbr className="kh-narrow" title={f.label}>
                      {f.short}
                    </abbr>
                  </dt>
                  <dd className="kh-value">{row![f.key]}</dd>
                </div>
              ))}
            </dl>
          )}
          {(latest.length > 0 || next) && (
            <div className="kh-extras">
              {latest.length > 0 && (
                <div className="kh-extra">
                  <span className="kh-label">Seneste {latest.length === 5 ? 'fem' : latest.length}</span>
                  <span className="kh-form">
                    {latest.map((f, i) => (
                      <span key={i} className={`kh-chip kh-chip--${f}`} title={RESULT[f]}>
                        <span aria-hidden>{f}</span>
                        <span className="visually-hidden">{RESULT[f]}</span>
                      </span>
                    ))}
                  </span>
                  {unbeaten !== undefined && (
                    <span className="kh-note">
                      Ubesejret i {unbeaten} {unbeaten === 1 ? 'kamp' : 'kampe'}
                    </span>
                  )}
                </div>
              )}
              {next && (
                <div className="kh-extra">
                  <span className="kh-label">
                    Næste kamp, {formatLong(next.kickoff)} kl. {formatTime(next.kickoff)}
                  </span>
                  <span className="kh-text">
                    {next.href ? (
                      <Link href={next.href} prefetch={false}>
                        {next.opponent}
                      </Link>
                    ) : (
                      next.opponent
                    )}
                    , {next.home ? 'hjemme' : 'ude'}
                  </span>
                </div>
              )}
              {next && <KlubCountdown kickoff={next.kickoff.getTime()} initialNow={now} />}
            </div>
          )}
        </div>
      )}

      <div className="kh-menu">
        <nav className="kh-nav" aria-label={`Sektioner på siden om ${name}`}>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} data-kh={s.id}>
              {s.label}
            </a>
          ))}
        </nav>
        <div className="kh-actions">
          {calendarHref && (
            <a className="kh-action" href={calendarHref}>
              Kampe i kalender
            </a>
          )}
          {ticketHref && (
            <a className="kh-action" href={ticketHref} target="_blank" rel="sponsored nofollow noopener">
              Billetter
            </a>
          )}
          <KlubFollow slug={slug} name={name} />
        </div>
      </div>
    </header>
  )
}
