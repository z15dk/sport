import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { MIN_INDEXED, parseRivalry, rivalry, rivalryPath, type Rivalry } from '../../../lib/rivalry'
import type { PastMatch } from '../../../data/matchInsights'
import { JsonLd, breadcrumbLd, webPageLd } from '../../../lib/jsonld'
import { SITE_URL, paths } from '../../../lib/site'
import { formatLong, formatShortYear } from '../../../lib/time'
import { TeamBadge } from '../../../components/TeamBadge'
import { MatchRow } from '../../../components/MatchRow'
import { Faq } from '../../../components/Faq'
import { AdSlot } from '../../../components/AdSlot'
import { Updated } from '../../../components/Updated'
import { channelsFor } from '../../../data/channels'

// Head-to-head between two of our clubs (src/lib/rivalry.ts): the record, home
// and away, the biggest wins, the next meeting and every meeting with a link
// to its match page.

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

function load(slug: string) {
  const pair = parseRivalry(slug)
  if (!pair) return undefined
  const r = rivalry(pair[0], pair[1])
  return r && { r, canonical: rivalryPath(pair[0], pair[1]) }
}

const score = (m: PastMatch) => `${m.home} – ${m.away} ${m.homeScore}-${m.awayScore}`
const rec = (r: { w: number; d: number; l: number }) => `${r.w} ${r.w === 1 ? 'sejr' : 'sejre'}, ${r.d} uafgjort, ${r.l} nederlag`
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)

function summary(r: Rivalry) {
  const { a, b, record, meetings } = r
  const n = meetings.length
  if (!n) return `${a.club.name} og ${b.club.name} har ikke mødt hinanden i vores data endnu.`
  const lead = record.a === record.b ? `De har vundet lige mange: ${record.a} hver` : record.a > record.b ? `${a.club.name} har vundet ${record.a} og ${b.club.name} ${record.b}` : `${b.club.name} har vundet ${record.b} og ${a.club.name} ${record.a}`
  return `${a.club.name} og ${b.club.name} har mødt hinanden ${n} ${n === 1 ? 'gang' : 'gange'}${r.since ? ` siden ${r.since.getFullYear()}` : ''}. ${lead}, og ${record.draw} er endt uafgjort. Seneste opgør: ${score(meetings[0])} (${formatLong(meetings[0].date)}).`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = load((await params).slug)
  if (!found) return { title: 'Opgøret findes ikke' }
  const { r, canonical } = found
  const title = `${r.a.club.name} – ${r.b.club.name}: indbyrdes opgør, statistik og næste kamp`
  return {
    title: { absolute: `${title} | Matchly` },
    description: `${summary(r)}${r.next ? ` Næste kamp: ${formatLong(r.next.kickoff)}.` : ''}`.slice(0, 300),
    alternates: { canonical },
    robots: r.meetings.length >= MIN_INDEXED ? undefined : { index: false, follow: true },
  }
}

