// Thin bars for the admin overviews (/admin/data, /admin/besoegende): one series in the site's green, a limit line when given

const num = (n: number) => n.toLocaleString('da-DK')

/** A row of thin bars, one per value; the title of each is its tooltip */
export function Bars({ values, labels, unit, limit }: { values: number[]; labels: string[]; unit: string; limit?: number }) {
  const max = Math.max(1, limit ?? 0, ...values)
  return (
    <div className="dash-bars" role="img" aria-label={values.map((v, i) => `${labels[i]}: ${v} ${unit}`).join(', ')}>
      {limit !== undefined && <span className="dash-bars__limit" style={{ bottom: `${(limit / max) * 100}%` }} />}
      {values.map((v, i) => (
        <span key={i} className={`dash-bars__bar${limit !== undefined && v >= limit ? ' is-over' : ''}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} title={`${labels[i]}: ${num(v)} ${unit}`} />
      ))}
    </div>
  )
}

