import Link from 'next/link'
import type { LeagueStats } from '../../data/stats'
import { formPoints, inForm, type LeagueDeep, type LeaguePlayer, type LeagueRow } from '../../data/leagueDeep'
import { paths } from '../../lib/site'
import { formatTime, isoDate, formatDayMonth, formatWeekday } from '../../lib/time'
import { counted } from '../../lib/words'
import { playerPath } from '../../data/player'
import { TeamBadge } from '../TeamBadge'
import { PlayerPhoto } from '../PlayerPhoto'
import { FormChips } from '../FormChips'

// The league page's top and its deeper boxes (src/data/leagueDeep.ts): the season at a glance on a dark field,
// "Kort fortalt", the clubs in form, attack against defence, the players in numbers and who is out.

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const dayText = (iso: string) => `${formatWeekday(isoDate(new Date(iso)))} ${formatDayMonth(isoDate(new Date(iso)))}`

function StatusLine({ deep }: { deep: LeagueDeep }) {
  const s = deep.status
  if (s.kind === 'live')
    return (
      <span className="lx-hero__status is-live">
        <i aria-hidden /> {counted(s.count, 'kamp', 'kampe')} i gang nu
      </span>
    )
  if (s.kind === 'over') return <span className="lx-hero__status">Grundspillet er færdigt</span>
  if (s.breakUntil) {
    const b = s.breakUntil
    const same = isoDate(new Date(b.from)) === isoDate(new Date(b.to))
    return (
      <span className="lx-hero__status is-break">
        <b>{b.international ? 'Landsholdspause' : 'Pause'}</b>
        {b.round ? `${b.round}. runde` : 'Næste runde'} spilles {same ? dayText(b.from) : `${dayText(b.from)} – ${dayText(b.to)}`}
      </span>
    )
  }
  return (
    <Link className="lx-hero__status" href={paths.match(s.slug)}>
      <b>Næste kamp</b>
      {s.home} – {s.away} · {dayText(s.kickoff)} kl. {formatTime(new Date(s.kickoff))}
      {s.channels.length > 0 && ` · ${s.channels.join(', ')}`}
    </Link>
  )
}

/** A club's name, linked to its page when it has one */
const ClubLink = ({ row, className, children }: { row: LeagueRow; className?: string; children: React.ReactNode }) =>
  row.href ? (
    <Link className={className} href={row.href}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  )

export function LeagueHero({
  title,
  kicker,
  logo,
  logoLabel,
  rows,
  stats,
  goalWord = 'mål',
  deep,
  topScorer,
  leaderLabel = 'Fører',
}: {
  /** "Flest point" in a tournament with groups, where no one leads the whole tournament */
  leaderLabel?: string
  title: string
  kicker: string
  logo?: string
  logoLabel?: string
  rows: LeagueRow[]
  stats?: LeagueStats
  goalWord?: string
  deep: LeagueDeep
  topScorer?: { name: string; club: string; goals: number; photo?: string }
}) {
  const leader = rows[0]
  const hot = inForm(rows)
  const { played, total } = deep.round
  const pct = total ? Math.min(100, Math.round((played / total) * 100)) : 0
  return (
    <header className="lx-hero" style={{ '--lx-c': leader?.colors?.[0] ?? '#2c3a0c' } as React.CSSProperties}>
      <span className="lx-hero__m" aria-hidden>
        M
      </span>
      <div className="lx-hero__head">
        <span className="lx-hero__logo">
          <TeamBadge link={false} name={title} src={logo} label={logoLabel} colors={['#0f110c', '#c6f135']} size={60} />
        </span>
        <div>
          <span className="lx-hero__kicker">{kicker}</span>
          <h1 className="lx-hero__title">{title}</h1>
        </div>
      </div>
      {total > 0 && played > 0 && (
        <div className="lx-hero__progress" aria-label={`Runde ${played} af ${total}`}>
          <span>
            Runde <b>{played}</b> af {total}
          </span>
          <i>
            <em style={{ width: `${pct}%` }} />
          </i>
        </div>
      )}
      <div className="lx-hero__cards">
        {leader && (
          <ClubLink row={leader} className="lx-hero__leader">
            <TeamBadge link={false} name={leader.name} src={leader.logo} colors={leader.colors} size={40} />
            <span>
              <em>{leaderLabel}</em>
              <b>{leader.name}</b>
            </span>
            <strong>{leader.points}</strong>
          </ClubLink>
        )}
        {stats && (
          <div className="lx-hero__num">
            <strong>{one(stats.goalsPerMatch)}</strong>
            <span>gns. {goalWord} pr. kamp</span>
          </div>
        )}
        {hot && (
          <ClubLink row={hot} className="lx-hero__card">
            <TeamBadge link={false} name={hot.name} src={hot.logo} colors={hot.colors} size={34} />
            <span>
              <em>Bedste form</em>
              <b>{hot.name}</b>
              <FormChips form={hot.form} />
            </span>
            <strong>{formPoints(hot.form)}</strong>
          </ClubLink>
        )}
        {topScorer && (
          <div className="lx-hero__card">
            <PlayerPhoto photo={topScorer.photo} team={topScorer.club} size={40} />
            <span>
              <em>Topscorer</em>
              <b>{topScorer.name}</b>
              <small>{topScorer.club}</small>
            </span>
            <strong>{topScorer.goals}</strong>
          </div>
        )}
      </div>
      <StatusLine deep={deep} />
    </header>
  )
}

