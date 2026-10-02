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
  if (!s || !s.sold) return <p className="panel muted pad">Ingen billetter solgt endnu. Køb en i demoen – så dukker den op her med det samme.</p>
  return (
    <>
      <section className="tiles tiles--club" aria-label="Salget">
        <div className="tile tile--lime">
          <span className="tile__label">Billetter solgt</span>
          <strong className="tile__value">{s.sold}</strong>
        </div>
        <div className="tile tile--ink">
          <span className="tile__label">Til klubben</span>
          <strong className="tile__value">{kr(s.revenue)}</strong>
        </div>
        <div className="tile tile--blush">
          <span className="tile__label">Scannet ved indgangen</span>
          <strong className="tile__value">
            {s.used} / {s.sold}
          </strong>
        </div>
        <div className="tile tile--lime">
          <span className="tile__label">Køb</span>
          <strong className="tile__value">{s.orders}</strong>
        </div>
      </section>
      <section className="panel">
        <h2 className="panel__title">Pr. billettype</h2>
        <ul className="admin-list">
          {s.types.map((t) => (
            <li key={t.type} className="bs-salesrow">
              <span>
                <strong>{t.label}</strong> <span className="muted small">{t.price ? kr(t.price) : 'gratis'}</span>
              </span>
              <span>
                {t.sold} solgt · {t.used} scannet · <strong>{kr(t.sold * t.price)}</strong>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="panel__title">Seneste køb</h2>
        <ul className="admin-list">
          {s.latest.map((o) => (
            <li key={o.id} className="bs-salesrow">
              <span>
                {clock(o.created)} · {short(o.name)}
              </span>
              <span>
                {o.tickets} {o.tickets === 1 ? 'billet' : 'billetter'} · <strong>{kr(o.total)}</strong>
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small pad">Køberens gebyr ({kr(s.fee)} i alt) går til Matchly – klubben får hele billetprisen.</p>
      </section>
    </>
  )
}
