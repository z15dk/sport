import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import { getBadges } from '../../../lib/badges'
import { goalsOf, pickMatches, scoringSide, todayIso, weekNumbers, type Pick, type WeekNumbers } from '../../../lib/social'
import type { Club } from '../../../data/leagues'
import type { Fixture } from '../../../data/season'
import { addDays, formatLong, formatTime, isValidIsoDate } from '../../../lib/time'
import s from './sociale.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sociale medier (test)', robots: { index: false, follow: false } }

type SearchParams = Promise<{ dato?: string }>
type Logos = Record<string, string>

// Test page: the cards a day's Facebook and Instagram posts would get, from
// the real data. Nothing is posted from here.

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

/** Whether a colour is light (then dark text and a dark watermark) */
function isLight(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum > 0.6
}

/** The club's colour field: background, text and a text colour that reads on it */
function field(club: Club): CSSProperties {
  const [bg, fg] = club.colors
  // A white field (e.g. AGF) takes the club's second colour instead
  const base = isLight(bg) && !isLight(fg) && bg.toLowerCase() === '#ffffff' ? fg : bg
  return { background: base, color: isLight(base) ? '#16181a' : '#ffffff' }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-ZÆØÅ0-9]/.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 3) || name.slice(0, 3).toUpperCase()

function Crest({ club, logos, large, plate }: { club: Club; logos: Logos; large?: boolean; plate?: boolean }) {
  const url = logos[club.name]
  if (!url)
    return (
      <span className={cx(s.initials, large && s.lg)} style={{ background: club.colors[0], color: club.colors[1] }}>
        {initials(club.name)}
      </span>
    )
  // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts
  const img = <img className={large ? s.crestLg : s.crest} src={url} alt="" />
  return plate ? <span className={s.plate}>{img}</span> : img
}

/** The club's logo, large, faint and one colour, behind a colour field */
function Watermark({ club, logos, style }: { club: Club; logos: Logos; style: CSSProperties }) {
  const url = logos[club.name]
  if (!url) return null
  const dark = isLight(String(field(club).background))
  // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts
  return <img className={s.wm} src={url} alt="" aria-hidden style={{ ...style, filter: dark ? 'brightness(0)' : 'brightness(0) invert(1)' }} />
}

function Team({ club, logos }: { club: Club; logos: Logos }) {
  return (
    <span className={s.team}>
      <Crest club={club} logos={logos} /> {club.name}
    </span>
  )
}

