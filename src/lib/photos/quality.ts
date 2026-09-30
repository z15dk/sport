import sharp from 'sharp'

// Picture measures for bursts and "best of the match":
//  - sharpness: spread of the edge response (Laplacian) on an 800 px grey copy; higher = sharper
//  - dhash: 64-bit difference hash of a 9×8 grey copy; near-identical pictures differ in few bits
// groupBursts is pure (tests/photos/quality.test.ts).

type Raw = { data: Buffer; width: number; height: number; channels: number }

export async function measure(raw: Raw): Promise<{ sharpness: number; dhash: string }> {
  const src = () => sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: raw.channels as 1 | 2 | 3 | 4 } })
  // Grey copy first, then the Laplacian on it (both steps written out, so the order is certain)
  const grey = await src().resize(800, 800, { fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const edges = await sharp(grey.data, { raw: { width: grey.info.width, height: grey.info.height, channels: 1 } })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw()
    .toBuffer()
  let sum = 0
  let sq = 0
  for (const v of edges) {
    sum += v
    sq += v * v
  }
  const mean = sum / edges.length
  const stdev = Math.sqrt(Math.max(0, sq / edges.length - mean * mean))
  const small = await src().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let bits = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += small[y * 9 + x] > small[y * 9 + x + 1] ? '1' : '0'
  const dhash = BigInt(`0b${bits}`).toString(16).padStart(16, '0')
  return { sharpness: Math.round(stdev * 100) / 100, dhash }
}

export function hamming(a: string, b: string) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let n = 0
  while (x) {
    n += Number(x & 1n)
    x >>= 1n
  }
  return n
}

export interface BurstInput {
  id: number
  matchKey: string
  takenAt?: string | null
  dhash?: string | null
  sharpness?: number | null
}

/**
 * Bursts: pictures from the same match, next to each other in time (or upload order),
 * that look alike (≤ 12 of 64 hash bits differ) and, when both have a camera time,
 * were taken within 15 seconds. Returns groups of 2+ ids, sharpest first.
 */
export function groupBursts(photos: BurstInput[], maxBits = 12, maxSeconds = 15): number[][] {
  const byMatch = new Map<string, BurstInput[]>()
  for (const p of photos) if (p.dhash) byMatch.set(p.matchKey, [...(byMatch.get(p.matchKey) ?? []), p])
  const groups: number[][] = []
  for (const list of byMatch.values()) {
    list.sort((a, b) => (a.takenAt && b.takenAt ? a.takenAt.localeCompare(b.takenAt) : 0) || a.id - b.id)
    let cur: BurstInput[] = []
    const close = (a: BurstInput, b: BurstInput) => {
      if (hamming(a.dhash!, b.dhash!) > maxBits) return false
      if (a.takenAt && b.takenAt) return Math.abs(Date.parse(b.takenAt) - Date.parse(a.takenAt)) <= maxSeconds * 1000
      return true
    }
    const flush = () => {
      if (cur.length > 1) groups.push([...cur].sort((a, b) => (b.sharpness ?? 0) - (a.sharpness ?? 0)).map((p) => p.id))
      cur = []
    }
    for (const p of list) {
      if (cur.length && !close(cur[cur.length - 1], p)) flush()
      cur.push(p)
    }
    flush()
  }
  return groups
}
