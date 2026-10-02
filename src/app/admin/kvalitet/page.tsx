import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import Link from 'next/link'
import { leagueQuality, sourceQuality, type Check, type Level } from '../../../lib/dataQuality'
import { formatFull, formatTime } from '../../../lib/time'
import { historyOverview } from '../../../lib/apisports'
import { DashFlow } from '../../../components/admin/DashFlow'

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

const TILE: Record<Level, string> = { ok: 'is-ok', warn: 'is-warn', error: 'is-bad' }
const worst = (levels: Level[]): Level => (levels.includes('error') ? 'error' : levels.includes('warn') ? 'warn' : 'ok')
const ORDER: Level[] = ['error', 'warn', 'ok']

function Tile({ label, value, sub, level }: { label: string; value: string; sub: string; level: Level }) {
  return (
    <div className={`dash-tile ${TILE[level]}`}>
      <span className="dash-tile__label">
        <b>{MARK[level]}</b> {label}
      </span>
      <strong className="dash-tile__value">{value}</strong>
      <span className="dash-tile__sub">{sub}</span>
    </div>
  )
}

/** Checks that the data is right and keeps updating: per source, per league and per earlier season */
export default async function DataQualityPage() {
  if (!(await isAdmin())) redirect('/admin')
  const now = new Date()
  const sources = sourceQuality(now.getTime())
  const leagues = [...leagueQuality(now.getTime())].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level))
  const count = (l: Level) => leagues.filter((x) => x.level === l).length
  const srcCount = (l: Level) => sources.filter((x) => x.level === l).length
  const seasons = historyOverview().map((r) => {
    const level: Level = r.check?.status === 'ok' ? 'ok' : !r.saved || r.check?.status === 'no-official' ? 'warn' : 'error'
    const text = !r.saved
      ? 'Ikke tilgængelig på planen (eller ingen kampe)'
      : r.check?.status === 'ok'
        ? `${r.check.games.length} kampe stemmer med slutstillingen${r.check.adjustments.length ? ` (pointjusteringer: ${r.check.adjustments.map((a) => `${a.name} ${a.points > 0 ? '+' : ''}${a.points}`).join(', ')})` : ''}${r.table?.scorers?.length ? ', officielle topscorere hentet' : ''}`
        : r.check?.status === 'no-official'
          ? `${r.saved} kampe gemt – ${r.check.issues[0]}${r.table?.error ? ` (${r.table.error})` : ''}`
          : `${r.check?.games.length ?? 0} kampe gemt – stemmer ikke med slutstillingen${r.table?.refetches ? ` (hentet igen ${r.table.refetches} gang${r.table.refetches > 1 ? 'e' : ''})` : ''}`
    return { key: `${r.division.id}|${r.year}`, name: `${r.division.name} ${r.season}`, level, text, issues: level === 'error' ? (r.check?.issues.slice(0, 12) ?? []) : [] }
  })
  const seasonsOk = seasons.filter((r) => r.level === 'ok').length
  return (
    <div className="page">
      <div className="clubs admin dash">
        <AdminNav current="/admin/kvalitet" />
        <div className="dash-head">
          <h1 className="feed__title">Datakvalitet</h1>
          <p className="muted small">
            Kontrol af de data, siden viser · {formatFull(now)} kl. {formatTime(now)} · detaljer om hentningen: <Link href="/admin/data">Data &amp; API</Link>
          </p>
        </div>
        <div className="dash-tiles">
          <Tile label="Ligaer i orden" value={`${count('ok')} af ${leagues.length}`} sub="alle tjek bestået" level="ok" />
          <Tile label="Ligaer at tjekke" value={String(count('warn'))} sub="advarsler, siden virker" level={count('warn') ? 'warn' : 'ok'} />
          <Tile label="Ligaer med fejl" value={String(count('error'))} sub={count('error') ? leagues.filter((l) => l.level === 'error').map((l) => l.name).join(', ') : 'ingen'} level={count('error') ? 'error' : 'ok'} />
          <Tile label="Kilder i orden" value={`${srcCount('ok')} af ${sources.length}`} sub={`${srcCount('warn')} at tjekke · ${srcCount('error')} med fejl`} level={worst(sources.map((x) => x.level))} />
          <Tile label="Tidligere sæsoner" value={`${seasonsOk} af ${seasons.length}`} sub="stemmer med slutstillingen og vises" level={seasons.some((x) => x.level === 'error') ? 'warn' : 'ok'} />
          <Tile label="Samlet" value={WORD[worst([...leagues.map((l) => l.level), ...sources.map((x) => x.level)])]} sub="det værste tjek lige nu" level={worst([...leagues.map((l) => l.level), ...sources.map((x) => x.level)])} />
        </div>

        <h2 className="dash-section">Ligaer</h2>
        <DashFlow>
          {leagues.map((l) => (
            <section key={l.id} className="panel dash-card">
              <h2 className="panel__title quality__name">
                <span className={`quality__badge quality__badge--${l.level}`}>{WORD[l.level]}</span> {l.name}
              </h2>
              <p className="muted small">
                {l.matches} kampe, {l.finished} spillet · kilder:{' '}
                {Object.entries(l.sources)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')}
              </p>
              <Checks checks={l.checks} />
            </section>
          ))}
        </DashFlow>

        <h2 className="dash-section">Kilder</h2>
        <DashFlow>
          {[...sources]
            .sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level))
            .map((s) => (
              <section key={s.name} className="panel dash-card">
                <h2 className="panel__title quality__name">
                  <span className={`quality__badge quality__badge--${s.level}`}>{WORD[s.level]}</span> {s.name}
                </h2>
                <Checks checks={s.checks} />
              </section>
            ))}
        </DashFlow>

        <h2 className="dash-section">Tidligere sæsoner</h2>
        <section className="panel dash-card">
          <p className="muted small">
            Hver sæson hentes fra API-Sports og tjekkes hold for hold mod den officielle slutstilling (kampe, sejre/uafgjorte/nederlag og målscore; ishockey og
            basketball kun antal kampe). Kun sæsoner i orden får en side. Stemmer en sæson ikke, hentes den igen (op til 3 gange, med 3 dages mellemrum).
          </p>
          {!seasons.length ? (
            <p className="muted small">Ingen sæsoner hentet endnu.</p>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Sæson</th>
                  <th>Status</th>
                  <th>Tjek</th>
                </tr>
              </thead>
              <tbody>
                {[...seasons]
                  .sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level))
                  .map((r) => (
                    <tr key={r.key}>
                      <td>{r.name}</td>
                      <td>
                        <span className={`quality__badge quality__badge--${r.level}`}>{WORD[r.level]}</span>
                      </td>
                      <td>
                        {r.text}
                        {r.issues.length > 0 && (
                          <ul className="quality__items">
                            {r.issues.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
