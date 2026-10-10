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
    <section className="panel dash-card">
      <RefreshEvery seconds={30} />
      <h2 className="panel__title">James</h2>
      <p className="small" style={{ margin: '0 0 10px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 'none', width: 9, height: 9, borderRadius: 9, background: running.length ? '#6f8f00' : '#c9cdbd' }} />
        <span>
          {running.length ? (
            <>
              <strong>Arbejder</strong> på {running.map((j) => `${j.label.toLowerCase()} (${minutes(now - (j.startedAt ?? now))})`).join(' og ')}
            </>
          ) : (
            <>
              <strong>Holder pause</strong>
              {upcoming ? ` · næste: ${upcoming.label.toLowerCase()} ${when(upcoming.nextAt!)}` : ''}
            </>
          )}
        </span>
      </p>
      <table className="dash-table">
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} title={j.what}>
              <td>{j.label}</td>
              <td className={j.running ? undefined : 'muted'} style={j.running ? { color: '#6f8f00', fontWeight: 700 } : j.ok === false ? { color: '#ff4a1f', fontWeight: 700 } : undefined}>
                {j.running ? 'I gang' : j.ok === false ? 'Fejlede' : j.startedAt ? when(j.startedAt) : '–'}
              </td>
              <td className="muted">{j.nextAt ? when(j.nextAt) : j.id === 'matchly-referat' ? 'efter kamp' : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Sidst kørt · næste kørsel. Opdateres hvert 30. sekund.</p>
    </section>
  )
}
