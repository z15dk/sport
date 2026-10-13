'use client'

import Link from 'next/link'
import { useState } from 'react'
import { paths } from '../lib/site'

/**
 * "Få <klub> i din indbakke": the sign-up for the weekly club mail (src/lib/klubmail/server.ts). On the football club
 * pages as a dark box, and small (`compact`) under Mine hold for all the visitor's football teams. The address goes to
 * /api/klubmail/tilmeld, which sends a mail to confirm (double opt-in); the hidden "website" field is for robots.
 */
export function ClubMailSignup({ clubs, compact }: { clubs: { slug: string; name: string }[]; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'done' | 'error'; text?: string }>({ kind: 'idle' })
  if (!clubs.length) return null
  const who = clubs.length === 1 ? clubs[0].name : clubs.length === 2 ? `${clubs[0].name} og ${clubs[1].name}` : 'dine hold'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState({ kind: 'sending' })
    try {
      const r = await fetch('/api/klubmail/tilmeld', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, clubs: clubs.map((c) => c.slug), website }),
      })
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (r.ok && data.ok) setState({ kind: 'done' })
      else setState({ kind: 'error', text: data.error ?? 'Noget gik galt – prøv igen.' })
    } catch {
      setState({ kind: 'error', text: 'Ingen forbindelse – prøv igen.' })
    }
  }

  const id = `klubmail-${compact ? 'mine' : clubs[0].slug}`
  return (
    <section className={`klubmail${compact ? ' klubmail--compact' : ''}`} aria-labelledby={`${id}-title`}>
      {!compact && (
        <span className="klubmail__m" aria-hidden>
          M
        </span>
      )}
      <div className="klubmail__copy">
        {!compact && <span className="klubmail__kicker">Gratis · hver mandag morgen</span>}
        <h2 id={`${id}-title`} className="klubmail__title">
          Få {who} i din indbakke
        </h2>
        <p className="klubmail__text">Sidste resultat, næste kamp med TV-kanal og stillingen – hver mandag morgen. Gratis, og du kan altid afmelde.</p>
      </div>
      {state.kind === 'done' ? (
        <p className="klubmail__done" role="status">
          <strong>Tjek din indbakke.</strong> Tryk på linket i mailen for at bekræfte – så kommer den første mail på mandag. (Er du allerede tilmeldt, sker der
          ikke mere.)
        </p>
      ) : (
        <form className="klubmail__form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor={`${id}-email`}>
            Din mailadresse
          </label>
          <input
            id={`${id}-email`}
            className="klubmail__input"
            type="email"
            name="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            placeholder="din@mail.dk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {/* Only robots fill this in */}
          <input className="klubmail__hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} />
          <button type="submit" className="klubmail__btn" disabled={state.kind === 'sending'}>
            {state.kind === 'sending' ? 'Sender …' : 'Tilmeld'}
          </button>
          {state.kind === 'error' && (
            <p className="klubmail__error" role="alert">
              {state.text}
            </p>
          )}
          <p className="klubmail__note">
            Vi bruger kun adressen til mailen. <Link href={paths.privacy()}>Privatliv</Link>
          </p>
        </form>
      )}
    </section>
  )
}
