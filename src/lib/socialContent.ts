import 'server-only'
import { focusPick, leagueName,
  bigMatchTopic,
  factsTopic,
  formTopic,
  hasNamedScorers,
  isFinishedMatch,
  LEAGUE_MATCHES,
  leagueOnly,
  pickMatches,
  picksFor,
  scorersTopic,
  tableTopic,
  topicDivision,
  weekNumbers,
  weekendTopic,
  type FormRow,
  type Pick,
  type WeekNumbers,
} from './social'
import { DIVISIONS, type Division } from '../data/leagues'
import type { ScorerRow } from '../data/stats'
import type { StandingRow } from '../data/season'
import { getBadges } from './badges'
import { formatLong, formatTime, isoDate } from './time'
import { SITE_URL, paths } from './site'
import { TOPICS, type PostKind, type TopicId } from './socialStore'

// What a post is about, from its kind, date and the day's picked matches: the
// data for its cards (src/app/admin/sociale/cards.tsx), its text and a title
// for the admin. Nothing here posts anything.

export interface PostSpec {
  kind: PostKind
  date: string
  topic?: TopicId
  slot?: string
  matchIds: string[]
  /** Women's football: its own posts and look */
  women?: boolean
  /** One of our leagues (Division id), or up to three separated by commas: the post is made from those leagues alone instead of the day's picks and the topic league */
  league?: string
  /** A match picked by hand (its id): the focus match card with the head-to-head, instead of the week's biggest match */
  focus?: string
}

export type Content =
  | { kind: 'programme'; date: string; picks: Pick[]; women?: boolean }
  | { kind: 'story'; date: string; slot: string; picks: Pick[]; women?: boolean }
  | { kind: 'results'; date: string; overview: Pick[]; detailed: Pick[]; women?: boolean; focus?: boolean }
  | { kind: 'topic'; topic: 'week'; date: string; week: WeekNumbers }
  | { kind: 'topic'; topic: 'scorers'; date: string; division: Division; rows: ScorerRow[] }
  | { kind: 'topic'; topic: 'form'; date: string; division: Division; rows: FormRow[] }
  | { kind: 'topic'; topic: 'table'; date: string; division: Division; rows: StandingRow[] }
  | { kind: 'topic'; topic: 'bigmatch'; date: string; pick: Pick; focus?: boolean; women?: boolean }
  | { kind: 'topic'; topic: 'weekend'; date: string; days: { date: string; picks: Pick[] }[] }
  | { kind: 'topic'; topic: 'facts'; date: string; picks: Pick[] }

/** The post's data, or undefined when there is nothing good enough to post */
export function contentFor(spec: PostSpec, now: number): Content | undefined {
  const { date, women } = spec
  // Made for one league: its own matches of the day (a whole round) instead of the picked ones
  const only = spec.league ? leagueOnly(spec.league) : () => true
  // A whole round for each chosen league
  const leagueCount = spec.league ? spec.league.split(',').filter(Boolean).length : 0
  const matchIds = spec.league ? pickMatches(date, now, only, LEAGUE_MATCHES * leagueCount).map((p) => p.fixture.id) : spec.matchIds
  switch (spec.kind) {
    case 'programme': {
      const picks = picksFor(date, now, matchIds)
      return picks.length ? { kind: 'programme', date, picks, women } : undefined
    }
    case 'story': {
      const picks = picksFor(date, now, matchIds).filter((p) => formatTime(p.fixture.kickoff) === spec.slot)
      return picks.length ? { kind: 'story', date, slot: spec.slot!, picks, women } : undefined
    }
    case 'results': {
      // A focus match's result: that one match, looked for over the week from the date (it may have been played a day later)
      const overview = spec.focus ? [focusPick(date, now, spec.focus)].filter((p): p is Pick => !!p && p.finished) : picksFor(date, now, matchIds, isFinishedMatch)
      return overview.length
        ? { kind: 'results', date, overview, detailed: overview.filter((p) => hasNamedScorers(p.fixture)), women: women || overview.some((p) => p.women), focus: !!spec.focus }
        : undefined
    }
    case 'topic': {
      // A topic about one league: the first chosen
      const div = spec.league ? DIVISIONS.find((d) => d.id === spec.league!.split(',')[0]) : topicDivision()
      switch (spec.topic) {
        case 'week': {
          const week = weekNumbers(date, only)
          return week.mostGoals || week.upset || week.streak || week.crowd ? { kind: 'topic', topic: 'week', date, week } : undefined
        }
        case 'scorers': {
          const t = div && scorersTopic(div)
          return t ? { kind: 'topic', topic: 'scorers', date, ...t } : undefined
        }
        case 'form': {
          const t = div && formTopic(div, now)
          return t ? { kind: 'topic', topic: 'form', date, ...t } : undefined
        }
        case 'table': {
          const t = div && tableTopic(div, now)
          return t ? { kind: 'topic', topic: 'table', date, ...t } : undefined
        }
        case 'bigmatch': {
          // A focus match picked by hand, else the week's biggest
          const pick = spec.focus ? focusPick(date, now, spec.focus) : bigMatchTopic(date, now, only)
          return pick ? { kind: 'topic', topic: 'bigmatch', date, pick, focus: !!spec.focus, women: !!(spec.women || pick.women) } : undefined
        }
        case 'weekend': {
          const days = weekendTopic(date, now, only, spec.league ? LEAGUE_MATCHES * leagueCount : undefined)
          return days ? { kind: 'topic', topic: 'weekend', date, days } : undefined
        }
        case 'facts': {
          const picks = factsTopic(date, now, matchIds)
          return picks ? { kind: 'topic', topic: 'facts', date, picks } : undefined
        }
      }
    }
  }
  return undefined
}

