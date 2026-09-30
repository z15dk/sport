import { decideSide, type Side } from './colors.ts'
import { backNameFits, pickName, type LineupPlayer, type SquadRow } from './names.ts'
import type { VisionResult } from './vision.ts'

// From the AI's answer to tags: own club or opponent, name, and whether the
// photo must be reviewed by hand. Pure (tests/photos/tagging.test.ts).
//
// A tag only gets a name when all of this holds: the number was read with at
// least `minConfidence`, the colour says own club without doubt, and exactly
// one player fits. Everything else keeps its number, gets no name and a note,
// and the photo goes to the review queue.

export interface TagDraft {
  number: number
  jerseyColor: string
  side: Side
  confidence: number
  box?: [number, number, number, number]
  playerName?: string
  nameSource?: 'kamp' | 'trup'
  backName?: string
  note?: string
}

export interface TaggingContext {
  /** The photographed club is known (found among the clubs) */
  clubKnown: boolean
  ownColors: string[]
  opponentColors?: string[]
  matchDate?: string
  /** The own club's team sheet for the match, when there is one */
  lineup?: LineupPlayer[]
  squad: SquadRow[]
  minConfidence: number
}

export interface Tagging {
  tags: TagDraft[]
  situation?: string
  review: boolean
  reasons: string[]
  /** Rough minutes to fix by hand; the review queue shows the quickest first */
  cost: number
}

export function tagPhoto(vision: VisionResult, ctx: TaggingContext): Tagging {
  const reasons = new Set<string>()
  let cost = 0
  const tags: TagDraft[] = vision.players.map((p) => {
    const tag: TagDraft = { number: p.number, jerseyColor: p.jerseyColor, side: 'ukendt', confidence: p.confidence, box: p.box, backName: p.backName }
    if (!ctx.clubKnown) {
      tag.note = 'klubben i mappenavnet er ukendt'
      return tag
    }
    const side = decideSide(p.jerseyColor, ctx.ownColors, ctx.opponentColors)
    tag.side = side.side
    if (side.side === 'ukendt') {
      tag.note = side.note
      reasons.add('hold usikkert')
      cost += 1
      return tag
    }
    if (side.side === 'modstander') return tag
    if (p.confidence < ctx.minConfidence) {
      tag.note = `nummeret er læst med lav tillid (${p.confidence.toFixed(2)})`
      reasons.add('lav tillid')
      cost += 1
      return tag
    }
    const name = pickName(p.number, ctx.matchDate, ctx.lineup, ctx.squad)
    // The name on the shirt must agree with the looked-up name; if not, the number or the date is wrong
    if (name.name && p.backName && !backNameFits(p.backName, name.name)) {
      tag.note = `trøjen siger "${p.backName}", men #${p.number} er ${name.name} ifølge ${name.source === 'kamp' ? 'holdkortet' : 'truppen'}`
      reasons.add('navn passer ikke')
      cost += 1
      return tag
    }
    if (name.name) {
      tag.playerName = name.name
      tag.nameSource = name.source
    } else {
      tag.note = name.note
      reasons.add('ukendt navn')
      cost += 2
    }
    return tag
  })

  // The same own number twice in one photo: at least one of them is misread
  const own = tags.filter((t) => t.side === 'egen')
  for (const t of own) {
    if (own.filter((o) => o.number === t.number).length > 1) {
      t.playerName = undefined
      t.nameSource = undefined
      t.note = `#${t.number} er læst to gange på egne spillere`
      reasons.add('samme nummer to gange')
      cost += 1
    }
  }

  if (!ctx.clubKnown) {
    reasons.add('ukendt klub')
    cost += 5
  }
  if (!tags.length) {
    reasons.add('ingen numre')
    cost += 3
  }
  return { tags, situation: vision.situation, review: reasons.size > 0, reasons: [...reasons], cost }
}
