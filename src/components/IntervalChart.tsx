import { INTERVALS } from '../data/stats'

interface Series {
  label: string
  values: number[]
}

/**
 * Goals per quarter-hour. One series: bars up from the baseline. Two series
 * (scored / conceded): the first above, the second below the baseline.
 */
export function IntervalChart({ series, caption }: { series: [Series] | [Series, Series]; caption: string }) {
  const [up, down] = series
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const bar = (value: number, s: Series, i: number, dir: 'up' | 'down') => (
    <span className={`ichart__bar ichart__bar--${dir}`} style={{ height: `${(value / max) * 100}%` }}>
      <span className="ichart__tip" role="tooltip">
        {INTERVALS[i]}: {value} {s.label.toLowerCase()}
      </span>
    </span>
  )
  return (
    <figure className="ichart">
      {down && (
        <figcaption className="ichart__legend">
          <span>
            <i className="ichart__key ichart__key--up" /> {up.label}
          </span>
          <span>
            <i className="ichart__key ichart__key--down" /> {down.label}
          </span>
        </figcaption>
      )}
      <div className="ichart__plot" aria-hidden>
        {INTERVALS.map((label, i) => (
          <div key={label} className="ichart__col">
            <div className="ichart__half ichart__half--up">
              <span className="ichart__value">{up.values[i] || ''}</span>
              {bar(up.values[i], up, i, 'up')}
            </div>
            {down && (
              <div className="ichart__half ichart__half--down">
                {bar(down.values[i], down, i, 'down')}
                <span className="ichart__value">{down.values[i] || ''}</span>
              </div>
            )}
            <span className="ichart__label">{label}</span>
          </div>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Minutter</th>
            {series.map((s) => (
              <th key={s.label}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {INTERVALS.map((label, i) => (
            <tr key={label}>
              <td>{label}</td>
              {series.map((s) => (
                <td key={s.label}>{s.values[i]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ichart__caption muted small">{caption}</p>
    </figure>
  )
}
