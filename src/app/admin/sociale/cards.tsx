import type { CSSProperties, ReactNode } from 'react'
import { goalsOf, scoringSide, type FormRow, type Pick, type WeekNumbers } from '../../../lib/social'
import type { ScorerRow } from '../../../data/stats'
import type { StandingRow } from '../../../data/season'
import type { Club, Division } from '../../../data/leagues'
import type { Fixture } from '../../../data/season'
import { formatLong, formatTime } from '../../../lib/time'
import s from './sociale.module.css'
import { CardDownload, RailDownload } from './CardDownload'
import type { Content } from '../../../lib/socialContent'

// The cards of the social media posts, made from the site's real data and
// logos: shown on /admin/sociale/skabeloner and, one post at a time, on
// /admin/sociale/kort, where the engine takes the pictures (src/lib/socialRender.ts).
// A card is 4:5 for the feed (1080×1350) or 9:16 for a story (1080×1920).

export type Logos = Record<string, string>

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
export function field(club: Club): CSSProperties {
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

export function Crest({ club, logos, large, plate }: { club: Club; logos: Logos; large?: boolean; plate?: boolean }) {
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
function Watermark({ club, logos, style, natural }: { club: Club; logos: Logos; style: CSSProperties; natural?: boolean }) {
  const url = logos[club.name]
  if (!url) return null
  const dark = isLight(String(field(club).background))
  // natural: the logo in its own colours, faint (the focus match), else one colour that reads on the field
  // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts
  return <img className={s.wm} src={url} alt="" aria-hidden style={{ ...style, ...(natural ? { opacity: 0.16 } : { filter: dark ? 'brightness(0)' : 'brightness(0) invert(1)' }) }} />
}

/** The post's text under the cards (as it goes out with the pictures) */
export const CaptionBox = ({ text }: { text: string }) => (
  <p className={s.text}>
    <b>Tekst</b>
    {text}
  </p>
)

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

export function Card({ children, story, caption, style, className }: { children: ReactNode; story?: boolean; caption: string; style?: CSSProperties; className?: string }) {
  return (
    <figure className={cx(s.fig, story && s.story)}>
      <div className={cx(s.card, className)} style={style} data-card={fileSlug(caption)} data-surface={story ? 'story' : 'feed'}>
        {children}
      </div>
      <figcaption>
        {caption} · <CardDownload />
      </figcaption>
    </figure>
  )
}

/** The card's top line; the women's cards (a .women carousel) add their tag */
const Head = ({ left }: { left: string }) => (
  <div className={s.hd}>
    <span>
      <b className={s.womenTag} />
      {left}
    </span>
  </div>
)
/** The Matchly bar at the foot of every card, with the address, so the sender shows wherever a card is shared */
/** No page numbers on the pictures ("1/2", "3/7"): only the address and a word like "Optakt" or "8 kampe" */
const noCount = (t?: string) => t?.replace(/\b\d+\/\d+\b(\s*·\s*)?/g, '').trim() || undefined
const Foot = ({ left: l, right: r }: { left?: string; right?: string }) => {
  const left = noCount(l)
  const right = noCount(r)
  return (
  <div className={s.brandbar}>
    <span className={s.brandLogo}>
      Matchly<b>.</b>
    </span>
    <small className={s.siteAll}>{['matchly.dk', left, right].filter(Boolean).join(' · ')}</small>
    <small className={s.siteWomen}>{['matchly.dk/kvindefodbold', left, right].filter(Boolean).join(' · ')}</small>
  </div>
  )
}

const BRAND: CSSProperties = { background: '#16181a', color: '#ffffff' }
/** A card's colour: the club's field, or Matchly's own for a carousel's first and last card */
/** A card's colour, with the faint text and lines dark on a light colour (else they vanish on e.g. Brøndby's yellow) */
function colourOf(club?: Club): CSSProperties {
  const f = club ? field(club) : BRAND
  return f.color === '#16181a' ? ({ ...f, '--p-ink-2': 'rgba(22, 24, 26, 0.72)', '--p-rule': 'rgba(22, 24, 26, 0.2)' } as CSSProperties) : f
}

/**
 * One card in a carousel. Every card is built the same way, so the carousel
 * reads as one story: a full colour with the club's logo as a watermark, a
 * small label, a big headline, the logos with a line, a little content and
 * the Matchly bar.
 */
export function StoryCard({
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
  size = 13,
  logoMark,
  natural,
  center,
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
  /** Headline size in cqw (default 13) */
  size?: number
  /** Matchly's green M as the watermark instead of `mark` */
  logoMark?: boolean
  /** The club's logo as the watermark in its own colours (faint) */
  natural?: boolean
  /** Everything centred (the focus match) */
  center?: boolean
}) {
  return (
    <Card caption={caption} style={colourOf(club)} className={cx(s.onColor, center && s.centerCard)}>
      {club ? (
        <Watermark club={club} logos={logos} natural={natural} style={{ width: '95cqw', height: '95cqw', right: '-30cqw', bottom: '-12cqw' }} />
      ) : logoMark ? (
        <span className={cx(s.wmM, s.wmMGreen)} aria-hidden>
          M
        </span>
      ) : (
        mark && (
          <span className={cx(s.wmText, s.num)} aria-hidden>
            {mark}
          </span>
        )
      )}
      <Head left={label} />
      <div className={s.pad} style={{ marginTop: '8cqw' }}>
        <div className={cx(s.big, s.num)} style={{ fontSize: `${size}cqw` }}>
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
  if (!goals.some((i) => i.player)) return null
  const name = (i: (typeof goals)[number]) => `${i.player ?? 'Mål'}${i.kind === 'penalty' ? ' (str.)' : i.kind === 'own-goal' ? ' (selvmål)' : ''}`
  const side = (x: 'home' | 'away') =>
    goals
      .filter((i) => scoringSide(i) === x)
      .slice(0, max)
      .map((i, k) => (
        <div key={k}>
          <b>{i.minute}&apos;</b> {name(i)}
        </div>
      ))
  return (
    <div className={s.scorers}>
      <div>{side('home')}</div>
      <div>{side('away')}</div>
    </div>
  )
}

/** Goals on the 0-90 axis; a minute label close to the one before goes on the upper line so they don't overlap */
function goalAxis(goals: ReturnType<typeof goalsOf>) {
  let lastLow = -100
  let lastHigh = -100
  return goals.map((i) => {
    const left = Math.min(100, (i.minute / 95) * 100)
    let level = 0
    if (left - lastLow < 8) level = left - lastHigh < 8 ? 0 : 1
    if (level) lastHigh = left
    else lastLow = left
    return { i, left, level }
  })
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

export function Day({ time, label, title, where, rail, tools, children }: { time: string; label: string; title: string; where: string; rail: string; tools?: ReactNode; children: ReactNode }) {
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
          <span className={s.tools}>
            {tools}
            <RailDownload />
          </span>
        </div>
        <p className={s.where}>{where}</p>
        {children}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- morning: the day's programme

/** At most this many matches on one graphic; more matches give more cards (a carousel) */
const PER_PROGRAMME_CARD = 6

export function Programme({ date, picks, logos }: { date: string; picks: Pick[]; logos: Logos }) {
  const long = formatLong(date)
  const day = long.charAt(0).toUpperCase() + long.slice(1)
  const chunks: Pick[][] = []
  for (let i = 0; i < picks.length; i += PER_PROGRAMME_CARD) chunks.push(picks.slice(i, i + PER_PROGRAMME_CARD))
  const of = (i: number) => (chunks.length > 1 ? ` · ${i + 1}/${chunks.length}` : '')
  const rows = (list: Pick[], story?: boolean) =>
    list.map((p) => (
      <div key={p.fixture.id} className={cx(s.fixtureRow, story && s.storyRow)}>
        {[p.fixture.home, p.fixture.away].map((club, i) => (
          <div key={club.id} className={cx(s.fixtureTeam, i === 1 && s.right)} style={{ ...NEUTRAL_TEAM, gridColumn: i === 0 ? 1 : 3, gridRow: 1 }}>
            {i === 1 && <span className={s.fixtureName}>{club.name}</span>}
            <Crest club={club} logos={logos} plate />
            {i === 0 && <span className={s.fixtureName}>{club.name}</span>}
          </div>
        ))}
        <div className={s.fixtureTime} style={{ gridColumn: 2, gridRow: 1 }}>
          <b>{formatTime(p.fixture.kickoff)}</b>
          <small>{p.league}</small>
        </div>
      </div>
    ))
  return (
    <>
      <div className={s.rail}>
        {chunks.map((list, i) => (
          <StoryCard
            key={`feed-${i}`}
            caption={`Feed (4:5)${of(i)}`}
            mark={String(new Date(`${date}T12:00:00Z`).getUTCDate())}
            label={day}
            headline="Dagens kampe"
            size={8.5}
            logoMark
            crests={[]}
            foot={chunks.length > 1 ? `${i + 1}/${chunks.length} · ${picks.length} kampe` : `${picks.length} kampe`}
            logos={logos}
          >
            {/* Room for six whole matches between the headline and the Matchly bar */}
            <div className={cx(s.fixtures, s.fixturesSix)}>{rows(list)}</div>
          </StoryCard>
        ))}
        {chunks.map((list, i) => (
          <Card key={`story-${i}`} story caption={`Story (9:16)${of(i)}`} style={BRAND} className={s.onColor}>
            {/* Matchly's neon M, faint in outline, behind the day's matches (as on the feed card) */}
            <span className={cx(s.wmM, s.wmMGreen)} aria-hidden>
              M
            </span>
            <Head left={day} />
            <div className={s.pad} style={{ marginTop: '4cqw' }}>
              <div className={s.big} style={{ fontSize: '9cqw' }}>
                Dagens udvalgte kampe
              </div>
            </div>
            {/* Takes the room there is, so the Matchly bar always stays on the card */}
            <div className={s.storySix} style={{ marginTop: '5cqw', display: 'flex', flexDirection: 'column', gap: '1.5cqw', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }} data-fit>
              {rows(list, true)}
            </div>
            <Foot left={chunks.length > 1 ? `${i + 1}/${chunks.length} · ${picks.length} kampe` : `${picks.length} kampe`} />
          </Card>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Monday: the week in numbers

export function Week({ week, logos }: { week: WeekNumbers; logos: Logos }) {
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
                {goalAxis(goalsOf(g)).map(({ i, left, level }, k) => (
                  <span key={k}>
                    <i className={(scoringSide(i) === 'home' ? g.home : g.away) === winnerOf(g) ? s.dotOn : s.dotOff} style={{ left: `${left}%` }} />
                    <b className={s.minute} style={{ left: `${Math.max(3, Math.min(97, left))}%`, top: level ? '0.5cqw' : '5cqw' }}>
                      {i.minute}&apos;
                    </b>
                  </span>
                ))}
                <span className={s.scale} style={{ left: 0 }}>
                  0&apos;
                </span>
                <span className={s.scale} style={{ left: '47%' }}>
                  45&apos;
                </span>
                <span className={s.scale} style={{ right: 0 }}>
                  90&apos;
                </span>
              </div>
            )}
            <Scorers f={g} max={6} />
            {late >= 3 && !goalsOf(g).some((i) => i.player) && (
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
    </>
  )
}

// ---------------------------------------------------------------- before kick-off: stories

/** One match's story before kick-off: the two clubs in their colours and the match's fact */
function PreviewCard({ p, logos }: { p: Pick; logos: Logos }) {
  return (
  <Card story caption={`${p.fixture.home.name}–${p.fixture.away.name}`}>
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
  )
}

/** A kick-off's story when more matches start together, or the match has no fact: the matches in their colours */
function SlotListCard({ slot, picks, logos }: { slot: string; picks: Pick[]; logos: Logos }) {
  return (
    <Card story caption={`Kampstart kl. ${slot}`} style={BRAND} className={s.onColor}>
      <span className={cx(s.wmM, s.wmMGreen)} aria-hidden>
        M
      </span>
      <Head left={`Om en time · kl. ${slot}`} />
      <div className={s.pad} style={{ marginTop: '4cqw' }}>
        <div className={s.big} style={{ fontSize: '12cqw' }}>
          Kampstart
          <br />
          kl. {slot}
        </div>
      </div>
      <div style={{ marginTop: '6cqw', display: 'flex', flexDirection: 'column', gap: '1.5cqw', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }} data-fit>
        {picks.map((p) => (
          <FixtureRow key={p.fixture.id} p={p} logos={logos} story />
        ))}
      </div>
      <Foot left="Optakt" />
    </Card>
  )
}

/** One kick-off's story (one story per kick-off time): the match's own card when it starts alone and has a fact */
export function SlotStory({ slot, picks, logos }: { slot: string; picks: Pick[]; logos: Logos }) {
  return picks.length === 1 && picks[0].fact ? <PreviewCard p={picks[0]} logos={logos} /> : <SlotListCard slot={slot} picks={picks} logos={logos} />
}

/** The stories of a day, one per kick-off time */
export function Previews({ picks, logos }: { picks: Pick[]; logos: Logos }) {
  const slots = slotsOf(picks)
  if (!slots.length) return <p className={s.empty}>Ingen kommende kampe.</p>
  return (
    <div className={s.rail}>
      {slots.map(([slot, list]) => (
        <SlotStory key={slot} slot={slot} picks={list} logos={logos} />
      ))}
    </div>
  )
}

/** The picks by kick-off time "HH.MM", in order */
export function slotsOf(picks: Pick[]): [string, Pick[]][] {
  const map = new Map<string, Pick[]>()
  for (const p of picks) {
    const t = formatTime(p.fixture.kickoff)
    map.set(t, [...(map.get(t) ?? []), p])
  }
  return [...map.entries()]
}

/** The teams' fields in a list of matches: one neutral tone for every club, so the list reads calmly (the logos carry the clubs) */
const NEUTRAL_TEAM: CSSProperties = { background: '#2a2d26', color: '#ffffff' }

/** A match in neutral fields with the clubs' logos and the time between them */
function FixtureRow({ p, logos, story }: { p: Pick; logos: Logos; story?: boolean }) {
  return (
    <div className={cx(s.fixtureRow, story && s.storyRow)}>
      {[p.fixture.home, p.fixture.away].map((club, i) => (
        <div key={club.id} className={cx(s.fixtureTeam, i === 1 && s.right)} style={{ ...NEUTRAL_TEAM, gridColumn: i === 0 ? 1 : 3, gridRow: 1 }}>
          {i === 1 && <span className={s.fixtureName}>{club.name}</span>}
          <Crest club={club} logos={logos} plate />
          {i === 0 && <span className={s.fixtureName}>{club.name}</span>}
        </div>
      ))}
      <div className={s.fixtureTime} style={{ gridColumn: 2, gridRow: 1 }}>
        <b>{formatTime(p.fixture.kickoff)}</b>
        <small>{p.league}</small>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- evening: results

/** The evening carousel: the first card lists up to 5 results (scorers or not); a card of its own only for matches with every scorer named */
export function Results({ date, overview, picks, logos }: { date: string; overview: Pick[]; picks: Pick[]; logos: Logos }) {
  if (!overview.length) return <p className={s.empty}>Ingen færdige kampe endnu.</p>
  // All results, six to a card; a card of its own per match (with its scorers) only while it all fits a carousel of ten
  const pages: Pick[][] = []
  for (let i = 0; i < overview.length; i += PER_PROGRAMME_CARD) pages.push(overview.slice(i, i + PER_PROGRAMME_CARD))
  const finished = picks.filter((p) => p.finished)
  const done = pages.length + finished.length <= 10 ? finished : []
  const total = pages.length + done.length
  const day = String(new Date(`${date}T12:00:00Z`).getUTCDate())
  return (
    <>
      <div className={s.rail}>
        {pages.map((page, n) => (
        <StoryCard key={n} caption={pages.length > 1 ? `Resultater ${n + 1}/${pages.length}` : 'Forside'} mark={day} label={formatLong(date)} headline="Resultater" crests={[]} foot={`${n + 1}/${total}`} logos={logos}>
          <table className={s.tb} style={{ fontSize: '3.4cqw' }}>
            <tbody>
              {page.map((p) => (
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
        ))}
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
              foot={`${pages.length + k + 1}/${total}`}
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
    </>
  )
}


// ---------------------------------------------------------------- the day's topic (10–11)

/** A team from the statistics as a club for the cards */
const asClub = (t: { id: string; name: string; colors?: [string, string] }): Club => ({ id: t.id, slug: t.id, name: t.name, city: '', colors: t.colors ?? ['#16181a', '#ffffff'] })

/** A carousel's closing card: where to find the rest */
function EndCard({ label, mark, crests, total, logos, next }: { label: string; mark: string; crests: Club[]; total: number; logos: Logos; next?: string }) {
  return (
    <StoryCard
      caption="Afslutning"
      mark={mark}
      label={label}
      headline={
        <>
          Alle kampe,
          <br />
          tabeller og tal
        </>
      }
      crests={crests}
      foot={`${total}/${total}`}
      logos={logos}
    >
      <p className={s.serif} style={{ fontSize: '6.2cqw' }}>
        Link i profilen.{next ? ` ${next}` : ''}
      </p>
    </StoryCard>
  )
}

/** The league's top scorers */
export function ScorersCards({ division, rows, logos }: { division: Division; rows: ScorerRow[]; logos: Logos }) {
  const top = rows[0]
  return (
    <div className={s.rail}>
      <StoryCard
        caption="Topscorerne"
        club={asClub(top.club)}
        // No line above the headline: the list says who leads
        label=""
        headline="Topscorerne"
        crests={[]}
        foot="1/2"
        logos={logos}
        size={12}
      >
        <table className={cx(s.tb, s.oneLine)} style={{ fontSize: '3.6cqw' }}>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.player}-${r.club.id}`}>
                <td style={{ width: '8cqw', fontWeight: 700 }}>{i + 1}.</td>
                <td>
                  <span className={s.team}>
                    <Crest club={asClub(r.club)} logos={logos} plate /> {r.player}
                  </span>
                </td>
                <td className={s.r} style={{ fontWeight: 700 }}>
                  {r.goals}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StoryCard>
      <EndCard label={division.name} mark="#" crests={[asClub(top.club)]} total={2} logos={logos} />
    </div>
  )
}

const FORM_COLOR = { V: '#c6f135', U: 'rgba(255,255,255,0.55)', T: '#ff4a1f' } as const

/** The form table: points in the latest 5 matches */
export function FormCards({ division, rows, logos }: { division: Division; rows: FormRow[]; logos: Logos }) {
  const best = rows[0]
  const worst = rows[rows.length - 1]
  const list = (items: FormRow[]) => (
    <table className={cx(s.tb, s.oneLine)} style={{ fontSize: '3.5cqw' }}>
      <tbody>
        {items.map((r) => (
          <tr key={r.club.id}>
            <td>
              <span className={s.team}>
                <Crest club={r.club} logos={logos} plate /> {r.club.name}
              </span>
            </td>
            <td style={{ width: '30cqw', textAlign: 'right' }}>
              {r.form.map((x, i) => (
                <span key={i} className={s.formDot} style={{ background: FORM_COLOR[x], color: x === 'U' ? '#16181a' : x === 'V' ? '#16181a' : '#fff' }}>
                  {x}
                </span>
              ))}
            </td>
            <td className={s.r} style={{ fontWeight: 700 }}>
              {r.points} p.
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <div className={s.rail}>
      <StoryCard caption="Formtabellen" mark="5" label={`${division.name} · de seneste 5 kampe`} headline="Formtabellen" crests={[]} foot="1/3" logos={logos} size={12}>
        {list(rows.slice(0, 8))}
      </StoryCard>
      <StoryCard
        caption="I form"
        club={best.club}
        label={`${division.name} · nr. ${best.pos} i tabellen`}
        headline={`${best.points} af 15 point`}
        crests={[best.club]}
        line={`${best.club.name} er ligaens bedste hold lige nu`}
        foot="2/3"
        logos={logos}
        size={11}
      >
        <p className={s.serif} style={{ fontSize: '6cqw' }}>
          {best.form.filter((x) => x === 'V').length} sejre og {best.goals[0]}–{best.goals[1]} i mål i de seneste 5 kampe.
        </p>
        {worst && worst !== best && (
          <p className={s.serif} style={{ fontSize: '5cqw', marginTop: '4cqw', opacity: 0.85 }}>
            I bunden: {worst.club.name} med {worst.points} point.
          </p>
        )}
      </StoryCard>
      <EndCard label={division.name} mark="5" crests={[best.club]} total={3} logos={logos} />
    </div>
  )
}

/** The league table: 6 teams per card */
export function TableCards({ division, rows, logos }: { division: Division; rows: StandingRow[]; logos: Logos }) {
  const leader = rows[0]
  const parts = Array.from({ length: Math.ceil(Math.min(rows.length, 24) / 6) }, (_, i) => rows.slice(i * 6, i * 6 + 6))
  const total = parts.length + 1
  return (
    <div className={s.rail}>
      {parts.map((part, k) => (
        <StoryCard
          key={k}
          caption={k === 0 ? 'Tabellen' : `Nr. ${k * 6 + 1}–${k * 6 + part.length}`}
          club={k === 0 ? leader.club : undefined}
          mark={k === 0 ? undefined : String(k * 6 + 1)}
          label={k === 0 ? `${division.name} · ${leader.played} kampe spillet` : division.name}
          headline={k === 0 ? 'Stillingen' : `Nr. ${k * 6 + 1}–${k * 6 + part.length}`}
          crests={[]}
          foot={`${k + 1}/${total}`}
          logos={logos}
          size={11}
        >
          <table className={cx(s.tb, s.oneLine)} style={{ fontSize: '3.4cqw' }}>
            <tbody>
              {part.map((r, i) => (
                <tr key={r.club.id}>
                  <td style={{ width: '8cqw', fontWeight: 700 }}>{k * 6 + i + 1}.</td>
                  <td>
                    <span className={s.team}>
                      <Crest club={r.club} logos={logos} plate /> {r.club.name}
                    </span>
                  </td>
                  <td className={s.r} style={{ width: '9cqw', opacity: 0.8 }}>
                    {r.played}
                  </td>
                  <td className={s.r} style={{ width: '11cqw', opacity: 0.8 }}>
                    {r.goalsFor - r.goalsAgainst > 0 ? '+' : ''}
                    {r.goalsFor - r.goalsAgainst}
                  </td>
                  <td className={s.r} style={{ width: '10cqw', fontWeight: 700 }}>
                    {r.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </StoryCard>
      ))}
      <EndCard label={division.name} mark="1" crests={[leader.club]} total={total} logos={logos} />
    </div>
  )
}

/** The fact and its numbers, as on the preview story */
/** The match's fact and its proof; `rows` limits the proof to the newest meetings, so the text never runs off the card */
function FactBlock({ p, size = 7, rows }: { p: Pick; size?: number; rows?: number }) {
  if (!p.fact) return null
  const proof = rows ? p.fact.proof.slice(0, rows) : p.fact.proof
  return (
    <>
      <p className={s.serif} style={{ fontSize: `${size}cqw`, lineHeight: 1.05 }}>
        {p.fact.text}
      </p>
      <div className={s.sub} style={{ marginTop: '4cqw', marginBottom: '1cqw' }}>
        {/* Cut short: the fact's own heading, with how many of them are shown */}
        {proof.length < p.fact.proof.length ? `${p.fact.proofTitle} – de ${proof.length} nyeste` : p.fact.proofTitle}
      </div>
      <table className={cx(s.tb, s.oneLine)} style={{ fontSize: '3.3cqw' }}>
        <tbody>
          {proof.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className={s.r}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const weekdayTime = (d: Date) => `${formatLong(d).split(' ')[0]} kl. ${formatTime(d)}`

/** The week's biggest match */
/** The head-to-head in words: who leads, or the one meeting there is */
function h2hSentence(home: string, away: string, h: { w: number; d: number; l: number; n: number }, last?: { home: string; away: string; hs: number; as: number }) {
  if (h.n === 1 && last) {
    if (last.hs === last.as) return `Det seneste opgør endte uafgjort ${last.hs}–${last.as}.`
    const winner = last.hs > last.as ? last.home : last.away
    return `${winner} vandt det seneste opgør ${Math.max(last.hs, last.as)}–${Math.min(last.hs, last.as)}.`
  }
  if (h.w > h.l) return `${home} fører ${h.w}–${h.l} i de seneste ${h.n} opgør.`
  if (h.l > h.w) return `${away} fører ${h.l}–${h.w} i de seneste ${h.n} opgør.`
  return `Helt lige: ${h.w}–${h.l} i de seneste ${h.n} opgør.`
}

/** A focus match's result: the score large between the two logos, and the goals */
export function FocusResultCards({ p, logos }: { p: Pick; logos: Logos }) {
  const f = p.fixture
  const goals = goalsOf(f)
  let h = 0
  let a = 0
  return (
    <div className={s.rail}>
      <StoryCard caption="Slutresultat" club={winnerOf(f) ?? f.home} natural center label={p.women ? 'Slut' : `${p.league} · slut`} headline="Slutresultat" size={8.5} crests={[]} foot="" logos={logos}>
        {logos[p.league] && (
          <div className={s.leagueLine}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the league's logo */}
            <img src={logos[p.league]} alt={p.league} />
          </div>
        )}
        <div className={s.h2hBig}>
          <div>
            <Crest club={f.home} logos={logos} large plate />
            <span>{f.home.name}</span>
          </div>
          <div className={s.h2hBigScore}>
            <b>{score(f)}</b>
            <small>Fuldtid</small>
          </div>
          <div>
            <Crest club={f.away} logos={logos} large plate />
            <span>{f.away.name}</span>
          </div>
        </div>
        {goals.length > 0 && (
          <div className={s.h2hRows}>
            <div className={s.h2hRowsTitle}>Målene</div>
            <table className={cx(s.tb, s.oneLine)} style={{ fontSize: '3.4cqw' }}>
              <tbody>
                {goals.slice(0, 5).map((i, n) => {
                  const side = scoringSide(i)
                  if (side === 'home') h++
                  else a++
                  return (
                    <tr key={n}>
                      <td className={s.k}>{i.minute}&apos;</td>
                      <td>
                        <span className={s.team}>
                          <Crest club={side === 'home' ? f.home : f.away} logos={logos} plate /> {i.player ?? 'Mål'}
                          {i.kind === 'penalty' ? ' (str.)' : i.kind === 'own-goal' ? ' (selvmål)' : ''}
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
        )}
      </StoryCard>
    </div>
  )
}

export function BigMatchCards({ p, logos, focus }: { p: Pick; logos: Logos; focus?: boolean }) {
  const f = p.fixture
  const pos = [p.home.pos && `${f.home.name} er nr. ${p.home.pos}`, p.away.pos && `${f.away.name} nr. ${p.away.pos}`].filter(Boolean).join(', ')
  // The head-to-head card: the focus match's own lookup, else the fact when it is the head-to-head
  const meet = p.h2h ?? (p.fact?.h2h ? p.fact : undefined)
  const h2h = meet?.h2h
  return (
    <div className={s.rail}>
      <StoryCard
        caption={focus ? 'Fokuskamp' : 'Ugens kamp'}
        club={f.home}
        // A women's card has the league in its tag: the line only says when
        label={p.women ? weekdayTime(f.kickoff) : `${p.league} · ${weekdayTime(f.kickoff)}`}
        headline={focus ? 'Kampens fokus' : 'Ugens kamp'}
        natural={focus}
        center={focus}
        crests={[f.home, f.away]}
        line={`${f.home.name} – ${f.away.name}`}
        foot="Optakt"
        logos={logos}
        size={focus ? 8.5 : 12}
      >
        {/* The league's own logo by its name */}
        {focus && logos[p.league] && (
          <div className={s.leagueLine}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the league's logo */}
            <img src={logos[p.league]} alt={p.league} />
          </div>
        )}
        {/* One card: the match on top, the head-to-head under it (who leads, the latest meeting large or the meetings counted) */}
        {h2h && meet ? (
          <>
          <p className={s.serif} style={{ fontSize: '5.2cqw', lineHeight: 1.08, marginBottom: '3cqw' }}>
            {h2hSentence(f.home.name, f.away.name, h2h, meet.meetings?.[0])}
          </p>
          {h2h.n < 3 && meet.meetings?.[0] ? (
            // One or two meetings: the latest one large, logos and score (counting wins says nothing yet)
            (() => {
              const m = meet.meetings![0]
              const club = (name: string) => (name === f.home.name ? f.home : name === f.away.name ? f.away : undefined)
              const home = club(m.home)
              const away = club(m.away)
              return (
                <div className={s.h2hBig}>
                  <div>
                    {home && <Crest club={home} logos={logos} large plate />}
                    <span>{m.home}</span>
                  </div>
                  <div className={s.h2hBigScore}>
                    <b>
                      {m.hs}–{m.as}
                    </b>
                    <small>{m.year}</small>
                  </div>
                  <div>
                    {away && <Crest club={away} logos={logos} large plate />}
                    <span>{m.away}</span>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className={s.h2hNums}>
              <div className={h2h.w > h2h.l ? s.lead : undefined}>
                <Crest club={f.home} logos={logos} plate />
                <b>{h2h.w}</b>
                <span>sejre</span>
              </div>
              <div>
                <i className={s.h2hEq}>=</i>
                <b>{h2h.d}</b>
                <span>uafgjort</span>
              </div>
              <div className={h2h.l > h2h.w ? s.lead : undefined}>
                <Crest club={f.away} logos={logos} plate />
                <b>{h2h.l}</b>
                <span>sejre</span>
              </div>
            </div>
          )}
          {meet.meetings && meet.meetings.length > (h2h.n < 3 ? 1 : 0) && (
            <div className={s.h2hRows}>
              <div className={s.h2hRowsTitle}>{h2h.n < 3 ? 'Opgøret før' : 'Seneste opgør'}</div>
              {meet.meetings.slice(h2h.n < 3 ? 1 : 0, h2h.n < 3 ? 2 : 1).map((m, i) => {
                const club = (name: string) => (name === f.home.name ? f.home : name === f.away.name ? f.away : undefined)
                const home = club(m.home)
                const away = club(m.away)
                return (
                  <div key={i} className={s.h2hRow}>
                    <small>{m.year}</small>
                    <span className={s.h2hTeam}>
                      {home && <Crest club={home} logos={logos} plate />}
                      {m.home}
                    </span>
                    <b className={s.h2hScore}>
                      {m.hs}–{m.as}
                    </b>
                    <span className={cx(s.h2hTeam, s.right)}>
                      {m.away}
                      {away && <Crest club={away} logos={logos} plate />}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          </>
        ) : p.fact ? (
          <FactBlock p={p} size={6.4} />
        ) : (
          pos && (
            <p className={s.serif} style={{ fontSize: '6.4cqw' }}>
              {pos}.
            </p>
          )
        )}
      </StoryCard>
    </div>
  )
}

/** The weekend's programme: one card per day */
export function WeekendCards({ days, logos }: { days: { date: string; picks: Pick[] }[]; logos: Logos }) {
  // At most six matches on a card: a day with more goes on over more cards
  const cards = days.flatMap((d) => {
    const parts: Pick[][] = []
    for (let i = 0; i < d.picks.length; i += PER_PROGRAMME_CARD) parts.push(d.picks.slice(i, i + PER_PROGRAMME_CARD))
    return parts.map((picks, n) => ({ date: d.date, picks, part: parts.length > 1 ? n + 1 : 0 }))
  })
  const total = cards.length + 1
  return (
    <div className={s.rail}>
      {cards.map((d, i) => {
        const long = formatLong(d.date)
        return (
          <StoryCard
            key={`${d.date}-${d.part}`}
            caption={d.part ? `${long} (${d.part})` : long}
            mark={String(new Date(`${d.date}T12:00:00Z`).getUTCDate())}
            logoMark={i === 0}
            label={d.part > 1 ? 'Weekendens kampe (fortsat)' : 'Weekendens kampe'}
            headline={long.charAt(0).toUpperCase() + long.slice(1)}
            size={8.5}
            crests={[]}
            foot={`${i + 1}/${total}`}
            logos={logos}
          >
            <div className={cx(s.fixtures, s.fixturesSix)}>
              {d.picks.map((p) => (
                <FixtureRow key={p.fixture.id} p={p} logos={logos} />
              ))}
            </div>
          </StoryCard>
        )
      })}
      <EndCard label="Weekenden" mark="W" crests={[]} total={total} logos={logos} next="Live-stilling og målscorere hele weekenden." />
    </div>
  )
}

/** A fact about each of the day's matches */
export function FactsCards({ date, picks, logos }: { date: string; picks: Pick[]; logos: Logos }) {
  const total = picks.length + 1
  const long = formatLong(date)
  return (
    <div className={s.rail}>
      <StoryCard
        caption="Forside"
        mark={String(new Date(`${date}T12:00:00Z`).getUTCDate())}
        logoMark
        label={long.charAt(0).toUpperCase() + long.slice(1)}
        headline="Dagens fakta"
        crests={[]}
        foot={`1/${total}`}
        logos={logos}
      >
        <div className={s.fixtures}>
          {picks.map((p) => (
            <FixtureRow key={p.fixture.id} p={p} logos={logos} />
          ))}
        </div>
      </StoryCard>
      {picks.map((p, i) => (
        <StoryCard
          key={p.fixture.id}
          caption={`${p.fixture.home.name}–${p.fixture.away.name}`}
          club={p.fixture.home}
          label={`${p.league} · kl. ${formatTime(p.fixture.kickoff)}`}
          headline={`${p.fixture.home.name} – ${p.fixture.away.name}`}
          size={8}
          crests={[p.fixture.home, p.fixture.away]}
          foot={`${i + 2}/${total}`}
          logos={logos}
        >
          {/* Headline, crests and the fact take most of the card: the three newest meetings fit under them */}
          <FactBlock p={p} size={6} rows={3} />
        </StoryCard>
      ))}
    </div>
  )
}

/** Every card of one post, from its content (src/lib/socialContent.ts) */
export function PostCards({ content: c, logos }: { content: Content; logos: Logos }) {
  // Women's football: the same cards in its own colours and with its tag
  if ('women' in c && c.women) {
    // The tag says the league when every match is from one ("A-LIGA"), else women's football
    const leagues = new Set(
      (c.kind === 'programme' || c.kind === 'story' ? c.picks : c.kind === 'results' ? c.overview : c.kind === 'topic' && c.topic === 'bigmatch' ? [c.pick] : []).map((p) => p.league),
    )
    const tag = leagues.size === 1 ? [...leagues][0] : 'Kvindefodbold'
    return (
      <div className={s.women} style={{ '--women-tag': JSON.stringify(tag) } as CSSProperties}>
        {PostCardsOf(c, logos)}
      </div>
    )
  }
  return PostCardsOf(c, logos)
}

function PostCardsOf(c: Content, logos: Logos) {
  switch (c.kind) {
    case 'programme':
      return <Programme date={c.date} picks={c.picks} logos={logos} />
    case 'story':
      return (
        <div className={s.rail}>
          <SlotStory slot={c.slot} picks={c.picks} logos={logos} />
        </div>
      )
    case 'results':
      // A focus match's result: its own card; else the day's results
      if (c.focus && c.overview[0]) return <FocusResultCards p={c.overview[0]} logos={logos} />
      return <Results date={c.date} overview={c.overview} picks={c.detailed} logos={logos} />
    case 'topic':
      switch (c.topic) {
        case 'week':
          return <Week week={c.week} logos={logos} />
        case 'scorers':
          return <ScorersCards division={c.division} rows={c.rows} logos={logos} />
        case 'form':
          return <FormCards division={c.division} rows={c.rows} logos={logos} />
        case 'table':
          return <TableCards division={c.division} rows={c.rows} logos={logos} />
        case 'bigmatch':
          return <BigMatchCards p={c.pick} logos={logos} focus={c.focus} />
        case 'weekend':
          return <WeekendCards days={c.days} logos={logos} />
        case 'facts':
          return <FactsCards date={c.date} picks={c.picks} logos={logos} />
      }
  }
}
