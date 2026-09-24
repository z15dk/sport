import { formatLong, formatTime } from '../lib/time'

/** Visible "last updated" line; freshness matters to readers and search engines. */
export function Updated({ at }: { at: Date | number }) {
  const d = new Date(at)
  return (
    <p className="updated">
      Opdateret{' '}
      <time dateTime={d.toISOString()}>
        {formatLong(d)} kl. {formatTime(d)}
      </time>
    </p>
  )
}
