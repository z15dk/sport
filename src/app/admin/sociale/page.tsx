import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import { getBadges } from '../../../lib/badges'
import { goalsOf, hasNamedScorers, isFinishedMatch, pickMatches, scoringSide, todayIso, weekNumbers, type Pick, type WeekNumbers } from '../../../lib/social'
import type { Club } from '../../../data/leagues'
import type { Fixture } from '../../../data/season'
import { addDays, formatLong, formatTime, isValidIsoDate } from '../../../lib/time'
import s from './sociale.module.css'
import { CardDownload, RailDownload } from './CardDownload'
import { FitRows } from './FitRows'

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
  if (!url) {
    const mark = (
      <span className={cx(s.initials, large && s.lg)} style={{ background: club.colors[0], color: club.colors[1] }}>
        {initials(club.name)}
      </span>
    )
    return plate ? <span className={s.plate}>{mark}</span> : mark
  }
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

/** A file-name friendly version of a text: "Randers FC–Viborg FF" -> "randers-fc-viborg-ff" */
const fileSlug = (text: string) =>
  text
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function Card({ children, story, caption, style, className }: { children: ReactNode; story?: boolean; caption: string; style?: CSSProperties; className?: string }) {
  return (
    <figure className={cx(s.fig, story && s.story)}>
      <div className={cx(s.card, className)} style={style} data-card={fileSlug(caption)}>
        {children}
      </div>
      <figcaption>
        {caption} · <CardDownload />
      </figcaption>
    </figure>
  )
}

const Head = ({ left }: { left: string }) => (
  <div className={s.hd}>
    <span>{left}</span>
  </div>
)
/** The Matchly bar at the foot of every card, with the address, so the sender shows wherever a card is shared */
const Foot = ({ left, right }: { left?: string; right?: string }) => (
  <div className={s.brandbar}>
    <span className={s.brandLogo}>
      Matchly<b>.</b>
    </span>
    <small>{['matchly.dk', left, right].filter(Boolean).join(' · ')}</small>
  </div>
)

const BRAND: CSSProperties = { background: '#16181a', color: '#ffffff' }
/** A card's colour: the club's field, or Matchly's own for a carousel's first and last card */
const colourOf = (club?: Club) => (club ? field(club) : BRAND)

/**
 * One card in a carousel. Every card is built the same way, so the carousel
 * reads as one story: a full colour with the club's logo as a watermark, a
 * small label, a big headline, the logos with a line, a little content and
 * the Matchly bar.
 */
