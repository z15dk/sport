import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import Link from 'next/link'
import { leagueQuality, sourceQuality, type Check, type Level } from '../../../lib/dataQuality'
import { formatFull, formatTime } from '../../../lib/time'
import { historyOverview } from '../../../lib/apisports'

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

        <section className="panel prose__section">
          <h2 className="panel__title">Tidligere sæsoner</h2>
          <p className="muted small">
            Hver sæson hentes fra API-Sports og tjekkes hold for hold mod den officielle slutstilling (kampe, sejre/uafgjorte/nederlag og målscore; ishockey og
            basketball kun antal kampe). Kun sæsoner i orden får en side. Stemmer en sæson ikke, hentes den igen (op til 3 gange, med 3 dages mellemrum).
          </p>
          {(() => {
            const rows = historyOverview()
            if (!rows.length) return <p className="muted small">Ingen sæsoner hentet endnu.</p>
            const ok = rows.filter((r) => r.check?.status === 'ok').length
            return (
              <>
                <p>
                  <strong>
                    {ok} af {rows.length}
                  </strong>{' '}
                  sæsoner er i orden og vises.
                </p>
                {rows.map((r) => {
                  const level: Level = r.check?.status === 'ok' ? 'ok' : !r.saved || r.check?.status === 'no-official' ? 'warn' : 'error'
                  const text = !r.saved
                    ? 'Ikke tilgængelig på planen (eller ingen kampe)'
                    : r.check?.status === 'ok'
                      ? `I orden: ${r.check.games.length} kampe stemmer med slutstillingen${r.check.adjustments.length ? ` (pointjusteringer: ${r.check.adjustments.map((a) => `${a.name} ${a.points > 0 ? '+' : ''}${a.points}`).join(', ')})` : ''}${r.table?.scorers?.length ? ', officielle topscorere hentet' : ''}`
                      : r.check?.status === 'no-official'
                        ? `${r.saved} kampe gemt – ${r.check.issues[0]}${r.table?.error ? ` (${r.table.error})` : ''}`
                        : `${r.check?.games.length ?? 0} kampe gemt – stemmer ikke med slutstillingen${r.table?.refetches ? ` (hentet igen ${r.table.refetches} gang${r.table.refetches > 1 ? 'e' : ''})` : ''}`
                  return (
                    <div key={`${r.division.id}|${r.year}`} className={`quality quality--${level}`}>
                      <h3 className="quality__name">
                        <span className={`quality__badge quality__badge--${level}`}>{WORD[level]}</span> {r.division.name} {r.season}
                      </h3>
                      <Checks checks={[{ level, text, items: level === 'error' ? r.check?.issues.slice(0, 12) : undefined }]} />
                    </div>
                  )
                })}
              </>
            )
          })()}
        </section>
      </div>
    </div>
  )
}
