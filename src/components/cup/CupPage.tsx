import type { ReactNode } from 'react'
import Link from 'next/link'
import type { ExternalLeague } from '../../lib/apisports'
import type { TableRow, Leaders } from '../../data/matchExtra'
import type { Match } from '../../types'
import type { LeagueStats as LeagueStatsData } from '../../data/stats'
import type { BracketRound } from '../../lib/bracket'
import type { CupView } from '../../lib/cupView'
import type { CupInfo } from '../../data/cupInfo'
import { TeamBadge } from '../TeamBadge'
import { MatchRow } from '../MatchRow'
import { LiveNow } from '../LiveNow'
import { Updated } from '../Updated'
import { CalendarButton } from '../CalendarButton'
import { KnockoutBracket } from '../KnockoutBracket'
import { LeagueStats } from '../LeagueStats'
import { LeagueLeaders } from '../LeagueLeaders'
import { LeagueBriefBox } from '../league/LeagueDeepBoxes'
import { AboutText } from '../AboutText'
import { AdSlot } from '../AdSlot'
import { Faq } from '../Faq'
import { danishCountry } from '../../data/countries'
import { paths, SITE_URL } from '../../lib/site'
import { JsonLd, absoluteImage, breadcrumbLd, faqLd, webPageLd } from '../../lib/jsonld'
import { formatDayMonth, formatTime, formatWeekday, isoDate } from '../../lib/time'
import { counted } from '../../lib/words'

// A cup's page in the league pages' design (the FA Cup, the EFL Trophy): the season at a glance on the dark
// field, the round being played, the groups when there are some, the bracket once the last rounds are near,
// every round's results, the top scorers, the facts and history, and the questions people ask.

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const dayText = (iso: string | number) => `${formatWeekday(isoDate(new Date(iso)))} ${formatDayMonth(isoDate(new Date(iso)))}`
/** "7.–11. dec." for a round spread over days, "lør 7. nov." for one day */
const span = (from: number, to: number) => (isoDate(new Date(from)) === isoDate(new Date(to)) ? dayText(from) : `${formatDayMonth(isoDate(new Date(from)))} – ${formatDayMonth(isoDate(new Date(to)))}`)

interface Props {
  league: ExternalLeague
  view: CupView
  info?: CupInfo
  /** The group tables (EFL Trophy), from the source */
  groups?: TableRow[][]
  /** Our own group tables lack a shoot-out's extra point somewhere (its score has not come yet) */
  groupsUnsure?: boolean
  bracket?: BracketRound[]
  stats?: LeagueStatsData
  leaders?: Leaders
  upcoming: Match[]
  now: number
  news?: ReactNode
}

