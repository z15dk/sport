import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { SITE_URL } from './site'

// Access to the admin pages (/admin). The password is ADMIN_PASSWORD in the
// server's environment (/opt/scoreline/env on the VPS); without it the admin
// pages are closed. A login sets a signed, HttpOnly cookie for 7 days.

export const COOKIE = 'scoreline_admin'
/** Not secret and readable by the page: only tells the browser to ask for the admin bar (the bar itself checks COOKIE) */
export const BAR_COOKIE = 'scoreline_bar'
const MAX_AGE_S = 7 * 24 * 3600

export const adminPassword = () => process.env.ADMIN_PASSWORD?.trim() || undefined

/** Signing key derived from the password, so changing the password logs everyone out */
const key = () => createHash('sha256').update(`scoreline-admin|${adminPassword()}`).digest()

const sign = (value: string) => createHmac('sha256', key()).update(value).digest('base64url')

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function checkPassword(given: string) {
  const password = adminPassword()
  if (!password) return false
  // Compare hashes so the comparison takes the same time whatever the length
  const h = (s: string) => createHash('sha256').update(s).digest('hex')
  return safeEqual(h(given), h(password))
}

export function sessionToken() {
  const expires = String(Date.now() + MAX_AGE_S * 1000)
  return `${expires}.${sign(expires)}`
}

function validToken(token: string | undefined) {
  if (!token || !adminPassword()) return false
  const [expires, signature] = token.split('.')
  return !!expires && !!signature && Number(expires) > Date.now() && safeEqual(signature, sign(expires))
}

/** True when the request comes from a logged-in admin */
export async function isAdmin() {
  return validToken((await cookies()).get(COOKIE)?.value)
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_S,
}

export const barCookieOptions = { ...cookieOptions, httpOnly: false }

/** The hosts a request may come from: the site's own address, what the proxy says the browser asked for, and the server itself */
function ownHosts(request: Request): string[] {
  const hosts = [request.headers.get('x-forwarded-host'), request.headers.get('host')]
  try {
    hosts.push(new URL(SITE_URL).host)
  } catch {
    // No site address set
  }
  return [...new Set(hosts.flatMap((h) => (h ? h.split(',').map((x) => x.trim()) : [])).filter(Boolean))]
}

/** Requests that change something must come from our own pages */
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true // same-origin form posts from older browsers
  try {
    const host = new URL(origin).host
    // The site's own hosts, and the local checkout (npm run live / next start)
    return ownHosts(request).includes(host) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  } catch {
    return false
  }
}

/** Why a request to an admin API is refused, or undefined when it is allowed: the text goes back to the page, so the cause is visible */
export async function adminDenied(request: Request): Promise<string | undefined> {
  if (!(await isAdmin())) return 'Ikke logget ind – log ind på /admin igen'
  if (!sameOrigin(request)) return `Afvist afsender: siden er åbnet på ${request.headers.get('origin')}, men serveren kender kun ${ownHosts(request).join(', ') || '(ingen adresse)'}`
  return undefined
}

/**
 * The visitor's address as nginx saw it: X-Real-IP (nginx sets it to $remote_addr, the visitor can't), else the
 * LAST X-Forwarded-For entry (nginx appends the real one; the first ones are whatever the visitor sent).
 */
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real
  const fwd = request.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
  return fwd?.at(-1) ?? 'lokal'
}

// A few wrong passwords per minute per address, and at most 30 a minute in all, then wait
const attempts = new Map<string, { count: number; since: number }>()
let all = { count: 0, since: 0 }
export function tooManyAttempts(ip: string) {
  const now = Date.now()
  if (now - all.since > 60_000) {
    all = { count: 0, since: now }
    // Old addresses go, so made-up ones can't fill the memory
    for (const [k, v] of attempts) if (now - v.since > 60_000) attempts.delete(k)
  }
  all.count++
  if (all.count > 30 || attempts.size > 5_000) return true
  const a = attempts.get(ip)
  if (!a || now - a.since > 60_000) {
    attempts.set(ip, { count: 1, since: now })
    return false
  }
  a.count++
  return a.count > 5
}
