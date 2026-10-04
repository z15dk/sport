'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export interface LeagueOption {
  id: string
  name: string
  sport: string
}

/** How many leagues one template can be made from */
const MAX = 3

/**
 * Picks the leagues a template is made from: up to three, one select each, a
 * new one appearing when the last is chosen. The choice lives in the page's
 * address (?liga-<section>=<id>,<id>, or ?liga=… for every section), so a link
 * to the page shows the same cards; nothing is saved.
 */
export function LeaguePicker({ param, value, options, auto, label }: { param: string; value?: string; options: LeagueOption[]; auto: string; label?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const sports = [...new Set(options.map((o) => o.sport))]
  const chosen = (value ?? '').split(',').filter(Boolean)
  const set = (ids: string[]) => {
    const url = new URL(window.location.href)
    const list = [...new Set(ids.filter(Boolean))].slice(0, MAX)
    if (list.length) url.searchParams.set(param, list.join(','))
    else url.searchParams.delete(param)
    start(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }))
  }
  // The chosen leagues, and one more select while there is room
  const slots = chosen.length < MAX ? [...chosen, ''] : chosen
  return (
    <span className="social-league-pick" style={pending ? { opacity: 0.6 } : undefined}>
      {label && <span>{label}</span>}
      {slots.map((id, i) => (
        <select
          key={`${i}-${id}`}
          value={id}
          onChange={(e) => set(e.target.value ? chosen.map((c, j) => (j === i ? e.target.value : c)).concat(i === chosen.length ? [e.target.value] : []) : chosen.filter((_, j) => j !== i))}
          aria-label={`${label ?? 'Liga'} ${i + 1}`}
        >
          <option value="">{i === 0 ? auto : i < chosen.length ? '– fjern –' : '+ tilføj liga'}</option>
          {sports.map((sport) => (
            <optgroup key={sport} label={sport}>
              {options
                .filter((o) => o.sport === sport && (o.id === id || !chosen.includes(o.id)))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      ))}
    </span>
  )
}
