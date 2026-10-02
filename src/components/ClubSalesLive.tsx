'use client'

import { useEffect, useState } from 'react'

// The club's live view of a match's sales (/billetsystem/demo/klub/<kamp>), asked for every 5 seconds

interface Sales {
  types: { type: string; label: string; price: number; sold: number; used: number }[]
  orders: number
  revenue: number
  fee: number
  sold: number
  used: number
  latest: { id: string; created: number; name: string; total: number; tickets: number }[]
}

const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr.`
const clock = (t: number) => new Date(t).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' })
/** Only the first name and an initial, as the club's staff would see it */
const short = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/)
  return first ? `${first}${rest.length ? ` ${rest.at(-1)![0]}.` : ''}` : 'Uden navn'
}

export function ClubSalesLive({ match }: { match: string }) {
  const [s, setS] = useState<Sales | null>()
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch(`/api/billetsystem/salg?kamp=${encodeURIComponent(match)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((x) => alive && setS(x as Sales | null))
        .catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [match])
  if (s === undefined) return <p className="muted">Henter …</p>
  if (!s || !s.sold) return <p className="bs-empty">Ingen billetter solgt endnu. Køb en i demoen – så dukker den op her med det samme.</p>
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)
  return (
    <div className="bs-club">
      <section className="bs-kpis" aria-label="Salget">
        <div className="bs-kpi is-lime">
          <span>Billetter solgt</span>
          <strong>{s.sold}</strong>
          <em>{s.orders === 1 ? '1 køb' : `${s.orders} køb`}</em>
        </div>
        <div className="bs-kpi">
          <span>Til klubben</span>
          <strong>{kr(s.revenue)}</strong>
          <em>Hele billetprisen</em>
        </div>
        <div className="bs-kpi">
          <span>Lukket ind</span>
          <strong>
            {s.used}
            <small> / {s.sold}</small>
          </strong>
          <i className="bs-bar" aria-hidden>
            <b style={{ width: `${pct(s.used, s.sold)}%` }} />
          </i>
        </div>
      </section>
      <div className="bs-club__cols">
        <section className="bs-card">
          <h2 className="bs-card__title">Pr. billettype</h2>
          <ul className="bs-typerows">
            {s.types.map((t) => (
              <li key={t.type}>
                <span className="bs-typerows__name">
                  <strong>{t.label}</strong>
                  <span>{t.price ? kr(t.price) : 'Gratis'}</span>
                </span>
                <span className="bs-typerows__nums">
                  <strong>{t.sold}</strong> solgt · {t.used} inde
                </span>
                <span className="bs-typerows__sum">{kr(t.sold * t.price)}</span>
                <i className="bs-bar" aria-hidden>
                  <b style={{ width: `${pct(t.used, t.sold)}%` }} />
                </i>
              </li>
            ))}
          </ul>
        </section>
        <section className="bs-card">
          <h2 className="bs-card__title">Seneste køb</h2>
          <ul className="bs-feed">
            {s.latest.map((o) => (
              <li key={o.id}>
                <span className="bs-feed__dot" aria-hidden />
                <span className="bs-feed__who">
                  <strong>{short(o.name)}</strong>
                  <span>
                    {clock(o.created)} · {o.tickets} {o.tickets === 1 ? 'billet' : 'billetter'}
                  </span>
                </span>
                <strong className="bs-feed__sum">{kr(o.total)}</strong>
              </li>
            ))}
          </ul>
          <p className="bs-card__note">Køberens gebyr ({kr(s.fee)} i alt) går til Matchly – klubben får hele billetprisen.</p>
        </section>
      </div>
    </div>
  )
}