function StoryCard({
  caption,
  club,
  mark,
  label,
  headline,
  crests,
  line,
  children,
  foot,
  logos,
}: {
  caption: string
  club?: Club
  /** Text as the watermark when there is no club (the first and last card) */
  mark?: string
  label: string
  headline: ReactNode
  crests: Club[]
  line?: ReactNode
  children?: ReactNode
  foot: string
  logos: Logos
}) {
  return (
    <Card caption={caption} style={colourOf(club)} className={s.onColor}>
      {club ? (
        <Watermark club={club} logos={logos} style={{ width: '95cqw', height: '95cqw', right: '-30cqw', bottom: '-12cqw' }} />
      ) : (
        mark && (
          <span className={cx(s.wmText, s.num)} aria-hidden>
            {mark}
          </span>
        )
      )}
      <Head left={label} />
      <div className={s.pad} style={{ marginTop: '8cqw' }}>
        <div className={cx(s.big, s.num)} style={{ fontSize: '13cqw' }}>
          {headline}
        </div>
      </div>
      {(crests.length > 0 || line) && (
        <div className={s.pad} style={{ marginTop: '4cqw', fontSize: '4.8cqw', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2.5cqw', flexWrap: 'wrap' }}>
          {crests.map((c) => (
            <Crest key={c.id} club={c} logos={logos} large plate />
          ))}
          {line && <span style={{ flex: '1 1 30cqw' }}>{line}</span>}
        </div>
      )}
      {children && (
        // Takes the room there is, so the Matchly bar always stays on the card
        <div className={s.pad} style={{ marginTop: '5cqw', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }} data-fit>
          {children}
        </div>
      )}
      <Foot right={foot} />
    </Card>
  )
}

/** "Holstebro Boldklub 1–3 Ishøj IF" with the score kept on one line */
const MatchLine = ({ f }: { f: Fixture }) => (
  <>
    {f.home.name} <span style={{ whiteSpace: 'nowrap' }}>{score(f)}</span> {f.away.name}
  </>
)
const winnerOf = (f: Fixture) => (f.score[1] > f.score[0] ? f.away : f.home)

/** The result, big: home and away with the score between */
const BigScore = ({ f }: { f: Fixture }) => (
  <div className={s.bigScore}>
    <span>{f.home.name}</span>
    <strong className={s.num}>{score(f)}</strong>
    <span>{f.away.name}</span>
  </div>
)

/** The goals as one short line per goal, when the sources have them */
function Scorers({ f, max }: { f: Fixture; max: number }) {
  const goals = goalsOf(f)
  if (!goals.length) return null
  const name = (i: (typeof goals)[number]) => `${i.player ?? 'Mål'}${i.kind === 'penalty' ? ' (str.)' : i.kind === 'own-goal' ? ' (selvmål)' : ''}`
  const side = (x: 'home' | 'away') =>
    goals
      .filter((i) => scoringSide(i) === x)
      .slice(0, max)
      .map((i) => `${name(i)} ${i.minute}'`)
      .join(', ')
  return (
    <div className={s.scorers}>
      <span>{side('home')}</span>
      <span>{side('away')}</span>
    </div>
  )
}

/** ISO week number of a date */
function weekNumber(date: string) {
  const d = new Date(`${date}T12:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / 86_400_000 / 7 - ((firstThursday.getUTCDay() + 6) % 7 - 3) / 7)
}

const dm = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
const score = (f: Fixture) => `${f.score[0]}–${f.score[1]}`
const dots = (n: number) => n.toLocaleString('da-DK')

function Day({ time, label, title, where, rail, children }: { time: string; label: string; title: string; where: string; rail: string; children: ReactNode }) {
  return (
    <section className={s.day}>
      <div className={s.when}>
        {time}
        <small>{label}</small>
      </div>
      {/* data-rail names the files: date, section, number and card */}
      <div className={s.body} data-rail={rail}>
        <div className={s.titleRow}>
          <h2>{title}</h2>
          <RailDownload />
        </div>
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
          <div className={s.pad} style={{ marginTop: '6cqw' }}>
            <div className={s.big} style={{ fontSize: '8cqw' }}>
              {day}
            </div>
          </div>
          {/* Takes the room there is: long names never push the Matchly bar off the card */}
          <div className={s.pad} style={{ marginTop: '4cqw', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }} data-fit>
            <table className={s.tb} style={{ fontSize: '3.4cqw' }}>
              <tbody>
                {picks.map((p) => (
                  <tr key={p.fixture.id}>
                    <td className={s.k} style={{ padding: '1.5cqw 0' }}>
                      {formatTime(p.fixture.kickoff)}
                    </td>
                    <td style={{ padding: '1.5cqw 0' }}>
                      <div className={s.sub} style={{ fontSize: '2.9cqw' }}>
                        {p.league}
                      </div>
                      <div className={s.vs}>
                        <Team club={p.fixture.home} logos={logos} />
                        <span aria-hidden>–</span>
                        <Team club={p.fixture.away} logos={logos} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot left={`${picks.length} kampe`} right="Dansk tid" />
        </Card>
        <Card story caption="Story (9:16)">
          <Head left={day} />
          <div className={s.pad} style={{ marginTop: '4cqw' }}>
            <div className={s.big} style={{ fontSize: '9cqw' }}>
              Dagens udvalgte kampe
            </div>
          </div>
          {/* Takes the room there is, so the Matchly bar always stays on the card */}
          <div style={{ marginTop: '5cqw', display: 'flex', flexDirection: 'column', gap: '1.5cqw', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }} data-fit>
            {picks.map((p) => (
              <div key={p.fixture.id}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '4.6cqw', fontWeight: 600, lineHeight: 1.15 }}>
                  {[p.fixture.home, p.fixture.away].map((club) => (
                    <div key={club.id} className={s.block} style={{ ...field(club), padding: '3.6cqw 4cqw', gap: '2cqw' }}>
                      <Watermark club={club} logos={logos} style={{ width: '40cqw', height: '40cqw', right: '-12cqw', top: '-10cqw' }} />
                      <Crest club={club} logos={logos} plate /> {club.name}
                    </div>
                  ))}
                </div>
                <div className={cx(s.pad, s.sub)} style={{ paddingTop: '1cqw', fontSize: '3.6cqw' }}>
                  {formatTime(p.fixture.kickoff)} · {p.league}
                </div>
              </div>
            ))}
          </div>
          <Foot left={`${picks.length} kampe`} />
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
  const week_ = weekNumber(week.to)
  // The clubs the story is about, once each, for the first and last card
  const featured = [...new Map([g && winnerOf(g), u?.winner, st?.club, cr?.fixture.home].filter((c): c is Club => !!c).map((c) => [c.id, c])).values()]
  const late = g ? goalsOf(g).filter((i) => i.minute > 70).length : 0
  return (
    <>
      <div className={s.rail}>
        <StoryCard caption="Forside" mark={String(week_)} label={`Uge ${week_} · ${range}`} headline="Ugens tal" crests={featured} foot={`1/${total}`} logos={logos}>
          <table className={s.tb}>
            <tbody>
              {rows.map((r) => (
                <tr key={r.text}>
                  <td className={s.k} style={{ fontSize: '5.4cqw', width: '24cqw' }}>
                    {r.n}
                  </td>
                  <td>{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StoryCard>

        {g && (
          <StoryCard
            caption="Flest mål"
            club={winnerOf(g)}
            label={`${g.division!.name}${g.round ? ` · ${g.round}. runde` : ''}`}
            headline={`${g.score[0] + g.score[1]} mål`}
            crests={[g.home, g.away]}
            line={<MatchLine f={g} />}
            foot={next()}
            logos={logos}
          >
            {goalsOf(g).length > 0 && (
              <div className={s.axis}>
                {goalsOf(g).map((i, k) => (
                  <i key={k} className={(scoringSide(i) === 'home' ? g.home : g.away) === winnerOf(g) ? s.dotOn : s.dotOff} style={{ left: `${Math.min(100, (i.minute / 95) * 100)}%` }} />
                ))}
                <span style={{ left: 0 }}>0&apos;</span>
                <span style={{ left: '47%' }}>45&apos;</span>
                <span style={{ right: 0 }}>90&apos;</span>
              </div>
            )}
            {late >= 3 && (
              <p className={s.serif} style={{ fontSize: '6cqw', marginTop: '3cqw' }}>
                {late} af målene faldt efter det 70. minut.
              </p>
            )}
          </StoryCard>
        )}

        {u && (
          <StoryCard
            caption="Overraskelsen"
            club={u.winner}
            label={`${u.fixture.division!.name} · placeringer før kampen`}
            headline={
              <>
                Nr. {u.winnerPos} slog
                <br />
                nr. {u.loserPos}
              </>
            }
            crests={[u.fixture.home, u.fixture.away]}
            foot={next()}
            logos={logos}
          >
            <BigScore f={u.fixture} />
            <Scorers f={u.fixture} max={4} />
            {u.loserUnbeaten >= 3 && (
              <p className={s.serif} style={{ fontSize: '6cqw', marginTop: '3cqw' }}>
                {u.loser.name} havde ikke tabt i {u.loserUnbeaten} kampe.
              </p>
            )}
          </StoryCard>
        )}

        {st && (
          <StoryCard
            caption="Stimen"
            club={st.club}
            label={st.division.name}
            headline={
              <>
                {st.length} kampe
                <br />
                uden nederlag
              </>
            }
            crests={[st.club]}
            line={st.club.name}
            foot={next()}
            logos={logos}
          >
            <table className={s.tb} style={{ fontSize: '3.5cqw' }}>
              <tbody>
                {st.games.slice(0, 4).map((p) => (
                  <tr key={p.fixture.id}>
                    <td>{dm(p.fixture.kickoff)}</td>
                    <td>{p.opponent.name}</td>
                    <td className={s.r}>
                      {p.goalsFor}–{p.goalsAgainst}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} style={{ opacity: 0.75 }}>
                    {st.games.length > 4 ? `+ ${st.games.length - 4} kampe mere · ` : ''}
                    {st.lastDefeat ? `seneste nederlag ${formatLong(st.lastDefeat.toISOString().slice(0, 10))}` : 'ubesejret i sæsonen'}
                  </td>
                </tr>
              </tbody>
            </table>
          </StoryCard>
        )}

        {cr && (
          <StoryCard
            caption="Tilskuere"
            club={cr.fixture.home}
            label={cr.fixture.division!.name}
            headline={dots(cr.fixture.spectators!)}
            crests={[cr.fixture.home]}
            line={`tilskuere i ${cr.fixture.home.city || cr.fixture.home.name}`}
            foot={next()}
            logos={logos}
          >
            {cr.average && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2cqw', fontSize: '3.6cqw' }}>
                <div>
                  {cr.fixture.home.name} – {cr.fixture.away.name}
                </div>
                <div className={s.bar} style={{ background: 'currentColor', width: '100%' }} />
                <div style={{ marginTop: '2cqw' }}>Sæsonens snit i ligaen: {dots(cr.average)}</div>
                <div className={s.bar} style={{ background: 'currentColor', opacity: 0.45, width: `${Math.round((cr.average / cr.fixture.spectators!) * 100)}%` }} />
              </div>
            )}
          </StoryCard>
        )}

        <StoryCard
          caption="Afslutning"
          mark={String(week_)}
          label={`Uge ${week_}`}
          headline={
            <>
              Alle kampe,
              <br />
              tabeller og tal
            </>
          }
          crests={featured}
          foot={`${total}/${total}`}
          logos={logos}
        >
          <p className={s.serif} style={{ fontSize: '6.2cqw' }}>
            Link i profilen. I morgen: formtabellen.
          </p>
        </StoryCard>
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
            <div key={club.id} className={s.block} style={{ ...field(club), paddingTop: i === 0 ? '12cqw' : '7cqw', flexDirection: 'column', alignItems: 'flex-start', gap: '2cqw', flexShrink: 0 }}>
              <Watermark club={club} logos={logos} style={{ width: '62cqw', height: '62cqw', right: '-14cqw', top: '-12cqw' }} />
              {i === 0 && (
                <span style={{ fontSize: '3.6cqw', opacity: 0.85 }}>
                  {p.league} · kl. {formatTime(p.fixture.kickoff)}
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
          {/* The colour fields keep their size; a long table is cut, never the teams or the Matchly bar */}
          <div className={s.pad} style={{ marginTop: '8cqw', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }} data-fit>
            <p className={s.serif} style={{ fontSize: '9cqw', lineHeight: 1.02 }}>
              {p.fact!.text}
            </p>
            <div className={s.sub} style={{ marginTop: '5cqw', marginBottom: '1cqw' }}>
              {p.fact!.proofTitle}
            </div>
            <table className={cx(s.tb, s.oneLine)} style={{ fontSize: '3.4cqw' }}>
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
          <Foot left="Optakt" />
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- evening: results

/** The evening carousel: the first card lists up to 5 results (scorers or not); a card of its own only for matches with every scorer named */
function Results({ date, overview, picks, logos }: { date: string; overview: Pick[]; picks: Pick[]; logos: Logos }) {
  const done = picks.filter((p) => p.finished)
  if (!overview.length) return <p className={s.empty}>Ingen færdige kampe endnu.</p>
  const total = done.length + 1
  const day = String(new Date(`${date}T12:00:00Z`).getUTCDate())
  return (
    <>
      <div className={s.rail}>
        <StoryCard caption="Forside" mark={day} label={formatLong(date)} headline="Resultater" crests={[]} foot={`1/${total}`} logos={logos}>
          <table className={s.tb} style={{ fontSize: '3.4cqw' }}>
            <tbody>
              {overview.map((p) => (
                <tr key={p.fixture.id}>
                  <td>
                    <span className={s.team}>
                      <Crest club={p.fixture.home} logos={logos} plate /> {p.fixture.home.name}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', padding: '0 2cqw' }}>{score(p.fixture)}</td>
                  <td className={s.r} style={{ whiteSpace: 'normal' }}>
                    <span className={s.team}>
                      {p.fixture.away.name} <Crest club={p.fixture.away} logos={logos} plate />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </StoryCard>
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
            <StoryCard
              key={f.id}
              caption={`${f.home.name}–${f.away.name}`}
              club={winnerOf(f)}
              label={`${p.league} · slut`}
              headline={score(f)}
              crests={[f.home, f.away]}
              line={`${f.home.name} – ${f.away.name}`}
              foot={`${k + 2}/${total}`}
              logos={logos}
            >
              {goals.length > 0 ? (
                <table className={s.tb} style={{ fontSize: '3.7cqw' }}>
                  <tbody>
                    {goals.slice(0, p.sameDay.length ? 5 - p.sameDay.length : 6).map((i, n) => {
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
                            {i.player ?? 'Mål'} <span style={{ opacity: 0.75 }}>({side === 'home' ? f.home.name : f.away.name})</span>
                            {i.kind === 'penalty' ? ', straffe' : i.kind === 'own-goal' ? ', selvmål' : ''}
                          </td>
                          <td className={s.r}>
                            {h}–{a}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : null}
              {after.length > 0 && (
                <p className={s.serif} style={{ fontSize: '5.7cqw', marginTop: '3cqw' }}>
                  {after.join(' ')}
                </p>
              )}
              {p.sameDay.length > 0 && (
                <div style={{ marginTop: goals.length ? '4cqw' : 0 }}>
                  <div style={{ fontSize: '3.2cqw', opacity: 0.8, marginBottom: '1cqw' }}>Også i {p.league}</div>
                  <table className={s.tb} style={{ fontSize: '3.5cqw' }}>
                    <tbody>
                      {p.sameDay.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <span className={s.team}>
                              <Crest club={o.home} logos={logos} plate /> {o.home.name}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', padding: '0 2cqw' }}>{score(o)}</td>
                          <td className={s.r} style={{ whiteSpace: 'normal' }}>
                            <span className={s.team}>
                              {o.away.name} <Crest club={o.away} logos={logos} plate />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </StoryCard>
          )
        })}
      </div>
      <p className={s.text}>
        <b>Tekst</b>
        {overview.map((p) => `${p.fixture.home.name} ${score(p.fixture)} ${p.fixture.away.name}`).join('. ')}
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
  const picks = pickMatches(date, now)
  // The results carousel: the day's best finished matches where every goal has a named scorer
  const results = pickMatches(date, now, hasNamedScorers)
  // Its first card: the day's best finished matches, scorers or not
  const finished = pickMatches(date, now, isFinishedMatch)
  // Our logos, plus the ones API-Sports sent with its games
  const logos: Logos = { ...Object.assign({}, ...[...picks, ...results, ...finished].map((p) => p.logos ?? {})), ...(await getBadges()) }
  const week = weekNumbers(date)
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const lastMonday = addDays(date, -((weekday + 6) % 7))
  return (
    <div className="page">
      <div className="clubs prose admin">
        <AdminNav current="/admin/sociale" />
        <FitRows />
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
          <Day rail={`${date}-dagens-kampe`} time="08.00" label="Morgen" title="Dagens kampe" where={`Facebook-feed og Instagram-story · ${picks.length} udvalgte kampe`}>
            <Programme date={date} picks={picks} logos={logos} />
          </Day>
        )}
        <Day rail={`${date}-ugens-tal`} time="10.00" label="Mandag" title="Ugens tal" where={`Karrusel i feed på Facebook og Instagram · ${formatLong(week.from)} – ${formatLong(week.to)}`}>
          <Week week={week} logos={logos} />
        </Day>
        {picks.length > 0 && (
          <>
            <Day rail={`${date}-optakt`} time="–2 t" label="Før kamp" title="Optakter" where="Instagram-story ca. 2 timer før hver kamp">
              <Previews picks={picks} logos={logos} />
            </Day>
            <Day rail={`${date}-resultater`} time="Aften" label="Efter kampene" title="Resultater" where="Karrusel i feed på Facebook og Instagram · forsiden viser op til 5 resultater; eget kort kun til kampe, hvor alle mål har en målscorer med navn">
              <Results date={date} overview={finished} picks={results} logos={logos} />
            </Day>
          </>
        )}
        <p className="muted small">Kortene vises formindsket: 4:5 til feed (1080×1350) og 9:16 til stories (1080×1920).</p>
      </div>
    </div>
  )
}
