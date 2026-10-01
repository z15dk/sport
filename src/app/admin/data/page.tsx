import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import { ApiStatusCheck } from '../../../components/admin/ApiStatusCheck'
import Link from 'next/link'
import { realDataFile, realDataStatus, tsdbDanishLeagues } from '../../../lib/realdata'
import { historyStatus } from '../../../lib/history'
import { archiveStatus, playerGamesStatus } from '../../../lib/archive'
import { apiSportsFiles, apiSportsStatus } from '../../../lib/apisports'
import { memoryStatus } from '../../../lib/extrasDb'
import { slowStatus } from '../../../lib/slow'
import { dbuPoolStatus } from '../../../lib/dbuLineups'
import { cpuStalls } from '../../../lib/cpuProfile'
import { role } from '../../../lib/role'
import { workerStatus } from '../../../lib/workerStatus'
import { archiveFile } from '../../../lib/archive'
import { DIVISIONS, allClubs, sportOf } from '../../../data/leagues'
import { clubAliasList } from '../../../lib/clubAliases'
import { LeagueTeamsAdmin, type LeagueRow } from '../../../components/admin/LeagueTeamsAdmin'
import { Bars } from '../../../components/admin/DashBars'
import { normalize, SEARCH_NAMES } from '../../../data/aliases'

/** What the kinds of API-Sports requests are (/admin/data's usage) */
const USAGE_NAMES: Record<string, string> = {
  '/fixtures?date': 'dagens kampe (live)',
  '/games?date': 'dagens kampe (live)',
  '/fixtures?league': 'hele sæsoner',
  '/games?league': 'hele sæsoner',
  '/fixtures?ids': 'målscorere/spillere',
  '/fixtures/events?fixture': 'målscorere (kampside)',
  '/fixtures/statistics?fixture': 'kampstatistik',
  '/fixtures/lineups?fixture': 'opstillinger',
  '/fixtures/headtohead?h2h': 'indbyrdes',
  '/fixtures?team': 'holdform',
  '/standings?league': 'tabeller',
  '/players/topscorers?league': 'topscorere',
  '/players/topassists?league': 'assists',
  '/players?id': 'spillersider',
  '/transfers?player': 'spillersider',
  '/trophies?player': 'spillersider',
  '/teams/statistics?league': 'holdstatistik',
  '/injuries?league': 'skader',
}

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Data & API · Admin', robots: { index: false, follow: false } }

// Every name we know (with the names set in the admin pages), as whole words: a team is "known" when one of them is a word run of its name
function knownNames(aliases: Record<string, string[]>) {
  const set = new Set<string>()
  for (const { club } of allClubs()) for (const n of [club.name, club.apiName, SEARCH_NAMES[club.id], ...(aliases[club.id] ?? [])]) if (n) set.add(normalize(n))
  return set
}
const isKnownIn = (known: Set<string>, team: string) => {
  const words = normalize(team).split(' ')
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j <= words.length; j++) if (known.has(words.slice(i, j).join(' '))) return true
  return false
}

const clock = (at: number | string | null | undefined) =>
  at ? new Date(at).toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }) : '–'
const ago = (at: string | null | undefined) => {
  if (!at) return 'aldrig'
  const min = Math.round((Date.now() - Date.parse(at)) / 60_000)
  return min < 1 ? 'lige nu' : min < 60 ? `for ${min} min. siden` : min < 48 * 60 ? `for ${Math.round(min / 60)} t. siden` : `for ${Math.round(min / 1440)} dage siden`
}
const num = (n: number) => n.toLocaleString('da-DK')
type Level = 'ok' | 'warn' | 'bad'
const MARK: Record<Level, string> = { ok: '✓', warn: '!', bad: '✕' }

function Tile({ label, value, sub, level }: { label: string; value: string; sub?: string; level: Level }) {
  return (
    <div className={`dash-tile is-${level}`}>
      <span className="dash-tile__label">
        <b aria-label={level === 'ok' ? 'I orden' : level === 'warn' ? 'Hold øje' : 'Problem'}>{MARK[level]}</b> {label}
      </span>
      <strong className="dash-tile__value">{value}</strong>
      {sub && <span className="dash-tile__sub">{sub}</span>}
    </div>
  )
}

