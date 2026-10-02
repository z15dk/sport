'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export interface LeagueOption {
  id: string
  name: string
  sport: string
}

/**
 * Picks the league a template is made from. The choice lives in the page's
 * address (?liga-<section>=<id>, or ?liga=<id> for every section), so a link
 * to the page shows the same cards; nothing is saved.
 */
export function LeaguePicker({ param, value, options, auto, label }: { param: string; value?: string; options: LeagueOption[]; auto: string; label?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const sports = [...new Set(options.map((o) => o.sport))]
  const change = (id: string) => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set(param, id)
    else url.searchParams.delete(param)
    start(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }))
  }
  return (
    <label className="social-league-pick" style={pending ? { opacity: 0.6 } : undefined}>
      {label && <span>{label}</span>}
      <select value={value ?? ''} onChange={(e) => change(e.target.value)} aria-label={label ?? 'Liga'}>
        <option value="">{auto}</option>
        {sports.map((sport) => (
          <optgroup key={sport} label={sport}>
            {options
              .filter((o) => o.sport === sport)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
