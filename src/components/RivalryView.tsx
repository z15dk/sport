import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { Rivalry } from '../lib/rivalry'
import { rivalryStats, type Outcome, type RivalryStats } from '../lib/rivalryStats'
import type { ClubStats, PastMatch } from '../data/matchInsights'
import { JsonLd, breadcrumbLd, webPageLd } from '../lib/jsonld'
import { SITE_URL, paths } from '../lib/site'
import { formatFull, formatLong, formatShortYear, formatTime } from '../lib/time'
import { TeamBadge } from './TeamBadge'
import { MatchRow } from './MatchRow'
import { FormChips } from './FormChips'
import { PartnerLogo } from './PartnerLogo'
import { RivalryFlow } from './RivalryFlow'
import { Faq } from './Faq'
import { AdSlot } from './AdSlot'
import { Updated } from './Updated'
import { channelsFor } from '../data/channels'

// The head-to-head page (/opgoer/<a>-mod-<b>, src/app/opgoer/[slug]/page.tsx) in the match page's design: the clubs
// large on a dark field lit in their colours with the record between them, the title and "Kort fortalt", then the
// boxes in the match page's flow – the balance, the goals, home and away, the last five and the run, the records,
// the competitions, this season side by side and the next meeting (src/lib/rivalryStats.ts) – and every meeting.

const score = (m: PastMatch) => `${m.home} – ${m.away} ${m.homeScore}-${m.awayScore}`
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)
const dec = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const flip = (f: Outcome[]): Outcome[] => f.map((x) => (x === 'V' ? 'T' : x === 'T' ? 'V' : 'U'))

export function summary(r: Rivalry) {
  const { a, b, record, meetings } = r
  const n = meetings.length
  if (!n) return `${a.club.name} og ${b.club.name} har ikke mødt hinanden i vores data endnu.`
  const lead = record.a === record.b ? `De har vundet lige mange: ${record.a} hver` : record.a > record.b ? `${a.club.name} har vundet ${record.a} og ${b.club.name} ${record.b}` : `${b.club.name} har vundet ${record.b} og ${a.club.name} ${record.a}`
  return `${a.club.name} og ${b.club.name} har mødt hinanden ${n} ${n === 1 ? 'gang' : 'gange'}${r.since ? ` siden ${r.since.getFullYear()}` : ''}. ${lead}, og ${record.draw} er endt uafgjort. Seneste opgør: ${score(meetings[0])} (${formatLong(meetings[0].date)}).`
}

/** "Kort fortalt": the points a reader looks for first, each from the data */
function brief(r: Rivalry, s: RivalryStats, sa?: ClubStats, sb?: ClubStats, channel?: string): string[] {
  const { a, b, record, home } = r
  const n = s.n
  const out: string[] = []
  if (n) {
    const leader = record.a > record.b ? a.club.name : record.b > record.a ? b.club.name : undefined
    out.push(leader ? `${leader} har vundet ${Math.max(record.a, record.b)} af ${n} opgør (${pct(Math.max(record.a, record.b), n)} %), og ${record.draw} er endt uafgjort.` : `De to har vundet lige mange af ${n} opgør, og ${record.draw} er endt uafgjort.`)
    if (s.run) out.push(`${s.run}.`)
    out.push(`Der scores i snit ${dec((s.goalsA + s.goalsB) / n)} mål pr. opgør, og begge hold har scoret i ${pct(s.btts, n)} % af kampene.`)
    const ah = home.a.w + home.a.d + home.a.l
    if (ah >= 3) out.push(`${a.club.name} har vundet ${home.a.w} og tabt ${home.a.l} af ${ah} hjemmekampe mod ${b.club.name}.`)
    const bh = home.b.w + home.b.d + home.b.l
    if (bh >= 3) out.push(`${b.club.name} har vundet ${home.b.w} og tabt ${home.b.l} af ${bh} hjemmekampe mod ${a.club.name}.`)
  }
  if (r.table) out.push(`I ${r.table.division.name} lige nu er ${a.club.name} nr. ${r.table.a} og ${b.club.name} nr. ${r.table.b}.`)
  else if (sa && sb) out.push(`${a.club.name} er nr. ${sa.position} i ${sa.division.name}, ${b.club.name} nr. ${sb.position} i ${sb.division.name}.`)
  if (r.next) out.push(`Næste opgør: ${r.next.home.name} – ${r.next.away.name} ${formatLong(r.next.kickoff)} kl. ${formatTime(r.next.kickoff)}${channel ? ` på ${channel}` : ''}.`)
  return out
}