function Card({ children, story, caption, style, className }: { children: ReactNode; story?: boolean; caption: string; style?: CSSProperties; className?: string }) {
  return (
    <figure className={cx(s.fig, story && s.story)}>
      <div className={cx(s.card, className)} style={style}>
        {children}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

const Head = ({ left }: { left: string }) => (
  <div className={s.hd}>
    <span>{left}</span>
    <span className={s.mark}>Scoreline</span>
  </div>
)
const Foot = ({ left, right }: { left: string; right?: string }) => (
  <div className={s.ft}>
    <span>{left}</span>
    {right && <span>{right}</span>}
  </div>
)

const dm = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
const score = (f: Fixture) => `${f.score[0]}–${f.score[1]}`
const dots = (n: number) => n.toLocaleString('da-DK')

function Day({ time, label, title, where, children }: { time: string; label: string; title: string; where: string; children: ReactNode }) {
  return (
    <section className={s.day}>
      <div className={s.when}>
        {time}
        <small>{label}</small>
      </div>
      <div className={s.body}>
        <h2>{title}</h2>
        <p className={s.where}>{where}</p>
        {children}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- morning: the day's programme

function Programme({ date, picks, logos }: { date: string; picks: Pick[]; logos: Logos }) {
  const long = formatLong(date)
  const day = long.charAt(0).toUpperCase() + long.slice(1)
  return (
    <>
      <div className={s.rail}>
        <Card caption="Feed (4:5)">
          <Head left="Kampprogram" />
          <div className={s.pad} style={{ marginTop: '9cqw' }}>
            <div className={s.big} style={{ fontSize: '11cqw' }}>
              {day}
            </div>
          </div>
          <div className={s.pad} style={{ marginTop: '8cqw' }}>
            <table className={s.tb}>
              <tbody>
                {picks.map((p) => (
                  <tr key={p.fixture.id}>
                    <td className={s.k}>{formatTime(p.fixture.kickoff)}</td>
                    <td>
                      <Team club={p.fixture.home} logos={logos} />
                      <br />
                      <Team club={p.fixture.away} logos={logos} />
                    </td>
                    <td className={cx(s.r, s.sub)}>{p.division.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot left={`${picks.length} kampe`} right="Dansk tid" />
        </Card>
        <Card story caption="Story (9:16)">
          <Head left="I dag" />
          <div style={{ marginTop: '8cqw', display: 'flex', flexDirection: 'column', gap: '2cqw' }}>
            {picks.map((p) => (
              <div key={p.fixture.id}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '5cqw', fontWeight: 600 }}>
                  {[p.fixture.home, p.fixture.away].map((club) => (
                    <div key={club.id} className={s.block} style={{ ...field(club), padding: '5cqw 4cqw', gap: '2cqw' }}>
                      <Watermark club={club} logos={logos} style={{ width: '40cqw', height: '40cqw', right: '-12cqw', top: '-10cqw' }} />
                      <Crest club={club} logos={logos} plate /> {club.name}
                    </div>
                  ))}
                </div>
                <div className={cx(s.pad, s.sub)} style={{ paddingTop: '1.5cqw', fontSize: '4cqw' }}>
                  {formatTime(p.fixture.kickoff)} · {p.division.name}
                </div>
              </div>
            ))}
          </div>
          <Foot left={day} />
        </Card>
      </div>
      <p className={s.text}>
        <b>Tekst</b>
        {`Dagens program: ${picks.map((p) => `${p.fixture.home.name}–${p.fixture.away.name} kl. ${formatTime(p.fixture.kickoff)}`).join(', ')}.`}
      </p>
    </>
  )
}

// ---------------------------------------------------------------- Monday: the week in numbers

function Week({ week, logos }: { week: WeekNumbers; logos: Logos }) {
  const range = `${formatLong(week.from)} – ${formatLong(week.to)}`
  const rows: { n: string; text: string }[] = []
  if (week.mostGoals) rows.push({ n: String(week.mostGoals.score[0] + week.mostGoals.score[1]), text: `mål i ${week.mostGoals.home.name}–${week.mostGoals.away.name}` })
  if (week.upset) rows.push({ n: `${week.upset.winnerPos}–${week.upset.loserPos}`, text: `nr. ${week.upset.winnerPos} slog nr. ${week.upset.loserPos} i ${week.upset.fixture.division!.name}` })
  if (week.streak) rows.push({ n: String(week.streak.length), text: `kampe uden nederlag til ${week.streak.club.name}` })
  if (week.crowd) rows.push({ n: dots(week.crowd.fixture.spectators!), text: `tilskuere, ${week.crowd.fixture.home.name}–${week.crowd.fixture.away.name}` })
  if (!rows.length) return <p className={s.empty}>Ingen tal fra ugen, der er stærke nok. Så springes opslaget over.</p>
  const total = rows.length + 2
  let n = 1
  const next = () => `${++n}/${total}`
  const g = week.mostGoals
  const u = week.upset
  const st = week.streak
  const cr = week.crowd
  return (
    <>
      <div className={s.rail}>
        <Card caption="Overblik">
          <Head left={range} />
          <div className={s.pad} style={{ marginTop: '9cqw' }}>
            <div className={s.big} style={{ fontSize: '15cqw' }}>
              Ugens tal
            </div>
          </div>
          <div className={s.pad} style={{ marginTop: '8cqw' }}>
            <table className={s.tb}>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.text}>
                    <td className={s.k} style={{ fontSize: '6.5cqw', width: '26cqw' }}>
                      {r.n}
                    </td>
                    <td>{r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot left="Ugen i tal" right={`1/${total}`} />
        </Card>

        {g && (
          <Card caption="Flest mål">
            <div style={{ display: 'flex', height: '2.4cqw' }}>
              <i style={{ flex: 1, background: String(field(g.home).background) }} />
              <i style={{ flex: 1, background: String(field(g.away).background) }} />
            </div>
            <Head left={`${g.division!.name}${g.round ? ` · ${g.round}. runde` : ''}`} />
            <div className={s.pad} style={{ marginTop: '6cqw', display: 'flex', alignItems: 'baseline', gap: '3cqw' }}>
              <span className={cx(s.big, s.num)} style={{ fontSize: '32cqw' }}>
                {g.score[0] + g.score[1]}
              </span>
              <span className={s.big} style={{ fontSize: '9cqw' }}>
                mål
              </span>
            </div>
            <div className={s.pad} style={{ fontSize: '4.6cqw', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2.5cqw' }}>
              <Crest club={g.home} logos={logos} large />
              <Crest club={g.away} logos={logos} large />
              <span>
                {g.home.name} {score(g)} {g.away.name}
              </span>
            </div>
            {goalsOf(g).length > 0 && (
              <div className={s.pad}>
                <div className={s.axis}>
                  {goalsOf(g).map((i, k) => (
                    <i key={k} style={{ left: `${Math.min(100, (i.minute / 95) * 100)}%`, background: String(field(scoringSide(i) === 'home' ? g.home : g.away).background) }} />
                  ))}
                  <span style={{ left: 0 }}>0&apos;</span>
                  <span style={{ left: '47%' }}>45&apos;</span>
                  <span style={{ right: 0 }}>90&apos;</span>
                </div>
              </div>
            )}
            <Foot left={formatLong(g.kickoff)} right={next()} />
          </Card>
        )}

        {u && (
          <Card caption="Overraskelsen" style={field(u.winner)} className={s.onColor}>
            <Watermark club={u.winner} logos={logos} style={{ width: '95cqw', height: '95cqw', right: '-30cqw', bottom: '-20cqw' }} />
            <Head left={u.fixture.division!.name} />
            <div className={s.pad} style={{ marginTop: '9cqw' }}>
              <div className={s.big} style={{ fontSize: '13cqw' }}>
                Nr. {u.winnerPos} slog
                <br />
                nr. {u.loserPos}
              </div>
            </div>
            <div className={s.pad} style={{ marginTop: '4cqw', fontSize: '4.8cqw', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2.5cqw' }}>
              <Crest club={u.fixture.home} logos={logos} large plate />
              <Crest club={u.fixture.away} logos={logos} large plate />
              <span>
                {u.fixture.home.name} {score(u.fixture)} {u.fixture.away.name}
              </span>
            </div>
            {u.loserUnbeaten >= 3 && (
              <p className={cx(s.pad, s.serif)} style={{ fontSize: '4.6cqw', marginTop: '6cqw' }}>
                {u.loser.name} havde ikke tabt i {u.loserUnbeaten} kampe.
              </p>
            )}
            <Foot left="Placeringer før kampen" right={next()} />
          </Card>
        )}

        {st && (
          <Card caption="Stimen" style={field(st.club)} className={s.onColor}>
            <Watermark club={st.club} logos={logos} style={{ width: '95cqw', height: '95cqw', right: '-30cqw', bottom: '-20cqw' }} />
            <Head left={st.division.name} />
            <div className={s.pad} style={{ marginTop: '5cqw', display: 'flex', alignItems: 'baseline', gap: '3cqw' }}>
              <span className={cx(s.big, s.num)} style={{ fontSize: '26cqw' }}>
                {st.length}
              </span>
              <span className={s.big} style={{ fontSize: '7cqw' }}>
                kampe uden
                <br />
                nederlag
              </span>
            </div>
            <div className={s.pad} style={{ fontSize: '4.8cqw', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2.5cqw' }}>
              <Crest club={st.club} logos={logos} large plate /> {st.club.name}
            </div>
            <div className={s.pad} style={{ marginTop: '4cqw' }}>
              <table className={s.tb} style={{ fontSize: '3.5cqw' }}>
                <tbody>
                  {st.games.slice(0, 5).map((p) => (
                    <tr key={p.fixture.id}>
                      <td>{dm(p.fixture.kickoff)}</td>
                      <td>{p.opponent.name}</td>
                      <td className={s.r}>
                        {p.goalsFor}–{p.goalsAgainst}
                      </td>
                    </tr>
                  ))}
                  {st.games.length > 5 && (
                    <tr>
                      <td colSpan={3} style={{ opacity: 0.7 }}>
                        + {st.games.length - 5} kampe mere
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Foot left={st.lastDefeat ? `Seneste nederlag ${formatLong(st.lastDefeat.toISOString().slice(0, 10))}` : 'Ubesejret i sæsonen'} right={next()} />
          </Card>
        )}

        {cr && (
          <Card caption="Tilskuere" style={field(cr.fixture.home)} className={s.onColor}>
            <Watermark club={cr.fixture.home} logos={logos} style={{ width: '95cqw', height: '95cqw', right: '-30cqw', bottom: '-20cqw' }} />
            <Head left={cr.fixture.division!.name} />
            <div className={s.pad} style={{ marginTop: '10cqw' }}>
              <span className={cx(s.big, s.num)} style={{ fontSize: '22cqw' }}>
                {dots(cr.fixture.spectators!)}
              </span>
            </div>
            <div className={s.pad} style={{ fontSize: '5cqw', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2.5cqw' }}>
              <Crest club={cr.fixture.home} logos={logos} large plate /> tilskuere i {cr.fixture.home.city || cr.fixture.home.name}
            </div>
            {cr.average && (
              <div className={s.pad} style={{ marginTop: '7cqw', display: 'flex', flexDirection: 'column', gap: '2cqw', fontSize: '3.6cqw' }}>
                <div>
                  {cr.fixture.home.name} – {cr.fixture.away.name}
                </div>
                <div className={s.bar} style={{ background: 'currentColor', width: '100%' }} />
                <div style={{ marginTop: '2cqw' }}>Sæsonens snit i ligaen: {dots(cr.average)}</div>
                <div className={s.bar} style={{ background: 'currentColor', opacity: 0.45, width: `${Math.round((cr.average / cr.fixture.spectators!) * 100)}%` }} />
              </div>
            )}
            <Foot left="Flest tilskuere" right={next()} />
          </Card>
        )}

        <Card caption="Afslutning">
          <Head left="Ugens tal" />
          <div className={s.pad} style={{ marginTop: 'auto' }}>
            <div className={s.big} style={{ fontSize: '10cqw' }}>
              Alle kampe, tabeller og tal fra ugen
            </div>
          </div>
          <p className={cx(s.pad, s.serif)} style={{ fontSize: '4.6cqw', margin: '4cqw 0 10cqw' }}>
            Link i profilen. I morgen: formtabellen.
          </p>
          <Foot left="Scoreline" right={`${total}/${total}`} />
        </Card>
      </div>
      <p className={s.text}>
        <b>Tekst</b>
        {[
          'Ugen i tal.',
          g && `${g.home.name} og ${g.away.name} delte ${g.score[0] + g.score[1]} mål.`,
          u && `I ${u.fixture.division!.name} slog nr. ${u.winnerPos} nr. ${u.loserPos}.`,
          st && `${st.club.name} er nu ${st.length} kampe uden nederlag.`,
        ]
          .filter(Boolean)
          .join(' ')}
        {'\n\nAlle kampe og tabeller: link i profilen.'}
      </p>
    </>
  )
}

// ---------------------------------------------------------------- before kick-off: stories

function Previews({ picks, logos }: { picks: Pick[]; logos: Logos }) {
  const withFact = picks.filter((p) => p.fact)
  if (!withFact.length) return <p className={s.empty}>Ingen af dagens kampe har et tal, der er godt nok. Så droppes optakterne.</p>
  return (
    <div className={s.rail}>
      {withFact.map((p) => (
        <Card key={p.fixture.id} story caption={`${formatTime(new Date(p.fixture.kickoff.getTime() - 2 * 3_600_000))} · ${p.fixture.home.name}–${p.fixture.away.name}`}>
          {[p.fixture.home, p.fixture.away].map((club, i) => (
            <div key={club.id} className={s.block} style={{ ...field(club), paddingTop: i === 0 ? '12cqw' : '7cqw', flexDirection: 'column', alignItems: 'flex-start', gap: '2cqw' }}>
              <Watermark club={club} logos={logos} style={{ width: '62cqw', height: '62cqw', right: '-14cqw', top: '-12cqw' }} />
              {i === 0 && (
                <span style={{ fontSize: '3.6cqw', opacity: 0.85 }}>
                  {p.division.name} · kl. {formatTime(p.fixture.kickoff)}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '4cqw' }}>
                <Crest club={club} logos={logos} large plate />
                <span className={s.big} style={{ fontSize: '9.5cqw' }}>
                  {club.name}
                </span>
              </span>
            </div>
          ))}
          <div className={s.pad} style={{ marginTop: '8cqw' }}>
            <p className={s.serif} style={{ fontSize: '5.6cqw' }}>
              {p.fact!.text}
            </p>
            <div className={s.sub} style={{ marginTop: '5cqw', marginBottom: '1cqw' }}>
              {p.fact!.proofTitle}
            </div>
            <table className={s.tb} style={{ fontSize: '3.4cqw' }}>
              <tbody>
                {p.fact!.proof.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className={s.r}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot left="Scoreline" />
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- evening: results

function Results({ date, picks, logos }: { date: string; picks: Pick[]; logos: Logos }) {
  const done = picks.filter((p) => p.finished)
  if (!done.length) return <p className={s.empty}>Ingen af dagens udvalgte kampe er færdigspillet endnu.</p>
  const total = done.length + 1
  return (
    <>
      <div className={s.rail}>
        <Card caption="Overblik">
          <Head left={formatLong(date)} />
          <div className={s.pad} style={{ marginTop: '9cqw' }}>
            <div className={s.big} style={{ fontSize: '13cqw' }}>
              Resultater
            </div>
          </div>
          <div className={s.pad} style={{ marginTop: '8cqw' }}>
            <table className={s.tb} style={{ fontSize: '4.3cqw' }}>
              <tbody>
                {done.flatMap((p) => [
                  <tr key={`${p.fixture.id}h`}>
                    <td>
                      <Team club={p.fixture.home} logos={logos} />
                    </td>
                    <td className={s.r} style={{ fontWeight: p.fixture.score[0] > p.fixture.score[1] ? 700 : 400 }}>
                      {p.fixture.score[0]}
                    </td>
                  </tr>,
                  <tr key={`${p.fixture.id}a`} className={s.pair}>
                    <td>
                      <Team club={p.fixture.away} logos={logos} />
                    </td>
                    <td className={s.r} style={{ fontWeight: p.fixture.score[1] > p.fixture.score[0] ? 700 : 400 }}>
                      {p.fixture.score[1]}
                    </td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
          <Foot left="Slut" right={`1/${total}`} />
        </Card>
        {done.map((p, k) => {
          const f = p.fixture
          const goals = goalsOf(f)
          let h = 0
          let a = 0
          const after = [
            p.after?.home && `${f.home.name} er nu nr. ${p.after.home}.`,
            p.after?.away && `${f.away.name} er nu nr. ${p.after.away}.`,
          ].filter(Boolean)
          return (
            <Card key={f.id} caption={`${f.home.name}–${f.away.name}`}>
              <div className={s.scoreHead}>
                {[f.home, f.away].map((club, i) => (
                  <div key={club.id} className={cx(s.side, i === 1 && s.right)} style={{ ...field(club), gridColumn: i === 0 ? 1 : 3, gridRow: 1 }}>
                    <Watermark club={club} logos={logos} style={{ width: '46cqw', height: '46cqw', top: '-6cqw', ...(i === 0 ? { right: '-18cqw' } : { left: '-18cqw' }) }} />
                    <span style={{ fontSize: '3.3cqw', opacity: 0.85, minHeight: '4cqw' }}>{i === 0 ? `${p.division.name} · slut` : ' '}</span>
                    <Crest club={club} logos={logos} large plate />
                    <span style={{ fontSize: '4.4cqw', fontWeight: 600 }}>{club.name}</span>
                  </div>
                ))}
                <div className={cx(s.score, s.big, s.num)} style={{ gridColumn: 2, gridRow: 1 }}>
                  {score(f)}
                </div>
              </div>
              {goals.length > 0 ? (
                <div className={s.pad} style={{ marginTop: '5cqw' }}>
                  <table className={s.tb} style={{ fontSize: '3.8cqw' }}>
                    <tbody>
                      {goals.slice(0, 7).map((i, n) => {
                        const side = scoringSide(i)
                        if (side === 'home') h++
                        else a++
                        return (
                          <tr key={n}>
                            <td className={s.k}>
                              {i.approx ? 'ca. ' : ''}
                              {i.minute}&apos;
                            </td>
                            <td>
                              <span className={s.team}>
                                <Crest club={side === 'home' ? f.home : f.away} logos={logos} />
                                {i.player ?? 'Mål'}
                                {i.kind === 'penalty' ? ', straffe' : i.kind === 'own-goal' ? ', selvmål' : ''}
                              </span>
                            </td>
                            <td className={s.r}>
                              {h}–{a}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={cx(s.pad, s.sub)} style={{ marginTop: '5cqw' }}>
                  Kilderne har ikke målscorerne til denne kamp endnu.
                </p>
              )}
              {after.length > 0 && (
                <p className={cx(s.pad, s.serif)} style={{ fontSize: '4.4cqw', marginTop: '4cqw' }}>
                  {after.join(' ')}
                </p>
              )}
              <Foot left="Scoreline" right={`${k + 2}/${total}`} />
            </Card>
          )
        })}
      </div>
      <p className={s.text}>
        <b>Tekst</b>
        {done.map((p) => `${p.fixture.home.name} ${score(p.fixture)} ${p.fixture.away.name}`).join('. ')}
        {'.\n\nAlle mål og tabeller: link i profilen.'}
      </p>
    </>
  )
}

// ---------------------------------------------------------------- the page

export default async function SocialPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const now = Date.now()
  const { dato } = await searchParams
  const date = isValidIsoDate(dato) ? dato : todayIso(now)
  const logos = await getBadges()
  const picks = pickMatches(date, now)
  const week = weekNumbers(date)
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const lastMonday = addDays(date, -((weekday + 6) % 7))
  return (
    <div className="page">
      {/* Fonts for the cards only */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- only this test page uses them */}
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" />
      <div className="clubs prose admin">
        <AdminNav current="/admin/sociale" />
        <h1 className="feed__title">Sociale medier (test)</h1>
        <p>
          De kort, en dags opslag på Facebook og Instagram ville få, lavet af sidens rigtige data og logoer. Intet bliver postet herfra. Ugens tal
          vises altid her, men postes kun om mandagen.
        </p>
        <p className="filter-bar">
          <Link className="pill" href={`/admin/sociale?dato=${addDays(date, -1)}`}>
            ← {formatLong(addDays(date, -1))}
          </Link>
          <span className="pill is-active">{formatLong(date)}</span>
          <Link className="pill" href={`/admin/sociale?dato=${addDays(date, 1)}`}>
            {formatLong(addDays(date, 1))} →
          </Link>
          {lastMonday !== date && (
            <Link className="pill" href={`/admin/sociale?dato=${lastMonday}`}>
              Seneste mandag
            </Link>
          )}
        </p>

        {picks.length === 0 ? (
          <p>Ingen kampe i vores ligaer denne dag.</p>
        ) : (
          <Day time="08.00" label="Morgen" title="Dagens kampe" where={`Facebook-feed og Instagram-story · ${picks.length} udvalgte kampe`}>
            <Programme date={date} picks={picks} logos={logos} />
          </Day>
        )}
        <Day time="10.00" label="Mandag" title="Ugens tal" where={`Karrusel i feed på Facebook og Instagram · ${formatLong(week.from)} – ${formatLong(week.to)}`}>
          <Week week={week} logos={logos} />
        </Day>
        {picks.length > 0 && (
          <>
            <Day time="–2 t" label="Før kamp" title="Optakter" where="Instagram-story ca. 2 timer før hver kamp">
              <Previews picks={picks} logos={logos} />
            </Day>
            <Day time="Aften" label="Efter kampene" title="Resultater" where="Karrusel i feed på Facebook og Instagram, når den sidste udvalgte kamp er slut">
              <Results date={date} picks={picks} logos={logos} />
            </Day>
          </>
        )}
        <p className="muted small">Kortene vises formindsket: 4:5 til feed (1080×1350) og 9:16 til stories (1080×1920).</p>
      </div>
    </div>
  )
}
