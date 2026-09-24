import { useState } from 'react'

export function TeamBadge({ name, src, size = 20 }: { name: string; src?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      <img
        className="badge"
        src={`${src}/tiny`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[\p{L}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <span className="badge badge--fallback" style={{ width: size, height: size }} aria-hidden>
      {initials}
    </span>
  )
}
