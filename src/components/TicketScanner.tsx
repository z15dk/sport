'use client'

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

// The gate's scanner (/billetsystem/demo/scanner): the phone's back camera, every frame read for a QR
// code (jsQR, works in every browser), the code checked on the server and the answer shown big:
// green = let in, red = already used / another match / not a ticket. The same code is not sent twice
// while it stays in front of the camera, and a code can always be typed instead (a broken screen, no camera).

type Result =
  | { status: 'ok'; label: string; title: string }
  | { status: 'used'; label: string; title: string; usedAt: number }
  | { status: 'wrong-match'; label: string; title: string }
  | { status: 'invalid' }
  | { status: 'offline' }

const clock = (t: number) => new Date(t).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Copenhagen' })

export function TicketScanner({ match }: { match?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [on, setOn] = useState(false)
  const [camError, setCamError] = useState<string>()
  const [result, setResult] = useState<Result>()
  const [counts, setCounts] = useState({ ok: 0, no: 0 })
  const [typed, setTyped] = useState('')
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const busy = useRef(false)
  const seq = useRef(0)

  /** typed = checked at once; from the camera only when it is not the code just answered */
  async function check(code: string, typed = false) {
    const now = Date.now()
    if (!typed) {
      // The same code held in front of the camera is answered once: sent again only after it has
      // been out of sight for 3 seconds (every sighting moves the time on)
      if (code === last.current.code && now - last.current.at < 3000) {
        last.current.at = now
        return
      }
      if (busy.current) return
      last.current = { code, at: now }
    }
    const mine = ++seq.current
    busy.current = true
    try {
      const res = await fetch('/api/billetsystem/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, kamp: match }) })
      const r = (await res.json()) as Result
      setCounts((c) => (r.status === 'ok' ? { ...c, ok: c.ok + 1 } : { ...c, no: c.no + 1 }))
      // Only the newest check is shown (a typed code is not overwritten by an older camera answer)
      if (mine === seq.current) {
        setResult(r)
        navigator.vibrate?.(r.status === 'ok' ? 80 : [60, 60, 60])
      }
    } catch {
      if (mine === seq.current) setResult({ status: 'offline' })
    } finally {
      if (mine === seq.current) busy.current = false
    }
  }

  useEffect(() => {
    if (!on) return
    let stream: MediaStream | undefined
    let frame = 0
    let stopped = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const tick = () => {
          if (stopped) return
          const c = canvas.current
          if (c && v.videoWidth) {
            const w = Math.min(640, v.videoWidth)
            const h = Math.round((v.videoHeight / v.videoWidth) * w)
            c.width = w
            c.height = h
            const ctx = c.getContext('2d', { willReadFrequently: true })!
            ctx.drawImage(v, 0, 0, w, h)
            const img = ctx.getImageData(0, 0, w, h)
            const qr = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
            if (qr?.data) check(qr.data)
          }
          frame = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        setCamError('Kameraet kunne ikke startes. Giv siden lov til kameraet – eller skriv koden herunder.')
        setOn(false)
      }
    })()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps

  const tone = !result ? '' : result.status === 'ok' ? ' is-ok' : ' is-no'
  const text = !result
    ? 'Klar – hold QR-koden foran kameraet'
    : result.status === 'ok'
      ? `Gyldig · ${result.label}`
      : result.status === 'used'
        ? `Allerede brugt kl. ${clock(result.usedAt)}`
        : result.status === 'wrong-match'
          ? `Billet til en anden kamp (${result.title})`
          : result.status === 'offline'
            ? 'Ingen forbindelse – prøv igen'
            : 'Ikke en gyldig billet'

  return (
    <div className="bs-scan">
      <div className={`bs-scan__result${tone}`} role="status" aria-live="assertive">
        <strong>{result?.status === 'ok' ? '✓' : result ? '✕' : '…'}</strong>
        <span>{text}</span>
        {result && 'title' in result && result.status !== 'wrong-match' && <em>{result.title}</em>}
      </div>
      <div className="bs-scan__cam">
        <video ref={video} playsInline muted className={on ? 'is-on' : ''} />
        <canvas ref={canvas} hidden />
        {!on && (
          <button type="button" className="wg-btn wg-btn--lime" onClick={() => setOn(true)}>
            Start kameraet
          </button>
        )}
      </div>
      {camError && <p className="is-error small">{camError}</p>}
      <form
        className="bs-scan__type"
        onSubmit={(e) => {
          e.preventDefault()
          if (typed.trim()) check(typed.trim(), true)
        }}
      >
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Eller skriv koden (MTK1.…)" aria-label="Billetkode" />
        <button type="submit" className="pill is-active">
          Tjek
        </button>
      </form>
      <p className="muted small">
        Lukket ind: <strong>{counts.ok}</strong> · Afvist: <strong>{counts.no}</strong>
      </p>
    </div>
  )
}