export default async function RivalryPage({ params }: { params: Params }) {
  const slug = (await params).slug
  const found = load(slug)
  if (!found) notFound()
  const { r, canonical } = found
  if (`/opgoer/${slug}` !== canonical) permanentRedirect(canonical)
  const { a, b, record, meetings, home } = r
  const now = Date.now()
  const n = meetings.length
  const name = `${a.club.name} – ${b.club.name}`
  const lead = summary(r)
  const nextChannel = r.next ? channelsFor(r.next)[0]?.name : undefined
  const faq = [
    n > 0 && {
      q: `Hvem har vundet flest opgør mellem ${a.club.name} og ${b.club.name}?`,
      a: record.a === record.b ? `De har vundet lige mange (${record.a} hver) i ${n} opgør, og ${record.draw} er endt uafgjort.` : `${record.a > record.b ? a.club.name : b.club.name} har vundet ${Math.max(record.a, record.b)} af ${n} opgør, ${record.a > record.b ? b.club.name : a.club.name} ${Math.min(record.a, record.b)}, og ${record.draw} er endt uafgjort.`,
    },
    r.next && { q: `Hvornår spiller ${a.club.name} mod ${b.club.name} næste gang?`, a: `${r.next.home.name} – ${r.next.away.name} spilles ${formatLong(r.next.kickoff)} kl. ${r.next.kickoff.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' })}${nextChannel ? ` og vises på ${nextChannel}` : ''}.` },
    n > 0 && { q: `Hvad endte sidste kamp mellem ${a.club.name} og ${b.club.name}?`, a: `${score(meetings[0])} ${formatLong(meetings[0].date)} (${meetings[0].competition}).` },
    n > 0 && { q: `Hvor mange mål er der scoret i opgørene?`, a: `${record.goalsA + record.goalsB} mål i ${n} kampe: ${record.goalsA} til ${a.club.name} og ${record.goalsB} til ${b.club.name}.` },
  ].filter((x): x is { q: string; a: string } => !!x)

  const Side = ({ c }: { c: Rivalry['a'] }) => (
    <Link className="rivalry__club" href={paths.club(c.club.slug)}>
      <TeamBadge link={false} name={c.club.name} colors={c.club.colors} size={64} />
      <strong>{c.club.name}</strong>
      <span className="muted small">{c.division.name}</span>
    </Link>
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
      <div className="clubs">
        <nav className="crumbs" aria-label="Brødkrummer">
          <Link href={paths.club(a.club.slug)}>{a.club.name}</Link>
          <span aria-hidden>/</span>
          <span>Opgør mod {b.club.name}</span>
        </nav>
        <h1 className="feed__title">
          {name}
          <span>Indbyrdes opgør og statistik</span>
        </h1>

        <section className="panel rivalry">
          <Side c={a} />
          <div className="rivalry__record" aria-label="Sejre og uafgjorte">
            <div>
              <strong>{record.a}</strong>
              <span>{record.a === 1 ? 'Sejr' : 'Sejre'}</span>
            </div>
            <div>
              <strong>{record.draw}</strong>
              <span>Uafgjort</span>
            </div>
            <div>
              <strong>{record.b}</strong>
              <span>{record.b === 1 ? 'Sejr' : 'Sejre'}</span>
            </div>
            {n > 0 && (
              <div className="rivalry__bar" aria-hidden>
                <i style={{ width: `${pct(record.a, n)}%` }} />
                <i style={{ width: `${pct(record.draw, n)}%` }} />
                <i style={{ width: `${pct(record.b, n)}%` }} />
              </div>
            )}
          </div>
          <Side c={b} />
        </section>

        <p className="lead">{lead}</p>
        <Updated at={now} />

        {r.next && (
          <section className="league">
            <header className="league__header">
              <div className="league__toggle">
                <span className="league__titles">
                  <span className="league__country">{r.next.league}</span>
                  <h2 className="league__name">Næste opgør</h2>
                </span>
              </div>
            </header>
            <ul className="league__matches">
              <MatchRow match={r.next} showDate />
            </ul>
          </section>
        )}

        {n > 0 && (
          <section className="tiles tiles--club" aria-label="Opgørene i tal">
            <div className="tile tile--lime">
              <span className="tile__label">Kampe</span>
              <strong className="tile__value">{n}</strong>
            </div>
            <div className="tile tile--ink">
              <span className="tile__label">Mål</span>
              <strong className="tile__value">
                {record.goalsA}–{record.goalsB}
              </strong>
            </div>
            <div className="tile tile--blush">
              <span className="tile__label">Mål pr. kamp</span>
              <strong className="tile__value">{((record.goalsA + record.goalsB) / n).toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</strong>
            </div>
            {r.table ? (
              <div className="tile tile--lime">
                <span className="tile__label">I {r.table.division.name} nu</span>
                <strong className="tile__value tile__value--text">
                  {r.table.a}. og {r.table.b}.
                </strong>
              </div>
            ) : (
              <div className="tile tile--lime">
                <span className="tile__label">Uafgjort</span>
                <strong className="tile__value">{pct(record.draw, n)} %</strong>
              </div>
            )}
          </section>
        )}

        {n > 0 && (
          <section className="panel">
            <h2 className="panel__title">Hjemme og ude</h2>
            <ul className="rivalry__facts">
              <li>
                <strong>{a.club.name} hjemme:</strong> {rec(home.a)}
              </li>
              <li>
                <strong>{b.club.name} hjemme:</strong> {rec(home.b)}
              </li>
              {r.biggestA && (
                <li>
                  <strong>Største sejr til {a.club.name}:</strong> {score(r.biggestA)} ({formatShortYear(r.biggestA.date)})
                </li>
              )}
              {r.biggestB && (
                <li>
                  <strong>Største sejr til {b.club.name}:</strong> {score(r.biggestB)} ({formatShortYear(r.biggestB.date)})
                </li>
              )}
              {r.mostGoals && r.mostGoals.homeScore + r.mostGoals.awayScore > 0 && (
                <li>
                  <strong>Flest mål:</strong> {score(r.mostGoals)} ({formatShortYear(r.mostGoals.date)})
                </li>
              )}
            </ul>
          </section>
        )}

        <AdSlot placement="feed" />

        {n > 0 && (
          <section className="panel">
            <h2 className="panel__title">Alle opgør</h2>
            <ul className="h2h">
              {meetings.map((m, i) => {
                const winner = m.homeScore > m.awayScore ? m.home : m.homeScore < m.awayScore ? m.away : null
                const colors = (team: string) => (team === a.club.name ? a.club.colors : team === b.club.name ? b.club.colors : undefined)
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
      </div>
    </div>
  )
}
