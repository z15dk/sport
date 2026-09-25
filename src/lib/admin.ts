import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

// Access to the admin pages (/admin). The password is ADMIN_PASSWORD in the
// server's environment (/opt/scoreline/env on the VPS); without it the admin
// pages are closed. A login sets a signed, HttpOnly cookie for 7 days.

export const COOKIE = 'scoreline_admin'
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

/** Requests that change something must come from our own pages */
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true // same-origin form posts from older browsers
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

// A few wrong passwords per minute per address, then wait
const attempts = new Map<string, { count: number; since: number }>()
export function tooManyAttempts(ip: string) {
  const now = Date.now()
  const a = attempts.get(ip)
  if (!a || now - a.since > 60_000) {
    attempts.set(ip, { count: 1, since: now })
    return false
  }
  a.count++
  return a.count > 5
}
