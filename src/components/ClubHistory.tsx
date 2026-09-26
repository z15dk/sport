import type { ClubHistory as History, SeasonRecord } from '../lib/history'
import { formatShortYear } from '../lib/time'

const SHOWN = 10

function SeasonRows({ seasons }: { seasons: SeasonRecord[] }) {
  return (
    <>
      {seasons.map((s) =>
        s.missing ? (
          <tr key={`${s.season}-missing`} className="history__missing">
            <td>{s.season}</td>
            <td colSpan={8}>Ingen kampe i vores kampdatabase</td>
          </tr>
        ) : (
        <tr key={`${s.season}-${s.tournament}`}>
          <td>{s.season}</td>
          <td>{s.tournament}</td>
          <td className="num pos">{s.position ? `${s.position}.` : s.incomplete ? <span className="history__partial" title="Vores kampdatabase mangler nogle af sæsonens kampe">ufuldst.</span> : '–'}</td>
          <td className="num">{s.played}</td>
          <td className="num">{s.won}</td>
          <td className="num">{s.drawn}</td>
          <td className="num">{s.lost}</td>
          <td className="num">
            {s.goalsFor}-{s.goalsAgainst}
          </td>
          <td className="num">
            <strong>{s.points}</strong>
          </td>
        </tr>
        ),
      )}
    </>
  )
}

/** A club's real record from the match database: totals and season by season */
export function ClubHistory({ name, history }: { name: string; history: History }) {
  const { total, seasons, biggestWin } = history
  const pct = (n: number) => Math.round((n / total.played) * 100)
  const head = (
    <thead>
      <tr>
        <th>Sæson</th>
        <th>Turnering</th>
        <th className="num">Plac.</th>
        <th className="num">K</th>
        <th className="num">V</th>
        <th className="num">U</th>
        <th className="num">T</th>
        <th className="num">Mål</th>
        <th className="num">P</th>
      </tr>
    </thead>
  )
  return (
    <section className="panel table-panel history">
      <header className="table-panel__head">
        <h2 className="panel__title">Historik</h2>
        <span className="tag">
          {formatShortYear(history.first)}–{formatShortYear(history.last)}
        </span>
      </header>
      <p className="history__lead">
        {name} har spillet {total.played.toLocaleString('da-DK')} kampe i vores kampdatabase: {total.won} sejre ({pct(total.won)} %),{' '}
        {total.drawn} uafgjorte og {total.lost} nederlag med en målscore på {total.goalsFor}-{total.goalsAgainst}.
        {biggestWin &&
          ` Største sejr: ${biggestWin.home} – ${biggestWin.away} ${biggestWin.homeScore}-${biggestWin.awayScore} (${biggestWin.competition}, ${formatShortYear(biggestWin.date)}).`}
      </p>
      <div className="table-wrap">
        <table className="table table--compact">
          {head}
          <tbody>
            <SeasonRows seasons={seasons.slice(0, SHOWN)} />
          </tbody>
        </table>
      </div>
      {seasons.length > SHOWN && (
        <details className="history__more">
          <summary>Vis alle {seasons.length} sæsoner</summary>
          <div className="table-wrap">
            <table className="table table--compact">
              {head}
              <tbody>
                <SeasonRows seasons={seasons.slice(SHOWN)} />
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="muted small history__note">
        Rigtige resultater fra vores kampdatabase. Placering er beregnet ud fra kampene og vises kun, når databasen har hele sæsonen (&quot;ufuldst.&quot;:
        der mangler kampe). Sæsoner uden kampe i databasen står som huller – klubben kan godt have spillet i en række, vi ikke har data for.
      </p>
    </section>
  )
}
