'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'

// /admin/data, "Vores ligaer": the number of unknown teams opens the league's
// list, and each unknown name can be given to one of the league's clubs
// (/api/admin/club-alias). Names given before can be taken away again.

export interface LeagueRow {
  id: string
  name: string
  events: number
  finished: number
  source?: string
  unknown: string[]
  clubs: { id: string; name: string; group: string }[]
  aliases: { club: string; clubName: string; name: string }[]
}

const num = (n: number) => n.toLocaleString('da-DK')

function UnknownName({ name, clubs, onSaved }: { name: string; clubs: LeagueRow['clubs']; onSaved: () => void }) {
  const [club, setClub] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function save() {
    if (!club) return
    setBusy(true)
    setError(undefined)
    const res = await fetch('/api/admin/club-alias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ club, name }) }).catch(() => undefined)
    const r = (await res?.json().catch(() => ({}))) as { error?: string } | undefined
    setBusy(false)
    if (!res?.ok) return setError(r?.error ?? 'Det gik ikke')
    onSaved()
  }
  return (
    <li>
      <b>{name}</b> er{' '}
      <select value={club} onChange={(e) => setClub(e.target.value)} disabled={busy} aria-label={`Klub for ${name}`}>
        <option value="">– vælg klub –</option>
        {[...new Set(clubs.map((c) => c.group))].map((g) => (
          <optgroup key={g} label={g}>
            {clubs
              .filter((c) => c.group === g)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>{' '}
      <button type="button" className="pill is-active" disabled={!club || busy} onClick={save}>
        {busy ? 'Gemmer …' : 'Gem'}
      </button>
      {error && <span className="is-bad"> {error}</span>}
    </li>
  )
}

export function LeagueTeamsAdmin({ rows }: { rows: LeagueRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState<string>()
  const [saved, setSaved] = useState<string[]>([])
  const done = (name: string) => {
    setSaved((s) => [...s, name])
    router.refresh()
  }
  async function remove(club: string, name: string) {
    await fetch('/api/admin/club-alias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ club, name, remove: true }) }).catch(() => undefined)
    router.refresh()
  }
  return (
    <table className="dash-table">
      <thead>
        <tr>
          <th>Liga</th>
          <th>Kampe</th>
          <th>Spillet</th>
          <th>Kilde</th>
          <th>Ukendte hold</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => {
          const unknown = l.unknown.filter((n) => !saved.includes(n))
          const isOpen = open === l.id
          return (
            <Fragment key={l.id}>
              <tr>
                <td>{l.name}</td>
                <td className={l.events ? undefined : 'is-bad'}>{l.events ? num(l.events) : 'ingen'}</td>
                <td>{num(l.finished)}</td>
                <td className="muted">{l.source ?? '–'}</td>
                <td>
                  {unknown.length || l.aliases.length ? (
                    <button type="button" className={`dash-link${unknown.length ? ' is-warn' : ''}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : l.id)}>
                      {unknown.length ? `${unknown.length} ret` : 'navne'} {isOpen ? '▴' : '▾'}
                    </button>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
              </tr>
              {isOpen && (
                <tr className="dash-expand">
                  <td colSpan={5}>
                    {unknown.length > 0 ? (
                      <>
                        <p className="muted small">
                          Navne fra vores kilder, som ingen af ligaens klubber hedder. Vælg den klub, navnet hører til – så får kampene klubbens side, logo og farver.
                          Er det en ny klub (fx oprykker), skal den oprettes i klubregistret.
                        </p>
                        <ul className="dash-unknown">
                          {unknown.map((n) => (
                            <UnknownName key={n} name={n} clubs={l.clubs} onSaved={() => done(n)} />
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="muted small">Alle hold er fundet.</p>
                    )}
                    {l.aliases.length > 0 && (
                      <p className="small">
                        Navne sat her:{' '}
                        {l.aliases.map((a) => (
                          <span key={`${a.club}|${a.name}`} className="dash-alias">
                            {a.name} → {a.clubName}{' '}
                            <button type="button" className="text-btn" onClick={() => remove(a.club, a.name)} aria-label={`Fjern ${a.name}`}>
                              ✕
                            </button>
                          </span>
                        ))}
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
