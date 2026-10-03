'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The cookie banner and the trackers behind it (ids from src/lib/tracking.ts via the layout).
// Nothing is loaded before a yes: statistics → Google Analytics 4, marketing → Meta Pixel.
// "Accepter alle" and "Kun nødvendige" are equally big (as the Danish DPA asks), the choice
// is kept in the browser for 12 months (localStorage, allowed: it is what remembers the no),
// every choice is logged on the server with a random id as proof (/api/consent, no IP),
// and "Cookie-indstillinger" in the footer opens the banner again. Withdrawing a yes removes
// the trackers' cookies and reloads the page. Logged-in admins (the bar's flag cookie) are
// neither asked nor counted.

import { CONSENT_KEY as KEY, CONSENT_MAX_AGE as MAX_AGE, CONSENT_VERSION as VERSION } from '../lib/consentScript'
export const OPEN_CONSENT = 'matchly:consent'

interface Choice {
  v: number
  at: number
  stats: boolean
  marketing: boolean
  /** Random id of this browser's consent, logged on the server as proof (src/lib/consentLog.ts) */
  id?: string
}

const newId = () => {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-6)
}

/** Sends the choice to the consent log (also when the page reloads right after) */
function logChoice(c: Choice, action: 'accept' | 'reject' | 'custom' | 'withdraw') {
  const body = JSON.stringify({ id: c.id, v: c.v, stats: c.stats, marketing: c.marketing, action })
  try {
    if (!navigator.sendBeacon?.('/api/consent', new Blob([body], { type: 'application/json' }))) void fetch('/api/consent', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined)
  } catch {
    // the choice still holds in the browser
  }
}

type W = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; fbq?: ((...a: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] }; _fbq?: unknown }

function readChoice(): Choice | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Choice | null
    return c && c.v === VERSION && Date.now() - c.at < MAX_AGE ? c : undefined
  } catch {
    return undefined
  }
}

const isAdminBrowser = () => document.cookie.split('; ').some((c) => c === 'scoreline_bar=1')

function loadGa(id: string, marketing: boolean) {
  const w = window as W
  if (w.gtag) return
  w.dataLayer = w.dataLayer ?? []
  w.gtag = function gtag() {
    // gtag needs the arguments object itself
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments)
  }
  w.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: marketing ? 'granted' : 'denied', ad_user_data: marketing ? 'granted' : 'denied', ad_personalization: marketing ? 'granted' : 'denied' })
  w.gtag('js', new Date())
  w.gtag('config', id)
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(s)
}

function loadPixel(id: string) {
  const w = window as W
  if (w.fbq) return
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) (fbq.callMethod as (...a: unknown[]) => void)(...args)
    else fbq.queue!.push(args)
  } as NonNullable<W['fbq']> & { push?: unknown; loaded?: boolean; version?: string }
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  w.fbq = fbq
  w._fbq = fbq
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(s)
  fbq('init', id)
  fbq('track', 'PageView')
}

