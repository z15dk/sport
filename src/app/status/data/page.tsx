import type { Metadata } from 'next'
import { realDataStatus } from '../../../lib/realdata'
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
                  ? `${l.events} kampe, heraf ${l.finished} spillet. Vises med rigtige resultater.`
                  : 'Ingen kampe hentet endnu – ligaen vises med fiktive resultater indtil da.'}
              </p>
              {l.teams.length > 0 && <p>Hold: {l.teams.join(', ')}</p>}
              {unknown.length > 0 && (
                <p className="unverified">
                  Ikke fundet i klubregistret (får ingen klubside): {unknown.join(', ')}. Tilføj dem i src/data/leagues.ts eller
                  som apiName.
                </p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