const score = (p: Pick) => `${p.fixture.score[0]}–${p.fixture.score[1]}`
const vs = (p: Pick) => `${p.fixture.home.name} – ${p.fixture.away.name}`
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** The admin's name for the post */
export function titleFor(spec: PostSpec): string {
  if (spec.women) return `Kvindefodbold: ${titleFor({ ...spec, women: false }).toLowerCase()}`
  const names = (spec.league ?? '').split(',').filter(Boolean).map(leagueName)
  const title =
    spec.focus ? 'Fokuskamp' : spec.kind === 'programme' ? 'Dagens kampe' : spec.kind === 'story' ? `Story før kampstart kl. ${spec.slot}` : spec.kind === 'results' ? 'Resultater' : `Dagens emne: ${TOPICS.find((t) => t.id === spec.topic)?.name ?? spec.topic}`
  return names.length ? `${title} · ${names.join(', ')}` : title
}

/** The post's text (the platform's ending and hashtags are added when it is posted) */
// ---------------------------------------------------------------- the texts

/** Ten ways to end a post before the matches: the call to follow along (programme, stories) */
const LIVE_OUTROS = [
  'Følg alle kampene live på matchly.dk 📲',
  'Live score og stillinger på matchly.dk ⚡',
  'Hvem vinder i dag? Skriv dit bud i kommentarerne 👇',
  'Hvilken kamp skal du se? Fortæl os det 👇',
  'Vi opdaterer live hele dagen på matchly.dk 🔄',
  'Del med en, der skal med på stadion 🏟️',
  'Alle mål og tabeller – live på matchly.dk',
  'Tag din fodboldven, der aldrig går glip af en kamp 🙌',
  'Hold øje med stillingen live på matchly.dk 📊',
  'God kampdag! ⚽',
]
/** …and after the matches: results, tables and numbers */
const AFTER_OUTROS = [
  'Alle resultater og tabeller på matchly.dk 📊',
  'Hvem imponerede mest? Skriv det i kommentarerne 👇',
  'Se hele stillingen på matchly.dk',
  'Enig eller uenig? 👇',
  'Tag en ven, der skal se det her 🙌',
  'Mere statistik på matchly.dk 📈',
  'Hvad siger du til det? 👀',
  'Følg med på matchly.dk – vi har alle tallene',
  'Del gerne med en anden fodboldnørd ⚽',
  'Vi ses til næste runde! 🔥',
]

const pickOf = <T,>(list: T[], i: number) => list[((i % list.length) + list.length) % list.length]
/** The day's own variant: another one every day, the same all day for the same post */
function seedOf(c: Content) {
  const key = `${c.date}-${c.kind}-${c.kind === 'topic' ? c.topic : ''}`
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 10
}

