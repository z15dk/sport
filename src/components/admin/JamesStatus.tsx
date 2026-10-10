import { jamesStatus } from '../../lib/jamesStatus'
import { RefreshEvery } from './RefreshEvery'

// "James lige nu" on /admin/indstillinger: what he is working on, and each of his jobs' last and next run

const day = (t: number) => new Date(t).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })
const clock = (t: number) => new Date(t).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' })
const today = (t: number) => day(t) === day(Date.now())
const when = (t: number) => (today(t) ? `i dag ${clock(t)}` : `${day(t)} ${clock(t)}`)
const minutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} t ${m % 60} min`
}

export async function JamesStatus() {
  const jobs = await jamesStatus()
  if (!jobs) return null
  const now = Date.now()
  const running = jobs.filter((j) => j.running)
  const upcoming = jobs.filter((j) => j.nextAt).sort((a, b) => a.nextAt! - b.nextAt!)[0]
  return (
    <section className="panel dash-card" style={{ marginBottom: 16 }}>
      <RefreshEvery seconds={30} />
      <h2 className="panel__title">James lige nu</h2>
      <p style={{ margin: '4px 0 12px', fontWeight: 700 }}>
        {running.length ? (
          <>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 10, background: '#6f8f00', marginRight: 8 }} />
            Arbejder på {running.map((j) => `${j.label.toLowerCase()} (${minutes(now - (j.startedAt ?? now))})`).join(' og ')}: {running[0].what}
          </>
        ) : (
          <>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 10, background: '#c9cdbd', marginRight: 8 }} />
            Holder pause{upcoming ? ` – næste: ${upcoming.label.toLowerCase()} ${when(upcoming.nextAt!)}` : ''}
          </>
        )}
      </p>
      <table className="table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Job</th>
            <th style={{ textAlign: 'left' }}>Sidst</th>
            <th style={{ textAlign: 'left' }}>Næste</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>
                <strong>{j.label}</strong>
                <div className="muted small">{j.what}</div>
              </td>
              <td className="small">
                {j.running ? (
                  <span style={{ color: '#6f8f00', fontWeight: 700 }}>I gang siden {clock(j.startedAt ?? now)}</span>
                ) : j.startedAt ? (
                  <>
                    {when(j.startedAt)}
                    {j.endedAt && ` · ${minutes(j.endedAt - j.startedAt)}`}
                    {j.ok === false ? <span style={{ color: '#ff4a1f', fontWeight: 700 }}> · fejlede</span> : j.ok ? ' · gik godt' : ''}
                  </>
                ) : (
                  <span className="muted">Ikke kørt endnu</span>
                )}
              </td>
              <td className="small">{j.nextAt ? when(j.nextAt) : <span className="muted">{j.id === 'matchly-referat' ? 'Efter næste kamp' : 'Når du beder om det'}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