export default async function DataStatusPage() {
  if (!(await isAdmin())) redirect('/admin')
  // A split server (src/lib/role.ts): the jobs' own state comes from the background process's status file
  const worker = role() === 'web' ? workerStatus() : undefined
  // DBU's pools for 2. and 3. division: one with no matches left must be swapped for the next (winter break and new season)
  const poolStatus = dbuPoolStatus()
  const pools = poolStatus.filter((p) => p.read && p.upcoming === 0 && !poolStatus.some((o) => o.league === p.league && o.upcoming > 0))
  // What blocked the server (sampled, src/lib/cpuProfile.ts): this process's and the background process's, newest first
  const stalls = [...cpuStalls().map((x) => ({ ...x, where: worker ? 'Siden' : '' })), ...(worker?.stalls ?? []).map((x) => ({ ...x, where: 'Baggrund' }))]
    .sort((a, b) => b.at - a.at)
    .slice(0, 10)
  const s = { ...realDataStatus(), ...(worker?.realData ?? {}) }
  const h = historyStatus()
  const a = archiveStatus()
  const pg = playerGamesStatus()
  const apis = apiSportsStatus()
  const danish = tsdbDanishLeagues()
  const slow = slowStatus()
  const mem = memoryStatus({ ...apiSportsFiles(), 'scoreline-arkiv.db': archiveFile(), 'real-data.json': realDataFile() })
  const football = apis.find((x) => x.api === 'football')
  const keyed = apis.filter((x) => x.hasKey)
  const lastHour = slow.recent.length ? Math.max(...slow.recent.map((m) => m.max)) : 0
  const fbLeft = football?.remaining ?? 0
  const fbShare = football?.limit ? fbLeft / football.limit : 1
  const fbUsed = football?.usage ? football.usage.hours.reduce((n, x) => n + x, 0) : 0
  const dataAge = s.fetchedAt ? (Date.now() - Date.parse(s.fetchedAt)) / 60_000 : Infinity
  const aliases = clubAliasList().aliases
  const known = knownNames(aliases)
  const leagues = s.leagues.map((l) => ({ ...l, unknown: l.teams.filter((t) => !isKnownIn(known, t)) }))
  const leagueRows: LeagueRow[] = leagues.map((l) => {
    // The league's own clubs first, then those of our other leagues in the same country and sport (promoted and relegated clubs)
    const div = DIVISIONS.find((d) => d.id === l.id)
    const near = div ? DIVISIONS.filter((d) => d.countryCode === div.countryCode && sportOf(d) === sportOf(div)).sort((a, b) => Number(b === div) - Number(a === div)) : []
    const seen = new Set<string>()
    const clubs = near.flatMap((d) =>
      [...d.clubs]
        .sort((a, b) => a.name.localeCompare(b.name, 'da'))
        .filter((c) => !seen.has(c.id) && seen.add(c.id))
        .map((c) => ({ id: c.id, name: c.name, group: d.name })),
    )
    return {
      id: l.id,
      name: l.name,
      events: l.events,
      finished: l.finished,
      source: l.source,
      unknown: l.unknown,
      clubs,
      aliases: clubs.flatMap((c) => (aliases[c.id] ?? []).map((name) => ({ club: c.id, clubName: c.name, name }))),
    }
  })
  // The UTC hours of today's calls, shown in Danish time
  const hourLabel = (hh: number) => new Date(Date.UTC(2026, 0, 1, hh)).toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit' })

  return (
    <div className="page">
      <div className="clubs admin dash">
        <AdminNav current="/admin/data" />
        <div className="dash-head">
          <h1 className="feed__title">Data &amp; API</h1>
          <p className="muted small">
            Opdateret {clock(Date.now())} · <Link href="/admin/kvalitet">Datakvalitet</Link> · <Link href="/admin/logoer">Logo-job</Link>
          </p>
        </div>

        {pools.length > 0 && (
          <p className="banner">
            DBU-pulje{pools.length > 1 ? 'r' : ''} uden flere kampe: {pools.map((p) => `${p.pool} (${p.league})`).join(', ')}. Find de nye puljer (op- og nedrykningsspil eller ny sæson) på dbu.dk og tilføj dem i <code>DBU_LINEUP_POOLS</code> og <code>PHOTOS_DBU_POOLS</code> i /opt/scoreline/env – behold efterårets puljer i samme sæson, så topscorerne tæller hele sæsonen.
          </p>
        )}
        <div className="dash-tiles">
          <Tile
            label="Svartid"
            value={slow.minutes ? `${(lastHour / 1000).toLocaleString('da-DK', { maximumFractionDigits: 1 })} sek.` : 'måles'}
            sub={slow.minutes ? `længste ventetid, sidste 15 min. · ${slow.stalls} min. over 1 sek. (3 t.)` : 'fra serverstart'}
            level={lastHour >= 3000 ? 'bad' : lastHour >= 1000 ? 'warn' : 'ok'}
          />
          <Tile
            label="Hukommelse"
            value={`${num(mem.rss + (worker?.rss ?? 0))} MB`}
            sub={worker ? `siden ${num(mem.rss)} MB · baggrund ${num(worker.rss)} MB` : `JavaScript ${num(mem.heap)} MB`}
            level={mem.rss + (worker?.rss ?? 0) > 1800 ? 'bad' : mem.rss + (worker?.rss ?? 0) > 1100 ? 'warn' : 'ok'}
          />
          <Tile
            label="Fodbold-kald tilbage"
            value={football?.hasKey ? `${num(fbLeft)}${football.limit ? ` / ${num(football.limit)}` : ''}` : 'ingen nøgle'}
            sub={football?.hasKey ? `brugt i dag ${num(fbUsed)} · opslag ${num(football.extrasSpent)}/${num(football.extrasMax)}` : undefined}
            level={!football?.hasKey || football.lastError ? 'bad' : fbShare < 0.15 ? 'bad' : fbShare < 0.35 ? 'warn' : 'ok'}
          />
          <Tile
            label="Kampdata"
            value={ago(s.fetchedAt)}
            sub={s.lastError ? `Fejl: ${s.lastError}` : s.running ? 'henter nu' : `fuld hentning ${ago(s.lastFull)}`}
            level={s.lastError ? 'bad' : dataAge > 60 ? 'warn' : 'ok'}
          />
          <Tile label="Statistikbank" value={`${num(a.total)} kampe`} sub={`${num(pg.rows)} spillertal · gemt ${clock(a.lastRun)}`} level={a.lastError ? 'bad' : 'ok'} />
          <Tile label="Historik" value={h.error ? 'fejl' : `${num(h.matches)} kampe`} sub={h.error ?? `${h.clubs} klubber · ${h.from ?? ''}–${h.to ?? ''}`} level={h.error ? 'warn' : 'ok'} />
        </div>

        <div className="dash-grid">
          <div className="dash-col">
          <section className="panel dash-card">
            <h2 className="panel__title">Serverens svartid</h2>
            {slow.recent.length > 0 ? (
              <>
                <Bars values={slow.recent.map((m) => m.max)} labels={slow.recent.map((m) => clock(m.at))} unit="ms længste ventetid" limit={1000} />
                <p className="dash-axis muted small">
                  <span>{clock(slow.recent[0].at)}</span>
                  <span>Længste ventetid pr. minut · streg = 1 sek.</span>
                  <span>{clock(slow.recent.at(-1)!.at)}</span>
                </p>
              </>
            ) : (
              <p className="muted small">Måles fra serverstart – kom tilbage om et par minutter.</p>
            )}
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Opgave over 0,2 sek.</th>
                  <th>Længste</th>
                  <th>Gange</th>
                  <th>Senest</th>
                </tr>
              </thead>
              <tbody>
                {slow.tasks.slice(0, 8).map((x) => (
                  <tr key={x.label}>
                    <td>{x.label}</td>
                    <td className={x.max >= 1000 ? 'is-bad' : undefined}>{num(x.max)} ms</td>
                    <td>{x.count}</td>
                    <td>{clock(x.last)}</td>
                  </tr>
                ))}
                {!slow.tasks.length && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Ingen endnu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {role() === 'web' && (
            <section className="panel dash-card">
              <h2 className="panel__title">Baggrundsprocessen</h2>
              {!worker ? (
                <p className="is-bad small">Har ikke skrevet endnu – den starter (eller kan ikke starte).</p>
              ) : (
                <>
                  <p className={`small${worker.stale ? ' is-bad' : ''}`}>
                    {worker.stale ? 'Svarer ikke: sidst hørt fra ' : 'Kører · sidst hørt fra '}
                    {clock(worker.at)} · startet {clock(worker.startedAt)} · {num(worker.rss)} MB · længste ventetid sidste 15 min.{' '}
                    {num(worker.slow.recent.length ? Math.max(...worker.slow.recent.map((m) => m.max)) : 0)} ms (det mærker siden ikke)
                  </p>
                  <table className="dash-table">
                    <tbody>
                      {worker.slow.tasks.slice(0, 12).map((x) => (
                        <tr key={x.label}>
                          <td>{x.label}</td>
                          <td>{num(x.max)} ms</td>
                          <td>{x.count}</td>
                          <td>{clock(x.last)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          )}
          <section className="panel dash-card">
            <h2 className="panel__title">Filer og kilder</h2>
            <table className="dash-table">
              <tbody>
                {mem.files
                  .filter((f) => f.mb !== undefined)
                  .map((f) => (
                    <tr key={f.name}>
                      <td>{f.name}</td>
                      <td>{num(f.mb!)} MB</td>
                    </tr>
                  ))}
                <tr>
                  <td>TheSportsDB</td>
                  <td>
                    {s.requests} forespørgsler · løbende {ago(s.lastHot)}
                  </td>
                </tr>
                <tr>
                  <td>Kampdatabase</td>
                  <td>{h.error ? <span className="is-bad">{h.error}</span> : `${h.tournaments.length} turneringer · ${h.unmatched.length} hold uden klub`}</td>
                </tr>
                <tr>
                  <td>Denne sæson (database)</td>
                  <td>{h.season.length ? h.season.map((x) => `${x.id} ${x.events}`).join(', ') : 'ingen danske rækker'}</td>
                </tr>
              </tbody>
            </table>
          </section>
          </div>
          <section className="panel dash-card">
            <h2 className="panel__title">API-Sports</h2>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Sport</th>
                  <th>Kampe</th>
                  <th>Kald tilbage</th>
                  <th>Brugt i dag</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {apis.map((x) => (
                  <tr key={x.api}>
                    <td>{x.label}</td>
                    <td>{x.hasKey ? num(x.games) : '–'}</td>
                    <td>{x.hasKey ? `${x.remaining ?? '?'}${x.limit ? `/${num(x.limit)}` : ''}` : '–'}</td>
                    <td>{x.usage ? num(x.usage.hours.reduce((n, v) => n + v, 0)) : '–'}</td>
                    <td className={x.lastError || x.pausedUntil ? 'is-bad' : undefined}>
                      {!x.hasKey ? 'ingen nøgle' : x.pausedUntil ? `pause til ${clock(x.pausedUntil)}` : x.lastError ? `fejl: ${x.lastError}` : `hentet ${clock(x.todayFetchedAt)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {football?.usage && (
              <>
                <h3 className="dash-sub">Fodbold i dag pr. time (dansk tid)</h3>
                <Bars values={football.usage.hours} labels={football.usage.hours.map((_, i) => `kl. ${hourLabel(i)}`)} unit="kald" />
                <p className="dash-axis muted small">
                  <span>{hourLabel(0)}</span>
                  <span>baggrund og opslag stopper under {num(football.reserveNow)} tilbage</span>
                  <span>{hourLabel(23)}</span>
                </p>
                <ul className="dash-chips">
                  {Object.entries(
                    // Several kinds of request share a name (a player's page asks for four things): one chip each
                    Object.entries(football.usage.kinds).reduce<Record<string, number>>((m, [k, n]) => ((m[USAGE_NAMES[k] ?? k] = (m[USAGE_NAMES[k] ?? k] ?? 0) + n), m), {}),
                  )
                    .sort((p, q) => q[1] - p[1])
                    .slice(0, 8)
                    .map(([k, n]) => (
                      <li key={k}>
                        {k} <b>{num(n)}</b>
                      </li>
                    ))}
                </ul>
              </>
            )}
            <ApiStatusCheck />
          </section>

          <section className="panel dash-card">
            <h2 className="panel__title">Vores ligaer</h2>
            <LeagueTeamsAdmin rows={leagueRows} />
          </section>

        </div>

        <section className="panel dash-card dash-wide">
          <h2 className="panel__title">Hvad blokerede serveren</h2>
          <p className="muted small">Hver periode over 0,5 sek. uden pause, målt løbende: vores funktioner (fil og linje) efter tid, og hvor tiden selv gik.</p>
          {stalls.length ? (
            <table className="dash-table dash-stalls">
              <thead>
                <tr>
                  <th>Tid</th>
                  <th>Varighed</th>
                  <th>Vores funktioner (tid på stakken)</th>
                  <th>Hvor tiden selv gik</th>
                </tr>
              </thead>
              <tbody>
                {stalls.map((x) => (
                  <tr key={`${x.where}${x.at}`}>
                    <td>
                      {clock(x.at)}
                      {x.where && <div className="muted small">{x.where}</div>}
                    </td>
                    <td className={x.ms >= 1000 ? 'is-bad' : undefined}>{num(x.ms)} ms</td>
                    <td className="small">
                      {x.top.slice(0, 6).map((f) => (
                        <div key={f.fn}>
                          <code>{f.fn}</code> {num(f.ms)} ms
                        </div>
                      ))}
                      {!x.top.length && <span className="muted">Ingen af vores egne</span>}
                    </td>
                    <td className="small">
                      {x.self.map((f) => (
                        <div key={f.fn}>
                          <code>{f.fn}</code> {num(f.ms)} ms
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small">Ingen siden start (måles hvert minut).</p>
          )}
        </section>
        <div className="dash-details">
          <details className="panel">
            <summary>Statistikbanken pr. turnering ({a.byDivision.length})</summary>
            <p className="small">{a.byDivision.map((r) => `${r.division} ${num(r.matches)} (${num(r.incidents)} hændelser)`).join(' · ') || 'Ingen endnu.'}</p>
            <p className="muted small">
              Fil: <code>{a.file}</code>. Hver færdigspillet kamp fra alle kilder gemmes hvert 5. minut med resultat, pause, tilskuere, mål og kort. Spillertal: {num(pg.rows)}{' '}
              spiller-kampe fra {num(pg.matches)} kampe (20 kampe pr. kald ned til reserven).
            </p>
          </details>
          <details className="panel">
            <summary>Hold pr. liga og ukendte hold</summary>
            {leagues.map((l) => (
              <p key={l.id} className="small">
                <b>{l.name}</b>
                {l.lookup ? <span className="muted"> ({l.lookup})</span> : null}: {l.teams.join(', ') || 'ingen'}
                {l.unknown.length > 0 && <span className="unverified"> · Ukendte (tilføj i src/data/leagues.ts eller som apiName): {l.unknown.join(', ')}</span>}
              </p>
            ))}
          </details>
          <details className="panel">
            <summary>API-Sports: turneringer og historik pr. sport</summary>
            {keyed.map((x) => (
              <p key={x.api} className="small">
                <b>{x.label}</b> ({x.leagues.length} turneringer): {x.leagues.join(', ')}
                {x.history.length > 0 && (
                  <span className="muted"> · Historik: {x.history.map((hh) => `${hh.key.replace('|', ' ')} (${hh.matches ? `${hh.matches} kampe` : 'ikke adgang'})`).join(', ')}</span>
                )}
              </p>
            ))}
            <p className="muted small">
              Nøgler i serverens env: <code>API_SPORTS_KEY</code> (alle) eller <code>API_SPORTS_KEY_FOOTBALL</code>, <code>_BASKETBALL</code>, <code>_NBA</code>,{' '}
              <code>_HOCKEY</code>, <code>_HANDBALL</code>, <code>_VOLLEYBALL</code>, <code>_AMERICAN_FOOTBALL</code>. Døgnet nulstilles kl. 00 UTC.
            </p>
          </details>
          <details className="panel">
            <summary>Kampdatabasen (football.db): turneringer og hold uden klub</summary>
            <p className="small">
              {num(h.matches)} kampe fra {h.from} til {h.to}. Turneringer: {h.tournaments.map(([tt, n]) => `${tt} (${n})`).join(', ')}
            </p>
            {h.unmatched.length > 0 && <p className="muted small">Hold uden klub hos os ({h.unmatched.length}): {h.unmatched.join(', ')}</p>}
            <p className="muted small">
              Fil: <code>{h.file}</code>
            </p>
          </details>
          <details className="panel">
            <summary>Danske ligaer hos TheSportsDB ({danish.leagues.length})</summary>
            <ul className="small">
              {danish.leagues.map((l) => (
                <li key={l.id}>
                  <strong>{l.name}</strong> ({l.sport}, id {l.id}){l.alternate ? ` · også kaldt ${l.alternate}` : ''} · {l.ours ? `bruges til ${l.ours}` : <span className="muted">bruges ikke</span>}
                </li>
              ))}
            </ul>
            <p className="muted small">
              Fil: <code>{s.file}</code>
            </p>
          </details>
        </div>
      </div>
    </div>
  )
}
