import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdmin } from '../../../../lib/admin'
import { getBadges } from '../../../../lib/badges'
import { sizedImage } from '../../../../lib/imageSize'
import { nationalTeams } from '../../../../lib/nationalTeams'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'VS-grafik', robots: { index: false, follow: false } }

// The VS graphic for an article (1200×630): the two clubs' logos with "VS" between them, a line on top
// and, if chosen, a photo behind them darkened so the logos stand out. The server's Chromium opens this
// page and takes a picture of the card (src/lib/vsGraphic.ts); it can also be opened to look at it.

type Params = Promise<{ h?: string; a?: string; top?: string; bg?: string }>

/** Only pictures from our own site behind the logos */
const ownPath = (p?: string) => (p && p.startsWith('/') && !p.startsWith('//') ? p : undefined)

export default async function VsGraphic({ searchParams }: { searchParams: Params }) {
  if (!(await isAdmin())) redirect('/admin')
  const { h = '', a = '', top = '', bg } = await searchParams
  const badges = await getBadges()
  const flags = nationalTeams()
  // A national team's flag when the name is one (our clubs' logos win, e.g. a club named like a country)
  const logo = (name: string) => sizedImage(badges[name] ?? flags[name], 512)
  const isFlag = (name: string) => !badges[name] && !!flags[name]
  const back = ownPath(bg)
  const club = (name: string) => (
    <div className="vsg__club">
      {logo(name) ? (
        // eslint-disable-next-line @next/next/no-img-element -- the club's logo on the picture
        <img src={logo(name)} alt="" className={isFlag(name) ? 'is-flag' : undefined} />
      ) : (
        <span className="vsg__initials">{name.slice(0, 2).toUpperCase()}</span>
      )}
      <b>{name}</b>
    </div>
  )
  return (
    <div className="vsg-wrap">
      {/* Only the graphic on this page: it fills the window from the top left corner, above the site's own bars */}
      <style>{'html,body{background:#11130e!important;overflow:hidden}.vsg-wrap{position:fixed;inset:0;z-index:2147483000;padding:0;background:#11130e}'}</style>
      <div className={`vsg${back ? ' has-photo' : ''}`} data-card>
        {back && (
          // eslint-disable-next-line @next/next/no-img-element -- the photo behind the logos
          <img className="vsg__photo" src={back} alt="" />
        )}
        <span className="vsg__m" aria-hidden>
          M
        </span>
        {top && <div className="vsg__top">{top}</div>}
        <div className="vsg__row">
          {club(h)}
          <div className="vsg__vs">VS</div>
          {club(a)}
        </div>
        <div className="vsg__logo">
          MATCHLY<i>.</i>
        </div>
      </div>
    </div>
  )
}