/** Removes Google Analytics' and Meta's cookies (on this host and the parent domain) */
function clearTrackerCookies() {
  const host = location.hostname
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`]
  for (const c of document.cookie.split('; ')) {
    const name = c.split('=')[0]
    if (!/^(_ga|_gid|_gat|_fbp|_fbc)/.test(name)) continue
    for (const d of domains) document.cookie = `${name}=; path=/; max-age=0${d ? `; domain=${d}` : ''}`
  }
}

export function ConsentBanner({ ga, metaPixel }: { ga?: string; metaPixel?: string }) {
  const path = usePathname()
  // Open from the server when there are trackers to ask about: hidden by CONSENT_DONE_SCRIPT, and closed here, once a choice is made
  const [open, setOpen] = useState(!!(ga || metaPixel))
  const [details, setDetails] = useState(false)
  const [stats, setStats] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const choice = useRef<Choice | undefined>(undefined)
  const firstPath = useRef(true)
  const any = !!(ga || metaPixel)

  const apply = useCallback(
    (c: Choice) => {
      if (isAdminBrowser()) return
      if (c.stats && ga) loadGa(ga, c.marketing)
      if (c.marketing && metaPixel) loadPixel(metaPixel)
    },
    [ga, metaPixel],
  )

  useEffect(() => {
    if (!any || isAdminBrowser()) {
      setOpen(false)
      return
    }
    const c = readChoice()
    choice.current = c
    if (c) {
      setOpen(false)
      apply(c)
    } else setOpen(true)
    const reopen = () => {
      // The class from the head script would hide the banner opened again
      document.documentElement.classList.remove('consent-done')
      const now = readChoice()
      setStats(!!now?.stats)
      setMarketing(!!now?.marketing)
      setDetails(true)
      setOpen(true)
    }
    window.addEventListener(OPEN_CONSENT, reopen)
    return () => window.removeEventListener(OPEN_CONSENT, reopen)
  }, [any, apply])

  // Google Analytics counts page changes itself; the pixel is told
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false
      return
    }
    const w = window as W
    if (choice.current?.marketing && w.fbq) w.fbq('track', 'PageView')
  }, [path])

  function save(s: boolean, m: boolean, how: 'accept' | 'reject' | 'custom') {
    const before = choice.current
    const c: Choice = { v: VERSION, at: Date.now(), stats: s, marketing: m, id: before?.id ?? readChoice()?.id ?? newId() }
    const withdrawn = (before?.stats && !s) || (before?.marketing && !m)
    logChoice(c, withdrawn ? 'withdraw' : how)
    try {
      localStorage.setItem(KEY, JSON.stringify(c))
    } catch {
      // private window: asked again next time
    }
    choice.current = c
    setOpen(false)
    // A yes taken back: the scripts are already running, so clear their cookies and start the page again
    if (withdrawn) {
      clearTrackerCookies()
      location.reload()
      return
    }
    apply(c)
  }

  if (!open) return null
  return (
    <div className="consent" role="dialog" aria-modal="false" aria-labelledby="consent-title">
      <div className="consent__box">
        <span className="consent__m" aria-hidden>
          M
        </span>
        <h2 id="consent-title">
          Må vi bruge <em>cookies?</em>
        </h2>
        <p>
          Vi vil gerne måle, hvordan siden bruges{metaPixel ? ', og vise vores annoncer på Facebook og Instagram til dem, der kender Matchly' : ''}. Det kræver cookies fra{' '}
          {[ga && 'Google', metaPixel && 'Meta'].filter(Boolean).join(' og ')}. Siden virker fuldt ud uden. <Link href="/privatliv">Læs mere</Link>
        </p>
        {details && (
          <div className="consent__choices">
            <label className="consent__opt">
              <input type="checkbox" checked disabled />
              <span>
                <strong>Nødvendige</strong>
                <em>Husker dit valg og dine hold. Altid til.</em>
              </span>
            </label>
            {ga && (
              <label className="consent__opt">
                <input type="checkbox" checked={stats} onChange={(e) => setStats(e.target.checked)} />
                <span>
                  <strong>Statistik</strong>
                  <em>Google Analytics: hvilke sider der bliver set, og hvor besøgende kommer fra.</em>
                </span>
              </label>
            )}
            {metaPixel && (
              <label className="consent__opt">
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                <span>
                  <strong>Marketing</strong>
                  <em>Meta Pixel: måler vores annoncer på Facebook og Instagram.</em>
                </span>
              </label>
            )}
            {choice.current?.id && (
              <p className="consent__id">
                Dit samtykke-id: <code>{choice.current.id}</code> · givet {new Date(choice.current.at).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' })}
              </p>
            )}
          </div>
        )}
        <div className="consent__buttons">
          <button type="button" className="consent__btn is-yes" onClick={() => save(!!ga, !!metaPixel, 'accept')}>
            Accepter alle
          </button>
          <button type="button" className="consent__btn" onClick={() => save(false, false, 'reject')}>
            Kun nødvendige
          </button>
          {details ? (
            <button type="button" className="consent__link" onClick={() => save(stats && !!ga, marketing && !!metaPixel, 'custom')}>
              Gem mit valg
            </button>
          ) : (
            <button type="button" className="consent__link" onClick={() => setDetails(true)}>
              Tilpas
            </button>
          )}
        </div>
        <div className="consent__bar" aria-hidden>
          <b>
            Matchly<i>.</i>
          </b>
          <span>Live score og stats · matchly.dk</span>
        </div>
      </div>
    </div>
  )
}

/** "Cookie-indstillinger" in the footer: opens the banner again */
export function ConsentSettingsLink() {
  return (
    <button type="button" className="footer__linkbtn" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT))}>
      Cookie-indstillinger
    </button>
  )
}
