'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChannelDef, ChannelRule } from '../../data/channels'

const SPORT_LABEL: Record<string, string> = {
  soccer: 'Fodbold',
  basketball: 'Basketball',
  ice_hockey: 'Ishockey',
  handball: 'Håndbold',
  volleyball: 'Volleyball',
  american_football: 'Am. fodbold',
}
const COUNTRIES = ['Denmark', 'Germany', 'England', 'Sweden', 'Norway', 'Spain', 'Italy', 'France', 'USA', 'Europe', 'World']
const COUNTRY_LABEL: Record<string, string> = {
  Denmark: 'Danmark',
  Germany: 'Tyskland',
  England: 'England',
  Sweden: 'Sverige',
  Norway: 'Norge',
  Spain: 'Spanien',
  Italy: 'Italien',
  France: 'Frankrig',
  USA: 'USA',
  Europe: 'Europa',
  World: 'Verden',
}

/** Sends one change to the server and reloads the page's data */
function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const run = async (body: object) => {
    setBusy(true)
    setError(undefined)
    try {
      const res = await fetch('/api/admin/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Noget gik galt')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Kunne ikke nå serveren')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { run, busy, error }
}

const Err = ({ text }: { text?: string }) =>
  text ? (
    <span className="logo-editor__error" role="alert">
      {text}
    </span>
  ) : null

/** Name and link of one channel, with delete */
export function ChannelFields({ channel, fromTv }: { channel: ChannelDef; fromTv: boolean }) {
  const { run, busy, error } = useAction()
  const [name, setName] = useState(channel.name)
  const [url, setUrl] = useState(channel.url ?? '')
  const [saved, setSaved] = useState(false)
  return (
    <form
      className="link-editor"
      onSubmit={async (e) => {
        e.preventDefault()
        setSaved(false)
        if (await run({ action: 'updateChannel', id: channel.id, name, url })) setSaved(true)
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Kanalens navn" disabled={busy || fromTv} maxLength={60} />
      <input type="url" placeholder="https://… (link på logoet)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link på logoet" disabled={busy || fromTv} />
      {!fromTv && (
        <>
          <button className="pill is-active" type="submit" disabled={busy}>
            Gem
          </button>
          <button
            className="text-btn"
            type="button"
            disabled={busy}
            onClick={() => confirm(`Slet ${channel.name} og dens regler?`) && void run({ action: 'deleteChannel', id: channel.id })}
          >
            Slet
          </button>
        </>
      )}
      {fromTv && <em className="name-editor__original">Fra TV-programmet</em>}
      {saved && <span className="link-editor__ok">Gemt</span>}
      <Err text={error} />
    </form>
  )
}

export function AddChannel() {
  const { run, busy, error } = useAction()
  const [name, setName] = useState('')
  return (
    <form
      className="link-editor"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run({ action: 'addChannel', name })) setName('')
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ny kanal, fx TV 2 Sport" aria-label="Ny kanal" disabled={busy} maxLength={60} />
      <button className="pill is-active" type="submit" disabled={busy || !name.trim()}>
        Tilføj kanal
      </button>
      <Err text={error} />
    </form>
  )
}

export function RuleList({ rules, channels, leagues }: { rules: ChannelRule[]; channels: ChannelDef[]; leagues: string[] }) {
  const { run, busy, error } = useAction()
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '')
  const [sport, setSport] = useState('')
  const [country, setCountry] = useState('')
  const [league, setLeague] = useState('')
  const nameOf = (id: string) => channels.find((c) => c.id === id)?.name ?? id
  return (
    <>
      <ul className="admin-list">
        {rules.map((r) => (
          <li key={r.id} className="admin-list__row admin-rule">
            <span className="admin-list__name">
              <strong>
                {[r.sport ? SPORT_LABEL[r.sport] : 'Alle sportsgrene', r.country ? (COUNTRY_LABEL[r.country] ?? r.country) : 'alle lande', r.league ?? 'alle ligaer'].join(' · ')}
              </strong>
              <em>→ {nameOf(r.channelId)}</em>
            </span>
            <button className="text-btn" disabled={busy} onClick={() => void run({ action: 'deleteRule', id: r.id })}>
              Fjern
            </button>
          </li>
        ))}
        {rules.length === 0 && <li className="muted pad">Ingen regler endnu.</li>}
      </ul>
      <form
        className="admin-filter"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await run({ action: 'addRule', channelId, sport, country, league })) setLeague('')
        }}
      >
        <select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Sport">
          <option value="">Alle sportsgrene</option>
          {Object.entries(SPORT_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Land">
          <option value="">Alle lande</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {COUNTRY_LABEL[c]}
            </option>
          ))}
        </select>
        <input list="known-leagues" value={league} onChange={(e) => setLeague(e.target.value)} placeholder="Liga (valgfri), fx Superliga" aria-label="Liga" />
        <datalist id="known-leagues">
          {leagues.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <span aria-hidden>→</span>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="Kanal">
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="pill is-active" type="submit" disabled={busy || !channelId}>
          Tilføj regel
        </button>
        <Err text={error} />
      </form>
    </>
  )
}

/** Channel for one match: follows the rules, or an exception (a channel or none) */
export function MatchChannelSelect({ matchId, override, channels }: { matchId: string; override?: string; channels: ChannelDef[] }) {
  const { run, busy, error } = useAction()
  return (
    <span className="logo-editor">
      <select
        value={override ?? ''}
        disabled={busy}
        aria-label="Kanal for kampen"
        onChange={(e) => void run({ action: 'setOverride', matchId, channelId: e.target.value || undefined })}
      >
        <option value="">Automatisk</option>
        <option value="none">Ingen kanal</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Err text={error} />
    </span>
  )
}
