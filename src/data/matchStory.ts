import type { Incident, Match } from '../types'
import type { FormGame, Lineup, MatchStats, TableRow } from './matchExtra'
import type { PastMatch } from './matchInsights'
import { alike } from './aliases'
import { hashString } from './fixtures'
import { formatShortYear, formatTime, formatWeekday, isoDate } from '../lib/time'

// Match reports and previews in Danish, written from the match data alone.
// Every sentence needs its own data and is left out when that is missing, so
// nothing is ever guessed. Each kind of sentence has 20 wordings; which one a
// match gets is fixed by the match (server and browser write the same text),
// so two matches rarely read alike.

export interface StoryInput {
  match: Match
  now: number
  table?: TableRow[]
  form?: { home: FormGame[]; away: FormGame[] }
  h2h?: PastMatch[]
  stats?: MatchStats
  channels?: string[]
  lineups?: Lineup[]
  /** Each team's next match after this one */
  next?: { home?: Match; away?: Match }
  /** Whether this is each team's latest played match (only then does today's table describe the result) */
  latest?: { home: boolean; away: boolean }
}

type Pool<P> = ((p: P) => string)[]

/** The wording a match gets for a kind of sentence: fixed by the match and the kind */
function pick<P>(pool: Pool<P>, match: Match, kind: string, p: P): string {
  return pool[hashString(`${match.id}|${kind}`) % pool.length](p)
}

const gen = (name: string) => (/[sxz]$/i.test(name) ? `${name}'` : `${name}s`)
const minute = (m: number) => `${m}. minut`
const isGoal = (i: Incident) => i.kind === 'goal' || i.kind === 'penalty' || i.kind === 'own-goal'
const scoringSide = (i: Incident): 'home' | 'away' => (i.kind === 'own-goal' ? (i.side === 'home' ? 'away' : 'home') : i.side)
const pctText = (n: number) => `${Math.round(n)} %`

// ---------------------------------------------------------------- report: the result

type Result = { w: string; l: string; s: string; c: string }
const WIN: Pool<Result> = [
  (p) => `${p.w} vandt ${p.s} over ${p.l} i ${p.c}.`,
  (p) => `${p.w} slog ${p.l} ${p.s} i ${p.c}.`,
  (p) => `${p.w} tog sejren ${p.s} mod ${p.l} i ${p.c}.`,
  (p) => `${p.w} hentede tre point med en ${p.s}-sejr over ${p.l} i ${p.c}.`,
  (p) => `Det blev til sejr ${p.s} til ${p.w} mod ${p.l} i ${p.c}.`,
  (p) => `${p.l} måtte se sig slået ${p.s} af ${p.w} i ${p.c}.`,
  (p) => `${p.w} besejrede ${p.l} ${p.s} i ${p.c}.`,
  (p) => `${p.w} gik fra kampen mod ${p.l} med en ${p.s}-sejr i ${p.c}.`,
  (p) => `Sejren gik til ${p.w}, der vandt ${p.s} over ${p.l} i ${p.c}.`,
  (p) => `${p.w} vandt opgøret med ${p.l} ${p.s} i ${p.c}.`,
  (p) => `${p.w} fik den bedste afslutning og vandt ${p.s} over ${p.l} i ${p.c}.`,
  (p) => `${p.l} tabte ${p.s} til ${p.w} i ${p.c}.`,
  (p) => `${p.w} snuppede sejren ${p.s} mod ${p.l} i ${p.c}.`,
  (p) => `${p.w} kunne juble over en ${p.s}-sejr mod ${p.l} i ${p.c}.`,
  (p) => `Kampen mellem ${p.w} og ${p.l} i ${p.c} endte ${p.s} til ${p.w}.`,
  (p) => `${p.w} vandt ${p.s}, da holdet mødte ${p.l} i ${p.c}.`,
  (p) => `${p.w} trak det længste strå og vandt ${p.s} over ${p.l} i ${p.c}.`,
  (p) => `Tre point til ${p.w}, der slog ${p.l} ${p.s} i ${p.c}.`,
  (p) => `${p.w} hev sejren hjem ${p.s} mod ${p.l} i ${p.c}.`,
  (p) => `${p.l} gik point-løse fra mødet med ${p.w}, der vandt ${p.s} i ${p.c}.`,
]
const BIG_WIN: Pool<Result> = [
  (p) => `${p.w} vandt en overbevisende ${p.s}-sejr over ${p.l} i ${p.c}.`,
  (p) => `${p.w} kørte hen over ${p.l} og vandt ${p.s} i ${p.c}.`,
  (p) => `${p.w} var i storform og slog ${p.l} ${p.s} i ${p.c}.`,
  (p) => `${p.l} blev sendt hjem med et ${p.s}-nederlag til ${p.w} i ${p.c}.`,
  (p) => `${p.w} vandt stort, ${p.s}, over ${p.l} i ${p.c}.`,
  (p) => `Det blev en klar sejr til ${p.w}, der slog ${p.l} ${p.s} i ${p.c}.`,
  (p) => `${p.w} dominerede mod ${p.l} og vandt ${p.s} i ${p.c}.`,
  (p) => `${p.w} leverede en målfest og vandt ${p.s} over ${p.l} i ${p.c}.`,
  (p) => `${p.l} fik en hård eftermiddag og tabte ${p.s} til ${p.w} i ${p.c}.`,
  (p) => `${p.w} sejrede sikkert ${p.s} mod ${p.l} i ${p.c}.`,
  (p) => `${p.w} lod ingen tvivl om vinderen og slog ${p.l} ${p.s} i ${p.c}.`,
  (p) => `En stor sejr på ${p.s} til ${p.w} over ${p.l} i ${p.c}.`,
  (p) => `${p.w} var klart bedst og vandt ${p.s} over ${p.l} i ${p.c}.`,
  (p) => `${p.l} var chanceløse mod ${p.w}, der vandt ${p.s} i ${p.c}.`,
  (p) => `${p.w} scorede igen og igen og vandt ${p.s} over ${p.l} i ${p.c}.`,
  (p) => `${p.w} tog en sikker ${p.s}-sejr hjem mod ${p.l} i ${p.c}.`,
  (p) => `${p.w} fejede ${p.l} af banen med ${p.s} i ${p.c}.`,
  (p) => `Det endte med en markant ${p.s}-sejr til ${p.w} over ${p.l} i ${p.c}.`,
  (p) => `${p.w} satte ${p.l} på plads med ${p.s} i ${p.c}.`,
  (p) => `${p.w} vandt ${p.s} og viste klasse mod ${p.l} i ${p.c}.`,
]
type Draw = { h: string; a: string; s: string; c: string }
const DRAW: Pool<Draw> = [
  (p) => `${p.h} og ${p.a} spillede ${p.s} i ${p.c}.`,
  (p) => `Det endte uafgjort ${p.s} mellem ${p.h} og ${p.a} i ${p.c}.`,
  (p) => `${p.h} og ${p.a} delte point efter ${p.s} i ${p.c}.`,
  (p) => `Hverken ${p.h} eller ${p.a} fik sejren – kampen endte ${p.s} i ${p.c}.`,
  (p) => `Point blev delt, da ${p.h} og ${p.a} spillede ${p.s} i ${p.c}.`,
  (p) => `${p.h} mod ${p.a} i ${p.c} endte ${p.s}.`,
  (p) => `Et point til hver: ${p.h} og ${p.a} spillede ${p.s} i ${p.c}.`,
  (p) => `${p.h} og ${p.a} måtte nøjes med ${p.s} i ${p.c}.`,
  (p) => `Kampen mellem ${p.h} og ${p.a} i ${p.c} sluttede lige, ${p.s}.`,
  (p) => `${p.h} fik ${p.s} mod ${p.a} i ${p.c}.`,
  (p) => `Uafgjort ${p.s} blev resultatet, da ${p.h} mødte ${p.a} i ${p.c}.`,
  (p) => `${p.a} hentede ${p.s} på udebane mod ${p.h} i ${p.c}.`,
  (p) => `${p.h} og ${p.a} kunne ikke skilles ad og endte ${p.s} i ${p.c}.`,
  (p) => `Der blev ikke fundet en vinder mellem ${p.h} og ${p.a}: ${p.s} i ${p.c}.`,
  (p) => `${p.h} og ${p.a} gik fra hinanden med ${p.s} i ${p.c}.`,
  (p) => `Det blev ${p.s}, da ${p.h} tog imod ${p.a} i ${p.c}.`,
  (p) => `${p.h} og ${p.a} deltes om pointene efter ${p.s} i ${p.c}.`,
  (p) => `Uafgjort blev det mellem ${p.h} og ${p.a} – ${p.s} i ${p.c}.`,
  (p) => `${p.h} og ${p.a} leverede et ${p.s}-opgør uden vinder i ${p.c}.`,
  (p) => `${p.s} blev slutresultatet mellem ${p.h} og ${p.a} i ${p.c}.`,
]

