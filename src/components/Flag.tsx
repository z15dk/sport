const CODES: Record<string, 'DK' | 'DE' | 'SE' | 'NO' | 'ENG' | 'ES' | 'PT'> = {
  Danmark: 'DK',
  Tyskland: 'DE',
  Sverige: 'SE',
  Norge: 'NO',
  England: 'ENG',
  Spanien: 'ES',
  Portugal: 'PT',
}

/** Simple flags drawn from stripes: horizontal (h) or vertical (v) colours, a Nordic cross, or their own shapes */
const SIMPLE: Record<string, { h?: string[]; v?: string[]; cross?: [string, string]; swiss?: true; saltire?: true; crescent?: true; usa?: true }> = {
  Frankrig: { v: ['#0055a4', '#fff', '#ef4135'] },
  Italien: { v: ['#009246', '#fff', '#ce2b37'] },
  Belgien: { v: ['#000', '#fdda24', '#ef3340'] },
  Holland: { h: ['#ae1c28', '#fff', '#21468b'] },
  Østrig: { h: ['#c8102e', '#fff', '#c8102e'] },
  Finland: { cross: ['#fff', '#002f6c'] },
  Island: { cross: ['#02529c', '#dc1e35'] },
  Schweiz: { swiss: true },
  Skotland: { saltire: true },
  Tyrkiet: { crescent: true },
  USA: { usa: true },
  Polen: { h: ['#fff', '#dc143c'] },
  Ungarn: { h: ['#ce2939', '#fff', '#477050'] },
  Rumænien: { v: ['#002b7f', '#fcd116', '#ce1126'] },
  Irland: { v: ['#169b62', '#fff', '#ff883e'] },
  Bulgarien: { h: ['#fff', '#00966e', '#d62612'] },
  Ukraine: { h: ['#0057b7', '#ffd700'] },
  Rusland: { h: ['#fff', '#0039a6', '#d52b1e'] },
  Estland: { h: ['#0072ce', '#000', '#fff'] },
  Litauen: { h: ['#fdb913', '#006a44', '#c1272d'] },
  Letland: { h: ['#9e3039', '#9e3039', '#fff', '#9e3039', '#9e3039'] },
  Armenien: { h: ['#d90012', '#0033a0', '#f2a800'] },
  Nigeria: { v: ['#008751', '#fff', '#008751'] },
  Mali: { v: ['#14b53a', '#fcd116', '#ce1126'] },
  Guinea: { v: ['#ce1126', '#fcd116', '#009460'] },
  Colombia: { h: ['#fcd116', '#fcd116', '#003893', '#ce1126'] },
  Bolivia: { h: ['#d52b1e', '#f9e300', '#007934'] },
  Peru: { v: ['#d91023', '#fff', '#d91023'] },
  Tchad: { v: ['#002664', '#fecb00', '#c60c30'] },
  Gabon: { h: ['#009e60', '#fcd116', '#3a75c4'] },
  'Sierra Leone': { h: ['#1eb53a', '#fff', '#0072c6'] },
}

/** Whether we have a flag for the country */
export const hasFlag = (country?: string) => !!country && (country in CODES || country in SIMPLE)

/** Small national flag for a country name ("Danmark", "Tyskland"); nothing for others */
export function Flag({ country }: { country?: string }) {
  const code = country ? CODES[country] : undefined
  const simple = country ? SIMPLE[country] : undefined
  if (simple) return <SimpleFlag {...simple} />
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
  if (code === 'ES') {
    return (
      <svg className="flag" viewBox="0 0 3 2" aria-hidden>
        <rect width="3" height="2" fill="#aa151b" />
        <rect y="0.5" width="3" height="1" fill="#f1bf00" />
      </svg>
    )
  }
  if (code === 'PT') {
    return (
      <svg className="flag" viewBox="0 0 30 20" aria-hidden>
        <rect width="30" height="20" fill="#da291c" />
        <rect width="12" height="20" fill="#046a38" />
        <circle cx="12" cy="10" r="4" fill="#ffe900" />
      </svg>
    )
  }
  return null
}

function SimpleFlag({ h, v, cross, swiss, saltire, crescent, usa }: (typeof SIMPLE)[string]) {
  if (h || v) {
    const colors = (h ?? v)!
    return (
      <svg className="flag" viewBox="0 0 30 20" aria-hidden>
        {colors.map((c, i) => (h ? <rect key={i} y={(20 / colors.length) * i} width="30" height={20 / colors.length} fill={c} /> : <rect key={i} x={(30 / colors.length) * i} width={30 / colors.length} height="20" fill={c} />))}
      </svg>
    )
  }
  if (cross) {
    return (
      <svg className="flag" viewBox="0 0 18 11" aria-hidden>
        <rect width="18" height="11" fill={cross[0]} />
        <rect x="5" width="3" height="11" fill={cross[1]} />
        <rect y="4" width="18" height="3" fill={cross[1]} />
      </svg>
    )
  }
  if (swiss) {
    return (
      <svg className="flag" viewBox="0 0 30 20" aria-hidden>
        <rect width="30" height="20" fill="#da291c" />
        <rect x="13" y="4" width="4" height="12" fill="#fff" />
        <rect x="9" y="8" width="12" height="4" fill="#fff" />
      </svg>
    )
  }
  if (saltire) {
    return (
      <svg className="flag" viewBox="0 0 30 20" aria-hidden>
        <rect width="30" height="20" fill="#005eb8" />
        <path d="M0 0L30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
      </svg>
    )
  }
  if (crescent) {
    return (
      <svg className="flag" viewBox="0 0 30 20" aria-hidden>
        <rect width="30" height="20" fill="#e30a17" />
        <circle cx="11" cy="10" r="5" fill="#fff" />
        <circle cx="12.3" cy="10" r="4" fill="#e30a17" />
        <circle cx="17.5" cy="10" r="1.8" fill="#fff" />
      </svg>
    )
  }
  if (usa) {
    return (
      <svg className="flag" viewBox="0 0 30 20" aria-hidden>
        <rect width="30" height="20" fill="#fff" />
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} y={(20 / 13) * i * 2} width="30" height={20 / 13} fill="#b22234" />
        ))}
        <rect width="12" height={(20 / 13) * 7} fill="#3c3b6e" />
      </svg>
    )
  }
  return null
}
