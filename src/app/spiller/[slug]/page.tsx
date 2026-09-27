import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { apiPlayer } from '../../../lib/apisports'
import { playerPath, type PlayerData, type PlayerSeasonRow } from '../../../data/player'
import { ourClubByName } from '../../../data/cups'
import { teamByName } from '../../../data/teams'
import { clubMatches } from '../../../data/matches'
import { clubNames, normalize } from '../../../data/aliases'
import { seasonClubs } from '../../../data/season'
import { sportOf } from '../../../data/leagues'
import { danishCountry } from '../../../data/countries'
import { JsonLd, breadcrumbLd, webPageLd } from '../../../lib/jsonld'
import { SITE_URL, paths } from '../../../lib/site'
import { TZ, formatNumeric } from '../../../lib/time'
import { TeamBadge } from '../../../components/TeamBadge'
import { Updated } from '../../../components/Updated'
import { AdSlot } from '../../../components/AdSlot'
import type { Match } from '../../../types'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

const idOf = (slug: string) => {
  const id = Number(/^(\d{1,9})(-|$)/.exec(slug)?.[1])
  return Number.isFinite(id) && id > 0 ? id : undefined
}

const POSITIONS: Record<string, string> = { Goalkeeper: 'Målmand', Defender: 'Forsvar', Midfielder: 'Midtbane', Attacker: 'Angreb' }
const ageOf = (p: PlayerData) => p.age

/** Our club for API-Sports' team name, with its page and colours */
function clubOf(team: string) {
  const n = normalize(team)
  const found = seasonClubs().filter(({ club, division }) => sportOf(division) === 'soccer' && clubNames(club).some((x) => normalize(x) === n))
  const ours = found.length === 1 ? found[0] : ourClubByName(team, 'soccer')
  if (ours) return { name: ours.club.name, slug: ours.club.slug, colors: ours.club.colors }
  const t = teamByName(team)
  return t ? { name: t.name, slug: t.slug, colors: t.colors } : undefined
}

/** The season's rows (the newest season the player has) and the club he plays for now: the league with most games */
function current(p: PlayerData) {
  const newest = Math.max(0, ...p.seasons.map((s) => s.season))
  const rows = p.seasons.filter((s) => s.season === newest)
  const main = [...rows].sort((a, b) => b.games - a.games || (b.minutes ?? 0) - (a.minutes ?? 0))[0]
  return { season: newest, rows, main }
}

const sum = (rows: PlayerSeasonRow[], k: keyof PlayerSeasonRow) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0)
const seasonLabel = (y: number) => `${y}/${String(y + 1).slice(2)}`
const pct = (a?: number, b?: number) => (a !== undefined && b ? `${Math.round((a / b) * 100)} %` : '–')

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = idOf((await params).slug)
  const p = id ? await apiPlayer(id) : undefined
  if (!p) return { title: 'Spiller' }
  const { main, rows } = current(p)
  const club = main ? (clubOf(main.team)?.name ?? main.team) : undefined
  return {
    title: `${p.name}${club ? ` · ${club}` : ''} – statistik`,
    description: `${p.name}${club ? ` spiller i ${club}` : ''}: ${sum(rows, 'goals')} mål og ${sum(rows, 'assists')} assists i ${sum(rows, 'games')} kampe denne sæson. Kampe, minutter, skud, afleveringer, kort, klubskifter og trofæer.`,
    alternates: { canonical: playerPath(p.id, p.name) },
  }
}