/** Two clubs' numbers side by side with a bar each way (the match page's statistics rows) */
function Compare({ label, a, b, show = (x: number) => String(x), lowerIsBetter }: { label: string; a: number; b: number; show?: (x: number) => string; lowerIsBetter?: boolean }) {
  const sum = a + b || 1
  const better = a === b ? undefined : (a > b) !== !!lowerIsBetter ? 'a' : 'b'
  // Where lower is better (place, goals against) the bars are turned, so the longer bar is still the better club
  const [wa, wb] = lowerIsBetter ? [b / sum, a / sum] : [a / sum, b / sum]
  return (
    <div className="rv-cmp">
      <div className="rv-cmp__vals">
        <b className={better === 'a' ? 'is-best' : undefined}>{show(a)}</b>
        <span>{label}</span>
        <b className={better === 'b' ? 'is-best' : undefined}>{show(b)}</b>
      </div>
      <div className="rv-cmp__bar" aria-hidden>
        <i className="is-a" style={{ width: `${wa * 100}%` }} />
        <i className="is-b" style={{ width: `${wb * 100}%` }} />
      </div>
    </div>
  )
}

/** The page itself, from the pair's data (also what a preview with made-up data draws) */
export function RivalryView({ r, canonical, now, sa, sb }: { r: Rivalry; canonical: string; now: number; sa?: ClubStats; sb?: ClubStats }) {
  const { a, b, record, meetings, home } = r
  const n = meetings.length
  const name = `${a.club.name} – ${b.club.name}`
  const lead = summary(r)
  const s = rivalryStats(meetings, a.club.name, { a: a.club.name, b: b.club.name })
  const channels = r.next ? channelsFor(r.next) : []
  const nextChannel = channels[0]?.name
  const points = brief(r, s, sa, sb, nextChannel)
  const glow = (c?: [string, string]) => (c?.[0] && c[0].toLowerCase() !== '#ffffff' ? c[0] : c?.[1])
  const colors = (team: string) => (team === a.club.name ? a.club.colors : team === b.club.name ? b.club.colors : undefined)
  const faq = [
    n > 0 && {
      q: `Hvem har vundet flest opgør mellem ${a.club.name} og ${b.club.name}?`,
      a: record.a === record.b ? `De har vundet lige mange (${record.a} hver) i ${n} opgør, og ${record.draw} er endt uafgjort.` : `${record.a > record.b ? a.club.name : b.club.name} har vundet ${Math.max(record.a, record.b)} af ${n} opgør, ${record.a > record.b ? b.club.name : a.club.name} ${Math.min(record.a, record.b)}, og ${record.draw} er endt uafgjort.`,
    },
    r.next && { q: `Hvornår spiller ${a.club.name} mod ${b.club.name} næste gang?`, a: `${r.next.home.name} – ${r.next.away.name} spilles ${formatLong(r.next.kickoff)} kl. ${formatTime(r.next.kickoff)}${nextChannel ? ` og vises på ${nextChannel}` : ''}.` },
    n > 0 && { q: `Hvad endte sidste kamp mellem ${a.club.name} og ${b.club.name}?`, a: `${score(meetings[0])} ${formatLong(meetings[0].date)} (${meetings[0].competition}).` },
    n > 0 && { q: `Hvor mange mål er der scoret i opgørene?`, a: `${s.goalsA + s.goalsB} mål i ${n} kampe – ${dec((s.goalsA + s.goalsB) / n)} pr. kamp: ${s.goalsA} til ${a.club.name} og ${s.goalsB} til ${b.club.name}.` },
    r.biggestA && { q: `Hvad er ${a.club.name}s største sejr over ${b.club.name}?`, a: `${score(r.biggestA)} ${formatLong(r.biggestA.date)} (${r.biggestA.competition}).` },
    r.biggestB && { q: `Hvad er ${b.club.name}s største sejr over ${a.club.name}?`, a: `${score(r.biggestB)} ${formatLong(r.biggestB.date)} (${r.biggestB.competition}).` },
  ].filter((x): x is { q: string; a: string } => !!x)

  const Side = ({ c, st }: { c: Rivalry['a']; st?: ClubStats }) => (
    <div className="mx-hero__side">
      <span className="mx-hero__crest">
        <TeamBadge name={c.club.name} colors={c.club.colors} size={84} />
      </span>
      <strong className="mx-hero__name" style={{ '--len': Math.max(4, ...c.club.name.split(/\s+/).map((w) => w.length)) } as CSSProperties}>
        <Link href={paths.club(c.club.slug)}>{c.club.name}</Link>
      </strong>
      {st && (
        <span className="mx-hero__pos">
          {st.position}. plads · {st.row.points} p
        </span>
      )}
      {st && st.row.form.length > 0 && <FormChips form={st.row.form} />}
    </div>
  )

  return (
    <div className="page">
      <JsonLd data={breadcrumbLd([{ name: a.club.name, path: paths.club(a.club.slug) }, { name, path: canonical }])} />
      <JsonLd data={webPageLd(canonical, `${name}: indbyrdes opgør`, new Date(now), lead)} />
      {n > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `${name}: indbyrdes opgør`,
            numberOfItems: n,
            itemListElement: meetings.slice(0, 50).map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: score(m), ...(m.slug && { url: `${SITE_URL}${paths.match(m.slug)}` }) })),
          }}
        />
      )}
      <article className="match-page rv">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href={paths.club(a.club.slug)}>{a.club.name}</Link>
          <span aria-hidden>/</span>
          <span>Opgør mod {b.club.name}</span>
        </nav>

        <header className="mx-hero mx-hero--finished rv-hero" style={{ '--mx-home': glow(a.club.colors) ?? '#2c3a0c', '--mx-away': glow(b.club.colors) ?? '#2c3a0c' } as CSSProperties}>
          <span className="mx-hero__m" aria-hidden>
            M
          </span>
          <div className="mx-hero__top">
            <span>Indbyrdes opgør</span>
            {n > 0 && <span>{r.since ? `${n} kampe siden ${r.since.getFullYear()}` : `${n} kampe`}</span>}
          </div>
          <div className="mx-hero__row">
            <Side c={a} st={sa} />
            <div className="mx-hero__center">
              <span className="mx-hero__score" aria-label={`${record.a} sejre til ${a.club.name}, ${record.b} til ${b.club.name}`}>
                {record.a}
                <i>–</i>
                {record.b}
              </span>
              <span className="mx-hero__status">
                Sejre · {record.draw} uafgjort
              </span>
            </div>
            <Side c={b} st={sb} />
          </div>
          {r.next && (
            <div className="mx-hero__meta">
              <span>
                Næste opgør: {formatFull(r.next.kickoff)} kl. {formatTime(r.next.kickoff)}
              </span>
              {r.next.venue && <span>{r.next.venue}</span>}
            </div>
          )}
          {r.next && (
            <div className="mx-hero__actions">
              {channels.length > 0 && (
                <span className="mx-hero__tv">
                  <span>Vises på</span>
                  {channels.map((c) => (
                    <PartnerLogo key={c.id} partner={c} kind="kanal" height={26} />
                  ))}
                </span>
              )}
              <Link className="mx-hero__tickets" href={paths.match(r.next.slug)}>
                Til kampen →
              </Link>
            </div>
          )}
        </header>

        <div className={`match-page__intro${points.length ? ' has-story' : ''}`}>
          <div className="match-page__lede">
            <h1 className="match-page__title">
              <span className="match-page__title-team">
                <TeamBadge link={false} name={a.club.name} colors={a.club.colors} size={40} />
                {a.club.name}
              </span>{' '}
              –{' '}
              <span className="match-page__title-team">
                {b.club.name}
                <TeamBadge link={false} name={b.club.name} colors={b.club.colors} size={40} />
              </span>
            </h1>
            <p className="match-page__summary">{lead}</p>
            <Updated at={now} />
          </div>
          {points.length > 0 && (
            <section className="story rv-brief" aria-labelledby="rv-brief-title">
              <h2 id="rv-brief-title" className="story__title">
                Kort fortalt
              </h2>
              <ul>
                {points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {n > 0 && (
          <RivalryFlow>
            <section className="sheet__section">
              <h2 className="sheet__title">Balancen</h2>
              <div className="rv-balance">
                <div>
                  <strong>{record.a}</strong>
                  <span>{a.club.name}</span>
                </div>
                <div>
                  <strong>{record.draw}</strong>
                  <span>Uafgjort</span>
                </div>
                <div>
                  <strong>{record.b}</strong>
                  <span>{b.club.name}</span>
                </div>
              </div>
              <div className="rv-bar" aria-hidden>
                <i className="is-a" style={{ width: `${pct(record.a, n)}%` }} />
                <i className="is-d" style={{ width: `${pct(record.draw, n)}%` }} />
                <i className="is-b" style={{ width: `${pct(record.b, n)}%` }} />
              </div>
              <p className="rv-note">
                {pct(record.a, n)} % · {pct(record.draw, n)} % · {pct(record.b, n)} %
              </p>
            </section>

            <section className="sheet__section">
              <h2 className="sheet__title">Mål i opgørene</h2>
              <Compare label="Mål" a={s.goalsA} b={s.goalsB} />
              <Compare label="Mål pr. kamp" a={s.goalsA / n} b={s.goalsB / n} show={dec} />
              <Compare label="Rent bur" a={s.cleanA} b={s.cleanB} />
              <ul className="rv-facts">
                <li>
                  <b>{dec((s.goalsA + s.goalsB) / n)}</b> mål pr. kamp
                </li>
                <li>
                  <b>{pct(s.over25, n)} %</b> over 2,5 mål
                </li>
                <li>
                  <b>{pct(s.btts, n)} %</b> begge hold scorer
                </li>
                <li>
                  <b>{s.nilNil}</b> × 0-0
                </li>
              </ul>
            </section>

            <section className="sheet__section">
              <h2 className="sheet__title">Hjemme og ude</h2>
              {[
                { who: a.club.name, rec: home.a },
                { who: b.club.name, rec: home.b },
              ].map(({ who, rec }) => {
                const t = rec.w + rec.d + rec.l
                return (
                  <div key={who} className="rv-home">
                    <div className="rv-home__head">
                      <strong>{who} hjemme</strong>
                      <span className="muted small">{t} kampe</span>
                    </div>
                    <div className="rv-bar rv-bar--slim" aria-hidden>
                      <i className="is-w" style={{ width: `${pct(rec.w, t)}%` }} />
                      <i className="is-d" style={{ width: `${pct(rec.d, t)}%` }} />
                      <i className="is-l" style={{ width: `${pct(rec.l, t)}%` }} />
                    </div>
                    <span className="small">
                      {rec.w} sejre · {rec.d} uafgjort · {rec.l} nederlag
                    </span>
                  </div>
                )
              })}
            </section>

            <section className="sheet__section">
              <h2 className="sheet__title">Seneste {Math.min(5, n)} opgør</h2>
              <div className="rv-form">
                <span>{a.club.name}</span>
                <FormChips form={s.lastFive} />
              </div>
              <div className="rv-form">
                <span>{b.club.name}</span>
                <FormChips form={flip(s.lastFive)} />
              </div>
              <ul className="rv-last">
                {meetings.slice(0, 5).map((m, i) => (
                  <li key={i}>
                    <span className="muted small">{formatShortYear(m.date)}</span>
                    {m.slug ? <Link href={paths.match(m.slug)}>{score(m)}</Link> : <span>{score(m)}</span>}
                  </li>
                ))}
              </ul>
              {s.run && <p className="rv-run">{s.run}.</p>}
            </section>

            <section className="sheet__section">
              <h2 className="sheet__title">Rekorder</h2>
              <dl className="rv-records">
                {r.biggestA && (
                  <div>
                    <dt>Største sejr til {a.club.name}</dt>
                    <dd>
                      {score(r.biggestA)} <span className="muted small">{formatShortYear(r.biggestA.date)}</span>
                    </dd>
                  </div>
                )}
                {r.biggestB && (
                  <div>
                    <dt>Største sejr til {b.club.name}</dt>
                    <dd>
                      {score(r.biggestB)} <span className="muted small">{formatShortYear(r.biggestB.date)}</span>
                    </dd>
                  </div>
                )}
                {r.mostGoals && r.mostGoals.homeScore + r.mostGoals.awayScore > 0 && (
                  <div>
                    <dt>Flest mål i én kamp</dt>
                    <dd>
                      {score(r.mostGoals)} <span className="muted small">{formatShortYear(r.mostGoals.date)}</span>
                    </dd>
                  </div>
                )}
                {s.commonScore && (
                  <div>
                    <dt>Mest almindelige resultat</dt>
                    <dd>
                      {s.commonScore.score} <span className="muted small">{s.commonScore.times} gange</span>
                    </dd>
                  </div>
                )}
                {s.first && (
                  <div>
                    <dt>Første opgør i vores data</dt>
                    <dd>
                      {score(s.first as PastMatch)} <span className="muted small">{formatShortYear(s.first.date)}</span>
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {s.competitions.length > 0 && (
              <section className="sheet__section">
                <h2 className="sheet__title">Turneringer</h2>
                <table className="table table--compact rv-comps">
                  <thead>
                    <tr>
                      <th>Turnering</th>
                      <th className="num">K</th>
                      <th className="num" title={a.club.name}>
                        <TeamBadge link={false} name={a.club.name} colors={a.club.colors} size={18} />
                      </th>
                      <th className="num">U</th>
                      <th className="num" title={b.club.name}>
                        <TeamBadge link={false} name={b.club.name} colors={b.club.colors} size={18} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.competitions.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td className="num">{c.n}</td>
                        <td className="num">{c.a}</td>
                        <td className="num">{c.draw}</td>
                        <td className="num">{c.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {sa && sb && (
              <section className="sheet__section">
                <h2 className="sheet__title">Sæsonen lige nu</h2>
                <p className="muted small">{sa.division.id === sb.division.id ? sa.division.name : `${sa.division.name} og ${sb.division.name}`}</p>
                <Compare label="Placering" a={sa.position} b={sb.position} show={(x) => `${x}.`} lowerIsBetter />
                <Compare label="Point" a={sa.row.points} b={sb.row.points} />
                <Compare label="Mål for" a={sa.row.goalsFor} b={sb.row.goalsFor} />
                <Compare label="Mål imod" a={sa.row.goalsAgainst} b={sb.row.goalsAgainst} lowerIsBetter />
                <div className="rv-form">
                  <span>{a.club.name}</span>
                  <FormChips form={sa.row.form} />
                </div>
                <div className="rv-form">
                  <span>{b.club.name}</span>
                  <FormChips form={sb.row.form} />
                </div>
              </section>
            )}

            {r.next && (
              <section className="sheet__section">
                <h2 className="sheet__title">Næste opgør</h2>
                <ul className="league__matches">
                  <MatchRow match={r.next} showDate />
                </ul>
              </section>
            )}
          </RivalryFlow>
        )}

        <AdSlot placement="feed" />

        {n > 0 && (
          <section className="sheet__section">
            <h2 className="sheet__title">Alle opgør</h2>
            <ul className="h2h">
              {meetings.map((m, i) => {
                const winner = m.homeScore > m.awayScore ? m.home : m.homeScore < m.awayScore ? m.away : null
                return (
                  <li key={i} className="h2h__row">
                    <span className="h2h__meta">
                      {formatShortYear(m.date)}
                      <em>{m.competition}</em>
                    </span>
                    <span className={`h2h__team${winner === m.home ? ' is-winner' : ''}`}>
                      {m.home}
                      <TeamBadge link={false} name={m.home} colors={colors(m.home)} size={22} />
                    </span>
                    <span className="h2h__score">
                      {m.slug ? (
                        <Link href={paths.match(m.slug)} title={score(m)} prefetch={false}>
                          {m.homeScore}–{m.awayScore}
                        </Link>
                      ) : (
                        <>
                          {m.homeScore}–{m.awayScore}
                        </>
                      )}
                    </span>
                    <span className={`h2h__team h2h__team--away${winner === m.away ? ' is-winner' : ''}`}>
                      <TeamBadge link={false} name={m.away} colors={colors(m.away)} size={22} />
                      {m.away}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <AdSlot placement="content" />
        {faq.length > 0 && <Faq items={faq} />}
      </article>
    </div>
  )
}