function CupHero({ league, view, info, stats }: Pick<Props, 'league' | 'view' | 'info' | 'stats'>) {
  const { current, status } = view
  const done = view.rounds.length ? view.rounds.filter((r) => r.played === r.total).length : 0
  const top = view.scorers[0]
  return (
    <header className="lx-hero cx-hero" style={{ '--lx-c': '#2c3a0c' } as React.CSSProperties}>
      <span className="lx-hero__m" aria-hidden>
        M
      </span>
      <div className="lx-hero__head">
        <span className="lx-hero__logo">
          <TeamBadge link={false} name={league.name} src={league.logo} colors={['#0f110c', '#c6f135']} size={60} />
        </span>
        <div>
          <span className="lx-hero__kicker">
            {danishCountry(league.country)} · Pokalturnering · Sæson 2026/27
          </span>
          <h1 className="lx-hero__title">{league.name}</h1>
        </div>
      </div>
      {view.rounds.length > 0 && (
        <ol className="cx-hero__path" aria-label="Runderne">
          {view.rounds.map((r) => (
            <li key={r.raw} className={r === current ? 'is-now' : r.played === r.total ? 'is-done' : undefined}>
              {r.name}
            </li>
          ))}
          {info?.dates
            .filter((d) => !view.rounds.some((r) => r.name === d.name))
            .map((d) => (
              <li key={d.name}>{d.name}</li>
            ))}
        </ol>
      )}
      <div className="lx-hero__cards">
        {current && (
          <div className="lx-hero__leader">
            <span>
              <em>{current.played === current.total ? 'Seneste runde' : 'Runden nu'}</em>
              <b>{current.name}</b>
              <small>
                {current.played} af {counted(current.total, 'kamp', 'kampe')} spillet
              </small>
            </span>
            <strong className="cx-hero__teams">
              {view.teamsInRound}
              <small>hold</small>
            </strong>
          </div>
        )}
        {stats && (
          <div className="lx-hero__num">
            <strong>{one(stats.goalsPerMatch)}</strong>
            <span>gns. mål pr. kamp</span>
          </div>
        )}
        {view.biggestWin ? (
          <Link className="lx-hero__card" href={view.biggestWin.slug ? paths.match(view.biggestWin.slug) : '#resultater'}>
            <span>
              <em>Største sejr</em>
              <b>
                {view.biggestWin.home} – {view.biggestWin.away}
              </b>
              <small>{done ? `${counted(view.played, 'kamp', 'kampe')} spillet` : ''}</small>
            </span>
            <strong>
              {view.biggestWin.score[0]}-{view.biggestWin.score[1]}
            </strong>
          </Link>
        ) : (
          info && (
            <div className="lx-hero__card">
              <span>
                <em>Forsvarende mester</em>
                <b>{info.holder.name}</b>
                <small>Finalen {info.holder.season}: {info.holder.final}</small>
              </span>
            </div>
          )
        )}
        {top ? (
          <div className="lx-hero__card">
            <TeamBadge link={false} name={top.team} src={top.logo} size={34} />
            <span>
              <em>Topscorer</em>
              <b>{top.name}</b>
              <small>{top.team}</small>
            </span>
            <strong>{top.goals}</strong>
          </div>
        ) : (
          info && (
            <div className="lx-hero__card">
              <span>
                <em>Forsvarende mester</em>
                <b>{info.holder.name}</b>
                <small>{info.holder.final}</small>
              </span>
            </div>
          )
        )}
      </div>
      {status.kind === 'live' ? (
        <span className="lx-hero__status is-live">
          <i aria-hidden /> {counted(status.count, 'kamp', 'kampe')} i gang nu
        </span>
      ) : status.kind === 'next' ? (
        <Link className="lx-hero__status" href={paths.match(status.slug)}>
          <b>Næste kamp</b>
          {status.home} – {status.away} · {dayText(status.kickoff)} kl. {formatTime(new Date(status.kickoff))}
          {status.round && ` · ${status.round}`}
        </Link>
      ) : (
        (() => {
          const next = info?.dates.find((d) => Date.parse(d.date) > Date.now())
          return next ? (
            <span className="lx-hero__status">
              <b>Næste runde</b>
              {next.name} spilles {next.week ? `i ugen fra ${dayText(next.date)}` : dayText(next.date)}
            </span>
          ) : null
        })()
      )}
    </header>
  )
}

