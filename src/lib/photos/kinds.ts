// What a picture is. Match photos get numbers, names and teams; graphics and other
// pictures only a title, our own tags and rights (no "no numbers" review).

export const KINDS = {
  kampfoto: 'Kampfoto',
  portraet: 'Portræt / holdbillede',
  grafik: 'Grafik',
  andet: 'Andet',
} as const

export type Kind = keyof typeof KINDS

export const isKind = (k: unknown): k is Kind => typeof k === 'string' && k in KINDS

/** The AI's word for the kind (Danish or English) → our kind */
export function kindFromAi(word: unknown): Kind | undefined {
  const w = String(word ?? '').toLowerCase()
  if (!w) return undefined
  if (/grafik|graphic|illustration|infografik|banner|logo|plakat|tekst/.test(w)) return 'grafik'
  if (/portr|hold|team|portrait/.test(w)) return 'portraet'
  if (/kamp|match|action|spil/.test(w)) return 'kampfoto'
  return 'andet'
}

/** Clean tags: trimmed, no doubles (case-insensitive), at most 20 of 40 characters */
export function cleanTags(tags: unknown): string[] {
  const out: string[] = []
  for (const t of Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : []) {
    const v = String(t).trim().slice(0, 40)
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v)
  }
  return out.slice(0, 20)
}