export function LeagueBriefBox({ items, title = 'Kort fortalt' }: { items: string[]; title?: string }) {
  if (!items.length) return null
  return (
    <section className="panel lx-box lx-brief" aria-labelledby="lx-brief-title">
      <h2 id="lx-brief-title" className="panel__title">
        {title}
      </h2>
      <ul>
        {items.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </section>
  )
}


/** The clubs by points in their last five matches */
export function FormTableBox({ rows }: { rows: LeagueRow[] }) {
  if (Math.max(0, ...rows.map((r) => r.form.length)) < 3) return null
  const sorted = [...rows].sort((a, b) => formPoints(b.form) - formPoints(a.form) || b.points - a.points)
  const max = Math.max(1, Math.min(5, Math.max(...rows.map((r) => r.form.length))) * 3)
  return (
    <section className="panel lx-box" aria-labelledby="lx-form-title">
      <h2 id="lx-form-title" className="panel__title">
        Formtabellen
      </h2>
      <p className="muted small">Point i de seneste fem kampe.</p>
      <ol className="lx-form">
        {sorted.map((r, i) => (
          <li key={r.key}>
            <span className="lx-form__pos">{i + 1}</span>
            <ClubLink row={r} className="lx-form__club">
              <TeamBadge link={false} name={r.name} src={r.logo} colors={r.colors} size={22} />
              <span>{r.name}</span>
            </ClubLink>
            <FormChips form={r.form} />
            <span className="lx-form__bar">
              <i style={{ width: `${(formPoints(r.form) / max) * 100}%` }} />
            </span>
            <b>{formPoints(r.form)}</b>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Goals for and against for every club, in the table's order */
export function AttackDefenceBox({ rows }: { rows: LeagueRow[] }) {
  if (rows.length < 2 || !rows.some((r) => r.goalsFor || r.goalsAgainst)) return null
  const max = Math.max(1, ...rows.flatMap((r) => [r.goalsFor, r.goalsAgainst]))
  return (
    <section className="panel lx-box" aria-labelledby="lx-ad-title">
      <h2 id="lx-ad-title" className="panel__title">
        Angreb og forsvar
      </h2>
      <div className="lx-ad__legend">
        <span>
          <i className="is-for" /> Mål scoret
        </span>
        <span>
          <i className="is-against" /> Mål imod
        </span>
      </div>
      <ul className="lx-ad">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="lx-ad__club">
              <TeamBadge link={false} name={r.name} src={r.logo} colors={r.colors} size={20} />
              <span>{r.name}</span>
            </span>
            <span className="lx-ad__bars">
              <span>
                <i className="is-for" style={{ width: `${(r.goalsFor / max) * 100}%` }} />
                <b>{r.goalsFor}</b>
              </span>
              <span>
                <i className="is-against" style={{ width: `${(r.goalsAgainst / max) * 100}%` }} />
                <b>{r.goalsAgainst}</b>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PlayerList({ title, list, value }: { title: string; list: LeaguePlayer[]; value: (p: LeaguePlayer) => string }) {
  if (!list.length) return null
  return (
    <div className="lx-players__list">
      <h3>{title}</h3>
      <ol>
        {list.map((p, i) => (
          <li key={p.id}>
            <span className="lx-players__pos">{i + 1}</span>
            <PlayerPhoto photo={p.photo} team={p.club} size={34} />
            <span className="lx-players__who">
              <Link href={playerPath(p.id, p.name)} rel="nofollow" prefetch={false}>
                {p.name}
              </Link>
              <em>{p.club}</em>
            </span>
            <b>{value(p)}</b>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function LeaguePlayersBox({ deep, league }: { deep: LeagueDeep; league: string }) {
  const p = deep.players
  if (!p) return null
  return (
    <section className="panel lx-box" id="spillere" aria-labelledby="lx-players-title">
      <h2 id="lx-players-title" className="panel__title">
        Spillerne i tal
      </h2>
      <div className="lx-players">
        <PlayerList title="Bedste karakter" list={p.rating} value={(x) => one(x.rating ?? 0)} />
        <PlayerList title="Flest chancer skabt" list={p.chances} value={(x) => String(x.keyPasses)} />
        <PlayerList title="Flest redninger" list={p.saves} value={(x) => String(x.saves)} />
        <PlayerList title="Flest skud på mål" list={p.shotsOn} value={(x) => String(x.shotsOn)} />
      </div>
      <p className="muted small">Ligakampe i {league} denne sæson. Karakter: gennemsnit for spillere med mindst halvdelen af holdets kampe.</p>
    </section>
  )
}

export function LeagueOutBox({ deep }: { deep: LeagueDeep }) {
  if (!deep.out?.length) return null
  return (
    <section className="panel lx-box" aria-labelledby="lx-out-title">
      <h2 id="lx-out-title" className="panel__title">
        Skader og karantæner
      </h2>
      <p className="muted small">Meldt ude eller usikre til kampene de næste ti dage.</p>
      <div className="lx-out">
        {deep.out.map((c) => (
          <div key={c.club}>
            <h3>
              <TeamBadge name={c.club} size={20} />
              {c.club}
            </h3>
            <ul>
              {c.players.map((p) => (
                <li key={p.name}>
                  <PlayerPhoto photo={p.photo} team={c.club} size={28} />
                  <span>
                    <b>{p.name}</b>
                    <em>{p.reason}</em>
                  </span>
                  <i className={p.doubtful ? 'is-doubt' : undefined}>{p.doubtful ? 'Usikker' : 'Ude'}</i>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
