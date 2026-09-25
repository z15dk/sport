import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin'
import { getBadges } from '../../../lib/badges'
import { customLogoUrl } from '../../../lib/customLogos'
import { CHANNELS } from '../../../data/partners'
import { LogoEditor } from '../../../components/admin/LogoEditor'
import { LinkEditor } from '../../../components/admin/LinkEditor'
import { channelLinks } from '../../../lib/channelLinks'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Kanaler · Admin', robots: { index: false, follow: false } }

/** TV and streaming channels with their logos; logos can be uploaded or reset */
export default async function AdminChannels() {
  if (!(await isAdmin())) redirect('/admin')
  const badges = await getBadges()
  const links = channelLinks().links
  return (
    <div className="page">
      <div className="clubs admin">
        <header className="admin__head">
          <h1 className="feed__title">
            Kanaler
            <span>
              <Link href="/admin/klubber">Klubber</Link> · Kanaler
            </span>
          </h1>
          <form method="post" action="/api/admin/logout">
            <button className="text-btn" type="submit">
              Log ud
            </button>
          </form>
        </header>
        <section className="panel">
          <ul className="admin-list">
            {CHANNELS.map((channel) => {
              const slug = `kanal-${channel.id}`
              const uploaded = !!customLogoUrl(slug)
              const logo = badges[`kanal:${channel.id}`]
              return (
                <li key={channel.id} className="admin-list__row">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- channel logos are local files of any size
                    <img src={logo} alt="" className="admin-channel-logo" />
                  ) : (
                    <span className="partner-chip partner-chip--kanal">{channel.name}</span>
                  )}
                  <span className="admin-list__name">
                    <strong>{channel.name}</strong>
                    <LinkEditor id={channel.id} url={links[channel.id]} />
                  </span>
                  <span className={`admin-source admin-source--${uploaded ? 'upload' : logo ? 'fil' : 'forbogstaver'}`}>
                    {uploaded ? 'Uploadet her' : logo ? 'Fil i public/logos/kanaler' : 'Intet logo'}
                  </span>
                  <LogoEditor slug={slug} name={channel.name} uploaded={uploaded} />
                </li>
              )
            })}
          </ul>
        </section>
        <p className="muted small">
          Hvilke kampe hver kanal vises ved, står i src/data/partners.ts. Kampe uden kanal viser ingen kanal. Linket åbner i en ny fane.
        </p>
      </div>
    </div>
  )
}
