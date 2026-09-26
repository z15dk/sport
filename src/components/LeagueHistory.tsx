import Link from 'next/link'
import type { LeagueHistory as History } from '../lib/history'
import { paths } from '../lib/site'
import { formatShortYear } from '../lib/time'
import { TeamBadge } from './TeamBadge'

const one = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
/** A club with its logo, linked to its page when it has one */
const Club = ({ name, slug }: { name: string; slug?: string }) => (
  <span className="table__club">
    <TeamBadge link={false} name={name} size={20} />
    {slug ? <Link href={paths.club(slug)}>{name}</Link> : name}
  </span>
)

/** A league's finished seasons from the match database: top three per season, all-time table and records */
export function LeagueHistory({ name, history }: { name: string; history: History }) {
  const { seasons, allTime, biggestWin, bestCrowd } = history
  const shown = seasons.slice(0, 10)
  const rest = seasons.slice(10)
  const seasonRow = (s: History['seasons'][number]) => (
    <tr key={s.season}>
      <td>{s.season}</td>
      {s.incomplete ? (
        <td colSpan={3} className="history__missing-cell">
          Ufuldstændig i vores kampdatabase ({s.matches} af {s.teams * (s.teams - 1)} kampe)
        </td>
      ) : [0, 1, 2].map((i) => (
        <td key={i}>
          {s.top[i] ? (
            <>
              <Club {...s.top[i]} /> <span className="muted small">{s.top[i].points} p</span>
            </>
          ) : (
            '–'
          )}
        </td>
      ))}
      <td className="num">{s.matches}</td>
      <td className="num">{one(s.goalsPerMatch)}</td>
    </tr>
  )
  const head = (
    <thead>
      <tr>
        <th>Sæson</th>
        <th>Nr. 1</th>
        <th>Nr. 2</th>
        <th>Nr. 3</th>
        <th className="num">Kampe</th>
        <th className="num">Mål/kamp</th>
      </tr>
    </thead>
  )
  return (
    <section className="panel table-panel history">
      <header className="table-panel__head">
        <h2 className="panel__title">Historik</h2>
        <span className="tag">
          {seasons.length} sæsoner · {history.matches.toLocaleString('da-DK')} kampe
        </span>
      </header>
      <p className="history__lead">
        {name} i vores kampdatabase: {seasons.length} afsluttede sæsoner fra {seasons.at(-1)?.season} til {seasons[0]?.season}.
        {biggestWin && ` Største sejr: ${biggestWin.home} – ${biggestWin.away} ${biggestWin.homeScore}-${biggestWin.awayScore} (${formatShortYear(biggestWin.date)}).`}
        {bestCrowd &&
          ` Flest tilskuere: ${bestCrowd.spectators.toLocaleString('da-DK')} til ${bestCrowd.home} – ${bestCrowd.away} (${formatShortYear(bestCrowd.date)}).`}
      </p>
      <div className="table-wrap">
        <table className="table table--compact">
          {head}
          <tbody>{shown.map(seasonRow)}</tbody>
        </table>
      </div>
      {rest.length > 0 && (
        <details className="history__more">
          <summary>Vis alle {seasons.length} sæsoner</summary>
          <div className="table-wrap">
            <table className="table table--compact">
              {head}
              <tbody>{rest.map(seasonRow)}</tbody>
            </table>
          </div>
        </details>
      )}
      {allTime.length > 0 && (
        <>
          <h3 className="stats-sub history__sub">Alle tiders tabel</h3>
          <div className="table-wrap">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Klub</th>
                  <th className="num">Sæsoner</th>
                  <th className="num">K</th>
                  <th className="num">Mål</th>
                  <th className="num">P</th>
                </tr>
              </thead>
              <tbody>
                {allTime.map((r, i) => (
                  <tr key={`${r.name}-${i}`}>
                    <td className="num pos">{i + 1}</td>
                    <td>
                      <Club name={r.name} slug={r.slug} />
                    </td>
                    <td className="num">{r.seasons}</td>
                    <td className="num">{r.played}</td>
                    <td className="num">
                      {r.goalsFor}-{r.goalsAgainst}
                    </td>
                    <td className="num pts">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="muted small history__note">
        Beregnet af Scoreline ud fra alle kampe i vores kampdatabase (3 point for sejr). Nr. 1-3 er efter point i sæsonens kampe og tager ikke højde for
        pointhalvering, fratrukne point eller slutspil, der ligger uden for databasen.
      </p>
    </section>
  )
}