/** A post's text in ten versions: each with its own opening line and ending, the facts the same */
export function captionVariants(c: Content): string[] {
  const day = 'date' in c ? cap(formatLong(c.date)) : ''
  const dayLower = day.toLowerCase()
  const women = 'women' in c && c.women ? 'Kvindefodbold ⚽ ' : ''
  const out = (intros: string[], body: string[], outros: string[]) =>
    intros.map((intro, i) => [women + intro, '', ...body, '', pickOf(outros, i * 3 + 1)].join('\n'))
  switch (c.kind) {
    case 'programme': {
      const n = c.picks.length
      const body = c.picks.map((p) => `${formatTime(p.fixture.kickoff)} ${vs(p)} (${p.league})`)
      return out(
        [
          `${day} er fyldt med fodbold ⚽ Her er kampene, du ikke vil misse:`,
          `Kaffen er klar, programmet er klar ☕⚽ ${day}:`,
          `Hvad skal du se i dag? Vi har samlet ${n} kampe til dig 👇`,
          `Kampdag! 🔥 Det her sker ${dayLower}:`,
          `Sæt kryds i kalenderen – ${n} kampe venter ${dayLower} 🗓️`,
          'Fløjten lyder snart 📣 Dagens program:',
          'Ingen kedelig dag her! Se dagens kampe ⚽',
          'Klar til en dag med mål, drama og lokalopgør? 👀',
          'Dagens menu er serveret 🍽️⚽',
          'Fra første fløjt til sidste dommerkast – det er dagens kampe:',
        ],
        body,
        LIVE_OUTROS,
      )
    }
    case 'story': {
      const body = c.picks.map((p) => `${vs(p)} kl. ${formatTime(p.fixture.kickoff)}`)
      return Array.from({ length: 10 }, () => body.join('\n'))
    }
    case 'results': {
      const body = c.overview.map((p) => `${p.fixture.home.name} ${score(p)} ${p.fixture.away.name}`)
      return out(
        c.focus ? [
          'Slutfløjt! 🏁',
          'Sådan endte det ⚽',
          'Kampen er slut – her er resultatet 👇',
          'Det blev til en afgørelse 🔥',
          'Fuldtid! ⏱️',
          'Point fordelt – sådan gik det:',
          'Hvad siger du til det resultat? 👀',
          'Slut på dagens fokuskamp ⚽',
          'Resultatet er i hus ✅',
          'Dommeren har fløjtet af 📣',
        ] : [
          'Slutfløjt! 🏁 Her er dagens resultater:',
          `Sådan endte det ${dayLower} ⚽`,
          'Point blev vundet, point blev tabt – resultaterne er her 👇',
          'Mål, drama og et par overraskelser 😮 Dagens resultater:',
          'Dagen er spillet færdig. Her er tallene 📋',
          'Hvem jubler, og hvem bander? Se resultaterne 👇',
          'Resultaterne er i hus ✅',
          `${day}: sådan gik det på banerne`,
          'Så er der talt op! ⚽ Alle resultater:',
          'Tabellen har rykket sig – her er dagens resultater 📊',
        ],
        body,
        AFTER_OUTROS,
      )
    }
    case 'topic':
      switch (c.topic) {
        case 'week': {
          const { mostGoals: g, upset: u, streak: st, crowd: cr } = c.week
          const body = [
            g && `⚽ ${g.home.name} og ${g.away.name} delte ${g.score[0] + g.score[1]} mål.`,
            u && `😮 I ${u.fixture.division!.name} slog nr. ${u.winnerPos} nr. ${u.loserPos}.`,
            st && `🔥 ${st.club.name} er nu ${st.length} kampe uden nederlag.`,
            cr && `🏟️ ${cr.fixture.spectators!.toLocaleString('da-DK')} tilskuere så ${cr.fixture.home.name} – ${cr.fixture.away.name}.`,
          ].filter((x): x is string => !!x)
          return out(
            [
              'Ugen i tal 📊',
              'Ugens vildeste tal – har du styr på dem? 🤓',
              'Syv dage, masser af fodbold. Det her stak ud:',
              'Ugen der gik, kogt ned til fire tal 👇',
              'Nørd-hjørnet er åbent 🤓 Ugens tal:',
              'Det skete i ugens løb ⚽',
              'Tal, der fortæller historien om ugen 📈',
              'Ugens højdepunkter – målt og vejet:',
              'Fik du det hele med? Her er ugens tal 👀',
              'Ugens fodbold i tal og fakta:',
            ],
            body,
            AFTER_OUTROS,
          )
        }
        case 'scorers': {
          const top = c.rows[0]
          const body = c.rows.slice(0, 5).map((r, i) => `${i + 1}. ${r.player} (${r.club.name}) ${r.goals} mål`)
          const l = c.division.name
          return out(
            [
              `Målmaskinerne i ${l} 🎯`,
              `Hvem har kanonen ladt? Topscorerlisten i ${l} ⚽`,
              `${top.player} topper listen med ${top.goals} mål – men hvem følger efter? 👀`,
              `Næsen for mål 👃⚽ Topscorerne i ${l}:`,
              `Kampen om topscorertitlen i ${l} er i gang 🔥`,
              `De her ved, hvor målet står 🥅`,
              `Topscorerne i ${l} lige nu:`,
              `Skarpe skytter i ${l} 🎯 Her er listen:`,
              `Hvem ender som topscorer i ${l}? Status lige nu 👇`,
              `Netmasken har haft travlt 🥅 Topscorerne i ${l}:`,
            ],
            body,
            AFTER_OUTROS,
          )
        }
        case 'form': {
          const body = c.rows.slice(0, 5).map((r, i) => `${i + 1}. ${r.club.name} ${r.points} p. (${r.form.join('')})`)
          const l = c.division.name
          return out(
            [
              `Hvem er i form i ${l}? 🔥 Point i de seneste 5 kampe:`,
              `Formtabellen i ${l} 📈`,
              `Glem stillingen et øjeblik – det her er formen lige nu 👀`,
              `De varmeste hold i ${l} 🔥`,
              `Hvem har momentum? Formtabellen i ${l}:`,
              `Seneste 5 kampe, ${l} – sådan ser det ud:`,
              `Formkurven peger opad for de her hold 📈`,
              `Holdene, ingen har lyst til at møde lige nu 😬`,
              `Formen taler sit tydelige sprog i ${l}:`,
              `Topformen i ${l} – målt på de seneste 5 kampe ⚽`,
            ],
            body,
            AFTER_OUTROS,
          )
        }
        case 'table': {
          const body = c.rows.slice(0, 6).map((r, i) => `${i + 1}. ${r.club.name} ${r.points} p.`)
          const l = c.division.name
          return out(
            [
              `Stillingen i ${l} 📊`,
              `Sådan ser toppen ud i ${l} lige nu 👀`,
              `Hvem tager føringen? Tabellen i ${l}:`,
              `Tæt løb i toppen af ${l} 🔥`,
              `Status på ${l}:`,
              `Tabellen lyver ikke – ${l} lige nu 📋`,
              `Kampen om toppen i ${l} 🏆`,
              `Her står det i ${l} ⚽`,
              `Hvem slutter øverst i ${l}? Stillingen lige nu 👇`,
              `Tabelkig: ${l} 📈`,
            ],
            body,
            AFTER_OUTROS,
          )
        }
        case 'bigmatch': {
          const p = c.pick
          const when = `${formatLong(p.fixture.kickoff)} kl. ${formatTime(p.fixture.kickoff)}`
          const body = [`${vs(p)} · ${when} (${p.league})`, ...(p.fact ? ['', p.fact.text] : [])]
          return out(
            c.focus ? [
              'Dagens fokuskamp 🔥',
              'Den her kamp skal du ikke gå glip af 👀',
              'Vi har sat fokus på det her opgør ⚽',
              'Klar til kamp? Her er det indbyrdes regnskab 📊',
              'Der er lagt op til et brag 💥',
              'Hvem vinder? Historikken taler sit tydelige sprog 👇',
              'Alt er klar – og sådan har det gået i de seneste opgør:',
              'Opgøret alle taler om ⚽🔥',
              'Fokus på kampen – og på tallene bag 🤓',
              'Glæd dig til kampen – her er optakten:',
            ] : [
              'Ugens kamp 🔥',
              'Den her kamp skal du ikke gå glip af 👀',
              'Sæt kryds i kalenderen – ugens store opgør:',
              'Ugens kamp er fundet ⚽',
              'Der er lagt op til et brag 💥',
              'Alt er klar til ugens topkamp:',
              'Hvem trækker det længste strå? Ugens kamp:',
              'Ugens opgør – og der er meget på spil 🏆',
              'Det her bliver ugens kamp ⚽🔥',
              'Glæd dig til ugens største kamp:',
            ],
            body,
            LIVE_OUTROS,
          )
        }
        case 'weekend': {
          const body = c.days.flatMap((d, i) => [...(i ? [''] : []), `${cap(formatLong(d.date))}:`, ...d.picks.map((p) => `${formatTime(p.fixture.kickoff)} ${vs(p)} (${p.league})`)])
          return out(
            [
              'Weekendens kampe 📅',
              'Weekenden er reddet – her er kampene ⚽',
              'Hvad skal du se i weekenden? 👇',
              'Fodboldweekend! 🔥 Her er programmet:',
              'Planlæg weekenden efter de her kampe 🗓️',
              'Lørdag og søndag i fodboldens tegn ⚽',
              'Weekendens menu er klar 🍽️⚽',
              'Det her sker i weekenden 👀',
              'Klar til en weekend med fodbold? Her er kampene:',
              'Weekendprogrammet – gem det til senere 📌',
            ],
            body,
            LIVE_OUTROS,
          )
        }
        case 'facts': {
          const body = c.picks.map((p) => `${vs(p)}: ${p.fact!.text}`)
          return out(
            [
              'Dagens fakta 🤓',
              'Vidste du det? Fakta om dagens kampe 👇',
              'Lidt nørdviden før kampene 🤓',
              'Tal, du kan imponere med i dag 📊',
              'Inden fløjten lyder – dagens fakta:',
              'Statistikken har talt ⚽',
              'Det siger tallene før dagens kampe:',
              'Fakta-tjek før kickoff ✅',
              'Gode tal at kende i dag 👀',
              'Klar til kamp? Her er dagens fakta:',
            ],
            body,
            LIVE_OUTROS,
          )
        }
      }
  }
}

