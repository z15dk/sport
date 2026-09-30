// The AI behind a small interface, so Gemini can be swapped for another
// provider without touching the job: analyze() gets a JPEG (max 1600 px) and
// returns the readable shirt numbers with colour, confidence and box.

export interface VisionPlayer {
  number: number
  jerseyColor: string
  /** 0–1 */
  confidence: number
  /** [ymin, xmin, ymax, xmax], 0–1000 */
  box?: [number, number, number, number]
  /** The name printed on the shirt above the number, when readable */
  backName?: string
}

export interface VisionResult {
  players: VisionPlayer[]
  situation?: string
  model: string
}

export interface VisionProvider {
  readonly name: string
  analyze(jpeg: Buffer): Promise<VisionResult>
}

/** Quota used up (429 / RESOURCE_EXHAUSTED): stop the run, try again next run */
export class QuotaError extends Error {}
/** The service is down or slow (5xx, network): this photo is tried again later */
export class TransientError extends Error {}
/** Wrong key or model: stop the run, nothing will work until it is fixed */
export class FatalError extends Error {}
/** This photo cannot be analysed (refused, unreadable answer): the photo gets status fejl */
export class PhotoError extends Error {}

export const PROMPT = `Du ser et fodboldbillede. Find alle spillere, hvis trøjenummer er
tydeligt læseligt. Gæt ALDRIG et nummer, du ikke kan se klart.

Svar KUN med JSON i dette format:
{
  "spillere": [
    {"nummer": 9, "troejefarve": "rød", "tillid": 0.95, "boks": [120, 340, 880, 610], "rygnavn": "HANSEN"}
  ],
  "situation": "ét eller to ord, fx jubel, tackling, målmand, duel, hovedstød, skud, publikum"
}

- "troejefarve": ét dansk farveord for trøjens hovedfarve.
- "tillid": tal mellem 0 og 1 for hvor sikker du er på nummeret.
- "boks": [ymin, xmin, ymax, xmax] om hele spilleren, normaliseret 0 til 1000.
- "rygnavn": navnet trykt på trøjen over nummeret, præcis som det står. null hvis der
  ikke står et navn, eller det ikke kan læses helt. Gæt ALDRIG et navn.
Er der ingen læselige numre, så returnér en tom liste i "spillere".`

/** The AI's answer checked field by field; anything that does not fit is dropped, never guessed */
export function parseVisionJson(text: string, model: string): VisionResult {
  let data: unknown
  try {
    data = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    throw new PhotoError(`AI-svaret er ikke gyldig JSON: ${text.slice(0, 200)}`)
  }
  if (!data || typeof data !== 'object') throw new PhotoError('AI-svaret mangler indhold')
  const d = data as { spillere?: unknown; situation?: unknown }
  if (d.spillere !== undefined && !Array.isArray(d.spillere)) throw new PhotoError('AI-svaret: "spillere" er ikke en liste')
  const players: VisionPlayer[] = []
  for (const raw of (d.spillere as unknown[] | undefined) ?? []) {
    if (!raw || typeof raw !== 'object') continue
    const s = raw as Record<string, unknown>
    const number = typeof s.nummer === 'string' ? Number(s.nummer.trim()) : s.nummer
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 99) continue
    const conf = Number(s.tillid)
    const box = Array.isArray(s.boks) && s.boks.length === 4 && s.boks.every((v) => typeof v === 'number' && v >= 0 && v <= 1000) ? (s.boks.map(Math.round) as [number, number, number, number]) : undefined
    players.push({
      number,
      jerseyColor: typeof s.troejefarve === 'string' ? s.troejefarve.trim().toLowerCase().slice(0, 40) : '',
      confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
      box: box && box[0] < box[2] && box[1] < box[3] ? box : undefined,
      backName: typeof s.rygnavn === 'string' && s.rygnavn.trim() ? s.rygnavn.trim().slice(0, 40) : undefined,
    })
  }
  const situation = typeof d.situation === 'string' ? d.situation.trim().toLowerCase().slice(0, 60) || undefined : undefined
  return { players, situation, model }
}
