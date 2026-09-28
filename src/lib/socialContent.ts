import 'server-only'
import {
  bigMatchTopic,
  factsTopic,
  formTopic,
  hasNamedScorers,
  isFinishedMatch,
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
import type { Division } from '../data/leagues'
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
}

export type Content =
  | { kind: 'programme'; date: string; picks: Pick[] }
  | { kind: 'story'; date: string; slot: string; picks: Pick[] }
  | { kind: 'results'; date: string; overview: Pick[]; detailed: Pick[] }
  | { kind: 'topic'; topic: 'week'; date: string; week: WeekNumbers }
  | { kind: 'topic'; topic: 'scorers'; date: string; division: Division; rows: ScorerRow[] }
  | { kind: 'topic'; topic: 'form'; date: string; division: Division; rows: FormRow[] }
  | { kind: 'topic'; topic: 'table'; date: string; division: Division; rows: StandingRow[] }
  | { kind: 'topic'; topic: 'bigmatch'; date: string; pick: Pick }
  | { kind: 'topic'; topic: 'weekend'; date: string; days: { date: string; picks: Pick[] }[] }
  | { kind: 'topic'; topic: 'facts'; date: string; picks: Pick[] }

/** The post's data, or undefined when there is nothing good enough to post */
export function contentFor(spec: PostSpec, now: number): Content | undefined {
  const { date, matchIds } = spec
  switch (spec.kind) {
    case 'programme': {
      const picks = picksFor(date, now, matchIds)
      return picks.length ? { kind: 'programme', date, picks } : undefined
    }
    case 'story': {
      const picks = picksFor(date, now, matchIds).filter((p) => formatTime(p.fixture.kickoff) === spec.slot)
      return picks.length ? { kind: 'story', date, slot: spec.slot!, picks } : undefined
    }
    case 'results': {
      const overview = picksFor(date, now, matchIds, isFinishedMatch)
      return overview.length ? { kind: 'results', date, overview, detailed: overview.filter((p) => hasNamedScorers(p.fixture)) } : undefined
    }
    case 'topic': {
      const div = topicDivision()
      switch (spec.topic) {
        case 'week': {
          const week = weekNumbers(date)
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
          const pick = bigMatchTopic(date, now)
          return pick ? { kind: 'topic', topic: 'bigmatch', date, pick } : undefined
        }
        case 'weekend': {
          const days = weekendTopic(date, now)
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
  if (spec.kind === 'programme') return 'Dagens kampe'
  if (spec.kind === 'story') return `Story før kampstart kl. ${spec.slot}`
  if (spec.kind === 'results') return 'Resultater'
  return `Dagens emne: ${TOPICS.find((t) => t.id === spec.topic)?.name ?? spec.topic}`
}

/** The post's text (the platform's ending and hashtags are added when it is posted) */
export function captionFor(c: Content): string {
  switch (c.kind) {
    case 'programme':
      return [`${cap(formatLong(c.date))}: dagens udvalgte kampe`, '', ...c.picks.map((p) => `${formatTime(p.fixture.kickoff)} ${vs(p)} (${p.league})`)].join('\n')
    case 'story':
      return c.picks.map((p) => `${vs(p)} kl. ${formatTime(p.fixture.kickoff)}`).join('\n')
    case 'results':
      return [`Resultater ${formatLong(c.date)}`, '', ...c.overview.map((p) => `${p.fixture.home.name} ${score(p)} ${p.fixture.away.name}`)].join('\n')
    case 'topic':
      switch (c.topic) {
        case 'week': {
          const { mostGoals: g, upset: u, streak: st, crowd: cr } = c.week
          return [
            'Ugen i tal.',
            g && `${g.home.name} og ${g.away.name} delte ${g.score[0] + g.score[1]} mål.`,
            u && `I ${u.fixture.division!.name} slog nr. ${u.winnerPos} nr. ${u.loserPos}.`,
            st && `${st.club.name} er nu ${st.length} kampe uden nederlag.`,
            cr && `${cr.fixture.spectators!.toLocaleString('da-DK')} tilskuere så ${cr.fixture.home.name} – ${cr.fixture.away.name}.`,
          ]
            .filter(Boolean)
            .join(' ')
        }
        case 'scorers':
          return [`Topscorerne i ${c.division.name}`, '', ...c.rows.slice(0, 5).map((r, i) => `${i + 1}. ${r.player} (${r.club.name}) ${r.goals} mål`)].join('\n')
        case 'form':
          return [
            `Formtabellen i ${c.division.name}: point i de seneste 5 kampe`,
            '',
            ...c.rows.slice(0, 5).map((r, i) => `${i + 1}. ${r.club.name} ${r.points} p. (${r.form.join('')})`),
          ].join('\n')
        case 'table':
          return [`Stillingen i ${c.division.name}`, '', ...c.rows.slice(0, 6).map((r, i) => `${i + 1}. ${r.club.name} ${r.points} p.`)].join('\n')
        case 'bigmatch': {
          const p = c.pick
          return [`Ugens kamp: ${vs(p)}, ${formatLong(p.fixture.kickoff)} kl. ${formatTime(p.fixture.kickoff)} (${p.league}).`, p.fact?.text].filter(Boolean).join('\n\n')
        }
        case 'weekend':
          return [
            'Weekendens kampe',
            ...c.days.flatMap((d) => ['', `${cap(formatLong(d.date))}:`, ...d.picks.map((p) => `${formatTime(p.fixture.kickoff)} ${vs(p)} (${p.league})`)]),
          ].join('\n')
        case 'facts':
          return ['Dagens fakta', '', ...c.picks.map((p) => `${vs(p)}: ${p.fact!.text}`)].join('\n')
      }
  }
}

/** The page the post points to on our site */
export function linkFor(c: Content): string {
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