export default async function PlayerPage({ params }: { params: Params }) {
  const slug = (await params).slug
  const id = idOf(slug)
  if (!id) notFound()
  const p = await apiPlayer(id)
  if (!p) notFound()
  const path = playerPath(p.id, p.name)
  if (`/spiller/${slug}` !== path) permanentRedirect(path)

  const now = Date.now()
  const { season, rows, main } = current(p)
  const earlier = p.seasons.filter((s) => s.season < season)
  const club = main ? clubOf(main.team) : undefined
  const colors = club?.colors ?? ['#0f110c', '#c6f135']
  const position = main?.position ? (POSITIONS[main.position] ?? main.position) : undefined
  const keeper = main?.position === 'Goalkeeper'
  const games = sum(rows, 'games')
  const minutes = sum(rows, 'minutes')
  const goals = sum(rows, 'goals')
  const assists = sum(rows, 'assists')
  const ratings = rows.filter((r) => r.rating && r.games)
  // The rating weighted by games
  const rating = ratings.length ? ratings.reduce((n, r) => n + (r.rating ?? 0) * r.games, 0) / sum(ratings, 'games') : undefined

  // His goals in our matches this season, newest first (the scorer's name as the sources write it)
  const key = normalize(p.name)
  const goalsInOurGames: { match: Match; minutes: string[] }[] = club
    ? clubMatches(club.name, now)
        .filter((m) => m.state === 'finished')
        .map((m) => ({
          match: m,
          minutes: (m.incidents ?? [])
            .filter((i) => (i.kind === 'goal' || i.kind === 'penalty') && i.player && normalize(i.player) === key)
            .map((i) => `${i.minute}'${i.kind === 'penalty' ? ' (str.)' : ''}`),
        }))
        .filter((g) => g.minutes.length)
        .reverse()
    : []

  const detail: { label: string; value: string }[] = keeper
    ? [
        { label: 'Redninger', value: String(sum(rows, 'saves')) },
        { label: 'Mål imod', value: String(sum(rows, 'conceded')) },
        { label: 'Mål imod pr. kamp', value: games ? (sum(rows, 'conceded') / games).toFixed(2).replace('.', ',') : '–' },
        { label: 'Afleveringer', value: String(sum(rows, 'passes')) },
      ]
    : [
        { label: 'Skud', value: String(sum(rows, 'shots')) },
        { label: 'Skud på mål', value: `${sum(rows, 'shotsOn')} (${pct(sum(rows, 'shotsOn'), sum(rows, 'shots'))})` },
        { label: 'Minutter pr. mål', value: goals ? String(Math.round(minutes / goals)) : '–' },
        { label: 'Straffespark', value: `${sum(rows, 'penScored')} scoret${sum(rows, 'penMissed') ? `, ${sum(rows, 'penMissed')} misset` : ''}` },
        { label: 'Afleveringer', value: String(sum(rows, 'passes')) },
        { label: 'Chanceskabende afl.', value: String(sum(rows, 'keyPasses')) },
        { label: 'Driblinger', value: `${sum(rows, 'dribblesWon')} af ${sum(rows, 'dribbles')}` },
        { label: 'Dueller vundet', value: `${sum(rows, 'duelsWon')} af ${sum(rows, 'duels')} (${pct(sum(rows, 'duelsWon'), sum(rows, 'duels'))})` },
        { label: 'Tacklinger', value: String(sum(rows, 'tackles')) },
        { label: 'Erobringer', value: String(sum(rows, 'interceptions')) },
        { label: 'Frispark vundet', value: String(sum(rows, 'foulsDrawn')) },
        { label: 'Frispark begået', value: String(sum(rows, 'foulsCommitted')) },
      ]

  const personLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
    ...(p.firstname && { givenName: p.firstname }),
    ...(p.lastname && { familyName: p.lastname }),
    ...(p.birthDate && { birthDate: p.birthDate }),
    ...(p.nationality && { nationality: p.nationality }),
    ...(p.height && { height: p.height }),
    ...(p.photo && { image: p.photo }),
    url: `${SITE_URL}${path}`,
    ...(main && { memberOf: { '@type': 'SportsTeam', name: club?.name ?? main.team, ...(club && { url: `${SITE_URL}${paths.club(club.slug)}` }) } }),
  }

  return (
    <div className="page">
      <JsonLd data={personLd} />
      <JsonLd data={webPageLd(path, p.name, new Date(now))} />
      <JsonLd
        data={breadcrumbLd([
          ...(club ? [{ name: club.name, path: paths.club(club.slug) }] : []),
          { name: p.name, path },
        ])}
      />
      <div className="clubs">
        <header className="club-hero player-hero" style={{ '--club-bg': colors[0], '--club-fg': colors[1] } as React.CSSProperties}>
          {p.photo ? <img className="player-hero__photo" src={p.photo} alt={p.name} width={112} height={112} /> : <span className="player-hero__photo" />}
          <div className="club-hero__text">
            <span className="club-hero__eyebrow">
              {club ? <Link href={paths.club(club.slug)}>{club.name}</Link> : main?.team}
              {position && ` · ${position}`}
              {main?.number ? ` · Nr. ${main.number}` : ''}
            </span>
            <h1>{p.name}</h1>
            <span className="player-hero__facts">
              {[
                ageOf(p) && `${ageOf(p)} år`,
                p.nationality && (danishCountry(p.nationality) ?? p.nationality),
                p.height,
                p.injured && 'Skadet',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          {main?.teamLogo && <img className="player-hero__club" src={main.teamLogo} alt="" width={56} height={56} />}
        </header>

        <p className="lead">
          {p.name} har spillet {games} {games === 1 ? 'kamp' : 'kampe'} i sæsonen {seasonLabel(season)}
          {club ? ` for ${club.name}` : main ? ` for ${main.team}` : ''} og {keeper ? `lavet ${sum(rows, 'saves')} redninger` : `scoret ${goals} ${goals === 1 ? 'mål' : 'mål'} og lavet ${assists} ${assists === 1 ? 'assist' : 'assists'}`}
          {minutes ? ` på ${minutes.toLocaleString('da-DK')} minutter` : ''}.
        </p>
        <Updated at={now} />

        <section className="tiles tiles--club" aria-label={`Sæsonen ${seasonLabel(season)} i tal`}>
          <div className="tile tile--lime">
            <span className="tile__label">Kampe</span>
            <strong className="tile__value">{games}</strong>
          </div>
          <div className="tile tile--ink">
            <span className="tile__label">{keeper ? 'Redninger' : 'Mål'}</span>
            <strong className="tile__value">{keeper ? sum(rows, 'saves') : goals}</strong>
          </div>
          <div className="tile tile--blush">
            <span className="tile__label">{keeper ? 'Mål imod' : 'Assists'}</span>
            <strong className="tile__value">{keeper ? sum(rows, 'conceded') : assists}</strong>
          </div>
          <div className="tile tile--form">
            <span className="tile__label">Rating</span>
            <strong className="tile__value">{rating ? rating.toFixed(1).replace('.', ',') : '–'}</strong>
          </div>
        </section>

        <div className="player-grid">
          <section className="panel table-panel">
            <header className="table-panel__head">
              <h2 className="panel__title">Sæsonen {seasonLabel(season)}</h2>
            </header>
            <SeasonTable rows={rows} keeper={keeper} />
          </section>

          <section className="panel">
            <h2 className="panel__title">Detaljer</h2>
            <dl className="player-detail">
              {detail.map((d) => (
                <div key={d.label}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
              <div>
                <dt>Kort</dt>
                <dd>
                  <span className="card-mark card-mark--yellow" aria-hidden="true" /> {sum(rows, 'yellow')}{' '}
                  <span className="card-mark card-mark--red" aria-hidden="true" /> {sum(rows, 'red')}
                </dd>
              </div>
            </dl>
          </section>

          {goalsInOurGames.length > 0 && (
            <section className="panel">
              <h2 className="panel__title">Hans mål</h2>
              <ul className="player-goals">
                {goalsInOurGames.map(({ match: m, minutes: mins }) => (
                  <li key={m.id}>
                    <Link href={`/kamp/${m.slug}`}>
                      <span className="player-goals__date">{formatNumeric(m.kickoff)}</span>
                      <span className="player-goals__match">
                        {m.home.name} {m.home.score}–{m.away.score} {m.away.name}
                      </span>
                      <span className="player-goals__min">{mins.join(', ')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {earlier.length > 0 && (
            <section className="panel table-panel">
              <header className="table-panel__head">
                <h2 className="panel__title">Sæsonen {seasonLabel(earlier[0].season)}</h2>
              </header>
              <SeasonTable rows={earlier} keeper={keeper} />
            </section>
          )}

          {p.transfers.length > 0 && (
            <section className="panel">
              <h2 className="panel__title">Klubskifter</h2>
              <ul className="player-transfers">
                {p.transfers.slice(0, 8).map((t) => (
                  <li key={`${t.date}-${t.to}`}>
                    <span className="player-transfers__date">{formatNumeric(new Date(t.date))}</span>
                    <span className="player-transfers__teams">
                      <TeamName name={t.from} logo={t.fromLogo} />
                      <span aria-label="til">→</span>
                      <TeamName name={t.to} logo={t.toLogo} />
                    </span>
                    {t.type && t.type !== 'N/A' && <span className="player-transfers__type">{transferType(t.type)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.trophies.some((t) => t.place === 'Winner') && (
            <section className="panel">
              <h2 className="panel__title">Trofæer</h2>
              <ul className="player-trophies">
                {p.trophies
                  .filter((t) => t.place === 'Winner')
                  .slice(0, 12)
                  .map((t) => (
                    <li key={`${t.league}-${t.season}`}>
                      <span aria-hidden="true">🏆</span> <strong>{t.league}</strong> <span className="muted">{t.season}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2 className="panel__title">Om {p.name}</h2>
            <dl className="player-detail">
              {p.firstname && p.lastname && (
                <div>
                  <dt>Fulde navn</dt>
                  <dd>
                    {p.firstname} {p.lastname}
                  </dd>
                </div>
              )}
              {p.birthDate && (
                <div>
                  <dt>Født</dt>
                  <dd>
                    {birthFmt.format(new Date(p.birthDate))}
                    {p.birthPlace ? `, ${p.birthPlace}` : ''}
                  </dd>
                </div>
              )}
              {p.height && (
                <div>
                  <dt>Højde</dt>
                  <dd>{p.height}</dd>
                </div>
              )}
              {p.weight && (
                <div>
                  <dt>Vægt</dt>
                  <dd>{p.weight}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <p className="muted small">Statistik fra API-Sports. Rating er et gennemsnit af deres kampkarakterer (1–10).</p>
        <AdSlot placement="content" />
      </div>
    </div>
  )
}

const birthFmt = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })

const transferType = (t: string) => (t === 'Loan' ? 'Leje' : t === 'Free' ? 'Fri transfer' : t === 'Back from Loan' ? 'Retur fra leje' : /€|\d/.test(t) ? t : 'Skifte')

function TeamName({ name, logo }: { name: string; logo?: string }) {
  const club = clubOf(name)
  const inner = (
    <>
      <TeamBadge link={false} name={club?.name ?? name} src={logo} colors={club?.colors} size={20} />
      {club?.name ?? name}
    </>
  )
  return club ? (
    <Link className="table__club" href={paths.club(club.slug)}>
      {inner}
    </Link>
  ) : (
    <span className="table__club">{inner}</span>
  )
}

function SeasonTable({ rows, keeper }: { rows: PlayerSeasonRow[]; keeper: boolean }) {
  return (
    <div className="table-wrap table-wrap--flush">
      <table className="table table--compact">
        <thead>
          <tr>
            <th>Turnering</th>
            <th className="num" title="Kampe">K</th>
            <th className="num hide-sm" title="Minutter">Min</th>
            <th className="num" title={keeper ? 'Mål imod' : 'Mål'}>{keeper ? 'MI' : 'M'}</th>
            <th className="num" title={keeper ? 'Redninger' : 'Assists'}>{keeper ? 'R' : 'A'}</th>
            <th className="num hide-sm" title="Gule kort">G</th>
            <th className="num hide-sm" title="Røde kort">R</th>
            <th className="num" title="Rating">Rat.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.league}-${r.team}-${r.season}`}>
              <td>
                <span className="table__club">
                  {r.leagueLogo ? <img src={r.leagueLogo} alt="" width={20} height={20} loading="lazy" /> : null}
                  <span>
                    {r.league}
                    <span className="player-table__team">{clubOf(r.team)?.name ?? r.team}</span>
                  </span>
                </span>
              </td>
              <td className="num">{r.games}</td>
              <td className="num hide-sm">{r.minutes ?? '–'}</td>
              <td className="num pts">{keeper ? (r.conceded ?? 0) : r.goals}</td>
              <td className="num">{keeper ? (r.saves ?? 0) : r.assists}</td>
              <td className="num hide-sm">{r.yellow}</td>
              <td className="num hide-sm">{r.red}</td>
              <td className="num">{r.rating ? r.rating.toFixed(1).replace('.', ',') : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