/** The list in a post's text (the matches, results or numbers), without the opening and the ending */
export function captionList(c: Content): string {
  const lines = captionVariants(c)[0].split('\n')
  return c.kind === 'story' ? lines.join('\n') : lines.slice(2, -2).join('\n')
}

/** The post's text: one of its ten versions (by default the day's own, so the text changes from day to day) */
export function captionFor(c: Content, variant?: number): string {
  const all = captionVariants(c)
  return pickOf(all, variant ?? seedOf(c))
}

/** The page the post points to on our site */
export function linkFor(c: Content): string {
  if ('women' in c && c.women) return `${SITE_URL}${paths.women({ sport: 'soccer' })}`
  if (c.kind === 'topic' && 'division' in c) return `${SITE_URL}${paths.league(c.division.slug)}`
  if (c.kind === 'topic' && c.topic === 'bigmatch') return `${SITE_URL}${paths.match(c.pick.fixture.slug)}`
  if (c.kind === 'story' && c.picks.length === 1) return `${SITE_URL}${paths.match(c.picks[0].fixture.slug)}`
  const today = isoDate(Date.now())
  return `${SITE_URL}${paths.home({ dato: c.date, today })}`
}

/** The logos the cards show: ours, plus the ones the sources sent with their games */
export async function logosFor(c: Content): Promise<Record<string, string>> {
  const picks: Pick[] =
    c.kind === 'programme' || c.kind === 'story'
      ? c.picks
      : c.kind === 'results'
        ? c.overview
        : c.topic === 'bigmatch'
          ? [c.pick]
          : c.topic === 'weekend'
            ? c.days.flatMap((d) => d.picks)
            : c.topic === 'facts'
              ? c.picks
              : []
  const logos: Record<string, string> = Object.assign({}, ...picks.map((p) => p.logos ?? {}))
  if (c.kind === 'topic' && c.topic === 'scorers') for (const r of c.rows) if (r.club.logo) logos[r.club.name] ??= r.club.logo
  return { ...logos, ...(await getBadges()) }
}
