'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ClubSales } from '../lib/ticketShop'

// The club's own overview of all its sales (/billetsystem/demo/salg/<klub>), asked for every 5 seconds:
// totals, tickets per day, every match (also the coming ones without sales yet), per ticket type and the latest orders.

export interface DashMatch {
  slug: string
  title: string
  kickoff: number
}

const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr.`
const clock = (t: number) => new Date(t).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' })
const dayShort = (t: number) => new Date(t).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' }).replace('.', '')
const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('da-DK', { weekday: 'short' }).replace('.', '')
/** Only the first name and an initial, as the club's staff would see it */
const short = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/)
  return first ? `${first}${rest.length ? ` ${rest.at(-1)![0]}.` : ''}` : 'Uden navn'
}
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)

export function ClubDashboardLive({ club, matches }: { club: string; matches: DashMatch[] }) {
  const [s, setS] = useState<ClubSales | null>()
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch(`/api/billetsystem/salg?klub=${encodeURIComponent(club)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((x) => alive && setS(x as ClubSales | null))
        .catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [club])
  if (s === undefined) return <p className="muted">Henter …</p>
  const sales = s ?? { orders: 0, sold: 0, used: 0, revenue: 0, fee: 0, matches: [], days: [], types: [], latest: [] }
  // Every match: the coming ones from the fixture list, plus played/other matches that have sales
  const byMatch = new Map(sales.matches.map((m) => [m.match, m]))
  const rows = [
    ...matches.map((m) => ({ slug: m.slug, title: m.title, kickoff: m.kickoff, ...(byMatch.get(m.slug) ?? { orders: 0, sold: 0, used: 0, revenue: 0 }) })),
    ...sales.matches.filter((m) => !matches.some((x) => x.slug === m.match)).map((m) => ({ slug: m.match, title: m.title, kickoff: m.kickoff, orders: m.orders, sold: m.sold, used: m.used, revenue: m.revenue })),
  ].sort((a, b) => a.kickoff - b.kickoff)
  const maxSold = Math.max(1, ...rows.map((r) => r.sold))
  const maxDay = Math.max(1, ...sales.days.map((d) => d.sold))
  const week = sales.days.slice(-7).reduce((n, d) => n + d.sold, 0)
  const withSales = rows.filter((r) => r.sold > 0).length
  return (
    <div className="bs-club">
      <section className="bs-kpis bs-kpis--4" aria-label="Salget i alt">
        <div className="bs-kpi is-lime">
          <span>Billetter solgt</span>
          <strong>{sales.sold}</strong>
          <em>{sales.orders === 1 ? '1 køb' : `${sales.orders} køb`} · alle kampe</em>
        </div>
        <div className="bs-kpi">
          <span>Til klubben</span>
          <strong>{kr(sales.revenue)}</strong>
          <em>Hele billetprisen</em>
        </div>
        <div className="bs-kpi">
          <span>Sidste 7 dage</span>
          <strong>{week}</strong>
          <em>{week === 1 ? 'billet' : 'billetter'}</em>
        </div>
        <div className="bs-kpi">
          <span>Lukket ind</span>
          <strong>
            {sales.used}
            <small> / {sales.sold}</small>
          </strong>
          <i className="bs-bar" aria-hidden>
            <b style={{ width: `${pct(sales.used, sales.sold)}%` }} />
          </i>
        </div>
      </section>

      <section className="bs-card">
        <h2 className="bs-card__title">Solgt pr. dag · de sidste 14 dage</h2>
        {sales.sold === 0 ? (
          <p className="bs-card__note">Ingen billetter solgt endnu. Køb en i demoen – så står den her med det samme.</p>
        ) : (
          <ol className="bs-days" aria-label="Billetter pr. dag">
            {sales.days.map((d) => (
              <li key={d.day} title={`${d.day}: ${d.sold} ${d.sold === 1 ? 'billet' : 'billetter'} · ${kr(d.revenue)}`}>
                <span className="bs-days__n">{d.sold || ''}</span>
                <i aria-hidden>
                  <b style={{ height: `${Math.max(d.sold ? 4 : 0, pct(d.sold, maxDay))}%` }} />
                </i>
                <span className="bs-days__d">{weekday(d.day)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="bs-club__cols">
        <section className="bs-card">
          <h2 className="bs-card__title">
            Kampene <small>{withSales ? `· ${withSales} med salg` : ''}</small>
          </h2>
          {rows.length === 0 ? (
            <p className="bs-card__note">Ingen kommende hjemmekampe lige nu.</p>
          ) : (
            <ul className="bs-matchrows">
              {rows.map((r) => (
                <li key={r.slug}>
                  <span className="bs-matchrows__when">
                    <b>{dayShort(r.kickoff)}</b>
                    <span>kl. {clock(r.kickoff)}</span>
                  </span>
                  <span className="bs-matchrows__title">
                    <Link href={`/billetsystem/demo/klub/${r.slug}`} prefetch={false}>
                      {r.title}
                    </Link>
                    <span>
                      {r.sold ? `${r.sold} solgt · ${r.used} inde · ${kr(r.revenue)}` : 'Intet salg endnu'}
                      {' · '}
                      <Link href={`/billetsystem/demo/${r.slug}`} prefetch={false}>
                        køb
                      </Link>
                    </span>
                  </span>
                  <strong className="bs-matchrows__sold">{r.sold}</strong>
                  <i className="bs-bar" aria-hidden>
                    <b style={{ width: `${pct(r.sold, maxSold)}%` }} />
                  </i>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="bs-club__stack">
          <section className="bs-card">
            <h2 className="bs-card__title">Pr. billettype</h2>
            {sales.types.length === 0 ? (
              <p className="bs-card__note">Intet solgt endnu.</p>
            ) : (
              <ul className="bs-typerows">
                {sales.types.map((t) => (
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
                      <b style={{ width: `${pct(t.sold, sales.sold)}%` }} />
                    </i>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="bs-card">
            <h2 className="bs-card__title">Seneste køb</h2>
            {sales.latest.length === 0 ? (
              <p className="bs-card__note">Ingen køb endnu.</p>
            ) : (
              <ul className="bs-feed">
                {sales.latest.map((o) => (
                  <li key={o.id}>
                    <span className="bs-feed__dot" aria-hidden />
                    <span className="bs-feed__who">
                      <strong>{short(o.name)}</strong>
                      <span>
                        {clock(o.created)} · {o.tickets} {o.tickets === 1 ? 'billet' : 'billetter'} · {o.title}
                      </span>
                    </span>
                    <strong className="bs-feed__sum">{kr(o.total)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <p className="bs-card__note">Køberens gebyr ({kr(sales.fee)} i alt) går til Matchly – klubben får hele billetprisen.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