function GroupTable({ rows }: { rows: TableRow[] }) {
  const name = rows[0]?.group
  return (
    <div className="cx-group">
      {name && <h3 className="cx-group__name">{name}</h3>}
      <table className="cx-group__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Hold</th>
            <th className="num">K</th>
            <th className="num">+/-</th>
            <th className="num">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={r.rank <= 2 ? 'is-through' : undefined}>
              <td>{r.rank}</td>
              <td>
                <span className="cx-group__team">
                  <TeamBadge link={false} name={r.name} src={r.logo} size={20} />
                  {r.name}
                </span>
              </td>
              <td className="num">{r.played}</td>
              <td className="num">{r.for !== undefined && r.against !== undefined ? `${r.for - r.against > 0 ? '+' : ''}${r.for - r.against}` : ''}</td>
              <td className="num">
                <b>{r.points ?? ''}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoundSection({ name, matches, sub, open }: { name: string; matches: Match[]; sub?: string; open?: boolean }) {
  // A big round (the qualifying rounds have up to 160 games): the first ones, the rest behind a click
  const SHOW = 12
  return (
    <section className="league">
      <header className="league__header">
        <div className="league__toggle">
          <span className="league__titles">
            {sub && <span className="league__country">{sub}</span>}
            <h2 className="league__name">{name}</h2>
          </span>
        </div>
      </header>
      <ul className="league__matches">
        {matches.slice(0, open ? matches.length : SHOW).map((m) => (
          <MatchRow key={m.id} match={m} showDate />
        ))}
      </ul>
      {!open && matches.length > SHOW && (
        <details className="cx-more">
          <summary>Vis alle {matches.length} kampe</summary>
          <ul className="league__matches">
            {matches.slice(SHOW).map((m) => (
              <MatchRow key={m.id} match={m} showDate />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

export function CupPage({ league, view, info, groups, groupsUnsure, bracket, stats, leaders, upcoming, now, news }: Props) {
  const path = paths.league(league.key)
  const current = view.current
  const earlier = view.rounds.filter((r) => r !== current && r.played > 0).reverse()
  // Kort fortalt: where the cup is, in short sentences from the games
  const brief = [
    current && `${league.name} er nået til ${current.name.toLowerCase()} med ${counted(view.teamsInRound, 'hold', 'hold')}${current.played < current.total ? ` – ${current.played} af ${current.total} kampe er spillet` : ''}.`,
    view.played > 0 && `${counted(view.played, 'kamp', 'kampe')} er spillet i sæsonen med ${counted(view.goals, 'mål', 'mål')} i alt${stats ? ` (${one(stats.goalsPerMatch)} pr. kamp)` : ''}.`,
    view.biggestWin && `Største sejr: ${view.biggestWin.home} – ${view.biggestWin.away} ${view.biggestWin.score[0]}-${view.biggestWin.score[1]}.`,
    view.mostGoals && view.mostGoals !== view.biggestWin && view.mostGoals.score[0] + view.mostGoals.score[1] >= 6 && `Flest mål i én kamp: ${view.mostGoals.home} – ${view.mostGoals.away} ${view.mostGoals.score[0]}-${view.mostGoals.score[1]}.`,
    view.scorers[0] && `Topscorer: ${view.scorers[0].name} (${view.scorers[0].team}) med ${counted(view.scorers[0].goals, 'mål', 'mål')}.`,
    info && `Forsvarende mester er ${info.holder.name}, der vandt finalen i ${info.holder.season} ${info.holder.final}.`,
  ].filter((x): x is string => !!x)
  // The questions: those that follow the games first, then the fixed ones
  const next = view.status.kind === 'next' ? view.status : undefined
  const comingDate = info?.dates.find((d) => Date.parse(d.date) > now)
  const faq = [
    current && {
      q: `Hvor langt er ${league.name} nået?`,
      a: `${league.name} er nået til ${current.name.toLowerCase()}, hvor ${counted(view.teamsInRound, 'hold', 'hold')} er med. ${current.played} af ${current.total} kampe i runden er spillet.`,
    },
    (next || comingDate) && {
      q: `Hvornår spilles næste kamp i ${league.name}?`,
      a: next
        ? `Næste kamp er ${next.home} – ${next.away} ${dayText(next.kickoff)} kl. ${formatTime(new Date(next.kickoff))}${next.round ? ` (${next.round.toLowerCase()})` : ''}.`
        : `${comingDate!.name} spilles ${comingDate!.week ? `i ugen fra ${dayText(comingDate!.date)}` : dayText(comingDate!.date)}.`,
    },
    view.scorers[0] && {
      q: `Hvem er topscorer i ${league.name}?`,
      a: `${view.scorers[0].name} fra ${view.scorers[0].team} fører med ${counted(view.scorers[0].goals, 'mål', 'mål')} i de kampe, vi har målscorere fra.`,
    },
    ...(info?.faq ?? []),
  ].filter((x): x is { q: string; a: string } => !!x)
  return (
    <div className="page">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SportsEvent',
          name: `${league.name} 2026/27`,
          sport: 'Fodbold',
          eventStatus: 'https://schema.org/EventScheduled',
          location: { '@type': 'Country', name: danishCountry(league.country) },
          url: `${SITE_URL}${path}`,
          ...(league.logo && { image: absoluteImage(league.logo) }),
          ...(view.rounds[0] && { startDate: new Date(view.rounds[0].first).toISOString() }),
          ...(info?.dates.at(-1) && { endDate: info.dates.at(-1)!.date }),
        }}
      />
      <JsonLd data={webPageLd(path, league.name, new Date(now))} />
      <JsonLd data={breadcrumbLd([{ name: 'Kampe', path: '/' }, { name: league.name, path }])} />
      {faqLd(faq) && <JsonLd data={faqLd(faq)!} />}
      <div className="clubs">
        <div className="clubs__head">
          <CupHero league={league} view={view} info={info} stats={stats} />
        </div>

        <Updated at={now} />
        <CalendarButton kind="turnering" slug={league.key} name={league.name} />
        <LiveNow matches={upcoming} />

        <div className="table-duo">
          <div className="table-duo__main">
            {current && current.played < current.total && (
              <RoundSection
                name={current.name}
                sub={`${span(current.first, current.last)} · ${current.played} af ${current.total} kampe spillet`}
                matches={[...current.matches].sort((a, b) => Number(a.state === 'finished') - Number(b.state === 'finished') || a.kickoff.getTime() - b.kickoff.getTime())}
              />
            )}

            {groups && groups.length > 0 && (
              <section className="panel cx-groups" id="grupper">
                <header className="table-panel__head">
                  <h2 className="panel__title">Grupperne</h2>
                </header>
                <p className="muted small cx-groups__note">
                  Nr. 1 og 2 går videre. Uafgjort afgøres på straffespark, og vinderen får et ekstra point.
                  {groupsUnsure && ' Enkelte straffesparkskonkurrencer mangler endnu i vores data, så et ekstra point kan mangle.'}
                </p>
                <div className="cx-groups__grid">
                  {groups.map((g, i) => (
                    <GroupTable key={g[0]?.group ?? i} rows={g} />
                  ))}
                </div>
              </section>
            )}

            {bracket && bracket.length > 1 && <KnockoutBracket rounds={bracket} />}

            <section className="panel cx-plan" id="runder">
              <header className="table-panel__head">
                <h2 className="panel__title">Sæsonens runder</h2>
              </header>
              <ol className="cx-plan__list">
                {view.rounds.map((r) => (
                  <li key={r.raw} className={r === current ? 'is-now' : r.played === r.total ? 'is-done' : undefined}>
                    <span className="cx-plan__name">{r.name}</span>
                    <span className="cx-plan__date">{span(r.first, r.last)}</span>
                    <span className="cx-plan__count">
                      {r.played === r.total ? `${counted(r.total, 'kamp', 'kampe')} spillet` : `${r.played} af ${r.total} spillet`}
                    </span>
                  </li>
                ))}
                {info?.dates
                  .filter((d) => !view.rounds.some((r) => r.name === d.name))
                  .map((d) => (
                    <li key={d.name}>
                      <span className="cx-plan__name">{d.name}</span>
                      <span className="cx-plan__date">{d.week ? `Ugen fra ${formatDayMonth(d.date)}` : dayText(d.date)}</span>
                      <span className="cx-plan__count">Kommende</span>
                    </li>
                  ))}
              </ol>
            </section>

            <div id="resultater" className="cx-results">
              {earlier.map((r, i) => (
                <RoundSection key={r.raw} name={r.name} sub={span(r.first, r.last)} matches={[...r.matches].sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime())} open={i === 0 && r.matches.length <= 24} />
              ))}
            </div>

            <LeagueStats stats={stats} sport={league.sport} leaders={leaders} />
            {news}
          </div>

          <aside className="cx-side">
            {leaders && <LeagueLeaders leaders={leaders} league={league.name} />}
            {info && (
              <section className="panel cx-facts">
                <header className="table-panel__head">
                  <h2 className="panel__title">Fakta om {league.name}</h2>
                </header>
                <dl>
                  {info.facts.map((f) => (
                    <div key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </aside>
        </div>

        <AdSlot placement="feed" />
        <LeagueBriefBox items={brief} title={`${league.name} kort fortalt`} />
        {info && <AboutText title={`Om ${league.name}`} paragraphs={info.about} />}
        <AdSlot placement="content" />
        <Faq items={faq} />
        <p className="muted small">
          <Link href="/">Se alle dagens kampe</Link>.
        </p>
      </div>
    </div>
  )
}
