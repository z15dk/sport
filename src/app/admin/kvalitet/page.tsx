import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import Link from 'next/link'
import { leagueQuality, sourceQuality, type Check, type Level } from '../../../lib/dataQuality'
import { formatFull, formatTime } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Datakvalitet', robots: { index: false, follow: false } }

const MARK: Record<Level, string> = { ok: '✓', warn: '!', error: '✕' }
const WORD: Record<Level, string> = { ok: 'I orden', warn: 'Tjek', error: 'Fejl' }

function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className="quality__checks">
      {checks.map((c, i) => (
        <li key={i} className={`quality__check quality__check--${c.level}`}>
          <span className="quality__mark" aria-label={WORD[c.level]}>
            {MARK[c.level]}
          </span>
          <span>
            {c.text}
            {c.items && c.items.length > 0 && (
              <ul className="quality__items">
                {c.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Checks that the data is right and keeps updating: per source and per league */
export default async function DataQualityPage() {
  if (!(await isAdmin())) redirect('/admin')
  const now = new Date()
  const sources = sourceQuality(now.getTime())
  const leagues = leagueQuality(now.getTime())
  const count = (l: Level) => leagues.filter((x) => x.level === l).length
  return (
    <div className="page">
      <div className="clubs prose admin">
        <AdminNav current="/admin/kvalitet" />
        <h1 className="feed__title">Datakvalitet</h1>
        <p>
          Kontrol af de data, siden viser, {formatFull(now)} kl. {formatTime(now)}: {count('ok')} ligaer i orden, {count('warn')} skal tjekkes,{' '}
          {count('error')} med fejl. Detaljer om hentningen: <Link href="/admin/data">data-status</Link>.
        </p>

        <section className="panel prose__section">
          <h2 className="panel__title">Kilder</h2>
          {sources.map((s) => (
            <div key={s.name} className={`quality quality--${s.level}`}>
              <h3 className="quality__name">
                <span className={`quality__badge quality__badge--${s.level}`}>{WORD[s.level]}</span> {s.name}
              </h3>
              <Checks checks={s.checks} />
            </div>
          ))}
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Ligaer</h2>
          {[...leagues]
            .sort((a, b) => ['error', 'warn', 'ok'].indexOf(a.level) - ['error', 'warn', 'ok'].indexOf(b.level))
            .map((l) => (
              <div key={l.id} className={`quality quality--${l.level}`}>
                <h3 className="quality__name">
                  <span className={`quality__badge quality__badge--${l.level}`}>{WORD[l.level]}</span> {l.name}
                  <span className="muted small">
                    {' '}
                    · {l.matches} kampe, {l.finished} spillet · kilder:{' '}
                    {Object.entries(l.sources)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(', ')}
                  </span>
                </h3>
                <Checks checks={l.checks} />
              </div>
            ))}
        </section>
      </div>
    </div>
  )
}
