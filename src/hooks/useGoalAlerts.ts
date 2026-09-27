'use client'

import { useCallback, useEffect, useState } from 'react'

// Goal alerts (Målalarm) in this browser: web push through public/sw.js, for
// the teams followed under Mine hold. The server (src/lib/push.ts) keeps the
// push address and the teams; following or unfollowing a team sends the new
// list (syncGoalAlertTeams, called from useFavoriteTeams).

export type AlertState = 'loading' | 'unsupported' | 'insecure' | 'ios-install' | 'denied' | 'off' | 'on'

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
/** iPhone/iPad Safari outside the home screen app: push only works once added to the home screen */
const iosBrowser = () =>
  typeof navigator !== 'undefined' &&
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone)

function readTeams(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem('favoriteTeams') ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function currentSubscription() {
  if (!supported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

async function post(subscription: PushSubscription, welcome = false) {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), teams: readTeams(), welcome }),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Kunne ikke gemme')
}

/** Sends the followed teams again, when alerts are on in this browser */
export async function syncGoalAlertTeams() {
  try {
    if (!supported() || Notification.permission !== 'granted') return
    const sub = await currentSubscription()
    if (sub) await post(sub)
  } catch {
    // Tried again at the next change
  }
}

const keyBytes = (base64: string) => {
  const raw = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function useGoalAlerts() {
  const [state, setState] = useState<AlertState>('loading')
  const [error, setError] = useState<string>()

  useEffect(() => {
    let live = true
    ;(async () => {
      // Push only works on https (or localhost)
      if (!window.isSecureContext) return 'insecure'
      if (!supported()) return iosBrowser() ? 'ios-install' : 'unsupported'
      if (Notification.permission === 'denied') return 'denied'
      return (await currentSubscription()) ? 'on' : 'off'
    })()
      .catch(() => 'off' as const)
      .then((s) => live && setState(s))
    return () => {
      live = false
    }
  }, [])

  const enable = useCallback(async () => {
    setError(undefined)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      await navigator.serviceWorker.ready
      if ((await Notification.requestPermission()) !== 'granted') {
        setState(Notification.permission === 'denied' ? 'denied' : 'off')
        return
      }
      const { key } = (await (await fetch('/api/push/key')).json()) as { key: string }
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
      await post(sub, true)
      setState('on')
    } catch (err) {
      setError((err as Error).message || 'Kunne ikke slå målalarm til')
    }
  }, [])

  const disable = useCallback(async () => {
    setError(undefined)
    try {
      const sub = await currentSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setState('off')
    } catch (err) {
      setError((err as Error).message || 'Kunne ikke slå målalarm fra')
    }
  }, [])

  return { state, error, enable, disable }
}
