import 'server-only'
import { clientIp } from './admin'

// The public contact forms (/annoncering, /billetsystem): a small body only, and a few sends per visitor –
// on top of the site-wide cap in saveLead – so a script can neither block the form for real customers nor
// fill the owner's mailbox.

const MAX_BYTES = 20_000
const PER_IP = 3
const WINDOW_MS = 10 * 60_000
const sent = new Map<string, number[]>()

/** The form's JSON, or undefined when it is too big or not JSON */
export async function readSmallJson(request: Request): Promise<Record<string, unknown> | undefined> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return undefined
  const text = await request.text().catch(() => '')
  if (text.length > MAX_BYTES) return undefined
  try {
    const b = JSON.parse(text) as unknown
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** True when this visitor has sent the forms too often lately (counts the send when it is let through) */
export function formLimited(request: Request): boolean {
  const now = Date.now()
  if (sent.size > 5_000) for (const [k, v] of sent) if (v.every((t) => now - t > WINDOW_MS)) sent.delete(k)
  const ip = clientIp(request)
  const times = (sent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (times.length >= PER_IP) return true
  sent.set(ip, [...times, now])
  return false
}
