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
  const shown = seasons.slice(0, 6)
  const rest = seasons.slice(6)
  // One card per season: the champion big, second and third under it
  const seasonCard = (s: History['seasons'][number]) => (
    <li key={s.season} className="season-card">
      <span className="season-card__year">{s.season}</span>
      {s.incomplete || !s.top[0] ? (
        <span className="season-card__missing">
          Ufuldstændig ({s.matches} af {s.teams * (s.teams - 1)} kampe)
        </span>
      ) : (
        <>
          <span className="season-card__champion">
            <TeamBadge link={false} name={s.top[0].name} size={32} />
            <span>
              {s.top[0].slug ? <Link href={paths.club(s.top[0].slug)}>{s.top[0].name}</Link> : s.top[0].name}
              <em>{s.top[0].points} point</em>
            </span>
          </span>
          <ol className="season-card__rest" start={2}>
            {s.top.slice(1, 3).map((t) => (
              <li key={t.name}>
                <Club {...t} />
                <span className="muted small">{t.points} p</span>
              </li>
            ))}
          </ol>
        </>
      )}
      <span className="season-card__meta">
        {s.matches} kampe · {one(s.goalsPerMatch)} mål/kamp
      </span>
    </li>
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
        {name}: {seasons.length} afsluttede sæsoner fra {seasons.at(-1)?.season} til {seasons[0]?.season}.
        {biggestWin && ` Største sejr: ${biggestWin.home} – ${biggestWin.away} ${biggestWin.homeScore}-${biggestWin.awayScore} (${formatShortYear(biggestWin.date)}).`}
        {bestCrowd &&
          ` Flest tilskuere: ${bestCrowd.spectators.toLocaleString('da-DK')} til ${bestCrowd.home} – ${bestCrowd.away} (${formatShortYear(bestCrowd.date)}).`}
      </p>
      <ul className="season-cards season-cards--first">{shown.map(seasonCard)}</ul>
      <ul className="season-cards season-cards--all" aria-label="Alle sæsoner">{seasons.map(seasonCard)}</ul>
      {rest.length > 0 && (
        <details className="history__more">
          <summary>Vis alle {seasons.length} sæsoner</summary>
          <ul className="season-cards">{rest.map(seasonCard)}</ul>
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
                  <th className="num hide-sm">K</th>
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
                    <td className="num hide-sm">{r.played}</td>
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
        Beregnet af Scoreline ud fra sæsonernes kampe (3 point for sejr). Nr. 1-3 er efter point i sæsonens kampe og tager ikke højde for
        pointhalvering, fratrukne point eller slutspil.
      </p>
    </section>
  )
}
