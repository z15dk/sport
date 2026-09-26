import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminNav } from '../../../components/admin/AdminNav'
import { isAdmin } from '../../../lib/admin'
import { getBadges } from '../../../lib/badges'
import { customLogoUrl } from '../../../lib/customLogos'
import { channelConfig, channelData, tvStatus } from '../../../lib/channels'
import { loadRealData } from '../../../lib/realdata'
import { channelInfo } from '../../../data/channels'
import { getMatches } from '../../../data/matches'
import { DIVISIONS } from '../../../data/leagues'
import { LogoEditor } from '../../../components/admin/LogoEditor'
import { AddChannel, ChannelFields, MatchChannelSelect, RuleList } from '../../../components/admin/ChannelAdmin'
import { addDays, formatLong, formatTime, isoDate, isValidIsoDate } from '../../../lib/time'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kanaler · Admin', robots: { index: false, follow: false } }

const SOURCE_LABEL = { undtagelse: 'Undtagelse', 'tv-program': 'TV-program', regel: 'Regel' } as const

type SearchParams = Promise<{ dato?: string }>

/** TV channels: logos and links, rules for which matches they show, and exceptions per match */
export default async function AdminChannels({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect('/admin')
  const { dato } = await searchParams
  const now = Date.now()
  const date = isValidIsoDate(dato) ? dato : isoDate(now)
  const real = loadRealData()
  const badges = await getBadges()
  const config = channelConfig()
  const all = channelData().data.channels
  const own = new Set(config.channels.map((c) => c.id))
  const tv = tvStatus()
  const matches = getMatches(date, 'all', now).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  const leagues = [...new Set([...DIVISIONS.map((d) => d.name), ...(real?.external ?? []).map((g) => g.league.name)])].sort((a, b) => a.localeCompare(b, 'da'))

  return (
    <div className="page">
      <div className="clubs admin">
        <AdminNav current="/admin/kanaler" />
        <h1 className="feed__title">
          Kanaler
          
        </h1>

        <p className="muted small">
          En kamps kanal findes i denne rækkefølge: undtagelse for kampen, TheSportsDB&apos;s danske TV-program, og til sidst den mest præcise
          regel (liga før land før sport). Kampe uden kanal viser ingen kanal.
        </p>

        <section className="panel">
          <h2 className="panel__title">Kanaler</h2>
          <ul className="admin-list">
            {all.map((channel) => {
              const slug = `kanal-${channel.id}`
              const uploaded = !!customLogoUrl(slug)
              const logo = badges[`kanal:${channel.id}`]
              return (
                <li key={channel.id} className="admin-list__row">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- channel logos are local files or TheSportsDB's
                    <img src={logo} alt="" className="admin-channel-logo" />
                  ) : (
                    <span className="partner-chip partner-chip--kanal">{channel.name}</span>
                  )}
                  <span className="admin-list__name">
                    <ChannelFields channel={channel} fromTv={!own.has(channel.id)} />
                  </span>
                  <span className={`admin-source admin-source--${uploaded ? 'upload' : logo ? 'fil' : 'forbogstaver'}`}>
                    {uploaded ? 'Uploadet logo' : logo ? 'Logo' : 'Intet logo'}
                  </span>
                  <LogoEditor slug={slug} name={channel.name} uploaded={uploaded} />
                </li>
              )
            })}
          </ul>
          <div className="pad">
            <AddChannel />
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">Regler</h2>
          <RuleList rules={config.rules} channels={config.channels} leagues={leagues} />
        </section>

        <section className="panel">
          <header className="table-panel__head">
            <h2 className="panel__title">Kampe {formatLong(date)}</h2>
            <span className="admin-daynav">
              <Link href={`/admin/kanaler?dato=${addDays(date, -1)}`}>← Dagen før</Link>
              <Link href={`/admin/kanaler?dato=${addDays(date, 1)}`}>Dagen efter →</Link>
            </span>
          </header>
          <ul className="admin-list">
            {matches.map((m) => {
              const { channels, source } = channelInfo(m, real?.channels)
              return (
                <li key={m.id} className="admin-list__row admin-match">
                  <span className="admin-match__time">{formatTime(m.kickoff)}</span>
                  <span className="admin-list__name">
                    <strong>
                      {m.home.name} – {m.away.name}
                    </strong>
                    <em>{m.league}</em>
                  </span>
                  <span className="admin-source">
                    {channels.length ? channels.map((c) => c.name).join(', ') : 'Ingen kanal'}
                    {source && ` · ${SOURCE_LABEL[source]}`}
                  </span>
                  <MatchChannelSelect matchId={m.id} override={config.overrides[m.id]} channels={all} />
                </li>
              )
            })}
            {matches.length === 0 && <li className="muted pad">Ingen kampe denne dag.</li>}
          </ul>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">TheSportsDB&apos;s TV-program (Danmark)</h2>
          <p>
            {tv.lastError
              ? `Kunne ikke hentes: ${tv.lastError}. Den gratis nøgle giver sandsynligvis ikke adgang – reglerne bruges i stedet.`
              : tv.lastRun
                ? `${tv.events} udsendelser de næste ${tv.days} dage, ${tv.withChannel} med kanal. Senest hentet ${tv.lastRun}.`
                : 'Ikke hentet endnu.'}
          </p>
          {tv.channels.length > 0 && <p className="muted small">Kanaler: {tv.channels.join(', ')}</p>}
        </section>
      </div>
    </div>
  )
}
