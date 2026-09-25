import type { Metadata } from 'next'
import { realDataStatus } from '../../../lib/realdata'
import { historyStatus } from '../../../lib/history'
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
  return (
    <div className="page">
      <div className="clubs prose">
        <h1 className="feed__title">Data-status</h1>
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
      </div>
    </div>
  )
}
