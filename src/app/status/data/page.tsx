import type { Metadata } from 'next'
import Link from 'next/link'
import { realDataStatus, tsdbDanishLeagues } from '../../../lib/realdata'
import { historyStatus } from '../../../lib/history'
import { archiveStatus } from '../../../lib/archive'
import { apiSportsStatus } from '../../../lib/apisports'
import { allClubs } from '../../../data/leagues'
import { normalize, SEARCH_NAMES } from '../../../data/aliases'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Data-status', robots: { index: false, follow: false } }

const known = new Set(
  allClubs().flatMap(({ club }) => [club.name, club.apiName, SEARCH_NAMES[club.id]].filter((n): n is string => !!n).map(normalize)),
)
const isKnown = (team: string) => {
  const n = normalize(team)
  return [...known].some((k) => k === n || ` ${n} `.includes(` ${k} `) || ` ${k} `.includes(` ${n} `))
}

/** Shows what the real-data job has fetched from TheSportsDB */
export default function DataStatusPage() {
  const s = realDataStatus()
  const h = historyStatus()
  const a = archiveStatus()
  const apis = apiSportsStatus()
  const danish = tsdbDanishLeagues()
  return (
    <div className="page">
      <div className="clubs prose">
        <h1 className="feed__title">Data-status</h1>
        <p>
          Er dataene rigtige? Se <Link href="/status/kvalitet">datakvalitet</Link>.
        </p>
        <section className="panel prose__section">
          <h2 className="panel__title">Rigtige data fra TheSportsDB</h2>
          <p>
            {s.running ? 'Henter lige nu' : 'Hentning er ikke i gang'} · Senest opdateret: {s.fetchedAt ?? 'endnu ikke'} ·
            Fuld hentning: {s.lastFull ?? 'ikke færdig endnu'} · Løbende opdatering: {s.lastHot ?? '–'} · Forespørgsler: {s.requests}
          </p>
          <p>
            Fil: <code>{s.file}</code>
          </p>
          {s.lastError && <p className="unverified">Seneste fejl: {s.lastError}</p>}
        </section>
        <section className="panel prose__section">
          <h2 className="panel__title">Danske ligaer hos TheSportsDB</h2>
          {danish.leagues.length === 0 ? (
            <p>Listen hentes – genindlæs om et øjeblik.</p>
          ) : (
            <>
              <p className="muted small">
                Alle danske ligaer, TheSportsDB har (hentet {danish.fetchedAt}). Om der også er kampe i dem, ses under hver af vores ligaer længere nede –
                gratisnøglen giver kun de seneste og næste kampe, en betalt nøgle hele sæsonen.
              </p>
              <ul>
                {danish.leagues.map((l) => (
                  <li key={l.id}>
                    <strong>{l.name}</strong> ({l.sport}, id {l.id}){l.alternate ? ` · også kaldt ${l.alternate}` : ''} ·{' '}
                    {l.ours ? `bruges til ${l.ours}` : <span className="muted">bruges ikke</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        {s.leagues.map((l) => {
          const unknown = l.teams.filter((t) => !isKnown(t))
          return (
            <section key={l.id} className="panel prose__section">
              <h2 className="panel__title">{l.name}</h2>
              <p>
                {l.events > 0
                  ? `${l.events} kampe, heraf ${l.finished} spillet (fra ${l.source}).`
                  : 'Ingen kampe hos TheSportsDB eller i kampdatabasen (eller ikke hentet endnu) – ligaen vises ikke på siden.'}
              </p>
              {l.lookup && <p className="muted small">TheSportsDB: {l.lookup}</p>}
              {l.teams.length > 0 && <p>Hold: {l.teams.join(', ')}</p>}
              {unknown.length > 0 && (
                <p className="unverified">
                  Ikke fundet i klubregistret (får en side uden farver og by): {unknown.join(', ')}. Tilføj dem i src/data/leagues.ts
                  eller som apiName.
                </p>
              )}
            </section>
          )
        })}
        <section className="panel prose__section">
          <h2 className="panel__title">Kampdatabase (historik)</h2>
          <p>
            Fil: <code>{h.file}</code>
          </p>
          {h.error ? (
            <p className="unverified">{h.error}</p>
          ) : (
            <>
              <p>
                {h.matches.toLocaleString('da-DK')} spillede kampe fra {h.from} til {h.to}. {h.clubs} af vores klubber er fundet i
                databasen og får rigtige indbyrdes opgør og historik.
              </p>
              <p>Turneringer: {h.tournaments.map(([t, n]) => `${t} (${n})`).join(', ')}</p>
              <p>
                Denne sæson i databasen:{' '}
                {h.season.length
                  ? h.season.map((x) => `${x.id} ${x.events} kampe (${x.finished} spillet)`).join(', ')
                  : `ingen kampe fra de danske rækker (turneringer denne sæson: ${h.seasonTournaments.join(', ') || 'ingen'})`}
              </p>
              {h.unmatched.length > 0 && (
                <p className="muted small">
                  Hold i databasen uden klub hos os ({h.unmatched.length}): {h.unmatched.join(', ')}
                </p>
              )}
            </>
          )}
        </section>
        <section className="panel prose__section">
          <h2 className="panel__title">Scorelines statistikbank</h2>
          <p>
            Fil: <code>{a.file}</code> · Senest gemt: {a.lastRun ?? 'ikke endnu'}
          </p>
          {a.lastError && <p className="unverified">Seneste fejl: {a.lastError}</p>}
          <p>
            {a.total.toLocaleString('da-DK')} færdigspillede kampe gemt
            {a.byDivision.length > 0 && `: ${a.byDivision.map((r) => `${r.division} ${r.matches} (${r.incidents} hændelser)`).join(', ')}`}.
          </p>
          <p className="muted small">Hver færdigspillet kamp fra alle kilder gemmes her hvert 5. minut, med resultat, pauseresultat, tilskuere, mål og kort.</p>
        </section>
        <section className="panel prose__section">
          <h2 className="panel__title">API-Sports</h2>
          <p className="muted small">
            Nøgler i serverens env: <code>API_SPORTS_KEY</code> (alle) eller <code>API_SPORTS_KEY_FOOTBALL</code>, <code>_BASKETBALL</code>,{' '}
            <code>_NBA</code>, <code>_HOCKEY</code>, <code>_HANDBALL</code>, <code>_VOLLEYBALL</code>, <code>_AMERICAN_FOOTBALL</code>.
          </p>
          <ul>
            {apis.map((x) => (
              <li key={x.api}>
                <strong>{x.label}</strong>:{' '}
                {!x.hasKey
                  ? 'ingen nøgle'
                  : `${x.games} kampe i ${x.leagues.length} turneringer · kald tilbage i dag: ${x.remaining ?? '?'}${x.limit ? ` af ${x.limit}` : ''} · i dag hentet ${x.todayFetchedAt ?? 'ikke endnu'}`}
                {x.lastError && <span className="unverified"> · Fejl: {x.lastError}</span>}
                {x.leagues.length > 0 && <span className="muted small"> · {x.leagues.join(', ')}</span>}
                {x.history.length > 0 && (
                  <span className="muted small">
                    {' '}
                    · Historik gemt: {x.history.map((h) => `${h.key.replace('|', ' ')} (${h.matches ? `${h.matches} kampe` : 'ikke adgang'})`).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
