const CODES: Record<string, 'DK' | 'DE' | 'SE' | 'NO' | 'ENG'> = { Danmark: 'DK', Tyskland: 'DE', Sverige: 'SE', Norge: 'NO', England: 'ENG' }

/** Small national flag for a country name ("Danmark", "Tyskland"); nothing for others */
export function Flag({ country }: { country?: string }) {
  const code = country ? CODES[country] : undefined
  if (code === 'DK') {
    return (
      <svg className="flag" viewBox="0 0 37 28" aria-hidden>
        <rect width="37" height="28" fill="#c8102e" />
        <rect x="12" width="4" height="28" fill="#fff" />
        <rect y="12" width="37" height="4" fill="#fff" />
      </svg>
    )
  }
  if (code === 'DE') {
    return (
      <svg className="flag" viewBox="0 0 5 3" aria-hidden>
        <rect width="5" height="1" fill="#000" />
        <rect y="1" width="5" height="1" fill="#dd0000" />
        <rect y="2" width="5" height="1" fill="#ffce00" />
      </svg>
    )
  }
  if (code === 'SE') {
    return (
      <svg className="flag" viewBox="0 0 16 10" aria-hidden>
        <rect width="16" height="10" fill="#006aa7" />
        <rect x="5" width="2" height="10" fill="#fecc00" />
        <rect y="4" width="16" height="2" fill="#fecc00" />
      </svg>
    )
  }
  if (code === 'NO') {
    return (
      <svg className="flag" viewBox="0 0 22 16" aria-hidden>
        <rect width="22" height="16" fill="#ba0c2f" />
        <rect x="6" width="4" height="16" fill="#fff" />
        <rect y="6" width="22" height="4" fill="#fff" />
        <rect x="7" width="2" height="16" fill="#00205b" />
        <rect y="7" width="22" height="2" fill="#00205b" />
      </svg>
    )
  }
  if (code === 'ENG') {
    return (
      <svg className="flag" viewBox="0 0 5 3" aria-hidden>
        <rect width="5" height="3" fill="#fff" />
        <rect x="2" width="1" height="3" fill="#ce1124" />
        <rect y="1" width="5" height="1" fill="#ce1124" />
      </svg>
    )
  }
  return null
}