// ---------------------------------------------------------------- report: the goals

type Goal = { who: string; team: string; min: string; opp: string; how: string }
const OPENER: Pool<Goal> = [
  (p) => `${p.who} bragte ${p.team} foran i ${p.min}${p.how}.`,
  (p) => `${p.who} gav ${p.team} føringen i ${p.min}${p.how}.`,
  (p) => `${p.team} kom foran ved ${p.who} i ${p.min}${p.how}.`,
  (p) => `Kampens første mål kom i ${p.min}, da ${p.who} scorede for ${p.team}${p.how}.`,
  (p) => `${p.who} åbnede scoringen for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} tog føringen i ${p.min}, hvor ${p.who} scorede${p.how}.`,
  (p) => `Det var ${p.who}, der sendte ${p.team} foran i ${p.min}${p.how}.`,
  (p) => `I ${p.min} bragte ${p.who} ${p.team} på 1-0-kurs${p.how}.`,
  (p) => `${p.who} brød dødvandet for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} fik hul på bylden i ${p.min} ved ${p.who}${p.how}.`,
  (p) => `Første mål tilfaldt ${p.team}: ${p.who} i ${p.min}${p.how}.`,
  (p) => `${p.who} satte ${p.team} i front i ${p.min}${p.how}.`,
  (p) => `${p.team} scorede først, da ${p.who} ramte i ${p.min}${p.how}.`,
  (p) => `${p.who} fik kampen i gang for ${p.team} med kampens første mål i ${p.min}${p.how}.`,
  (p) => `I ${p.min} kom ${p.team} foran, efter at ${p.who} havde scoret${p.how}.`,
  (p) => `${p.who} sørgede for, at ${p.team} kom foran i ${p.min}${p.how}.`,
  (p) => `Føringen gik til ${p.team}, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} åbnede kontoen for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} slog første slag, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} gav ${p.team} en drømmestart med målet i ${p.min}${p.how}.`,
]
const EQUALISER: Pool<Goal> = [
  (p) => `${p.who} udlignede for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} kom tilbage ved ${p.who} i ${p.min}${p.how}.`,
  (p) => `${p.who} bragte ${p.team} på niveau i ${p.min}${p.how}.`,
  (p) => `I ${p.min} udlignede ${p.who} for ${p.team}${p.how}.`,
  (p) => `${p.team} svarede igen, da ${p.who} udlignede i ${p.min}${p.how}.`,
  (p) => `${p.who} sørgede for balance på måltavlen for ${p.team} i ${p.min}${p.how}.`,
  (p) => `Udligningen kom i ${p.min} ved ${p.who} for ${p.team}${p.how}.`,
  (p) => `${p.team} fik udlignet, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} gjorde det lige for ${p.team} i ${p.min}${p.how}.`,
  (p) => `Det stod lige igen, da ${p.who} scorede for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} var tilbage i kampen efter ${gen(p.who)} mål i ${p.min}${p.how}.`,
  (p) => `${p.who} udlignede til ${p.team} i ${p.min}${p.how}.`,
  (p) => `I ${p.min} kom ${p.team} op på siden af ${p.opp} ved ${p.who}${p.how}.`,
  (p) => `${p.who} svarede for ${p.team} med udligningen i ${p.min}${p.how}.`,
  (p) => `${p.team} fik balance i regnskabet i ${p.min}, hvor ${p.who} scorede${p.how}.`,
  (p) => `${gen(p.who)} mål i ${p.min} bragte ${p.team} tilbage på lige fod${p.how}.`,
  (p) => `${p.who} var manden, der udlignede for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} rejste sig og udlignede ved ${p.who} i ${p.min}${p.how}.`,
  (p) => `I ${p.min} slog ${p.who} til og udlignede for ${p.team}${p.how}.`,
  (p) => `${p.opp} mistede føringen, da ${p.who} udlignede for ${p.team} i ${p.min}${p.how}.`,
]
const LEAD: Pool<Goal> = [
  (p) => `${p.who} sendte ${p.team} foran igen i ${p.min}${p.how}.`,
  (p) => `${p.team} tog føringen, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} bragte ${p.team} i front i ${p.min}${p.how}.`,
  (p) => `I ${p.min} kom ${p.team} foran ved ${p.who}${p.how}.`,
  (p) => `${p.who} gav ${p.team} føringen i ${p.min}${p.how}.`,
  (p) => `${p.team} kom foran, efter at ${p.who} havde scoret i ${p.min}${p.how}.`,
  (p) => `Føringen skiftede til ${p.team}, da ${p.who} ramte i ${p.min}${p.how}.`,
  (p) => `${p.who} scorede til ${p.team} i ${p.min} og gav holdet føringen${p.how}.`,
  (p) => `${p.team} fik overtaget på måltavlen i ${p.min} ved ${p.who}${p.how}.`,
  (p) => `Det var ${p.who}, der sendte ${p.team} foran i ${p.min}${p.how}.`,
  (p) => `I ${p.min} satte ${p.who} ${p.team} foran${p.how}.`,
  (p) => `${p.who} vendte kampen til ${gen(p.team)} fordel i ${p.min}${p.how}.`,
  (p) => `${p.team} kom op i front, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} gav ${p.team} forspringet i ${p.min}${p.how}.`,
  (p) => `${p.team} gik foran ved ${p.who} i ${p.min}${p.how}.`,
  (p) => `Med målet i ${p.min} bragte ${p.who} ${p.team} foran${p.how}.`,
  (p) => `${p.who} sørgede for ${gen(p.team)} føring i ${p.min}${p.how}.`,
  (p) => `${p.team} tog teten i ${p.min}, hvor ${p.who} scorede${p.how}.`,
  (p) => `I ${p.min} var det ${p.who}, der bragte ${p.team} foran${p.how}.`,
  (p) => `${p.who} scorede føringsmålet for ${p.team} i ${p.min}${p.how}.`,
]
const EXTEND: Pool<Goal> = [
  (p) => `${p.who} øgede til ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} udbyggede føringen ved ${p.who} i ${p.min}${p.how}.`,
  (p) => `I ${p.min} øgede ${p.who} ${gen(p.team)} føring${p.how}.`,
  (p) => `${p.who} bragte ${p.team} yderligere foran i ${p.min}${p.how}.`,
  (p) => `${p.team} fik endnu et mål, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} gjorde det sværere for ${p.opp} med sit mål i ${p.min}${p.how}.`,
  (p) => `Føringen voksede, da ${p.who} scorede for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.who} scorede igen for ${p.team} i ${p.min}${p.how}.`,
  (p) => `I ${p.min} lagde ${p.who} endnu et mål til for ${p.team}${p.how}.`,
  (p) => `${p.team} trak fra, da ${p.who} ramte i ${p.min}${p.how}.`,
  (p) => `${p.who} øgede forspringet for ${p.team} i ${p.min}${p.how}.`,
  (p) => `Endnu et mål til ${p.team} kom i ${p.min} ved ${p.who}${p.how}.`,
  (p) => `${p.who} sørgede for, at ${p.team} kom længere foran i ${p.min}${p.how}.`,
  (p) => `${p.team} scorede igen i ${p.min} – denne gang ${p.who}${p.how}.`,
  (p) => `${p.who} gav ${p.team} luft med sit mål i ${p.min}${p.how}.`,
  (p) => `I ${p.min} bragte ${p.who} ${p.team} mere foran${p.how}.`,
  (p) => `${p.team} byggede videre på føringen, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} var på måltavlen for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} øgede, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} tilføjede endnu et mål for ${p.team} i ${p.min}${p.how}.`,
]
const REDUCE: Pool<Goal> = [
  (p) => `${p.who} reducerede for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} fik et mål tilbage ved ${p.who} i ${p.min}${p.how}.`,
  (p) => `I ${p.min} reducerede ${p.who} for ${p.team}${p.how}.`,
  (p) => `${p.who} gav ${p.team} håb med en reducering i ${p.min}${p.how}.`,
  (p) => `${p.team} kom et mål nærmere, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} pyntede på resultatet for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} svarede med et mål af ${p.who} i ${p.min}${p.how}.`,
  (p) => `${p.who} scorede for ${p.team} i ${p.min} og gjorde det spændende igen${p.how}.`,
  (p) => `Reduceringen kom i ${p.min} ved ${p.who} for ${p.team}${p.how}.`,
  (p) => `${p.team} kom på tavlen i ${p.min}, hvor ${p.who} scorede${p.how}.`,
  (p) => `${p.who} mindskede afstanden for ${p.team} i ${p.min}${p.how}.`,
  (p) => `I ${p.min} fik ${p.team} et mål på tavlen ved ${p.who}${p.how}.`,
  (p) => `${p.who} halede ind på ${p.opp} for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} fik håb igen, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} scorede et mål for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.team} reducerede ved ${p.who} i ${p.min}${p.how}.`,
  (p) => `${p.who} bragte ${p.team} tættere på i ${p.min}${p.how}.`,
  (p) => `Et mål af ${p.who} i ${p.min} holdt liv i ${gen(p.team)} håb${p.how}.`,
  (p) => `${p.team} kom tilbage i kampen med ${gen(p.who)} mål i ${p.min}${p.how}.`,
  (p) => `I ${p.min} scorede ${p.who} for ${p.team}${p.how}.`,
]
const DECIDER: Pool<Goal> = [
  (p) => `${p.who} afgjorde kampen for ${p.team} i ${p.min}${p.how}.`,
  (p) => `Det afgørende mål kom sent: ${p.who} scorede for ${p.team} i ${p.min}${p.how}.`,
  (p) => `${p.who} blev matchvinder for ${p.team} med målet i ${p.min}${p.how}.`,
  (p) => `I ${p.min} sikrede ${p.who} sejren til ${p.team}${p.how}.`,
  (p) => `${p.team} fandt sejrsmålet i ${p.min} ved ${p.who}${p.how}.`,
  (p) => `${p.who} sendte ${p.team} mod sejren med et sent mål i ${p.min}${p.how}.`,
  (p) => `Kampen blev afgjort i ${p.min}, da ${p.who} scorede for ${p.team}${p.how}.`,
  (p) => `${p.who} slog til sent og gav ${p.team} sejren i ${p.min}${p.how}.`,
  (p) => `Sejrsmålet til ${p.team} kom i ${p.min} ved ${p.who}${p.how}.`,
  (p) => `${p.who} var helten for ${p.team} med det afgørende mål i ${p.min}${p.how}.`,
  (p) => `${p.team} stjal sejren sent, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `I ${p.min} scorede ${p.who} det mål, der gav ${p.team} sejren${p.how}.`,
  (p) => `${p.who} sørgede for ${gen(p.team)} sejr med et mål i ${p.min}${p.how}.`,
  (p) => `Det sene mål af ${p.who} i ${p.min} afgjorde kampen til ${gen(p.team)} fordel${p.how}.`,
  (p) => `${p.team} fik det sidste ord, da ${p.who} scorede i ${p.min}${p.how}.`,
  (p) => `${p.who} knuste ${gen(p.opp)} håb med sit mål i ${p.min}${p.how}.`,
  (p) => `Med et sent mål i ${p.min} sikrede ${p.who} de tre point til ${p.team}${p.how}.`,
  (p) => `${p.who} afgjorde det hele for ${p.team} i ${p.min}${p.how}.`,
  (p) => `I ${p.min} kom det forløsende mål for ${p.team} ved ${p.who}${p.how}.`,
  (p) => `${p.who} scorede sejrsmålet for ${p.team} i ${p.min}${p.how}.`,
]
type Own = { who: string; team: string; min: string; for: string }
const OWN_GOAL: Pool<Own> = [
  (p) => `Et selvmål af ${gen(p.team)} ${p.who} i ${p.min} gav mål til ${p.for}.`,
  (p) => `${p.who} fra ${p.team} var uheldig og scorede selvmål i ${p.min}.`,
  (p) => `I ${p.min} kom ${p.for} på tavlen via et selvmål af ${p.who}.`,
  (p) => `${p.for} fik hjælp af et selvmål fra ${p.who} i ${p.min}.`,
  (p) => `${p.who} sendte bolden i eget net i ${p.min}.`,
  (p) => `Et uheldigt selvmål af ${p.who} i ${p.min} talte for ${p.for}.`,
  (p) => `${p.team} kom selv til at score for ${p.for}, da ${p.who} lavede selvmål i ${p.min}.`,
  (p) => `I ${p.min} scorede ${p.who} desværre i eget mål.`,
  (p) => `${p.for} fik et mål foræret, da ${p.who} ramte eget net i ${p.min}.`,
  (p) => `Selvmål af ${p.who} i ${p.min} gav ${p.for} et mål.`,
  (p) => `${p.who} styrede bolden i eget mål i ${p.min}.`,
  (p) => `Et selvmål i ${p.min} af ${gen(p.team)} ${p.who} talte for ${p.for}.`,
  (p) => `${p.for} scorede via selvmål af ${p.who} i ${p.min}.`,
  (p) => `I ${p.min} var ${p.who} uheldig og scorede for ${p.for}.`,
  (p) => `${p.who} kom til at score for ${p.for} i ${p.min}.`,
  (p) => `Et selvmål af ${p.who} i ${p.min} ændrede stillingen.`,
  (p) => `${p.team} gav ${p.for} et mål, da ${p.who} lavede selvmål i ${p.min}.`,
  (p) => `${p.who} fik et uheldigt selvmål i ${p.min}.`,
  (p) => `Bolden gik i eget net via ${p.who} i ${p.min}.`,
  (p) => `I ${p.min} blev ${p.who} noteret for et selvmål.`,
]
type Scorers = { team: string; list: string }
const SCORERS: Pool<Scorers> = [
  (p) => `Målene for ${p.team} blev scoret af ${p.list}.`,
  (p) => `${p.team} fik mål af ${p.list}.`,
  (p) => `For ${p.team} scorede ${p.list}.`,
  (p) => `${gen(p.team)} målscorere var ${p.list}.`,
  (p) => `${p.list} scorede for ${p.team}.`,
  (p) => `På ${gen(p.team)} side kom målene fra ${p.list}.`,
  (p) => `${p.team} scorede ved ${p.list}.`,
  (p) => `Målene til ${p.team}: ${p.list}.`,
  (p) => `${p.list} kom på måltavlen for ${p.team}.`,
  (p) => `For ${p.team} var det ${p.list}, der scorede.`,
  (p) => `${p.team} noterede mål af ${p.list}.`,
  (p) => `${p.list} stod for ${gen(p.team)} mål.`,
  (p) => `${gen(p.team)} mål blev lavet af ${p.list}.`,
  (p) => `Hos ${p.team} scorede ${p.list}.`,
  (p) => `${p.team} fik scoringer fra ${p.list}.`,
  (p) => `${p.list} ramte plet for ${p.team}.`,
  (p) => `Målscorere for ${p.team}: ${p.list}.`,
  (p) => `${p.list} var på tavlen for ${p.team}.`,
  (p) => `${p.team} scorede gennem ${p.list}.`,
  (p) => `For ${p.team} kom målene fra ${p.list}.`,
]

// ---------------------------------------------------------------- report: cards, statistics, table, form, next

type Red = { who: string; team: string; min: string }
const RED: Pool<Red> = [
  (p) => `${p.who} fra ${p.team} blev udvist i ${p.min}.`,
  (p) => `${p.team} måtte spille med ti mand, efter at ${p.who} blev udvist i ${p.min}.`,
  (p) => `I ${p.min} fik ${p.who} rødt kort for ${p.team}.`,
  (p) => `${p.who} så det røde kort i ${p.min}.`,
  (p) => `${p.team} mistede ${p.who} til et rødt kort i ${p.min}.`,
  (p) => `Et rødt kort til ${gen(p.team)} ${p.who} i ${p.min} ændrede kampen.`,
  (p) => `${p.who} blev sendt i bad før tid i ${p.min}.`,
  (p) => `I ${p.min} blev ${p.who} fra ${p.team} vist ud.`,
  (p) => `${p.team} blev reduceret til ti mand i ${p.min}, da ${p.who} fik rødt.`,
  (p) => `${p.who} forlod banen med rødt kort i ${p.min}.`,
  (p) => `Dommeren viste ${p.who} ud i ${p.min}.`,
  (p) => `${p.team} spillede resten af kampen i undertal efter ${gen(p.who)} udvisning i ${p.min}.`,
  (p) => `${p.who} fik marchordre i ${p.min}.`,
  (p) => `Rødt kort til ${p.who} fra ${p.team} i ${p.min}.`,
  (p) => `I ${p.min} blev ${p.team} ramt af en udvisning af ${p.who}.`,
  (p) => `${p.who} røg ud med rødt kort i ${p.min}.`,
  (p) => `${gen(p.team)} ${p.who} blev udvist i ${p.min}.`,
  (p) => `En udvisning af ${p.who} i ${p.min} sendte ${p.team} i undertal.`,
  (p) => `${p.who} måtte gå i ${p.min} efter et rødt kort.`,
  (p) => `${p.team} fik en spiller udvist, da ${p.who} så rødt i ${p.min}.`,
]
type StatsP = { h: string; a: string; hp: string; ap: string; hs: number; as: number; ball: string; more: string; less: string }
const STATS: Pool<StatsP> = [
  (p) => `${p.h} havde ${p.hp} af bolden og ${p.hs} skud mod ${gen(p.a)} ${p.as}.`,
  (p) => `${p.ball} havde mest af bolden (${p.ball === p.h ? p.hp : p.ap}), og skudstatistikken endte ${p.hs}-${p.as}.`,
  (p) => `Boldbesiddelsen var ${p.hp} mod ${p.ap}, og holdene skød ${p.hs} og ${p.as} gange.`,
  (p) => `${p.more} skød flest gange, ${Math.max(p.hs, p.as)} mod ${Math.min(p.hs, p.as)}.`,
  (p) => `Skuddene endte ${p.hs}-${p.as}, og ${p.ball} havde bolden mest.`,
  (p) => `${p.h} havde bolden ${p.hp} af tiden, ${p.a} ${p.ap}.`,
  (p) => `Med ${p.hs} skud mod ${p.as} og ${p.hp} boldbesiddelse til ${p.h} var ${p.more} mest i offensiven.`,
  (p) => `${p.ball} styrede spillet med ${p.ball === p.h ? p.hp : p.ap} boldbesiddelse.`,
  (p) => `Tallene viste ${p.hs} skud til ${p.h} og ${p.as} til ${p.a}.`,
  (p) => `${p.less} fik kun ${Math.min(p.hs, p.as)} skud af sted.`,
  (p) => `${p.h} skød ${p.hs} gange, ${p.a} ${p.as} gange, og boldbesiddelsen var ${p.hp}-${p.ap}.`,
  (p) => `${p.ball} havde overtaget i boldbesiddelse, mens skuddene endte ${p.hs}-${p.as}.`,
  (p) => `Boldbesiddelse ${p.hp}-${p.ap} og skud ${p.hs}-${p.as} fortæller om kampen.`,
  (p) => `${p.more} var det mest skydende hold med ${Math.max(p.hs, p.as)} forsøg.`,
  (p) => `${p.h} havde ${p.hp} af bolden, og ${p.a} ${p.ap}.`,
  (p) => `Der blev skudt ${p.hs + p.as} gange i alt, ${p.hs} af ${p.h} og ${p.as} af ${p.a}.`,
  (p) => (p.ball === p.more ? `${p.ball} dominerede boldbesiddelsen og skød også flest gange.` : `${p.ball} dominerede boldbesiddelsen, men ${p.more} skød flest gange.`),
  (p) => `Skud: ${p.hs}-${p.as}. Boldbesiddelse: ${p.hp}-${p.ap}.`,
  (p) => `${p.a} havde ${p.ap} af bolden og ${p.as} skud.`,
  (p) => `${p.more} skabte flest afslutninger, ${Math.max(p.hs, p.as)} mod ${Math.min(p.hs, p.as)}.`,
]
type TableP = { team: string; pos: number; pts: number; c: string; gap: string }
const TABLE_AFTER: Pool<TableP> = [
  (p) => `${p.team} ligger nu nr. ${p.pos} i ${p.c} med ${p.pts} point${p.gap}.`,
  (p) => `Efter kampen er ${p.team} nr. ${p.pos} med ${p.pts} point${p.gap}.`,
  (p) => `${p.team} står nu med ${p.pts} point på ${p.pos}.-pladsen i ${p.c}${p.gap}.`,
  (p) => `I stillingen er ${p.team} nr. ${p.pos} med ${p.pts} point${p.gap}.`,
  (p) => `${p.team} har nu ${p.pts} point og ligger nr. ${p.pos}${p.gap}.`,
  (p) => `${p.team} er nr. ${p.pos} i ${p.c} efter kampen, med ${p.pts} point${p.gap}.`,
  (p) => `Med ${p.pts} point er ${p.team} nr. ${p.pos}${p.gap}.`,
  (p) => `${p.team} indtager ${p.pos}.-pladsen med ${p.pts} point${p.gap}.`,
  (p) => `Placeringen for ${p.team} er nu nr. ${p.pos} med ${p.pts} point${p.gap}.`,
  (p) => `${p.team} har samlet ${p.pts} point og ligger nr. ${p.pos} i ${p.c}${p.gap}.`,
  (p) => `${p.team} er at finde som nr. ${p.pos} med ${p.pts} point${p.gap}.`,
  (p) => `I ${p.c} ligger ${p.team} nu på ${p.pos}.-pladsen, ${p.pts} point${p.gap}.`,
  (p) => `${p.pts} point giver ${p.team} en ${p.pos}.-plads${p.gap}.`,
  (p) => `${p.team} står som nr. ${p.pos} med ${p.pts} point i ${p.c}${p.gap}.`,
  (p) => `Tabellen viser nu ${p.team} på ${p.pos}.-pladsen med ${p.pts} point${p.gap}.`,
  (p) => `${p.team} er placeret som nr. ${p.pos} med ${p.pts} point${p.gap}.`,
  (p) => `Efter runden har ${p.team} ${p.pts} point og ${p.pos}.-pladsen${p.gap}.`,
  (p) => `${p.team} ligger på ${p.pos}.-pladsen i ${p.c} med ${p.pts} point${p.gap}.`,
  (p) => `Det giver ${p.team} ${p.pts} point og en plads som nr. ${p.pos}${p.gap}.`,
  (p) => `${p.team} har nu ${p.pts} point, hvilket er nok til ${p.pos}.-pladsen${p.gap}.`,
]
type Streak = { team: string; n: number; what: string }
const STREAK: Pool<Streak> = [
  (p) => `Det er ${gen(p.team)} ${p.what}.`,
  (p) => `${p.team} noterede dermed ${p.what}.`,
  (p) => `For ${p.team} var det ${p.what}.`,
  (p) => `${p.team} kan glæde sig over ${p.what}.`,
  (p) => `Dermed har ${p.team} ${p.what}.`,
  (p) => `Resultatet betyder ${p.what} for ${p.team}.`,
  (p) => `${p.team} fik ${p.what}.`,
  (p) => `Det blev ${p.what} for ${p.team}.`,
  (p) => `${p.team} kan nu se tilbage på ${p.what}.`,
  (p) => `Kampen var ${gen(p.team)} ${p.what}.`,
  (p) => `Med resultatet har ${p.team} ${p.what}.`,
  (p) => `${p.team} har dermed ${p.what}.`,
  (p) => `For ${p.team} er det nu ${p.what}.`,
  (p) => `${p.team} står nu med ${p.what}.`,
  (p) => `Det giver ${p.team} ${p.what}.`,
  (p) => `${p.team} har nu ${p.what} bag sig.`,
  (p) => `Hos ${p.team} er det ${p.what}.`,
  (p) => `${p.team} kunne notere ${p.what}.`,
  (p) => `Resultatet er ${gen(p.team)} ${p.what}.`,
  (p) => `${p.team} har nu fået ${p.what}.`,
]
type NextP = { team: string; opp: string; when: string; tv: string }
const NEXT: Pool<NextP> = [
  (p) => `${p.team} spiller næste gang mod ${p.opp} ${p.when}${p.tv}.`,
  (p) => `Næste opgave for ${p.team} er ${p.opp} ${p.when}${p.tv}.`,
  (p) => `${p.team} møder ${p.opp} ${p.when}${p.tv}.`,
  (p) => `${p.when} venter ${p.opp} for ${p.team}${p.tv}.`,
  (p) => `Næste kamp for ${p.team} er mod ${p.opp} ${p.when}${p.tv}.`,
  (p) => `${p.team} skal videre mod ${p.opp} ${p.when}${p.tv}.`,
  (p) => `${p.team} er i aktion igen ${p.when} mod ${p.opp}${p.tv}.`,
  (p) => `Allerede ${p.when} møder ${p.team} ${p.opp}${p.tv}.`,
  (p) => `${p.team} tager hul på næste kamp mod ${p.opp} ${p.when}${p.tv}.`,
  (p) => `${p.opp} bliver ${gen(p.team)} næste modstander ${p.when}${p.tv}.`,
  (p) => `Næste gang ${p.team} er på banen, er det mod ${p.opp} ${p.when}${p.tv}.`,
  (p) => `${p.team} fortsætter mod ${p.opp} ${p.when}${p.tv}.`,
  (p) => `${p.team} har ${p.opp} som næste modstander ${p.when}${p.tv}.`,
  (p) => `${p.team} og ${p.opp} mødes ${p.when}${p.tv}.`,
  (p) => `${p.when} gælder det ${p.opp} for ${p.team}${p.tv}.`,
  (p) => `${p.team} skal op mod ${p.opp} ${p.when}${p.tv}.`,
  (p) => `Næste udfordring for ${p.team}: ${p.opp} ${p.when}${p.tv}.`,
  (p) => `${p.team} spiller igen ${p.when}, når ${p.opp} venter${p.tv}.`,
  (p) => `Så er det ${p.opp} for ${p.team} ${p.when}${p.tv}.`,
  (p) => `${p.team} gør klar til ${p.opp} ${p.when}${p.tv}.`,
]

// ---------------------------------------------------------------- preview

type Intro = { h: string; a: string; when: string; c: string; round: string; tv: string }
const INTRO: Pool<Intro> = [
  (p) => `${p.h} tager imod ${p.a} ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.when} mødes ${p.h} og ${p.a} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.a} gæster ${p.h} ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.h} og ${p.a} står over for hinanden ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `Der er ${p.h} mod ${p.a} på programmet ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.h} får besøg af ${p.a} ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.when} spiller ${p.h} mod ${p.a} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.a} rejser til ${p.h} ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `Opgøret mellem ${p.h} og ${p.a} spilles ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.h} og ${p.a} tørner sammen ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.when} gælder det ${p.h} mod ${p.a} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.h} er vært for ${p.a} ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `I ${p.round}${p.c} møder ${p.h} ${p.a} ${p.when}${p.tv}.`,
  (p) => `${p.a} skal ud mod ${p.h} ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `Kampen ${p.h} – ${p.a} begynder ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.h} og ${p.a} mødes til dyst ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.when} er der kamp mellem ${p.h} og ${p.a} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.h} byder ${p.a} velkommen ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.a} er på besøg hos ${p.h} ${p.when} i ${p.round}${p.c}${p.tv}.`,
  (p) => `${p.h} spiller hjemme mod ${p.a} ${p.when} i ${p.round}${p.c}${p.tv}.`,
]
type TablePre = { h: string; a: string; hp: number; ap: number; hpts: number; apts: number }
const TABLE_BEFORE: Pool<TablePre> = [
  (p) => `${p.h} ligger nr. ${p.hp} med ${p.hpts} point, ${p.a} nr. ${p.ap} med ${p.apts}.`,
  (p) => `I tabellen er ${p.h} nr. ${p.hp} (${p.hpts} point) og ${p.a} nr. ${p.ap} (${p.apts} point).`,
  (p) => `Nr. ${p.hp} møder nr. ${p.ap}: ${p.h} har ${p.hpts} point, ${p.a} ${p.apts}.`,
  (p) => `${p.h} har ${p.hpts} point som nr. ${p.hp}, mens ${p.a} har ${p.apts} som nr. ${p.ap}.`,
  (p) => `Før kampen er ${p.h} nr. ${p.hp} og ${p.a} nr. ${p.ap}.`,
  (p) => `${p.hpts} point til ${p.h} (nr. ${p.hp}) mod ${p.apts} til ${p.a} (nr. ${p.ap}).`,
  (p) => `Stillingen: ${p.h} nr. ${p.hp} med ${p.hpts}, ${p.a} nr. ${p.ap} med ${p.apts}.`,
  (p) => `${p.h} står på ${p.hp}.-pladsen, ${p.a} på ${p.ap}.-pladsen.`,
  (p) => `Der er ${Math.abs(p.hpts - p.apts)} point mellem holdene: ${p.h} ${p.hpts}, ${p.a} ${p.apts}.`,
  (p) => `${p.a} kommer til kampen som nr. ${p.ap} med ${p.apts} point, ${p.h} er nr. ${p.hp} med ${p.hpts}.`,
  (p) => `Placeringerne før kampen: ${p.h} ${p.hp}., ${p.a} ${p.ap}.`,
  (p) => `${p.h} (nr. ${p.hp}) og ${p.a} (nr. ${p.ap}) har ${p.hpts} og ${p.apts} point.`,
  (p) => `Tabellen viser ${p.h} som nr. ${p.hp} og ${p.a} som nr. ${p.ap}.`,
  (p) => `${p.h} har ${p.hpts} point og ${p.a} ${p.apts} før opgøret.`,
  (p) => `Hjemmeholdet ${p.h} er nr. ${p.hp}, udeholdet ${p.a} nr. ${p.ap}.`,
  (p) => `${p.h} ligger ${p.hp < p.ap ? 'over' : 'under'} ${p.a} i tabellen: nr. ${p.hp} mod nr. ${p.ap}.`,
  (p) => `Med ${p.hpts} point er ${p.h} nr. ${p.hp}; ${p.a} har ${p.apts} og er nr. ${p.ap}.`,
  (p) => `Nr. ${p.hp} ${p.h} tager imod nr. ${p.ap} ${p.a}.`,
  (p) => `${p.a} er nr. ${p.ap} og ${p.h} nr. ${p.hp} i stillingen.`,
  (p) => `Pointene før kampen: ${p.h} ${p.hpts}, ${p.a} ${p.apts}.`,
]
type FormP = { team: string; line: string; v: number; u: number; t: number }
const FORM: Pool<FormP> = [
  (p) => `${p.team} har ${p.v} sejre, ${p.u} uafgjorte og ${p.t} nederlag i de seneste fem (${p.line}).`,
  (p) => `${gen(p.team)} seneste fem kampe: ${p.line}.`,
  (p) => `${p.team} kommer fra ${p.line} i de seneste fem kampe.`,
  (p) => `Formen hos ${p.team} er ${p.line} (${p.v} sejre i fem kampe).`,
  (p) => `${p.team} har vundet ${p.v} af de seneste fem kampe.`,
  (p) => `I de seneste fem kampe har ${p.team} hentet ${p.v * 3 + p.u} point.`,
  (p) => `${p.team}: ${p.line} i de seneste fem.`,
  (p) => `${gen(p.team)} form er ${p.line}.`,
  (p) => `${p.team} har ${p.v}-${p.u}-${p.t} i sejre, uafgjorte og nederlag i de seneste fem.`,
  (p) => `De seneste fem for ${p.team} lyder ${p.line}.`,
  (p) => `${p.team} har tabt ${p.t} af de seneste fem kampe.`,
  (p) => `${p.team} går ind til kampen med formen ${p.line}.`,
  (p) => `Kigger man på de seneste fem, har ${p.team} ${p.line}.`,
  (p) => `${p.team} har fået ${p.v * 3 + p.u} af 15 mulige point i de seneste fem.`,
  (p) => `${p.team} har ${p.v} sejre i de seneste fem kampe (${p.line}).`,
  (p) => `Seneste fem for ${p.team}: ${p.v} sejre, ${p.u} uafgjorte, ${p.t} nederlag.`,
  (p) => `${p.team} kommer med formen ${p.line}.`,
  (p) => `${p.team} har spillet ${p.line} i de seneste fem.`,
  (p) => `I de seneste fem har ${p.team} ${p.v} sejre og ${p.t} nederlag.`,
  (p) => `${gen(p.team)} seneste resultater: ${p.line}.`,
]
type H2H = { h: string; a: string; n: number; hw: number; d: number; aw: number; since: string }
const H2H_SUMMARY: Pool<H2H> = [
  (p) => `De to hold har mødt hinanden ${p.n} gange siden ${p.since}: ${p.hw} sejre til ${p.h}, ${p.d} uafgjorte og ${p.aw} til ${p.a}.`,
  (p) => `I de ${p.n} seneste opgør siden ${p.since} har ${p.h} vundet ${p.hw}, ${p.a} ${p.aw}, og ${p.d} er endt uafgjort.`,
  (p) => `${p.h} har vundet ${p.hw} af ${p.n} møder med ${p.a} siden ${p.since}.`,
  (p) => `Siden ${p.since} står det ${p.hw}-${p.d}-${p.aw} i sejre, uafgjorte og nederlag for ${p.h} mod ${p.a}.`,
  (p) => `${p.n} indbyrdes opgør siden ${p.since}: ${p.h} ${p.hw} sejre, ${p.a} ${p.aw}, uafgjort ${p.d}.`,
  (p) => `Historikken siden ${p.since} taler ${p.hw > p.aw ? `for ${p.h}` : p.aw > p.hw ? `for ${p.a}` : 'for ingen af dem'}: ${p.hw}-${p.d}-${p.aw} i ${p.n} kampe.`,
  (p) => `${p.a} har vundet ${p.aw} af de ${p.n} opgør mod ${p.h} siden ${p.since}.`,
  (p) => `Holdene har mødtes ${p.n} gange siden ${p.since}, og ${p.d} af dem er endt uafgjort.`,
  (p) => `I ${p.n} kampe siden ${p.since} har ${p.h} ${p.hw} sejre mod ${gen(p.a)} ${p.aw}.`,
  (p) => `De indbyrdes opgør siden ${p.since}: ${p.hw} til ${p.h}, ${p.d} uafgjort, ${p.aw} til ${p.a}.`,
  (p) => `${p.h} mod ${p.a} har siden ${p.since} givet ${p.hw} hjemmesejre og ${p.aw} udesejre i ${p.n} kampe.`,
  (p) => `Siden ${p.since} har ${p.h} og ${p.a} spillet ${p.n} gange mod hinanden.`,
  (p) => `Balancen siden ${p.since}: ${p.h} ${p.hw}, uafgjort ${p.d}, ${p.a} ${p.aw}.`,
  (p) => `${p.n} opgør siden ${p.since} er endt ${p.hw} gange med sejr til ${p.h}.`,
  (p) => `Mod ${p.a} har ${p.h} vundet ${p.hw} og tabt ${p.aw} af ${p.n} kampe siden ${p.since}.`,
  (p) => `Kigger man på de ${p.n} seneste møder siden ${p.since}, står det ${p.hw}-${p.d}-${p.aw}.`,
  (p) => `${p.h} og ${p.a} har ${p.n} indbyrdes opgør bag sig siden ${p.since}.`,
  (p) => `Statistikken siden ${p.since}: ${p.hw} sejre til ${p.h}, ${p.aw} til ${p.a}, ${p.d} uafgjorte.`,
  (p) => `${p.a} har ${p.aw} sejre og ${p.d} uafgjorte i ${p.n} kampe mod ${p.h} siden ${p.since}.`,
  (p) => `Siden ${p.since} har de to hold mødtes ${p.n} gange med ${p.hw}-${p.d}-${p.aw} som resultat.`,
]
type Last = { s: string; when: string; w?: string }
const LAST_MEETING: Pool<Last> = [
  (p) => `Seneste opgør endte ${p.s} (${p.when}).`,
  (p) => `Sidst holdene mødtes, blev det ${p.s} (${p.when}).`,
  (p) => `Det seneste møde ${p.when} endte ${p.s}.`,
  (p) => `${p.when} sluttede opgøret ${p.s}.`,
  (p) => `Sidste indbyrdes kamp: ${p.s} ${p.when}.`,
  (p) => `Forrige gang endte det ${p.s} (${p.when}).`,
  (p) => `Det sidste opgør ${p.when} blev ${p.s}.`,
  (p) => `Da holdene mødtes ${p.when}, endte det ${p.s}.`,
  (p) => `Resultatet sidst var ${p.s} (${p.when}).`,
  (p) => `Seneste kamp mellem dem: ${p.s}, ${p.when}.`,
  (p) => `${p.when} blev resultatet ${p.s}.`,
  (p) => `Sidste møde gav ${p.s} (${p.when}).`,
  (p) => `Holdenes seneste opgør ${p.when} endte ${p.s}.`,
  (p) => `Det blev ${p.s}, sidst holdene spillede (${p.when}).`,
  (p) => `Senest endte det ${p.s} ${p.when}.`,
  (p) => `Sidst gik det ${p.s} (${p.when}).`,
  (p) => `Det seneste indbyrdes resultat er ${p.s} fra ${p.when}.`,
  (p) => `${p.when} endte deres seneste kamp ${p.s}.`,
  (p) => `Forrige opgør sluttede ${p.s} ${p.when}.`,
  (p) => `Seneste indbyrdes: ${p.s} (${p.when}).`,
]
const LINEUPS_SOON: Pool<{ h: string; a: string }> = [
  () => `Opstillingerne kommer ca. en time før kampstart.`,
  () => `Holdene melder opstillingerne ud cirka en time før kampen.`,
  (p) => `${gen(p.h)} og ${gen(p.a)} startopstillinger kendes ca. en time før kampstart.`,
  () => `Startelleverne offentliggøres omkring en time før kampen.`,
  () => `Opstillingerne vises her, så snart de er meldt ud.`,
  () => `Ca. en time før kampstart kommer opstillingerne.`,
  () => `Startopstillingerne dukker op her omkring en time før kampen.`,
  () => `Opstillingerne følger ca. en time før kick-off.`,
  () => `Holdenes startelvere meldes ud en times tid før kampen.`,
  () => `Vi viser opstillingerne, når de kommer – typisk en time før kampstart.`,
  () => `De officielle opstillinger kommer cirka en time før kampen.`,
  () => `Startopstillingerne meldes normalt ud en time før kampstart.`,
  () => `Kig forbi en time før kampen for opstillingerne.`,
  () => `Opstillingerne er klar omkring en time før kampen.`,
  () => `Holdopstillingerne kommer ca. 60 minutter før kampstart.`,
  () => `En time før kampen kendes startelleverne.`,
  () => `Opstillingerne bliver offentliggjort en times tid før kampen.`,
  () => `Startelleverne vises her, når holdene har meldt dem ud.`,
  () => `Opstillingerne ventes ca. en time før kampstart.`,
  () => `Holdene melder deres startelvere ud omkring en time før kampen.`,
]
type LineupP = { team: string; f: string; names: string }
const LINEUP_KNOWN: Pool<LineupP> = [
  (p) => `${p.team} starter i ${p.f} med ${p.names}.`,
  (p) => `${p.team} stiller op i ${p.f}, bl.a. med ${p.names}.`,
  (p) => `${gen(p.team)} formation er ${p.f} med ${p.names} i startelleveren.`,
  (p) => `I ${gen(p.team)} ${p.f} starter blandt andre ${p.names}.`,
  (p) => `${p.team} spiller ${p.f} og har ${p.names} fra start.`,
  (p) => `${p.team} går ind til kampen i ${p.f}. ${p.names} starter.`,
  (p) => `${p.names} er i ${gen(p.team)} startelver, der spiller ${p.f}.`,
  (p) => `${p.team}: ${p.f} med ${p.names}.`,
  (p) => `${p.team} har valgt ${p.f} med ${p.names} på banen fra start.`,
  (p) => `Formationen hos ${p.team} er ${p.f}, og ${p.names} starter.`,
  (p) => `${p.team} starter med ${p.names} i en ${p.f}.`,
  (p) => `${gen(p.team)} startelver (${p.f}) tæller ${p.names}.`,
  (p) => `${p.team} stiller med ${p.f} og ${p.names}.`,
  (p) => `Hos ${p.team} starter ${p.names} i ${p.f}.`,
  (p) => `${p.team} er sat op i ${p.f} med ${p.names}.`,
  (p) => `${p.names} starter for ${p.team}, der spiller ${p.f}.`,
  (p) => `${p.team} åbner i ${p.f} med ${p.names}.`,
  (p) => `${gen(p.team)} ${p.f} har ${p.names} i startopstillingen.`,
  (p) => `${p.team} starter kampen i ${p.f}; blandt de elleve er ${p.names}.`,
  (p) => `I ${p.f} sender ${p.team} ${p.names} på banen.`,
]
const FIRST_MEETING: Pool<{ h: string; a: string }> = [
  (p) => `Vi har ingen tidligere opgør mellem ${p.h} og ${p.a} i vores kampdata.`,
  (p) => `${p.h} og ${p.a} har ikke mødt hinanden i de kampe, vi har registreret.`,
  (p) => `Der er ingen tidligere indbyrdes kampe mellem ${p.h} og ${p.a} i vores data.`,
  (p) => `I vores kampdata er det første møde mellem ${p.h} og ${p.a}.`,
  () => `Vi har ikke tidligere registreret et opgør mellem de to hold.`,
  (p) => `${p.h} mod ${p.a} er et nyt opgør i vores kampdata.`,
  (p) => `Vores kampdata har ingen tidligere møder mellem ${p.h} og ${p.a}.`,
  () => `Holdene har ingen fælles historik i vores data.`,
  (p) => `Vi kender ikke til tidligere kampe mellem ${p.h} og ${p.a}.`,
  () => `Der findes ingen tidligere indbyrdes resultater i vores kampdata.`,
  (p) => `${p.h} og ${p.a} mødes for første gang i vores registrerede kampe.`,
  () => `Vi har ikke tidligere set de to hold mod hinanden.`,
  (p) => `Ingen tidligere opgør mellem ${p.h} og ${p.a} er registreret hos os.`,
  () => `Opgøret er det første mellem holdene i vores kampdata.`,
  (p) => `I de kampe, vi har, har ${p.h} og ${p.a} ikke spillet mod hinanden.`,
  () => `Der er ingen indbyrdes historik at bygge på i vores data.`,
  (p) => `${p.h} og ${p.a} har ingen registrerede møder hos os.`,
  () => `Vi har ingen tidligere kampe mellem de to hold.`,
  (p) => `Vores data rummer ingen tidligere kampe ${p.h} – ${p.a}.`,
  () => `Det er et nyt bekendtskab i vores kampdata.`,
]

// ---------------------------------------------------------------- building the texts

function rowOf(table: TableRow[] | undefined, name: string) {
  return table?.find((r) => r.name === name) ?? table?.find((r) => alike([r.name], name))
}

/** "lørdag 3.10 kl. 15.00" */
function when(d: Date, now: number) {
  const day = isoDate(d)
  if (day === isoDate(now)) return `i dag kl. ${formatTime(d)}`
  if (day === isoDate(now + 86_400_000)) return `i morgen kl. ${formatTime(d)}`
  return `${formatWeekday(day)} ${d.getDate()}.${d.getMonth() + 1} kl. ${formatTime(d)}`
}

/** "tredje sejr i træk", "fjerde kamp uden nederlag", "første sejr i fem kampe" – from the latest results (newest first) */
function streakOf(results: ('V' | 'U' | 'T')[]): string | undefined {
  const ORD = ['', 'første', 'anden', 'tredje', 'fjerde', 'femte', 'sjette', 'syvende', 'ottende', 'niende', 'tiende']
  if (results.length < 3) return undefined
  const run = (f: (r: 'V' | 'U' | 'T') => boolean) => {
    let n = 0
    while (n < results.length && f(results[n])) n++
    return n
  }
  const wins = run((r) => r === 'V')
  if (wins >= 3) return `${ORD[Math.min(wins, 10)] ?? `${wins}.`} sejr i træk`
  const unbeaten = run((r) => r !== 'T')
  if (unbeaten >= 4) return `${ORD[Math.min(unbeaten, 10)]} kamp i træk uden nederlag`
  const losses = run((r) => r === 'T')
  if (losses >= 3) return `${ORD[Math.min(losses, 10)]} nederlag i træk`
  if (results[0] === 'V' && results.slice(1, 5).every((r) => r !== 'V') && results.length >= 5) return 'første sejr i fem kampe'
  return undefined
}

/** A match report, paragraph by paragraph; undefined until the match is finished */
export function matchReport(input: StoryInput): string[] | undefined {
  const { match: m } = input
  if (m.state !== 'finished' || m.home.score === undefined || m.away.score === undefined) return undefined
  const hs = m.home.score
  const as = m.away.score
  const c = m.round ? `${m.round}. runde af ${m.league}` : m.league
  const out: string[] = []

  // The result
  const home = hs > as
  if (hs === as) out.push(pick(DRAW, m, 'draw', { h: m.home.name, a: m.away.name, s: `${hs}-${as}`, c }))
  else {
    const w = home ? m.home.name : m.away.name
    const l = home ? m.away.name : m.home.name
    const s = `${Math.max(hs, as)}-${Math.min(hs, as)}`
    out.push(pick(Math.abs(hs - as) >= 3 ? BIG_WIN : WIN, m, 'win', { w, l, s, c }))
  }

  // The goals: in order when every goal is known, else the scorers we know
  if (m.sport === 'soccer') {
    const goals = (m.incidents ?? []).filter(isGoal).sort((a, b) => a.minute - b.minute)
    const nameOf = (side: 'home' | 'away') => (side === 'home' ? m.home.name : m.away.name)
    const sentences: string[] = []
    if (goals.length === hs + as && goals.every((g) => g.player && !g.approx)) {
      let h = 0
      let a = 0
      goals.forEach((g, i) => {
        const side = scoringSide(g)
        const before = side === 'home' ? h - a : a - h
        if (side === 'home') h++
        else a++
        const team = nameOf(side)
        const opp = nameOf(side === 'home' ? 'away' : 'home')
        const how = g.kind === 'penalty' ? ' på straffespark' : ''
        const key = `goal${i}`
        if (g.kind === 'own-goal') {
          sentences.push(pick(OWN_GOAL, m, key, { who: g.player!, team: nameOf(g.side), min: minute(g.minute), for: team }))
          return
        }
        const p = { who: g.player!, team, min: minute(g.minute), opp, how }
        const decisive = i === goals.length - 1 && g.minute >= 80 && hs !== as && before === 0 && (side === 'home') === hs > as
        if (decisive) sentences.push(pick(DECIDER, m, key, p))
        else if (h + a === 1) sentences.push(pick(OPENER, m, key, p))
        else if (before === -1) sentences.push(pick(EQUALISER, m, key, p))
        else if (before === 0) sentences.push(pick(LEAD, m, key, p))
        else if (before > 0) sentences.push(pick(EXTEND, m, key, p))
        else sentences.push(pick(REDUCE, m, key, p))
      })
    } else {
      // Not every goal known: only who scored, no order
      for (const side of ['home', 'away'] as const) {
        const own = goals.filter((g) => scoringSide(g) === side && g.kind !== 'own-goal' && g.player)
        if (!own.length) continue
        const list = own.map((g) => `${g.player} (${g.minute}.${g.kind === 'penalty' ? ', straffe' : ''})`)
        const text = list.length > 1 ? `${list.slice(0, -1).join(', ')} og ${list.at(-1)}` : list[0]
        sentences.push(pick(SCORERS, m, `scorers-${side}`, { team: nameOf(side), list: text }))
      }
    }
    if (sentences.length) out.push(sentences.join(' '))

    // Red cards
    const reds = (m.incidents ?? []).filter((i) => i.kind === 'red' && i.player)
    if (reds.length) out.push(reds.map((r, i) => pick(RED, m, `red${i}`, { who: r.player!, team: nameOf(r.side), min: minute(r.minute) })).join(' '))
  }

  // Statistics
  const st = input.stats?.rows
  const ball = st?.find((r) => r.label === 'Boldbesiddelse')
  const shots = st?.find((r) => r.label === 'Skud i alt')
  if (ball && shots) {
    const hBall = ball.home >= ball.away
    out.push(
      pick(STATS, m, 'stats', {
        h: m.home.name,
        a: m.away.name,
        hp: pctText(ball.home),
        ap: pctText(ball.away),
        hs: shots.home,
        as: shots.away,
        ball: hBall ? m.home.name : m.away.name,
        more: shots.home >= shots.away ? m.home.name : m.away.name,
        less: shots.home >= shots.away ? m.away.name : m.home.name,
      }),
    )
  }

  // The table after the match (the winner, or the home team after a draw)
  const focusSide = hs >= as ? 'home' : 'away'
  const focus = focusSide === 'home' ? m.home.name : m.away.name
  const row = input.latest?.[focusSide] ? rowOf(input.table, focus) : undefined
  const leader = input.table?.[0]
  if (row && row.points !== undefined && leader) {
    const gap = row === leader ? `, ${(leader.points ?? 0) - (input.table?.[1]?.points ?? 0)} point foran nr. 2` : `, ${(leader.points ?? 0) - row.points} point efter ${leader.name}`
    out.push(pick(TABLE_AFTER, m, 'table', { team: focus, pos: row.rank, pts: row.points, c: m.league, gap }))
  }

  // A streak (this match included)
  const recent = (side: 'home' | 'away') => {
    const games = input.form?.[side] ?? []
    const self = hs === as ? 'U' : (side === 'home') === hs > as ? 'V' : 'T'
    return [self, ...games.map((g) => (g.for > g.against ? 'V' : g.for < g.against ? 'T' : 'U'))] as ('V' | 'U' | 'T')[]
  }
  for (const side of ['home', 'away'] as const) {
    const what = streakOf(recent(side))
    if (what) {
      out.push(pick(STREAK, m, `streak-${side}`, { team: side === 'home' ? m.home.name : m.away.name, n: 0, what }))
      break
    }
  }

  // The next match
  const next = input.next?.home ?? input.next?.away
  if (next) {
    const team = input.next?.home ? m.home.name : m.away.name
    const opp = next.home.name === team ? next.away.name : next.home.name
    out.push(pick(NEXT, m, 'next', { team, opp, when: when(next.kickoff, input.now), tv: '' }))
  }
  return out
}

/** A preview before kick-off, paragraph by paragraph; undefined when there is too little to tell */
export function matchPreview(input: StoryInput): string[] | undefined {
  const { match: m, now } = input
  if (m.state !== 'upcoming') return undefined
  const h = m.home.name
  const a = m.away.name
  const out: string[] = []
  const tv = input.channels?.length ? ` – kampen vises på ${input.channels.join(' og ')}` : ''
  out.push(pick(INTRO, m, 'intro', { h, a, when: when(m.kickoff, now), c: m.league, round: m.round ? `${m.round}. runde af ` : '', tv }))
  let facts = 0

  const hr = rowOf(input.table, h)
  const ar = rowOf(input.table, a)
  if (hr && ar && hr.points !== undefined && ar.points !== undefined) {
    out.push(pick(TABLE_BEFORE, m, 'table', { h, a, hp: hr.rank, ap: ar.rank, hpts: hr.points, apts: ar.points }))
    facts++
  }

  const formLines: string[] = []
  for (const [side, team] of [['home', h], ['away', a]] as const) {
    const games = (input.form?.[side] ?? []).slice(0, 5)
    if (games.length < 3) continue
    const res = games.map((g) => (g.for > g.against ? 'V' : g.for < g.against ? 'T' : 'U'))
    const line = [...res].reverse().join('')
    formLines.push(pick(FORM, m, `form-${side}`, { team, line, v: res.filter((r) => r === 'V').length, u: res.filter((r) => r === 'U').length, t: res.filter((r) => r === 'T').length }))
  }
  if (formLines.length) {
    out.push(formLines.join(' '))
    facts++
  }

  const h2h = input.h2h ?? []
  if (h2h.length >= 2) {
    let hw = 0
    let aw = 0
    let d = 0
    for (const x of h2h) {
      const hg = alike([h], x.home) ? x.homeScore : x.awayScore
      const ag = alike([h], x.home) ? x.awayScore : x.homeScore
      if (hg > ag) hw++
      else if (hg < ag) aw++
      else d++
    }
    const since = String(h2h.at(-1)!.date.getFullYear())
    const last = h2h[0]
    out.push(
      [
        pick(H2H_SUMMARY, m, 'h2h', { h, a, n: h2h.length, hw, d, aw, since }),
        pick(LAST_MEETING, m, 'last', { s: `${last.home} – ${last.away} ${last.homeScore}-${last.awayScore}`, when: formatShortYear(last.date) }),
      ].join(' '),
    )
    facts++
  } else if (h2h.length === 0 && facts > 0) {
    out.push(pick(FIRST_MEETING, m, 'first', { h, a }))
  }

  if (m.sport === 'soccer') {
    const [hl, al] = input.lineups ?? []
    if (hl && al && hl.startXI.length) {
      const names = (l: Lineup) => {
        const outfield = l.startXI.filter((p) => p.pos !== 'G').slice(-3).map((p) => p.name)
        return outfield.length > 1 ? `${outfield.slice(0, -1).join(', ')} og ${outfield.at(-1)}` : (outfield[0] ?? '')
      }
      out.push(
        [hl, al]
          .filter((l) => l.formation)
          .map((l, i) => pick(LINEUP_KNOWN, m, `lineup${i}`, { team: i === 0 ? h : a, f: l.formation!, names: names(l) }))
          .join(' '),
      )
    } else if (m.kickoff.getTime() - now < 24 * 3_600_000 && facts > 0) out.push(pick(LINEUPS_SOON, m, 'lineups', { h, a }))
  }

  // At least two things to tell besides the kick-off
  return facts >= 2 ? out.filter(Boolean) : undefined
}
