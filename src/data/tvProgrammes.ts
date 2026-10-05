// The programme lists of two channels that show single matches, read into what we need of them
// (fetched and matched to our matches in src/lib/channels.ts). No imports, so the tests can read it.

/** A match on Bold's own channel: "Braga vs Gil Vicente" and the start in Danish time ("2026-10-19 21:15:00") */
export interface BoldProgramme {
  name: string
  start: string
}

/**
 * Bold's programme list (the list its TV guide is drawn from): the programmes on its own channel, "Bold+".
 * Also asked for by channel; the channel's name is checked here too, should the address one day answer with every channel.
 */
export function parseBold(data: unknown): BoldProgramme[] {
  if (!Array.isArray(data)) return []
  const out: BoldProgramme[] = []
  for (const x of data as { name?: unknown; program_start?: unknown; channel?: { name?: unknown } }[]) {
    if (typeof x?.name !== 'string' || typeof x.program_start !== 'string' || !/^bold/i.test(String(x.channel?.name ?? ''))) continue
    if (!/\svs\.?\s/i.test(x.name) || !/^\d{4}-\d{2}-\d{2}/.test(x.program_start)) continue
    out.push({ name: x.name.slice(0, 120), start: x.program_start.slice(0, 19) })
  }
  return out
}

/** A live match on SPORT LIVE: the day (ÅÅÅÅ-MM-DD, Danish time), the sport, the series ("Basketligaen") and the match ("BK Vejen-Værløse Blue Hawks") */
export interface SportLiveProgramme {
  day: string
  sport: string
  title: string
  match: string
}

/** The channel's name for a sport -> ours; other sports (futsal, table tennis, boxing) have no matches on our pages */
const SPORTLIVE_SPORT: Record<string, string> = { fodbold: 'soccer', basketball: 'basketball', håndbold: 'handball', ishockey: 'ice_hockey', volleyball: 'volleyball' }

const xmlText = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&').trim()

/**
 * SPORT LIVE's programme file: what it sends live with two sides in the title, in the sports we have matches of
 * ("Portugal-Danmark" in futsal is not the football match). Not repeats ("Repeat", "Relive"), and not the studio
 * before a match ("Optakt til …").
 */
export function parseSportLive(xml: string): SportLiveProgramme[] {
  const out: SportLiveProgramme[] = []
  for (const event of xml.split('<Event>').slice(1)) {
    const field = (tag: string) => xmlText(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(event)?.[1] ?? '')
    const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(field('Date'))
    const match = field('EpisodeTitle')
    const sport = SPORTLIVE_SPORT[field('PrimaryGenre').toLowerCase()]
    if (!date || !sport || field('Status').toLowerCase() !== 'live' || !match.includes('-') || /^optakt\b/i.test(match)) continue
    out.push({ day: `${date[3]}-${date[2]}-${date[1]}`, sport, title: field('Title').slice(0, 80), match: match.slice(0, 120) })
  }
  return out
}
