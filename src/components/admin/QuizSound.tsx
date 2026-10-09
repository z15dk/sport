'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// The series' sound on /admin/sociale/quiz: play it, upload a new one (it goes on every episode), remove it

export function QuizSound({ has }: { has: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean }>()
  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setMsg(undefined)
    const form = new FormData()
    form.set('file', file)
    const res = await fetch('/api/admin/quiz/lyd', { method: 'POST', body: form }).catch(() => undefined)
    const r = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string; episodes?: number }
    setBusy(false)
    if (!res?.ok || r.error) return setMsg({ text: r.error ?? 'Det gik ikke', error: true })
    setMsg({ text: `Lyden er gemt og lagt på ${r.episodes ?? 0} afsnit` })
    router.refresh()
  }
  return (
    <section className="panel pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="panel__title">Seriens lyd</h2>
      <p className="muted small">
        Samme lyd på alle afsnit (23,3 sek.). Klippene falder ved 3,5 · 5,5 (svaret) · 8,3 · 12,3 · 16,3 · 20,3 sek. En længere fil klippes af med en kort fade; en kortere får stilhed til sidst. Brug kun musik, I har ret til.
      </p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- music without words */}
      {has && <audio src={`/api/admin/quiz/lyd?v=${Date.now()}`} controls preload="none" style={{ width: '100%' }} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <label className="pill is-active" style={{ cursor: 'pointer' }}>
          {busy ? 'Lægger lyden på …' : has ? 'Skift lyd' : 'Upload lyd'}
          <input type="file" accept="audio/*,.mp3,.m4a,.wav" hidden disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
        {has && (
          <button
            type="button"
            className="text-btn"
            disabled={busy}
            onClick={async () => {
              if (!confirm('Fjern lyden? Nye afsnit bliver uden lyd.')) return
              await fetch('/api/admin/quiz/lyd', { method: 'DELETE' }).catch(() => undefined)
              router.refresh()
            }}
          >
            Fjern lyd
          </button>
        )}
        {msg && <small className={msg.error ? 'is-error' : 'muted'}>{msg.text}</small>}
      </div>
    </section>
  )
}
