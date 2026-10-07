import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { DatavagtButton } from '../../../components/admin/DatavagtButton'
import { isAdmin } from '../../../lib/admin'
import { readDatavagt } from '../../../lib/datavagt'
import { readRettelser } from '../../../lib/rettelser'
import { formatFull, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Datavagt', robots: { index: false, follow: false } }

// What the datavagt found last night, the corrections in use (who set them and why), and what Claude and the
// owner have changed. Claude reads and fixes the list each morning through /api/admin/datavagt.

const when = (ms: number) => `${formatFull(new Date(ms))} kl. ${formatTime(new Date(ms))}`

export default async function DatavagtPage() {
  if (!(await isAdmin())) redirect('/admin')
  const report = readDatavagt()
  const fixes = readRettelser()
  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/datavagt" />
        <h1 className="feed__title">Datavagt</h1>
        <p className="muted">
          Hver nat tjekkes de danske klubsider: træner og stadion mod DBU og API-Sports, ugens Superliga- og 1. divisionskampe uden TV-kanal, vores tabel mod API-Sports&apos; og kampe, der hænger som i gang eller ikke spillet. Claude gennemgår listen hver morgen, tjekker hvert punkt i to kilder og retter trænerne selv – resten står her. Tryk &quot;Det er rigtigt&quot;, så kommer et fund først igen, hvis det ændrer sig.
        </p>
        <section className="panel pad">
          <h2 className="panel__title">Fundet {report.at ? when(report.at) : '– endnu ikke kørt'}</h2>
          {report.findings.length ? (
            <ul className="quality__checks">
              {report.findings.map((f) => (
                <li key={f.id} className="quality__check quality__check--warn">
                  <span className="quality__mark">!</span>
                  <span>
                    <strong>{f.url ? <a href={f.url}>{f.club}</a> : f.club}</strong> – {f.text} <DatavagtButton id={f.id} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Intet at bemærke.</p>
          )}
        </section>
        <section className="panel pad">
          <h2 className="panel__title">Trænere vi retter ({Object.keys(fixes.coaches).length})</h2>
          <ul className="quality__checks">
            {Object.entries(fixes.coaches).map(([slug, c]) => (
              <li key={slug} className="quality__check quality__check--ok">
                <span className="quality__mark">✓</span>
                <span>
                  <strong>{slug}</strong>: {c.name}
                  {c.acting ? ' (konstitueret)' : ''} – {c.why} <span className="muted small">({c.by}, {when(c.at)})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        {Object.keys(fixes.confirmed).length > 0 && (
          <section className="panel pad">
            <h2 className="panel__title">Trænere du har bekræftet ({Object.keys(fixes.confirmed).length})</h2>
            <p className="muted small">DBU&apos;s navn er rigtigt – datavagten spørger ikke igen, før DBU nævner en anden.</p>
            <ul className="quality__checks">
              {Object.entries(fixes.confirmed).map(([slug, c]) => (
                <li key={slug} className="quality__check quality__check--ok">
                  <span className="quality__mark">✓</span>
                  <span>
                    <strong>{slug}</strong>: {c.name} <span className="muted small">({c.by}, {when(c.at)})</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {Object.keys(fixes.dismissed).length > 0 && (
          <section className="panel pad">
            <h2 className="panel__title">Fund du har godkendt ({Object.keys(fixes.dismissed).length})</h2>
            <ul className="quality__checks">
              {Object.entries(fixes.dismissed).map(([id, d]) => (
                <li key={id} className="quality__check quality__check--ok">
                  <span className="quality__mark">✓</span>
                  <span>
                    {d.text} <span className="muted small">({d.by}, {when(d.at)})</span> <DatavagtButton id={id} undo />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="panel pad">
          <h2 className="panel__title">Seneste ændringer</h2>
          {fixes.log.length ? (
            <ul className="quality__checks">
              {[...fixes.log].reverse().slice(0, 30).map((l, i) => (
                <li key={i} className="quality__check">
                  <span className="muted small">{when(l.at)} · {l.by}</span> {l.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Ingen endnu.</p>
          )}
        </section>
      </div>
    </div>
  )
}
